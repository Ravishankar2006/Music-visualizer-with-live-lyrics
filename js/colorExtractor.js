export class ColorExtractor {
    /**
     * Extracts a palette of dominant vibrant colors from an image URL.
     * Returns an array of { h, s, l } objects, or a default palette if no image.
     */
    static async extract(imageUrl, count = 5) {
        if (!imageUrl) return this.defaultPalette();

        try {
            const img = await this.loadImage(imageUrl);
            const pixels = this.samplePixels(img, 100); // Sample a 100x100 grid
            const palette = this.findDominantColors(pixels, count);
            return palette.length >= 2 ? palette : this.defaultPalette();
        } catch (e) {
            console.warn('ColorExtractor failed, using default palette:', e);
            return this.defaultPalette();
        }
    }

    static loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    static samplePixels(img, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        const pixels = [];
        // Sample every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue; // Skip transparent
            pixels.push(this.rgbToHsl(r, g, b));
        }
        return pixels;
    }

    static findDominantColors(pixels, count) {
        // Filter to only vibrant (saturated and not too dark or too bright) pixels
        const vibrant = pixels.filter(p => p.s > 25 && p.l > 15 && p.l < 80);
        if (vibrant.length === 0) return this.defaultPalette();

        // Bucket pixels into hue ranges (every 30 degrees = 12 buckets)
        const buckets = {};
        for (const p of vibrant) {
            const key = Math.floor(p.h / 30) * 30;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(p);
        }

        // Sort buckets by size and pick the top N
        const sorted = Object.entries(buckets)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, count);

        // Average each bucket to get a representative color
        return sorted.map(([, group]) => {
            const avgH = group.reduce((sum, p) => sum + p.h, 0) / group.length;
            const avgS = group.reduce((sum, p) => sum + p.s, 0) / group.length;
            const avgL = group.reduce((sum, p) => sum + p.l, 0) / group.length;
            // Boost saturation for visualizer vividness
            return { h: avgH, s: Math.min(100, avgS * 1.3), l: Math.min(75, Math.max(45, avgL)) };
        });
    }

    static rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    static defaultPalette() {
        // Fallback: a smooth blue → purple → pink gradient
        return [
            { h: 220, s: 80, l: 60 },
            { h: 270, s: 80, l: 60 },
            { h: 320, s: 80, l: 60 },
        ];
    }

    /**
     * Interpolates between palette colors for a normalized position t (0–1).
     * Returns { h, s, l }
     */
    static interpolate(palette, t) {
        if (palette.length === 1) return palette[0];
        const scaled = t * (palette.length - 1);
        const idx = Math.floor(scaled);
        const frac = scaled - idx;
        const c1 = palette[Math.min(idx, palette.length - 1)];
        const c2 = palette[Math.min(idx + 1, palette.length - 1)];
        return {
            h: c1.h + (c2.h - c1.h) * frac,
            s: c1.s + (c2.s - c1.s) * frac,
            l: c1.l + (c2.l - c1.l) * frac,
        };
    }
}
