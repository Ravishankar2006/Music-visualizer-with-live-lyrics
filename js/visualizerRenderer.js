export class VisualizerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.currentHue = 0;
        // Default palette (overridden when cover art is available)
        this.palette = [
            { h: 220, s: 80, l: 60 },
            { h: 270, s: 80, l: 60 },
            { h: 320, s: 80, l: 60 },
        ];

        // Peak markers per bar
        this.peaks = [];
        this.peakVelocities = [];

        // Beat detection
        this.beatFlashAlpha = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    // No palette needed — bars are white with dynamic glow
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight * 0.45;
    }

    render(audioData, isPlaying) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!audioData || !isPlaying) {
            this.drawStaticBars();
            return;
        }

        const { dataArray, bufferLength } = audioData;
        this.detectBeatFlash(dataArray, bufferLength);
        this.drawBeatFlash();
        this.drawBars(dataArray, bufferLength);
    }

    detectBeatFlash(dataArray, bufferLength) {
        // Compare the first 10% of bins (pure bass) for a strong kick
        const bassLength = Math.floor(bufferLength * 0.1);
        let bassSum = 0;
        for (let i = 0; i < bassLength; i++) bassSum += dataArray[i];
        const bassAvg = bassSum / bassLength;

        if (bassAvg > 200) { // Strong bass hit
            this.beatFlashAlpha = 0.18;
        } else {
            this.beatFlashAlpha *= 0.82; // Decay quickly
        }
    }

    drawBeatFlash() {
        if (this.beatFlashAlpha < 0.005) return;
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height, 0,
            this.canvas.width / 2, this.canvas.height, this.canvas.width * 0.8
        );
        gradient.addColorStop(0, `hsla(${this.currentHue}, 90%, 60%, ${this.beatFlashAlpha})`);
        gradient.addColorStop(1, `hsla(${this.currentHue}, 90%, 60%, 0)`);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawStaticBars() {
        const count = 80;
        const gap = 2;
        const totalGap = gap * (count - 1);
        const barWidth = (this.canvas.width - totalGap) / count;
        const centerY = this.canvas.height / 2;

        for (let i = 0; i < count; i++) {
            const x = i * (barWidth + gap);
            const barHeight = (Math.random() * 3 + 1);
            const hue = (this.currentHue + i * 3) % 360;
            this.ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.2)`;
            this.ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        }
    }

    roundedBar(x, y, width, height, radius) {
        // Draws a bar with a rounded top cap
        const r = Math.min(radius, width / 2, Math.abs(height) / 2);
        if (height === 0) return;

        const isUp = height > 0;
        const top = isUp ? y : y + height;
        const bottom = isUp ? y + height : y;

        this.ctx.beginPath();
        if (isUp) {
            // Top rounded, flat bottom
            this.ctx.moveTo(x, bottom);
            this.ctx.lineTo(x, top + r);
            this.ctx.quadraticCurveTo(x, top, x + r, top);
            this.ctx.lineTo(x + width - r, top);
            this.ctx.quadraticCurveTo(x + width, top, x + width, top + r);
            this.ctx.lineTo(x + width, bottom);
        } else {
            // Bottom rounded, flat top
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

    drawBars(dataArray, bufferLength) {
        const usefulLength = Math.floor(bufferLength * 0.4);
        const gap = 2;
        const totalGap = gap * (usefulLength - 1);
        const barWidth = (this.canvas.width - totalGap) / usefulLength;

        const centerY = this.canvas.height / 2;
        const maxHalfHeight = this.canvas.height * 0.47; // bars grow from center, so half the canvas

        // Init peaks array if needed
        if (this.peaks.length !== usefulLength) {
            this.peaks = new Array(usefulLength).fill(0);
            this.peakVelocities = new Array(usefulLength).fill(0);
        }

        for (let i = 0; i < usefulLength; i++) {
            const rawVal = dataArray[i] / 255;
            const barHeight = Math.pow(rawVal, 1.2) * maxHalfHeight;
            if (barHeight < 1) continue;
            const x = i * (barWidth + gap);

            // Glow hue: cool blue (220) on quiet bars → warm gold (45) on loud bars
            const glowHue = 220 - rawVal * 175; // 220 → 45 as amplitude rises
            const glowSat = 70 + rawVal * 30;
            const glowAlpha = 0.3 + rawVal * 0.7;
            const glowSpread = 6 + rawVal * 20;

            // ── Upper bar: white with height-driven glow ──
            const alphaTop = 0.55 + rawVal * 0.45;
            const gradientUp = this.ctx.createLinearGradient(0, centerY - barHeight, 0, centerY);
            gradientUp.addColorStop(0, `rgba(255,255,255,${alphaTop})`);          // bright white tip
            gradientUp.addColorStop(0.6, `rgba(255,255,255,${alphaTop * 0.8})`);  // solid body
            gradientUp.addColorStop(1, `rgba(255,255,255,0.05)`);                  // fade at base

            this.ctx.shadowColor = `hsla(${glowHue}, ${glowSat}%, 70%, ${glowAlpha})`;
            this.ctx.shadowBlur = glowSpread;
            this.ctx.fillStyle = gradientUp;
            this.roundedBar(x, centerY - barHeight, barWidth, barHeight, 3);

            // ── Mirror bar: faded white downward ──
            const gradientDown = this.ctx.createLinearGradient(0, centerY, 0, centerY + barHeight);
            gradientDown.addColorStop(0, `rgba(255,255,255,${alphaTop * 0.35})`);
            gradientDown.addColorStop(1, `rgba(255,255,255,0)`);

            this.ctx.fillStyle = gradientDown;
            this.ctx.shadowBlur = 0;
            this.roundedBar(x, centerY, barWidth, barHeight, 3);

            // ── Peak marker ──
            if (barHeight >= this.peaks[i]) {
                this.peaks[i] = barHeight;
                this.peakVelocities[i] = 0;
            } else {
                this.peakVelocities[i] += 0.4;
                this.peaks[i] -= this.peakVelocities[i];
                if (this.peaks[i] < 0) this.peaks[i] = 0;
            }

            if (this.peaks[i] > 3) {
                const peakY = centerY - this.peaks[i] - 4;
                const peakAlpha = Math.min(1, this.peaks[i] / maxHalfHeight * 1.5);
                this.ctx.shadowColor = `hsla(${glowHue}, ${glowSat}%, 85%, ${peakAlpha * 0.9})`;
                this.ctx.shadowBlur = 8;
                this.ctx.fillStyle = `rgba(255,255,255,${peakAlpha})`;
                this.ctx.beginPath();
                this.ctx.arc(x + barWidth / 2, peakY, Math.min(barWidth / 2, 3), 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }

        // Thin center divider line
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = `rgba(255,255,255,0.15)`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.canvas.width, centerY);
        this.ctx.stroke();
    }
}
