/**
 * LyricsEngine — LRC parser + frame-accurate sync
 *
 * Supports standard LRC: [mm:ss.xx] Line text
 * Multi-timestamp per line: [00:12.34][00:45.67] text
 *
 * Gap detection:
 *   Window to next line > GAP_THRESHOLD → surfaces state='break'
 *   so the UI shows a ♪ pulse instead of frozen text.
 */
export class LyricsEngine {
    static GAP_THRESHOLD = 4.5;  // seconds before we call it an instrumental break
    static BREAK_START   = 0.40; // show indicator after 40% of the gap window

    constructor() {
        this.lines    = [];
        this._loaded  = false;
        this._lastIdx = -1;
    }

    /** Parse an LRC string. Returns true if lines were found. */
    load(lrcText) {
        this.lines    = this._parse(lrcText);
        this._loaded  = this.lines.length > 0;
        this._lastIdx = -1;
        return this._loaded;
    }

    /** Remove loaded lyrics. */
    clear() {
        this.lines    = [];
        this._loaded  = false;
        this._lastIdx = -1;
    }

    get isLoaded() { return this._loaded; }

    /**
     * Call each animation frame with audio.currentTime.
     * Returns null when no lyrics, otherwise:
     * {
     *   state:    'before' | 'active' | 'break',
     *   changed:  boolean,
     *   prev:     string,
     *   current:  string,
     *   next:     string,
     *   progress: number,   // 0–1 through current line's time window
     * }
     */
    sync(t) {
        if (!this._loaded) return null;

        // Binary-search: last line with time ≤ t
        let lo = 0, hi = this.lines.length - 1, idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.lines[mid].time <= t) { idx = mid; lo = mid + 1; }
            else hi = mid - 1;
        }

        if (idx === -1) {
            return { state: 'before', changed: false, prev: '', current: '', next: this.lines[0]?.text ?? '', progress: 0 };
        }

        const changed = idx !== this._lastIdx;
        this._lastIdx = idx;

        const cur  = this.lines[idx];
        const next = this.lines[idx + 1] ?? null;
        const prev = idx > 0 ? this.lines[idx - 1] : null;

        let state = 'active', progress = 0;
        if (next) {
            const winDur  = next.time - cur.time;
            const elapsed = t - cur.time;
            progress = Math.min(1, elapsed / winDur);
            if (winDur > LyricsEngine.GAP_THRESHOLD && progress > LyricsEngine.BREAK_START) {
                state = 'break';
            }
        }

        return { state, changed, prev: prev?.text ?? '', current: cur.text, next: next?.text ?? '', progress };
    }

    // ── LRC Parser ───────────────────────────────────────────────

    _parse(lrc) {
        const out     = [];
        const TIME_RE = /\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]/g;
        const META_RE = /^\[(?:ar|ti|al|by|offset|length|re|ve|#):/i;

        for (const raw of lrc.split('\n')) {
            const line = raw.trim();
            if (!line || META_RE.test(line)) continue;

            const text = line.replace(/\[\d{1,3}:\d{2}(?:\.\d+)?\]/g, '').trim();
            if (!text) continue; // skip blank / instrumental marker lines

            TIME_RE.lastIndex = 0;
            let m;
            while ((m = TIME_RE.exec(line)) !== null) {
                const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
                out.push({ time, text });
            }
        }

        return out.sort((a, b) => a.time - b.time);
    }
}
