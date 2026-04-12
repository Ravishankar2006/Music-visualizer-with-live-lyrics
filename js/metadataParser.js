import { extractImageFromBuffer } from './utils.js';

export class MetadataParser {

    /**
     * Full metadata extraction — cover art + text tags.
     * Returns { coverUrl, title, artist, album } with nulls for missing fields.
     */
    static async extractMetadata(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const tags = this._parseID3Tags(arrayBuffer);
            let coverUrl = null;

            if (tags.cover) {
                const blob = new Blob([tags.cover.data], { type: tags.cover.format });
                coverUrl = URL.createObjectURL(blob);
            } else {
                // Fallback raw image scan
                const u8 = new Uint8Array(arrayBuffer);
                for (let i = 0; i < u8.length - 10; i++) {
                    if (u8[i] === 0xFF && u8[i+1] === 0xD8 && u8[i+2] === 0xFF) {
                        const d = extractImageFromBuffer(u8, i, 'image/jpeg');
                        if (d) { coverUrl = URL.createObjectURL(new Blob([d], { type: 'image/jpeg' })); break; }
                    }
                    if (u8[i] === 0x89 && u8[i+1] === 0x50 && u8[i+2] === 0x4E && u8[i+3] === 0x47) {
                        const d = extractImageFromBuffer(u8, i, 'image/png');
                        if (d) { coverUrl = URL.createObjectURL(new Blob([d], { type: 'image/png' })); break; }
                    }
                }
            }

            return {
                coverUrl,
                title:  tags.title  || null,
                artist: tags.artist || null,
                album:  tags.album  || null,
            };
        } catch {
            return { coverUrl: null, title: null, artist: null, album: null };
        }
    }

    /** Legacy compat — kept so nothing else breaks. */
    static async extractCoverArt(file) {
        return (await this.extractMetadata(file)).coverUrl;
    }

    // ── Internal ID3 parser ───────────────────────────────────
    static _parseID3Tags(buffer) {
        const result = { cover: null, title: null, artist: null, album: null };
        try {
            const view = new DataView(buffer);
            const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
            if (header !== 'ID3') return result;

            const ver = view.getUint8(3);
            const flags = view.getUint8(5);
            let tagSize = 0;
            for (let i = 0; i < 4; i++) tagSize = (tagSize << 7) | (view.getUint8(6 + i) & 0x7F);

            let offset = 10;
            if (flags & 0x40) { offset += 4 + view.getUint32(offset); }
            const tagEnd = Math.min(10 + tagSize, buffer.byteLength);

            const dec = new TextDecoder('utf-8');
            const decLatin = new TextDecoder('latin1');

            while (offset < tagEnd - 10) {
                let frameId = '', frameSize = 0;

                if (ver >= 3) {
                    frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1),
                                                  view.getUint8(offset+2), view.getUint8(offset+3));
                    frameSize = ver === 4
                        ? ((view.getUint8(offset+4)&0x7F)<<21)|((view.getUint8(offset+5)&0x7F)<<14)|
                          ((view.getUint8(offset+6)&0x7F)<<7)|(view.getUint8(offset+7)&0x7F)
                        : view.getUint32(offset + 4);
                    offset += 10;
                } else {
                    frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2));
                    frameSize = (view.getUint8(offset+3)<<16)|(view.getUint8(offset+4)<<8)|view.getUint8(offset+5);
                    offset += 6;
                }

                if (frameSize <= 0 || offset + frameSize > tagEnd) break;

                if (frameId === 'APIC' || frameId === 'PIC') {
                    result.cover = this.extractPictureData(view, offset, frameSize, ver);
                } else if (['TIT2','TIT1','TT2'].includes(frameId)) {
                    result.title  = this._readTextFrame(view, offset, frameSize, dec, decLatin);
                } else if (['TPE1','TP1'].includes(frameId)) {
                    result.artist = this._readTextFrame(view, offset, frameSize, dec, decLatin);
                } else if (['TALB','TAL'].includes(frameId)) {
                    result.album  = this._readTextFrame(view, offset, frameSize, dec, decLatin);
                }

                offset += frameSize;
            }
        } catch { /* silent */ }
        return result;
    }

    static _readTextFrame(view, offset, size, dec, decLatin) {
        try {
            const enc = view.getUint8(offset);
            const raw = new Uint8Array(view.buffer, view.byteOffset + offset + 1, size - 1);
            // Strip null terminators
            let end = raw.length;
            while (end > 0 && (raw[end-1] === 0 || raw[end-1] === 0xFE || raw[end-1] === 0xFF)) end--;
            if (enc === 1 || enc === 2) {
                // UTF-16 — skip BOM
                const start = (raw[0] === 0xFF && raw[1] === 0xFE) || (raw[0] === 0xFE && raw[1] === 0xFF) ? 2 : 0;
                return new TextDecoder('utf-16le').decode(raw.slice(start, end)).replace(/\0/g, '').trim();
            }
            return (enc === 3 ? dec : decLatin).decode(raw.slice(0, end)).replace(/\0/g, '').trim();
        } catch { return null; }
    }



    static parseID3CoverArt(buffer) {
        try {
            const view = new DataView(buffer);
            const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
            if (header !== 'ID3') return null;
            
            const majorVersion = view.getUint8(3);
            const minorVersion = view.getUint8(4);
            const flags = view.getUint8(5);
            
            let tagSize = 0;
            for (let i = 0; i < 4; i++) {
                tagSize = (tagSize << 7) | (view.getUint8(6 + i) & 0x7F);
            }
            
            let offset = 10;
            if (flags & 0x40) {
                const extHeaderSize = view.getUint32(offset);
                offset += 4 + extHeaderSize;
            }
            
            const tagEnd = Math.min(10 + tagSize, buffer.byteLength);
            
            while (offset < tagEnd - 10) {
                let frameId = '';
                let frameSize = 0;
                
                if (majorVersion >= 3) {
                    frameId = String.fromCharCode(
                        view.getUint8(offset), view.getUint8(offset + 1),
                        view.getUint8(offset + 2), view.getUint8(offset + 3)
                    );
                    if (majorVersion === 4) {
                        for (let i = 0; i < 4; i++) {
                            frameSize = (frameSize << 7) | (view.getUint8(offset + 4 + i) & 0x7F);
                        }
                    } else {
                        frameSize = view.getUint32(offset + 4);
                    }
                    offset += 10;
                } else {
                    frameId = String.fromCharCode(
                        view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2)
                    );
                    frameSize = (view.getUint8(offset + 3) << 16) | 
                               (view.getUint8(offset + 4) << 8) | 
                                view.getUint8(offset + 5);
                    offset += 6;
                }
                
                if (frameId === 'APIC' || frameId === 'PIC') {
                    return this.extractPictureData(view, offset, frameSize, majorVersion);
                }
                offset += frameSize;
                if (frameSize === 0 || offset >= tagEnd) break;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    static extractPictureData(view, offset, frameSize, majorVersion) {
        try {
            const frameEnd = offset + frameSize;
            let pos = offset;
            
            const textEncoding = view.getUint8(pos); pos++;
            
            let mimeType = '';
            while (pos < frameEnd && view.getUint8(pos) !== 0) {
                mimeType += String.fromCharCode(view.getUint8(pos));
                pos++;
            }
            pos++;
            
            const pictureType = view.getUint8(pos); pos++;
            
            while (pos < frameEnd && view.getUint8(pos) !== 0) {
                pos++;
            }
            pos++;
            
            const imageDataSize = frameEnd - pos;
            if (imageDataSize > 0) {
                const imageData = new Uint8Array(view.buffer, view.byteOffset + pos, imageDataSize);
                return {
                    format: mimeType || 'image/jpeg',
                    data: imageData
                };
            }
        } catch (error) {
            console.error('Extract Picture Data err:', error);
        }
        return null;
    }
}
