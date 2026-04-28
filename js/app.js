// imports
import { AudioProcessor }   from './audioProcessor.js';
import { VisualizerRenderer } from './visualizerRenderer.js';
import { MetadataParser }   from './metadataParser.js';
import { QueueManager }     from './queueManager.js';
import { LyricsEngine }     from './lyricsEngine.js';
import { formatTime }       from './utils.js';
 
class App {
    constructor() {
        this.audioEl = document.getElementById('audio');
        this.audioProcessor = new AudioProcessor(this.audioEl);
        this.visualizer = new VisualizerRenderer(document.getElementById('visualizer'));
        this.queue   = new QueueManager();
        this.lyrics  = new LyricsEngine();

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
            modeBtn:        document.getElementById('btn-mode'),
            modeIconBars:   document.getElementById('mode-icon-bars'),
            modeIconRadial: document.getElementById('mode-icon-radial'),
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
            // Queue sidebar
            queueBtn:       document.getElementById('btn-queue'),
            queuePanel:     document.getElementById('queue-panel'),
            queueClose:     document.getElementById('queue-close'),
            queueList:      document.getElementById('queue-list'),
            queueCount:     document.getElementById('queue-count'),
            // Lyrics
            lyricsDisplay:  document.getElementById('lyrics-display'),
            lyricsPrev:     document.getElementById('lyrics-prev'),
            lyricsCurrent:  document.getElementById('lyrics-current'),
            lyricsNext:     document.getElementById('lyrics-next'),
            lyricsBreak:    document.getElementById('lyrics-break'),
            lyricsProgress: document.getElementById('lyrics-progress'),
            lrcInput:       document.getElementById('lrc-input'),
            lrcBtn:         document.getElementById('lrc-btn'),
        };

        // Restore saved volume
        const vol = parseInt(localStorage.getItem('mv_volume') ?? '50');
        this.el.volumeSlider.value = vol;
        this.audioEl.volume = vol / 100;

        this._cursorTimeout = null;
        this._queueOpen = false;
        this._lastLyricsState = null;
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
        this.el.modeBtn.addEventListener('click', () => this._cycleMode());

        // Queue sidebar
        this.el.queueBtn.addEventListener('click', () => this._toggleQueue());
        this.el.queueClose.addEventListener('click', () => this._closeQueue());
        // Subscribe to queue changes so the sidebar auto-updates
        this.queue.onchange = () => this._renderQueue();

        // LRC lyrics file load
        this.el.lrcInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const ok = this.lyrics.load(ev.target.result);
                if (ok) {
                    this.el.lrcBtn.classList.add('lrc-loaded');
                    this.el.lyricsDisplay.classList.add('has-lyrics');
                    this._notify('Lyrics loaded ♪');
                } else {
                    this._notify('No lyrics found in file');
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // allow re-selecting same file
        });

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
                case 'KeyV':        this._cycleMode(); break;
                case 'KeyQ':        this._toggleQueue(); break;
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

        // Clear lyrics for new track
        this.lyrics.clear();
        this.el.lrcBtn.classList.remove('lrc-loaded');
        this.el.lyricsDisplay.classList.remove('has-lyrics', 'is-break', 'line-change');
        this.el.lyricsPrev.textContent = '';
        this.el.lyricsCurrent.textContent = '';
        this.el.lyricsNext.textContent = '';
        this._lastLyricsState = null;

        // Extract metadata (cover + tags)
        const meta = await MetadataParser.extractMetadata(track.audioFile);

        // Apply ID3 title / artist if found
        if (meta.title)  this.el.trackName.textContent   = meta.title;
        if (meta.artist) this.el.trackArtist.textContent  = meta.artist;

        // Persist resolved metadata onto the track object for queue display
        if (meta.title)    track.title    = meta.title;
        if (meta.artist)   track.artist   = meta.artist;
        if (meta.coverUrl) track.coverUrl = meta.coverUrl;

        // Cover art + colour palette
        if (meta.coverUrl) {
            this.el.coverImg.style.backgroundImage = `url(${meta.coverUrl})`;
            this.el.coverImg.classList.add('has-cover');
            this.el.coverImg.textContent = '';
            this.el.coverBg.style.backgroundImage = `url(${meta.coverUrl})`;
            this.visualizer.setPaletteFromUrl(meta.coverUrl);
        } else {
            this.el.coverBg.style.backgroundImage = 'none';
            this.visualizer.resetPalette();
        }
        this.el.coverBg.classList.add('visible');

        this.audioProcessor.play();
        this._renderQueue();

        // Auto-fetch LRC from lrclib.net if we have a title
        if (meta.title) {
            this._fetchLRC(meta.title, meta.artist || '');
        }
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

    _cycleMode() {
        const mode = this.visualizer.nextMode();

        // Swap icon
        this.el.modeIconBars.style.display   = mode === 'bars'   ? '' : 'none';
        this.el.modeIconRadial.style.display = mode === 'radial' ? '' : 'none';

        // Toggle full-screen canvas layout for radial mode
        if (mode === 'radial') {
            this.el.playerScreen.classList.add('radial-mode');
        } else {
            this.el.playerScreen.classList.remove('radial-mode');
        }
        this.visualizer.resize();

        // Visual feedback on button
        this.el.modeBtn.classList.add('active');
        clearTimeout(this._modeActiveTimer);
        this._modeActiveTimer = setTimeout(() => this.el.modeBtn.classList.remove('active'), 600);

        const labels = { bars: 'Bar visualizer', radial: 'Radial' };
        this._notify(`${labels[mode]} ✦`);
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

    // ─── Queue sidebar ─────────────────────────────────────────

    _toggleQueue() {
        this._queueOpen ? this._closeQueue() : this._openQueue();
    }

    _openQueue() {
        this._queueOpen = true;
        this.el.queuePanel.classList.add('open');
        this.el.queueBtn.classList.add('queue-open');
        this._renderQueue();
    }

    _closeQueue() {
        this._queueOpen = false;
        this.el.queuePanel.classList.remove('open');
        this.el.queueBtn.classList.remove('queue-open');
    }

    /**
     * Rebuild the queue list DOM from scratch.
     * Called on every queue mutation via queue.onchange.
     */
    _renderQueue() {
        const tracks = this.queue.tracks;
        const current = this.queue.currentIndex;
        const list = this.el.queueList;

        // Update count label
        const n = tracks.length;
        this.el.queueCount.textContent = n === 0 ? 'Empty' : `${n} track${n === 1 ? '' : 's'}`;

        // Empty state
        if (n === 0) {
            list.innerHTML = `
                <div class="queue-empty">
                    <div class="queue-empty-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                    </div>
                    <p class="queue-empty-text">No tracks yet.<br>Add some music to get started.</p>
                </div>`;
            return;
        }

        // Build rows
        list.innerHTML = '';
        tracks.forEach((track, i) => {
            const isActive = i === current;
            const row = document.createElement('div');
            row.className = 'queue-track' + (isActive ? ' active' : '');
            row.dataset.index = i;

            // Thumb: use cover if stored, else emoji
            const thumbBg = track.coverUrl
                ? `background-image: url(${track.coverUrl}); background-size: cover; background-position: center;`
                : '';
            const thumbContent = track.coverUrl ? '' : '🎵';

            row.innerHTML = `
                <div class="qt-index-wrap">
                    <span class="qt-index">${i + 1}</span>
                    <div class="qt-playing">
                        <div class="qt-eq-bar"></div>
                        <div class="qt-eq-bar"></div>
                        <div class="qt-eq-bar"></div>
                    </div>
                </div>
                <div class="qt-thumb" style="${thumbBg}">${thumbContent}</div>
                <div class="qt-info">
                    <div class="qt-name">${this._esc(track.title || track.name)}</div>
                    <div class="qt-artist">${this._esc(track.artist || '')}</div>
                </div>
                <button class="qt-remove" data-index="${i}" aria-label="Remove track">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>`;

            // Click row → jump to track
            row.addEventListener('click', (e) => {
                if (e.target.closest('.qt-remove')) return;
                const track = this.queue.jumpTo(i);
                if (track) this._loadTrack(track);
            });

            // Remove button
            row.querySelector('.qt-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.dataset.index);
                const wasCurrent = idx === this.queue.currentIndex;
                this.queue.remove(idx);
                if (wasCurrent) {
                    const next = this.queue.getCurrentTrack();
                    if (next) this._loadTrack(next);
                    else {
                        this.audioProcessor.stop();
                        this.el.playerScreen.classList.remove('visible');
                        this.el.uploadScreen.classList.remove('hidden');
                    }
                }
            });

            list.appendChild(row);
        });

        // Scroll active track into view
        const activeRow = list.querySelector('.queue-track.active');
        if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /** HTML-escape helper to prevent XSS from file names */
    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        this._updateLyricsDisplay();
    }

    /**
     * Beat-reactive cover art: scale pulse + halo glow.
     * Both driven by smoothed bass energy every animation frame.
     */
    _updateBeatPulse(data) {
        let bassEnergy = 0;
        if (data) {
            const { dataArray } = data;
            const bassLen = Math.floor(dataArray.length * 0.1);
            let sum = 0;
            for (let i = 0; i < bassLen; i++) sum += dataArray[i];
            bassEnergy = (sum / bassLen) / 255; // 0 → 1
        }

        // Fast attack, slow decay
        this._bassSmoothed += bassEnergy > this._bassSmoothed
            ? (bassEnergy - this._bassSmoothed) * 0.35
            : (bassEnergy - this._bassSmoothed) * 0.08;

        const b = this._bassSmoothed;

        // ── Scale pulse (subtle) ──
        const scale = 1 + b * 0.045;
        this.el.coverImg.style.setProperty('--beat-scale', scale.toFixed(4));

        // ── Reactive glow halo ──
        const palette = this.visualizer.palette;
        const { h, s } = palette[0] ?? { h: 220, s: 80 };
        const glowPx    = Math.round(b * 70);        // 0–70px spread
        const glowAlpha = (0.25 + b * 0.75).toFixed(3); // 0.25–1.0
        const baseAlpha = (0.55 + b * 0.2).toFixed(3);
        this.el.coverImg.style.boxShadow = [
            `0 24px 64px rgba(0,0,0,${baseAlpha})`,
            `0 0 ${glowPx}px hsla(${h},${s}%,65%,${glowAlpha})`,
            `0 0 ${Math.round(glowPx * 0.4)}px hsla(${(h+30)%360},${s}%,80%,${(glowAlpha * 0.5).toFixed(3)})`,
        ].join(', ');

        // ── Push palette glow to lyrics pill ──
        if (this.lyrics.isLoaded) {
            const lyricGlowSize  = Math.round(b * 28);
            const lyricGlowAlpha = (0.25 + b * 0.65).toFixed(3);
            const lyricColor = `hsla(${h},${s}%,72%,${lyricGlowAlpha})`;
            this.el.lyricsDisplay.style.setProperty('--lyric-glow-size',  `${lyricGlowSize}px`);
            this.el.lyricsDisplay.style.setProperty('--lyric-glow-color', lyricColor);
        }
    }

    // ─── Lyrics sync ──────────────────────────────────────────

    _updateLyricsDisplay() {
        if (!this.lyrics.isLoaded) return;

        const state = this.lyrics.sync(this.audioEl.currentTime);
        if (!state) return;

        const el = this.el.lyricsDisplay;

        // Toggle instrumental-break class
        if (state.state === 'break') {
            el.classList.add('is-break');
        } else {
            el.classList.remove('is-break');
        }

        // Only re-render DOM text when the active line changes
        if (state.changed) {
            this.el.lyricsPrev.textContent    = state.prev;
            this.el.lyricsCurrent.textContent = state.current;
            this.el.lyricsNext.textContent    = state.next;

            // Reset progress bar on new line
            this.el.lyricsProgress.style.width = '0%';

            // Trigger slide-in animation
            el.classList.remove('line-change');
            void el.offsetWidth;
            el.classList.add('line-change');
            clearTimeout(this._lyricAnimTimer);
            this._lyricAnimTimer = setTimeout(() => el.classList.remove('line-change'), 400);
        }

        // Update progress bar every frame
        if (state.state !== 'break') {
            this.el.lyricsProgress.style.width = `${(state.progress * 100).toFixed(1)}%`;
        }
    }

    // ─── Auto LRC fetch ────────────────────────────────────────

    async _fetchLRC(title, artist) {
        // Show fetching state on button
        this.el.lrcBtn.classList.add('lrc-fetching');

        try {
            const params = new URLSearchParams({ track_name: title });
            if (artist) params.set('artist_name', artist);
            const res = await fetch(`https://lrclib.net/api/get?${params}`, {
                headers: { 'Lrclib-Client': 'MusicVisualizer/1.0' },
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const lrcText = data.syncedLyrics || data.plainLyrics || '';
            if (!lrcText) throw new Error('No lyrics in response');

            const ok = this.lyrics.load(lrcText);
            if (ok) {
                this.el.lrcBtn.classList.add('lrc-loaded');
                this.el.lyricsDisplay.classList.add('has-lyrics');
                this._notify('♪ Lyrics fetched automatically');
            }
        } catch (err) {
            // Silently fail — user can still load LRC manually
            console.debug('[LRC fetch]', err.message);
        } finally {
            this.el.lrcBtn.classList.remove('lrc-fetching');
        }
    }
}


document.addEventListener('DOMContentLoaded', () => new App());
