export class AudioProcessor {
    constructor(audioElement) {
        this.audio = audioElement;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.isInitialized = false;
        this.isPlaying = false;
        
        this.audio.addEventListener('play', () => this.isPlaying = true);
        this.audio.addEventListener('pause', () => this.isPlaying = false);
        this.audio.addEventListener('ended', () => this.isPlaying = false);
    }

    init() {
        if (this.isInitialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaElementSource(this.audio);
            
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.analyser.fftSize = 512; // Increased resolution
            this.analyser.smoothingTimeConstant = 0.15; // Extremely snappy response
            this.analyser.minDecibels = -70; // Narrow band makes visualizer jump much more
            this.analyser.maxDecibels = -20;
            
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing audio context:', error);
        }
    }

    getFrequencyData() {
        if (!this.isInitialized || !this.isPlaying) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return {
            dataArray: this.dataArray,
            bufferLength: this.bufferLength
        };
    }

    play() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
    }
}
