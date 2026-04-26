export class QueueManager {
    constructor() {
        this.tracks = []; // { id, audioFile, audioUrl, name }
        this.currentIndex = -1;
        this.onchange = null; // () => void — called whenever queue mutates
    }

    _notify() {
        if (typeof this.onchange === 'function') this.onchange();
    }

    addFiles(files) {
        const audioFiles = [];

        for (let file of files) {
            if (file.type.startsWith('audio/')) {
                audioFiles.push(file);
            }
        }

        audioFiles.forEach(audioFile => {
            const baseName = audioFile.name.replace(/\.[^/.]+$/, '');
            this.tracks.push({
                id: Math.random().toString(36).substr(2, 9),
                audioFile,
                audioUrl: URL.createObjectURL(audioFile),
                name: baseName,
            });
        });

        if (this.currentIndex === -1 && this.tracks.length > 0) {
            this.currentIndex = 0;
            this._notify();
            return { action: 'play_new', track: this.tracks[0] };
        }

        this._notify();
        return { action: 'queued' };
    }

    /** Jump to a specific index. Returns the track or null. */
    jumpTo(index) {
        if (index < 0 || index >= this.tracks.length) return null;
        this.currentIndex = index;
        this._notify();
        return this.tracks[index];
    }

    /** Remove a track by index. Returns true if removed. */
    remove(index) {
        if (index < 0 || index >= this.tracks.length) return false;
        URL.revokeObjectURL(this.tracks[index].audioUrl);
        this.tracks.splice(index, 1);
        if (this.currentIndex >= this.tracks.length) {
            this.currentIndex = this.tracks.length - 1;
        }
        this._notify();
        return true;
    }

    getCurrentTrack() {
        if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
            return this.tracks[this.currentIndex];
        }
        return null;
    }

    next() {
        if (this.currentIndex < this.tracks.length - 1) {
            this.currentIndex++;
            this._notify();
            return this.getCurrentTrack();
        }
        return null;
    }

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this._notify();
            return this.getCurrentTrack();
        }
        return null;
    }
}
