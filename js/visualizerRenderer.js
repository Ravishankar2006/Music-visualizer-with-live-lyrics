import { ColorExtractor } from './colorExtractor.js';

export class VisualizerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        // Mode: 'bars' | 'radial'
        this.mode = 'bars';
        this._modes = ['bars', 'radial'];

        // Colour palette (HSL objects) — updated from cover art
        this.palette = ColorExtractor.defaultPalette();

        // Peak markers (bars mode)
        this.peaks          = [];
        this.peakVelocities = [];

        // Beat flash
        this.beatFlashAlpha = 0;
        this.beatFlashHue   = 220;

        // Radial rotation (slow spin on idle)
        this._radialAngle = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    // ─── Public API ────────────────────────────────────────────

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = this.mode === 'radial'
            ? window.innerHeight
            : window.innerHeight * 0.45;
    }

    /** Cycle to the next visualizer mode. Returns the new mode name. */
    nextMode() {
        const idx = this._modes.indexOf(this.mode);
        this.mode = this._modes[(idx + 1) % this._modes.length];
        // Reset per-mode state
        this.peaks = [];
        return this.mode;
    }

    /** Set colour palette from cover art URL (async, non-blocking). */
    async setPaletteFromUrl(imageUrl) {
        this.palette = await ColorExtractor.extract(imageUrl, 4);
    }

    /** Reset to neutral palette (no cover art). */
    resetPalette() {
        this.palette = ColorExtractor.defaultPalette();
    }

    // ─── Main render dispatch ──────────────────────────────────

    render(audioData, isPlaying) {
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);

        if (!audioData || !isPlaying) {
            this._drawIdle();
            return;
        }

        const { dataArray, bufferLength } = audioData;
        this._detectBeat(dataArray, bufferLength);
        this._drawBeatFlash();

        switch (this.mode) {
            case 'bars':   this._drawBars(dataArray, bufferLength);   break;
            case 'radial': this._drawRadial(dataArray, bufferLength); break;
        }
    }

    // ─── Beat detection ────────────────────────────────────────

    _detectBeat(dataArray, bufferLength) {
        const bassLen = Math.floor(bufferLength * 0.1);
        let bassSum = 0;
        for (let i = 0; i < bassLen; i++) bassSum += dataArray[i];
        const bassAvg = bassSum / bassLen;

        if (bassAvg > 200) {
            this.beatFlashAlpha = 0.16;
            // Tint flash with the dominant palette colour
            this.beatFlashHue = this.palette[0]?.h ?? 220;
        } else {
            this.beatFlashAlpha *= 0.82;
        }
    }

    _drawBeatFlash() {
        if (this.beatFlashAlpha < 0.005) return;
        const { width, height } = this.canvas;
        const g = this.ctx.createRadialGradient(
            width / 2, height, 0,
            width / 2, height, width * 0.8
        );
        g.addColorStop(0, `hsla(${this.beatFlashHue},80%,60%,${this.beatFlashAlpha})`);
        g.addColorStop(1, `hsla(${this.beatFlashHue},80%,60%,0)`);
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, width, height);
    }

    // ─── Idle / static state ───────────────────────────────────

    _drawIdle() {
        const { width, height } = this.canvas;
        const centerY = height / 2;
        const count   = 80;
        const gap     = 2;
        const bw      = (width - gap * (count - 1)) / count;
        const h0      = this.palette[0]?.h ?? 220;

        for (let i = 0; i < count; i++) {
            const x  = i * (bw + gap);
            const bh = Math.random() * 2 + 1;
            this.ctx.fillStyle = `hsla(${(h0 + i * 2) % 360},60%,65%,0.15)`;
            this.ctx.fillRect(x, centerY - bh / 2, bw, bh);
        }
    }

    // ══════════════════════════════════════════════════════════
    //   MODE 1 — MIRRORED BARS
    // ══════════════════════════════════════════════════════════

    _drawBars(dataArray, bufferLength) {
        const { width, height } = this.canvas;
        const usefulLen  = Math.floor(bufferLength * 0.4);
        const gap        = 2;
        const bw         = (width - gap * (usefulLen - 1)) / usefulLen;
        const centerY    = height / 2;
        const maxHalf    = height * 0.47;

        if (this.peaks.length !== usefulLen) {
            this.peaks          = new Array(usefulLen).fill(0);
            this.peakVelocities = new Array(usefulLen).fill(0);
        }

        for (let i = 0; i < usefulLen; i++) {
            const raw = dataArray[i] / 255;
            const bh  = Math.pow(raw, 1.2) * maxHalf;
            if (bh < 1) continue;

            const x = i * (bw + gap);

            // Pick glow colour from palette at bar position
            const { h, s } = ColorExtractor.interpolate(this.palette, i / usefulLen);
            // Shift lightness by amplitude (louder = warmer hue shift)
            const glowH     = h - raw * 30;
            const glowAlpha = 0.3 + raw * 0.7;
            const glowSpread = 6 + raw * 22;

            // Upper bar
            const alphaTop = 0.55 + raw * 0.45;
            const gradUp   = this.ctx.createLinearGradient(0, centerY - bh, 0, centerY);
            gradUp.addColorStop(0,   `rgba(255,255,255,${alphaTop})`);
            gradUp.addColorStop(0.6, `rgba(255,255,255,${alphaTop * 0.8})`);
            gradUp.addColorStop(1,   `rgba(255,255,255,0.04)`);

            this.ctx.shadowColor = `hsla(${glowH},${s}%,70%,${glowAlpha})`;
            this.ctx.shadowBlur  = glowSpread;
            this.ctx.fillStyle   = gradUp;
            this._roundedBar(x, centerY - bh, bw, bh, 3);

            // Mirror bar
            const gradDown = this.ctx.createLinearGradient(0, centerY, 0, centerY + bh);
            gradDown.addColorStop(0, `rgba(255,255,255,${alphaTop * 0.3})`);
            gradDown.addColorStop(1, `rgba(255,255,255,0)`);
            this.ctx.fillStyle  = gradDown;
            this.ctx.shadowBlur = 0;
            this._roundedBar(x, centerY, bw, bh, 3);

            // Peak marker
            if (bh >= this.peaks[i]) {
                this.peaks[i]          = bh;
                this.peakVelocities[i] = 0;
            } else {
                this.peakVelocities[i] += 0.4;
                this.peaks[i] -= this.peakVelocities[i];
                if (this.peaks[i] < 0) this.peaks[i] = 0;
            }

            if (this.peaks[i] > 3) {
                const peakY     = centerY - this.peaks[i] - 4;
                const peakAlpha = Math.min(1, this.peaks[i] / maxHalf * 1.5);
                this.ctx.shadowColor = `hsla(${glowH},${s}%,85%,${peakAlpha * 0.9})`;
                this.ctx.shadowBlur  = 8;
                this.ctx.fillStyle   = `rgba(255,255,255,${peakAlpha})`;
                this.ctx.beginPath();
                this.ctx.arc(x + bw / 2, peakY, Math.min(bw / 2, 3), 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }

        // Centre divider
        this.ctx.shadowBlur   = 0;
        this.ctx.strokeStyle  = 'rgba(255,255,255,0.12)';
        this.ctx.lineWidth    = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(width, centerY);
        this.ctx.stroke();
    }

    // ══════════════════════════════════════════════════════════
    //   MODE 2 — RADIAL / CIRCULAR
    // ══════════════════════════════════════════════════════════

    _drawRadial(dataArray, bufferLength) {
        const { width, height } = this.canvas;
        const cx = width / 2;
        const cy = height / 2;

        const usefulLen = Math.floor(bufferLength * 0.6);
        // innerR is just outside the 170px cover art (half = 85px)
        const innerR    = 108;
        const maxBarLen = Math.min(width, height) * 0.36;
        const angleStep = (Math.PI * 2) / usefulLen;

        // Slightly faster rotation for liveliness
        this._radialAngle += 0.0015;

        // ── Dark vignette behind cover art so it pops over the ring ──
        const vigR = innerR - 4;
        const vig  = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, vigR);
        vig.addColorStop(0,   'rgba(0,0,0,0.82)');
        vig.addColorStop(0.75,'rgba(0,0,0,0.60)');
        vig.addColorStop(1,   'rgba(0,0,0,0)');
        this.ctx.fillStyle = vig;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, vigR, 0, Math.PI * 2);
        this.ctx.fill();

        // ── Radial bars ──
        for (let i = 0; i < usefulLen; i++) {
            const raw = dataArray[i] / 255;
            const len = Math.pow(raw, 0.85) * maxBarLen;
            if (len < 1) continue;

            const angle = this._radialAngle + i * angleStep - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * (innerR + len);
            const y2 = cy + Math.sin(angle) * (innerR + len);

            const { h, s } = ColorExtractor.interpolate(this.palette, i / usefulLen);
            const glowHue = (h - raw * 30 + 360) % 360;

            this.ctx.shadowColor = `hsla(${glowHue},${s}%,70%,${0.35 + raw * 0.65})`;
            this.ctx.shadowBlur  = 8 + raw * 28;
            this.ctx.strokeStyle = `rgba(255,255,255,${0.45 + raw * 0.55})`;
            this.ctx.lineWidth   = Math.max(1.5, 2 + raw * 4);
            this.ctx.lineCap     = 'round';

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }

        // ── Bass-pulsing border circle around cover art ──
        const bassRaw  = dataArray[0] / 255;
        const midRaw   = dataArray[Math.floor(usefulLen * 0.3)] / 255;
        const circleR  = innerR * (0.92 + bassRaw * 0.12);
        const { h: h0, s: s0 } = this.palette[0] ?? { h: 220, s: 80 };
        const { h: h1, s: s1 } = this.palette[1] ?? { h: h0 + 40, s: s0 };

        // Outer glow ring (wider, dimmer)
        this.ctx.shadowColor = `hsla(${h0},${s0}%,75%,${0.6 + bassRaw * 0.4})`;
        this.ctx.shadowBlur  = 18 + bassRaw * 40;
        this.ctx.strokeStyle = `hsla(${h1},${s1}%,80%,${0.3 + midRaw * 0.5})`;
        this.ctx.lineWidth   = 1 + bassRaw * 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, circleR + 8, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner tight ring
        this.ctx.shadowBlur  = 6 + bassRaw * 20;
        this.ctx.strokeStyle = `rgba(255,255,255,${0.5 + bassRaw * 0.5})`;
        this.ctx.lineWidth   = 1.5 + bassRaw * 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    // ─── Shared drawing helper ─────────────────────────────────

    _roundedBar(x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, Math.abs(height) / 2);
        if (height === 0) return;
        const isUp  = height > 0;
        const top   = isUp ? y : y + height;
        const bottom = isUp ? y + height : y;
        this.ctx.beginPath();
        if (isUp) {
            this.ctx.moveTo(x, bottom);
            this.ctx.lineTo(x, top + r);
            this.ctx.quadraticCurveTo(x, top, x + r, top);
            this.ctx.lineTo(x + width - r, top);
            this.ctx.quadraticCurveTo(x + width, top, x + width, top + r);
            this.ctx.lineTo(x + width, bottom);
        } else {
            this.ctx.moveTo(x, top);
            this.ctx.lineTo(x + width, top);
            this.ctx.lineTo(x + width, bottom - r);
            this.ctx.quadraticCurveTo(x + width, bottom, x + width - r, bottom);
            this.ctx.lineTo(x + r, bottom);
            this.ctx.quadraticCurveTo(x, bottom, x, bottom - r);
        }
        this.ctx.closePath();
        this.ctx.fill();
    }
}
