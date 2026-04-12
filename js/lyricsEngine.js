export class LyricsEngine {
    constructor() {
        this.lyrics = [];
    }

    parse(content, filename) {
        if (filename.endsWith('.lrc')) {
            this.lyrics = this.parseLRC(content);
        } else {
            this.lyrics = this.parsePlainText(content);
        }
    }

    parseLRC(content) {
        const lines = content.split('\n');
        const lyrics = [];
        lines.forEach(line => {
            const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseInt(timeMatch[2]);
                const centiseconds = parseInt(timeMatch[3]);
                const time = minutes * 60 + seconds + centiseconds / 100;
                const text = timeMatch[4].trim();
                if (text.length > 0) {
                    lyrics.push({ time, text, words: text.split(' ') });
                }
            }
        });
        return lyrics.sort((a, b) => a.time - b.time);
    }

    parsePlainText(content) {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const lyrics = [];
        let currentTime = 0;
        lines.forEach(line => {
            lyrics.push({ time: currentTime, text: line, words: line.split(' ') });
            currentTime += 4; // 4 seconds per line
        });
        return lyrics;
    }

    getCurrentLyricIndex(currentTime) {
        if (!this.lyrics || this.lyrics.length === 0) return 0;
        let index = 0;
        for (let i = 0; i < this.lyrics.length; i++) {
            if (currentTime >= this.lyrics[i].time) {
                index = i;
            } else {
                break;
            }
        }
        return index;
    }
}
