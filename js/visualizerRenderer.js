import { ColorExtractor } from './colorExtractor.js';

export class VisualizerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        // Mode: 'bars' | 'radial'
        this.mode   = 'bars';
        this._modes = ['bars', 'radial'];

        // Colour palette (HSL objects) — updated from cover art
        this.palette = ColorExtractor.defaultPalette();

        // Peak markers (bars mode)
        this.peaks          = [];
        this.peakVelocities = [];

        // Beat flash
        this.beatFlashAlpha = 0;
        this.beatFlashHue   = 220;

        // Radial rotation
        this._radialAngle = 0;

        // Particles
        this._particles        = [];
        this._particleCooldown = 0;

        // Frame timing for particle physics
        this._lastFrameTime = performance.now();

        // Aurora smoothed intensity
        this._auroraIntensity = 0;

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

    nextMode() {
        const idx  = this._modes.indexOf(this.mode);
        this.mode  = this._modes[(idx + 1) % this._modes.length];
        this.peaks = [];
        return this.mode;
    }

    async setPaletteFromUrl(imageUrl) {
        this.palette = await ColorExtractor.extract(imageUrl, 4);
    }

    resetPalette() {
        this.palette = ColorExtractor.defaultPalette();
    }

    // ─── Main render dispatch ──────────────────────────────────

    render(audioData, isPlaying) {
        const now = performance.now();
        const dt  = Math.min((now - this._lastFrameTime) / 1000, 0.05);
        this._lastFrameTime = now;

        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);

        if (!audioData || !isPlaying) {
            this._drawIdle();
            return;
        }

        const { dataArray, bufferLength } = audioData;

        // Order matters: aurora → beat flash → bars/radial → particles on top
        this._detectBeat(dataArray, bufferLength, dt);
        this._drawAurora(dataArray, bufferLength);
        this._drawBeatFlash();
        this._updateParticles(dt);

        switch (this.mode) {
            case 'bars':   this._drawBars(dataArray, bufferLength);   break;
            case 'radial': this._drawRadial(dataArray, bufferLength); break;
        }

        this._drawParticles();
    }

    // ─── Beat detection ────────────────────────────────────────

    _detectBeat(dataArray, bufferLength, dt) {
        const bassLen = Math.floor(bufferLength * 0.1);
        let bassSum = 0;
        for (let i = 0; i < bassLen; i++) bassSum += dataArray[i];
        const bassAvg = bassSum / bassLen;

        if (bassAvg > 200) {
            this.beatFlashAlpha = 0.16;
            this.beatFlashHue   = this.palette[0]?.h ?? 220;

            // Spawn particles on strong beats with cooldown
            if (this._particleCooldown <= 0) {
                const { width, height } = this.canvas;
                const cx = width / 2;
                const cy = this.mode === 'radial' ? height / 2 : height * 0.5;
                const count = Math.round(14 + (bassAvg - 200) / 55 * 14);
                this._spawnParticles(cx, cy, count);
                this._particleCooldown = 0.22;
            }
        } else {
            this.beatFlashAlpha *= 0.82;
        }

        if (this._particleCooldown > 0) this._particleCooldown -= dt;
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

    // ─── Aurora background ─────────────────────────────────────

    _drawAurora(dataArray, bufferLength) {
        const { width, height } = this.canvas;

        // Average bass energy
        const bassLen = Math.floor(bufferLength * 0.08);
        let bassSum = 0;
        for (let i = 0; i < bassLen; i++) bassSum += dataArray[i];
        const bassRaw = (bassSum / bassLen) / 255;

        // Smooth intensity: fast attack, slow decay
        this._auroraIntensity += (bassRaw - this._auroraIntensity)
            * (bassRaw > this._auroraIntensity ? 0.35 : 0.05);
        const intensity = this._auroraIntensity;
        if (intensity < 0.015) return;

        const { h: h0, s: s0 } = this.palette[0] ?? { h: 220, s: 80 };
        const { h: h1, s: s1 } = this.palette[1] ?? { h: (h0 + 60) % 360, s: s0 };
        const h2 = (h0 + 130) % 360;

        const alpha = intensity * 0.30;

        // Primary blob — bottom center, expands with bass
        const r1 = width * (0.55 + intensity * 0.2);
        const g1 = this.ctx.createRadialGradient(
            width * 0.5, height * (1.05 - intensity * 0.25), 0,
            width * 0.5, height,
            r1
        );
        g1.addColorStop(0,   `hsla(${h0},${s0}%,55%,${(alpha * 0.95).toFixed(3)})`);
        g1.addColorStop(0.45,`hsla(${h0},${s0}%,45%,${(alpha * 0.35).toFixed(3)})`);
        g1.addColorStop(1,   `hsla(${h0},${s0}%,35%,0)`);
        this.ctx.fillStyle = g1;
        this.ctx.fillRect(0, 0, width, height);

        // Secondary blob — top-left, complementary hue
        const r2 = width * (0.38 + intensity * 0.12);
        const g2 = this.ctx.createRadialGradient(
            width * 0.12, height * 0.18, 0,
            width * 0.12, height * 0.18,
            r2
        );
        g2.addColorStop(0, `hsla(${h1},${s1}%,50%,${(alpha * 0.55).toFixed(3)})`);
        g2.addColorStop(1, `hsla(${h1},${s1}%,40%,0)`);
        this.ctx.fillStyle = g2;
        this.ctx.fillRect(0, 0, width, height);

        // Tertiary blob — right side, triadic hue
        const r3 = width * (0.28 + intensity * 0.1);
        const g3 = this.ctx.createRadialGradient(
            width * 0.88, height * 0.55, 0,
            width * 0.88, height * 0.55,
            r3
        );
        g3.addColorStop(0, `hsla(${h2},70%,50%,${(alpha * 0.42).toFixed(3)})`);
        g3.addColorStop(1, `hsla(${h2},70%,40%,0)`);
        this.ctx.fillStyle = g3;
        this.ctx.fillRect(0, 0, width, height);
    }

    // ─── Particles ─────────────────────────────────────────────

    _spawnParticles(cx, cy, count) {
        const { h, s } = this.palette[0] ?? { h: 220, s: 80 };
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 90 + Math.random() * 230;
            const hue   = (h + (Math.random() - 0.5) * 70 + 360) % 360;
            this._particles.push({
                x:     cx + (Math.random() - 0.5) * 16,
                y:     cy + (Math.random() - 0.5) * 16,
                vx:    Math.cos(angle) * speed,
                vy:    Math.sin(angle) * speed,
                life:  1.0,
                decay: 1.4 + Math.random() * 1.6,
                size:  2 + Math.random() * 4.5,
                h:     hue,
                s:     s,
            });
        }
        // Cap to avoid runaway memory
        if (this._particles.length > 350) {
            this._particles.splice(0, this._particles.length - 350);
        }
    }

    _updateParticles(dt) {
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
            p.vx *= 0.93; // air friction
            p.vy *= 0.93;
            p.life -= p.decay * dt;
            if (p.life <= 0) this._particles.splice(i, 1);
        }
    }

    _drawParticles() {
        if (this._particles.length === 0) return;
        const ctx = this.ctx;
        ctx.save();
        for (const p of this._particles) {
            const alpha = Math.pow(Math.max(0, p.life), 1.5);
            const r     = Math.max(0.5, p.size * p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle  = `hsla(${p.h},${p.s}%,78%,${alpha.toFixed(3)})`;
            ctx.shadowColor = `hsla(${p.h},${p.s}%,78%,${(alpha * 0.65).toFixed(3)})`;
            ctx.shadowBlur  = 7;
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
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
    //   MODE 1 — CENTER-MIRRORED BARS (LOGARITHMIC SCALE)
    // ══════════════════════════════════════════════════════════

    _drawBars(dataArray, bufferLength) {
        const { width, height } = this.canvas;
        // Only use lower 50% of FFT bins (audible range)
        const usefulLen = Math.floor(bufferLength * 0.5);
        const gap       = 2;
        const N         = 80;                    // bars per side → 160 total
        const bw        = (width - gap * (N * 2 - 1)) / (N * 2);
        const centerY   = height / 2;
        const maxHalf   = height * 0.47;

        // Re-init peaks array if bar count changed
        if (this.peaks.length !== N) {
            this.peaks          = new Array(N).fill(0);
            this.peakVelocities = new Array(N).fill(0);
        }

        for (let j = 0; j < N; j++) {
            // Logarithmic bin: j=0 → lowest freq, j=N-1 → highest
            const t      = j / (N - 1);
            const binIdx = Math.min(
                Math.round(Math.pow(t, 1.9) * usefulLen),
                usefulLen - 1
            );
            const raw = dataArray[binIdx] / 255;
            const bh  = Math.pow(raw, 1.15) * maxHalf;

            // Color along palette gradient
            const { h, s }   = ColorExtractor.interpolate(this.palette, t);
            const glowH      = (h - raw * 30 + 360) % 360;
            const glowAlpha  = 0.3 + raw * 0.7;
            const glowSpread = 6 + raw * 22;
            const alphaTop   = 0.55 + raw * 0.45;

            // Left bar: j=0 at far-left edge, j=N-1 is just left of center
            const xLeft  = (N - 1 - j) * (bw + gap);
            // Right bar: j=0 just right of center, j=N-1 at far-right edge
            const xRight = (N + j)     * (bw + gap);

            if (bh >= 1) {
                for (const x of [xLeft, xRight]) {
                    // Upper bar
                    const gradUp = this.ctx.createLinearGradient(0, centerY - bh, 0, centerY);
                    gradUp.addColorStop(0,   `rgba(255,255,255,${alphaTop.toFixed(3)})`);
                    gradUp.addColorStop(0.6, `rgba(255,255,255,${(alphaTop * 0.8).toFixed(3)})`);
                    gradUp.addColorStop(1,   `rgba(255,255,255,0.04)`);

                    this.ctx.shadowColor = `hsla(${glowH},${s}%,70%,${glowAlpha})`;
                    this.ctx.shadowBlur  = glowSpread;
                    this.ctx.fillStyle   = gradUp;
                    this._roundedBar(x, centerY - bh, bw, bh, 3);

                    // Mirror reflection below centerline
                    const gradDown = this.ctx.createLinearGradient(0, centerY, 0, centerY + bh);
                    gradDown.addColorStop(0, `rgba(255,255,255,${(alphaTop * 0.3).toFixed(3)})`);
                    gradDown.addColorStop(1, `rgba(255,255,255,0)`);
                    this.ctx.fillStyle  = gradDown;
                    this.ctx.shadowBlur = 0;
                    this._roundedBar(x, centerY, bw, bh, 3);
                }
            }

            // Peak markers (one per frequency bin, drawn on both sides)
            if (bh >= this.peaks[j]) {
                this.peaks[j]          = bh;
                this.peakVelocities[j] = 0;
            } else {
                this.peakVelocities[j] += 0.4;
                this.peaks[j] -= this.peakVelocities[j];
                if (this.peaks[j] < 0) this.peaks[j] = 0;
            }

            const peakH = this.peaks[j];
            if (peakH > 3) {
                const peakY     = centerY - peakH - 4;
                const peakAlpha = Math.min(1, peakH / maxHalf * 1.5);
                this.ctx.shadowColor = `hsla(${glowH},${s}%,85%,${(peakAlpha * 0.9).toFixed(3)})`;
                this.ctx.shadowBlur  = 8;
                this.ctx.fillStyle   = `rgba(255,255,255,${peakAlpha.toFixed(3)})`;
                const pr = Math.min(bw / 2, 3);
                // Left peak dot
                this.ctx.beginPath();
                this.ctx.arc(xLeft + bw / 2, peakY, pr, 0, Math.PI * 2);
                this.ctx.fill();
                // Right peak dot
                this.ctx.beginPath();
                this.ctx.arc(xRight + bw / 2, peakY, pr, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }

        // Centre divider line
        this.ctx.shadowBlur  = 0;
        this.ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        this.ctx.lineWidth   = 1;
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
        const cx = width  / 2;
        const cy = height / 2;

        const usefulLen = Math.floor(bufferLength * 0.6);
        const innerR    = 108;
        const maxBarLen = Math.min(width, height) * 0.36;
        const angleStep = (Math.PI * 2) / usefulLen;

        this._radialAngle += 0.0015;

        // Dark vignette behind cover art
        const vigR = innerR - 4;
        const vig  = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, vigR);
        vig.addColorStop(0,    'rgba(0,0,0,0.82)');
        vig.addColorStop(0.75, 'rgba(0,0,0,0.60)');
        vig.addColorStop(1,    'rgba(0,0,0,0)');
        this.ctx.fillStyle = vig;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, vigR, 0, Math.PI * 2);
        this.ctx.fill();

        // Radial bars with log-scale mapping
        for (let i = 0; i < usefulLen; i++) {
            const t      = i / usefulLen;
            const binIdx = Math.min(
                Math.round(Math.pow(t, 1.6) * usefulLen),
                usefulLen - 1
            );
            const raw = dataArray[binIdx] / 255;
            const len = Math.pow(raw, 0.85) * maxBarLen;
            if (len < 1) continue;

            const angle = this._radialAngle + i * angleStep - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * (innerR + len);
            const y2 = cy + Math.sin(angle) * (innerR + len);

            const { h, s } = ColorExtractor.interpolate(this.palette, t);
            const glowHue  = (h - raw * 30 + 360) % 360;

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

        // Bass-pulsing border circles around cover art
        const bassRaw = dataArray[0] / 255;
        const midRaw  = dataArray[Math.floor(usefulLen * 0.3)] / 255;
        const circleR = innerR * (0.92 + bassRaw * 0.12);
        const { h: h0, s: s0 } = this.palette[0] ?? { h: 220, s: 80 };
        const { h: h1, s: s1 } = this.palette[1] ?? { h: h0 + 40, s: s0 };

        this.ctx.shadowColor = `hsla(${h0},${s0}%,75%,${0.6 + bassRaw * 0.4})`;
        this.ctx.shadowBlur  = 18 + bassRaw * 40;
        this.ctx.strokeStyle = `hsla(${h1},${s1}%,80%,${0.3 + midRaw * 0.5})`;
        this.ctx.lineWidth   = 1 + bassRaw * 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, circleR + 8, 0, Math.PI * 2);
        this.ctx.stroke();

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
        const r      = Math.min(radius, width / 2, Math.abs(height) / 2);
        if (height === 0) return;
        const isUp   = height > 0;
        const top    = isUp ? y : y + height;
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
