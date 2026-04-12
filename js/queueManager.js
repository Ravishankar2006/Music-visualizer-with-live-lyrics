export class QueueManager {
    constructor() {
        this.tracks = []; // { id, audioFile, audioUrl, name }
        this.currentIndex = -1;
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
            return { action: 'play_new', track: this.tracks[0] };
        }

        return { action: 'queued' };
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
            return this.getCurrentTrack();
        }
        return null;
    }

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.getCurrentTrack();
        }
        return null;
    }
}
