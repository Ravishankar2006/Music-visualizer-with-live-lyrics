import { AudioProcessor } from './audioProcessor.js';
import { VisualizerRenderer } from './visualizerRenderer.js';
import { MetadataParser } from './metadataParser.js';
import { QueueManager } from './queueManager.js';
import { formatTime } from './utils.js';

class App {
    constructor() {
        this.audioEl = document.getElementById('audio');
        this.audioProcessor = new AudioProcessor(this.audioEl);
        this.visualizer = new VisualizerRenderer(document.getElementById('visualizer'));
        this.queue = new QueueManager();

        // Beat detection state
        this._bassSmoothed = 0;

        // Mute state
        this._muted = false;
        this._volumeBeforeMute = 50;

        this._setupDOM();
        this._setupEvents();
        this._animationLoop();
    }

    // ─── DOM references ────────────────────────────────────────

    _setupDOM() {
        this.el = {
            uploadScreen:   document.getElementById('upload-screen'),
            uploadArea:     document.getElementById('upload-area'),
            playerScreen:   document.getElementById('player-screen'),
            audioInput:     document.getElementById('audio-input'),
            audioInputMore: document.getElementById('audio-input-more'),
            coverBg:        document.getElementById('cover-art-background'),
            coverImg:       document.getElementById('cover-art-image'),
            trackName:      document.getElementById('track-name'),
            trackArtist:    document.getElementById('track-artist'),
            trackDuration:  document.getElementById('track-duration'),
            playBtn:        document.getElementById('mini-play-pause'),
            iconPlay:       document.getElementById('icon-play'),
            iconPause:      document.getElementById('icon-pause'),
            stopBtn:        document.getElementById('mini-stop'),
            prevBtn:        document.getElementById('btn-prev'),
            nextBtn:        document.getElementById('btn-next'),
            muteBtn:        document.getElementById('mute-btn'),
            volIconOn:      document.getElementById('vol-icon-on'),
            volIconOff:     document.getElementById('vol-icon-off'),
            volumeSlider:   document.getElementById('mini-volume'),
            currentTime:    document.getElementById('current-time'),
            totalTime:      document.getElementById('total-time'),
            progressFill:   document.getElementById('enhanced-progress-fill'),
            progressBar:    document.getElementById('enhanced-progress-bar'),
            controls:       document.getElementById('controls-overlay'),
            fullscreenBtn:  document.getElementById('fullscreen-btn'),
            fsIconExpand:   document.getElementById('fs-icon-expand'),
            fsIconCompress: document.getElementById('fs-icon-compress'),
            toast:          document.getElementById('toast'),
        };

        // Restore saved volume
        const vol = parseInt(localStorage.getItem('mv_volume') ?? '50');
        this.el.volumeSlider.value = vol;
        this.audioEl.volume = vol / 100;

        this._cursorTimeout = null;
    }

    // ─── Events ────────────────────────────────────────────────

    _setupEvents() {
        // File inputs
        this.el.audioInput.addEventListener('change', e => this._handleFiles(e.target.files));
        this.el.audioInputMore.addEventListener('change', e => this._handleFiles(e.target.files));

        // Clicking the card forwards to the file input
        this.el.uploadArea.addEventListener('click', e => {
            if (e.target === this.el.audioInput) return;
            this.el.audioInput.click();
        });

        // Drag & drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
            document.body.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
        );
        this.el.uploadArea.addEventListener('dragenter', () => this.el.uploadArea.classList.add('drag-over'));
        this.el.uploadArea.addEventListener('dragleave', () => this.el.uploadArea.classList.remove('drag-over'));
        this.el.uploadArea.addEventListener('drop', e => {
            this.el.uploadArea.classList.remove('drag-over');
            this._handleFiles(e.dataTransfer.files);
        });

        // Transport
        this.el.playBtn.addEventListener('click', () => this._togglePlay());
        this.el.stopBtn.addEventListener('click', () => this._stop());
        this.el.prevBtn.addEventListener('click', () => this._prevTrack());
        this.el.nextBtn.addEventListener('click', () => this._nextTrack());

        // Volume & mute
        this.el.volumeSlider.addEventListener('input', e => {
            const v = parseInt(e.target.value);
            this.audioEl.volume = v / 100;
            localStorage.setItem('mv_volume', v);
            if (v === 0) this._setMuteIcon(true);
            else         this._setMuteIcon(false);
        });
        this.el.muteBtn.addEventListener('click', () => this._toggleMute());

        // Seek
        this.el.progressBar.addEventListener('click', e => {
            if (!this.audioProcessor.isInitialized || !this.audioEl.duration) return;
            const rect = this.el.progressBar.getBoundingClientRect();
            this.audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * this.audioEl.duration;
        });

        // Fullscreen
        this.el.fullscreenBtn.addEventListener('click', () => this._toggleFullscreen());
        document.addEventListener('fullscreenchange', () => this._onFullscreenChange());

        // Audio events
        this.audioEl.addEventListener('play',  () => this._setPlayIcon(true));
        this.audioEl.addEventListener('pause', () => this._setPlayIcon(false));
        this.audioEl.addEventListener('ended', () => {
            this._setPlayIcon(false);
            const next = this.queue.next();
            if (next) this._loadTrack(next);
        });
        this.audioEl.addEventListener('timeupdate', () => this._onTimeUpdate());

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.code) {
                case 'Space':       e.preventDefault(); this._togglePlay(); break;
                case 'ArrowRight':  this.audioEl.duration && (this.audioEl.currentTime = Math.min(this.audioEl.currentTime + 5, this.audioEl.duration)); break;
                case 'ArrowLeft':   this.audioEl.duration && (this.audioEl.currentTime = Math.max(this.audioEl.currentTime - 5, 0)); break;
                case 'ArrowUp':     this._shiftVolume(+5); break;
                case 'ArrowDown':   this._shiftVolume(-5); break;
                case 'KeyM':        this._toggleMute(); break;
                case 'KeyF':        this._toggleFullscreen(); break;
                case 'KeyN':        this._nextTrack(); break;
                case 'KeyP':        this._prevTrack(); break;
            }
        });

        // Auto-hide cursor + controls
        document.addEventListener('mousemove', () => {
            document.body.classList.remove('hide-cursor');
            this.el.controls.classList.remove('hidden');
            clearTimeout(this._cursorTimeout);
            if (this.audioProcessor.isPlaying) {
                this._cursorTimeout = setTimeout(() => {
                    document.body.classList.add('hide-cursor');
                    this.el.controls.classList.add('hidden');
                }, 3000);
            }
        });
    }

    // ─── File handling ─────────────────────────────────────────

    _handleFiles(files) {
        const result = this.queue.addFiles(files);
        if (result.action === 'play_new') {
            this._loadTrack(result.track);
        } else {
            this._notify(`Added to queue 🎶`);
        }
    }

    async _loadTrack(track) {
        this.audioProcessor.init();
        this.audioEl.src = track.audioUrl;

        // Show player, hide upload
        this.el.uploadScreen.classList.add('hidden');
        this.el.playerScreen.classList.add('visible');

        // Reset cover & labels immediately
        this.el.coverImg.style.backgroundImage = 'none';
        this.el.coverImg.classList.remove('has-cover');
        this.el.coverImg.textContent = '🎵';
        this.el.trackName.textContent   = track.name;
        this.el.trackArtist.textContent = '';
        this.el.trackDuration.textContent = '0:00 / 0:00';

        // Extract metadata (cover + tags)
        const meta = await MetadataParser.extractMetadata(track.audioFile);

        // Apply ID3 title / artist if found
        if (meta.title)  this.el.trackName.textContent   = meta.title;
        if (meta.artist) this.el.trackArtist.textContent  = meta.artist;

        // Cover art
        if (meta.coverUrl) {
            this.el.coverImg.style.backgroundImage = `url(${meta.coverUrl})`;
            this.el.coverImg.classList.add('has-cover');
            this.el.coverImg.textContent = '';
            this.el.coverBg.style.backgroundImage = `url(${meta.coverUrl})`;
        } else {
            this.el.coverBg.style.backgroundImage = 'none';
        }
        this.el.coverBg.classList.add('visible');

        this.audioProcessor.play();
    }

    // ─── Playback ──────────────────────────────────────────────

    _togglePlay() {
        if (!this.audioProcessor.isInitialized) return;
        if (this.audioProcessor.isPlaying) this.audioProcessor.pause();
        else                               this.audioProcessor.play();
    }

    _stop() {
        if (!this.audioProcessor.isInitialized) return;
        this.audioProcessor.stop();
    }

    _prevTrack() {
        const track = this.queue.prev();
        if (track) this._loadTrack(track);
        else this._notify('Already at the first track');
    }

    _nextTrack() {
        const track = this.queue.next();
        if (track) this._loadTrack(track);
        else this._notify('No more tracks in queue');
    }

    // ─── Volume & mute ─────────────────────────────────────────

    _toggleMute() {
        if (this._muted) {
            // Unmute — restore previous volume
            const v = Math.max(this._volumeBeforeMute, 5);
            this.audioEl.volume = v / 100;
            this.el.volumeSlider.value = v;
            this._setMuteIcon(false);
        } else {
            // Mute
            this._volumeBeforeMute = parseInt(this.el.volumeSlider.value);
            this.audioEl.volume = 0;
            this.el.volumeSlider.value = 0;
            this._setMuteIcon(true);
        }
        this._muted = !this._muted;
    }

    _setMuteIcon(muted) {
        this.el.volIconOn.style.display  = muted ? 'none' : '';
        this.el.volIconOff.style.display = muted ? ''     : 'none';
    }

    _shiftVolume(delta) {
        const newVal = Math.min(100, Math.max(0, parseInt(this.el.volumeSlider.value) + delta));
        this.el.volumeSlider.value = newVal;
        this.audioEl.volume = newVal / 100;
        localStorage.setItem('mv_volume', newVal);
        this._setMuteIcon(newVal === 0);
        if (this._muted && newVal > 0) this._muted = false;
    }

    // ─── Fullscreen ────────────────────────────────────────────

    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    _onFullscreenChange() {
        const isFs = !!document.fullscreenElement;
        this.el.fsIconExpand.style.display   = isFs ? 'none' : '';
        this.el.fsIconCompress.style.display = isFs ? ''     : 'none';
    }

    // ─── Icon helpers ──────────────────────────────────────────

    _setPlayIcon(playing) {
        this.el.iconPlay.style.display  = playing ? 'none' : '';
        this.el.iconPause.style.display = playing ? ''     : 'none';
    }

    // ─── Time updates ──────────────────────────────────────────

    _onTimeUpdate() {
        const t = this.audioEl.currentTime;
        const d = this.audioEl.duration;
        if (d && !isNaN(d)) {
            this.el.progressFill.style.width   = `${(t / d) * 100}%`;
            this.el.currentTime.textContent    = formatTime(t);
            this.el.totalTime.textContent      = formatTime(d);
            this.el.trackDuration.textContent  = `${formatTime(t)} / ${formatTime(d)}`;
        }
    }

    // ─── Toast ─────────────────────────────────────────────────

    _notify(msg) {
        const el = this.el.toast;
        el.textContent = msg;
        el.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
    }

    // ─── Animation loop — visualizer + beat-reactive cover art ─

    _animationLoop() {
        requestAnimationFrame(() => this._animationLoop());
        const data = this.audioProcessor.getFrequencyData();
        this.visualizer.render(data, this.audioProcessor.isPlaying);
        this._updateBeatPulse(data);
    }

    /**
     * Feature 1: Beat-reactive cover art pulse.
     * Reads the low-frequency (bass) energy each frame, smooths it,
     * and writes --beat-scale to the cover art element so CSS scales it.
     */
    _updateBeatPulse(data) {
        let bassEnergy = 0;
        if (data) {
            const { dataArray } = data;
            // First ~10% of bins = bass
            const bassLen = Math.floor(dataArray.length * 0.1);
            let sum = 0;
            for (let i = 0; i < bassLen; i++) sum += dataArray[i];
            bassEnergy = (sum / bassLen) / 255; // 0 → 1
        }

        // Fast attack, slow decay — same feel as the visualizer bars
        this._bassSmoothed += bassEnergy > this._bassSmoothed
            ? (bassEnergy - this._bassSmoothed) * 0.35
            : (bassEnergy - this._bassSmoothed) * 0.08;

        // Map smoothed bass 0→1 to scale 1.0→1.045 (subtle but perceptible)
        const scale = 1 + this._bassSmoothed * 0.045;
        this.el.coverImg.style.setProperty('--beat-scale', scale.toFixed(4));
    }
}

document.addEventListener('DOMContentLoaded', () => new App());
