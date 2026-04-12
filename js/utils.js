export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function extractImageFromBuffer(uint8Array, startPos, mimeType) {
    try {
        let endPos = startPos + 1;
        if (mimeType === 'image/jpeg') {
            for (let i = startPos + 2; i < uint8Array.length - 1; i++) {
                if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xD9) {
                    endPos = i + 2;
                    break;
                }
            }
        } else if (mimeType === 'image/png') {
            for (let i = startPos + 8; i < uint8Array.length - 8; i++) {
                if (uint8Array[i] === 0x49 && uint8Array[i + 1] === 0x45 && 
                    uint8Array[i + 2] === 0x4E && uint8Array[i + 3] === 0x44) {
                    endPos = i + 8;
                    break;
                }
            }
        }
        if (endPos > startPos && endPos - startPos > 100) {
            return uint8Array.slice(startPos, endPos);
        }
    } catch (error) {
        console.error('Error extracting image from buffer:', error);
    }
    return null;
}
