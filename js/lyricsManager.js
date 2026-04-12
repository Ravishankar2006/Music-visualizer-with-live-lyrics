export class LyricsManager {
    constructor(displayEl) {
        this.el = displayEl;
        this.lines = [];       // [{ time, text, words[] }]
        this.currentIndex = -1;
        this.currentWordIndex = 0;
    }

    // ─── Load & Parse ────────────────────────────────────────

    load(content, filename) {
        this.lines = filename.toLowerCase().endsWith('.lrc')
            ? this._parseLRC(content)
            : this._parsePlain(content);
        this.currentIndex = -1;
        this.currentWordIndex = 0;
        this._render();
        return this.lines.length;
    }

    _parseLRC(content) {
        const result = [];
        for (const raw of content.split('\n')) {
            const line = raw.trim();
            // Matches [mm:ss.xx] or [mm:ss:xx]
            const m = line.match(/^\[(\d{1,2}):(\d{2})[.:,](\d{2,3})\](.*)/);
            if (!m) continue;
            const ms = m[3].length === 3 ? parseInt(m[3]) : parseInt(m[3]) * 10;
            const time = parseInt(m[1]) * 60 + parseInt(m[2]) + ms / 1000;
            const text = m[4].trim();
            if (text) result.push({ time, text, words: text.split(/\s+/) });
        }
        return result.sort((a, b) => a.time - b.time);
    }

    _parsePlain(content) {
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
        return lines.map((text, i) => ({
            time: i * 4,
            text,
            words: text.split(/\s+/)
        }));
    }

    // ─── Sync (called on every timeupdate) ───────────────────

    sync(currentTime) {
        if (!this.lines.length) return;

        // Find active line index: last line whose time <= currentTime
        let idx = -1;
        for (let i = 0; i < this.lines.length; i++) {
            if (currentTime >= this.lines[i].time) idx = i;
            else break;
        }

        // Find active word within the current line
        let wordIdx = 0;
        if (idx >= 0) {
            const line = this.lines[idx];
            const nextTime = this.lines[idx + 1]?.time ?? (line.time + 5);
            const lineDuration = Math.max(nextTime - line.time, 0.5);
            const elapsed = currentTime - line.time;
            const wordDuration = lineDuration / line.words.length;
            wordIdx = Math.min(
                Math.floor(elapsed / wordDuration),
                line.words.length - 1
            );
            wordIdx = Math.max(0, wordIdx);
        }

        // Only re-render when something actually changed
        if (idx !== this.currentIndex || wordIdx !== this.currentWordIndex) {
            this.currentIndex = idx;
            this.currentWordIndex = wordIdx;
            this._render();
        }
    }

    // ─── DOM Rendering ─────────────────────────────────────────

    _render() {
        if (!this.lines.length) {
            this.el.innerHTML = '<div class="no-lyrics">🎤 Upload a lyrics file</div>';
            return;
        }

        if (this.currentIndex < 0) {
            // Before song starts — show placeholder
            this.el.innerHTML = '<div class="no-lyrics">🎵</div>';
            return;
        }

        const curLine = this.lines[this.currentIndex];
        const word    = curLine.words[this.currentWordIndex] ?? '';
        const key     = `${this.currentIndex}-${this.currentWordIndex}`;

        // Only touch the DOM when the word actually changes
        const existing = this.el.querySelector('.lyric-word-solo');
        if (existing && existing.dataset.key === key) return;

        // Build new element and trigger pop-in animation
        const span = document.createElement('span');
        span.className  = 'lyric-word-solo';
        span.dataset.key = key;
        span.textContent = word;

        this.el.innerHTML = '';
        this.el.appendChild(span);

        // Force reflow so animation restarts every word change
        void span.offsetWidth;
        span.classList.add('animate');
    }

    _esc(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ─── Controls ──────────────────────────────────────────────

    reset() {
        this.currentIndex = -1;
        this.currentWordIndex = 0;
        this._render();
    }

    clear() {
        this.lines = [];
        this.el.innerHTML = '<div class="no-lyrics">🎤 Upload a lyrics file</div>';
    }

    get isLoaded() {
        return this.lines.length > 0;
    }
}
