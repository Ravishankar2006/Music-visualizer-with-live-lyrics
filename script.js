class MusicVisualizer {
    constructor() {
        this.audio = document.getElementById('audio');
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas.getContext('2d');
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.isPlaying = false;
        this.isInitialized = false;
        
        // UI State Management
        this.audioLoaded = false;
        this.lyricsLoaded = false;
        this.cursorTimeout = null;
        this.lastCursorMove = Date.now();
        this.cursorHideDelay = 3000; // Hide cursor after 3 seconds
        
        // Lyrics data
        this.lyrics = [];
        this.currentLyricIndex = 0;
        this.currentWordIndex = 0;
        this.lyricsType = null; // 'lrc' or 'plain'
        
        // Cover art data
        this.coverArt = null;
        this.coverArtUrl = null;
        
        // Visual settings - Fixed to bar visualizer with color changing
        this.visualizerType = 'bars';
        this.currentHue = 0;
        
        // Enhanced Lyrics Color System
        this.currentLyricsTheme = 0;
        this.lyricsThemes = [
            {
                name: 'classic-white',
                class: '',
                description: 'Classic White with Flowing Colors'
            },
            {
                name: 'warm-sunset',
                class: 'warm-sunset',
                description: 'Warm Sunset Flow'
            },
            {
                name: 'cool-ocean',
                class: 'cool-ocean',
                description: 'Cool Ocean Flow'
            },
            {
                name: 'pastel-dream',
                class: 'pastel-dream',
                description: 'Pastel Dream Flow'
            }
        ];
        
        // Color button click handling
        this.colorButtonClickCount = 0;
        this.colorButtonClickTimeout = null;
        
        this.setupCanvas();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupCursorManagement();
        this.animate();
    }

    setupCanvas() {
        const resizeCanvas = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight * 0.45;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    setupEventListeners() {
        // File inputs
        document.getElementById('audio-input').addEventListener('change', (e) => this.handleAudioFile(e));
        document.getElementById('lyrics-input').addEventListener('change', (e) => this.handleLyricsFile(e));
        
        // Mini controls
        document.getElementById('mini-play-pause').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('mini-stop').addEventListener('click', () => this.stop());
        document.getElementById('mini-volume').addEventListener('input', (e) => this.setVolume(e.target.value));
        
        // Enhanced color button with single/double click detection
        document.getElementById('mini-shuffle-colors').addEventListener('click', (e) => this.handleColorButtonClick(e));
        
        // Progress bar
        const progressBar = document.getElementById('enhanced-progress-bar');
        progressBar.addEventListener('click', (e) => this.seekAudio(e));
        
        // Audio events
        this.audio.addEventListener('loadedmetadata', () => this.updateTrackInfo());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.handleAudioEnd());
        this.audio.addEventListener('play', () => this.handlePlay());
        this.audio.addEventListener('pause', () => this.handlePause());
    }

    handleColorButtonClick(e) {
        e.preventDefault();
        this.colorButtonClickCount++;
        
        if (this.colorButtonClickTimeout) {
            clearTimeout(this.colorButtonClickTimeout);
        }
        
        this.colorButtonClickTimeout = setTimeout(() => {
            if (this.colorButtonClickCount === 1) {
                // Single click - change visualizer colors
                this.shuffleColors();
                this.showNotification('Visualizer colors changed! 🌈');
            } else if (this.colorButtonClickCount >= 2) {
                // Double click - change lyrics theme
                this.cycleLyricsTheme();
            }
            this.colorButtonClickCount = 0;
        }, 300); // 300ms delay to detect double click
    }

    cycleLyricsTheme() {
        // Move to next theme
        this.currentLyricsTheme = (this.currentLyricsTheme + 1) % this.lyricsThemes.length;
        const newTheme = this.lyricsThemes[this.currentLyricsTheme];
        
        // Apply new theme to current word
        this.applyLyricsTheme(newTheme);
        
        // Show notification
        this.showNotification(`Lyrics Theme: ${newTheme.description} ✨`);
        
        console.log(`Switched to lyrics theme: ${newTheme.name}`);
    }

    applyLyricsTheme(theme) {
        // Remove all existing theme classes from body
        const body = document.body;
        this.lyricsThemes.forEach(t => {
            body.classList.remove(`lyrics-${t.name}`);
        });
        
        // Add new theme class
        if (theme.name !== 'classic-white') {
            body.classList.add(`lyrics-${theme.name}`);
        }
        
        // Force re-render of current lyrics
        this.updateLyricsDisplay();
    }

    showNotification(message) {
        // Remove existing notification
        const existingNotification = document.getElementById('theme-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'theme-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 25px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            backdrop-filter: blur(20px);
            font-family: 'Inter', sans-serif;
            font-size: 1rem;
            font-weight: 500;
            z-index: 1000;
            opacity: 0;
            transition: all 0.3s ease;
            pointer-events: none;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 2000);
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('upload-area');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'), false);
        });

        uploadArea.addEventListener('drop', (e) => this.handleDrop(e), false);
    }

    setupCursorManagement() {
        // Track mouse movement
        document.addEventListener('mousemove', () => {
            this.lastCursorMove = Date.now();
            this.showCursor();
            this.showControlsOnCursor();
            
            // Clear existing timeout
            if (this.cursorTimeout) {
                clearTimeout(this.cursorTimeout);
            }
            
            // Set new timeout to hide cursor when playing
            if (this.isPlaying && this.audioLoaded) {
                this.cursorTimeout = setTimeout(() => {
                    this.hideCursor();
                    this.hideControlsOnIdle();
                }, this.cursorHideDelay);
            }
        });

        // Show cursor on any interaction
        document.addEventListener('click', () => this.showCursor());
        document.addEventListener('keydown', () => this.showCursor());
    }

    showCursor() {
        document.body.classList.remove('hide-cursor');
    }

    hideCursor() {
        if (this.isPlaying && this.audioLoaded) {
            document.body.classList.add('hide-cursor');
        }
    }

    showControlsOnCursor() {
        if (this.audioLoaded && this.isPlaying) {
            const controls = document.getElementById('controls-overlay');
            const uploadSection = document.getElementById('upload-section');
            
            controls.classList.add('show-on-cursor');
            controls.classList.remove('hidden');
            
            uploadSection.classList.add('show-on-cursor');
        }
    }

    hideControlsOnIdle() {
        if (this.isPlaying && this.audioLoaded) {
            const controls = document.getElementById('controls-overlay');
            const uploadSection = document.getElementById('upload-section');
            
            controls.classList.remove('show-on-cursor');
            uploadSection.classList.remove('show-on-cursor');
            
            // Don't fully hide controls, just reduce opacity
            setTimeout(() => {
                if (!controls.classList.contains('show-on-cursor')) {
                    controls.classList.add('hidden');
                }
            }, 500);
        }
    }

    hideUploadElements() {
        // Only hide upload elements if BOTH audio and lyrics are loaded
        if (!this.audioLoaded || !this.lyricsLoaded) {
            return; // Don't hide if either is missing
        }
        
        // Hide the main content area
        const contentArea = document.querySelector('.content-area');
        const uploadSection = document.getElementById('upload-section');
        
        contentArea.classList.add('hidden');
        
        // Move upload section to corner and make it compact
        uploadSection.classList.add('audio-loaded');
        
        // Hide both upload buttons since both files are loaded
        document.getElementById('audio-label').classList.add('hidden');
        document.getElementById('lyrics-label').classList.add('hidden');
        
        // Hide the entire upload section initially since both are loaded
        uploadSection.style.opacity = '0';
        uploadSection.style.pointerEvents = 'none';
    }

    showUploadElements() {
        const contentArea = document.querySelector('.content-area');
        const uploadSection = document.getElementById('upload-section');
        
        contentArea.classList.remove('hidden');
        uploadSection.classList.remove('audio-loaded');
        uploadSection.style.opacity = '';
        uploadSection.style.pointerEvents = '';
        
        // Show all upload buttons
        document.getElementById('audio-label').classList.remove('hidden');
        document.getElementById('lyrics-label').classList.remove('hidden');
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDrop(e) {
        const files = e.dataTransfer.files;
        
        for (let file of files) {
            if (file.type.startsWith('audio/')) {
                this.loadAudioFile(file);
            } else if (file.name.endsWith('.lrc') || file.name.endsWith('.txt')) {
                this.loadLyricsFile(file);
            }
        }
    }

    handleAudioFile(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadAudioFile(file);
        }
    }

    handleLyricsFile(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadLyricsFile(file);
        }
    }

    loadAudioFile(file) {
        const url = URL.createObjectURL(file);
        this.audio.src = url;
        this.audioLoaded = true;
        
        // Update track name
        const trackName = file.name.replace(/\.[^/.]+$/, "");
        document.getElementById('track-name').textContent = trackName;
        document.getElementById('song-title-subtle').textContent = trackName;
        
        // Extract cover art from MP3 file
        this.extractCoverArt(file);
        
        // Initialize audio context if not already done
        this.initializeAudioContext();
        
        // Update UI state
        this.updateUI();
    }

    loadLyricsFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.parseLyrics(content, file.name);
            this.lyricsLoaded = true;
            this.updateUI();
        };
        reader.readAsText(file);
    }

    parseLyrics(content, filename) {
        if (filename.endsWith('.lrc')) {
            this.lyricsType = 'lrc';
            this.lyrics = this.parseLRC(content);
        } else {
            this.lyricsType = 'plain';
            this.lyrics = this.parsePlainText(content);
        }
        
        document.getElementById('lyrics-status').textContent = `Lyrics loaded (${this.lyrics.length} lines)`;
    }

    // Parse LRC format lyrics
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
                    lyrics.push({
                        time: time,
                        text: text,
                        words: text.split(' ')
                    });
                }
            }
        });
        
        return lyrics.sort((a, b) => a.time - b.time);
    }

    // Parse plain text lyrics
    parsePlainText(content) {
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        const lyrics = [];
        let currentTime = 0;
        
        lines.forEach((line, index) => {
            lyrics.push({
                time: currentTime,
                text: line,
                words: line.split(' ')
            });
            currentTime += 4; // 4 seconds per line
        });
        
        return lyrics;
    }

    // Extract cover art from MP3 file
    async extractCoverArt(file) {
        try {
            console.log('Attempting to extract cover art from:', file.name);
            
            // Try manual ID3 parsing
            console.log('Trying manual ID3 parsing...');
            const arrayBuffer = await file.arrayBuffer();
            const coverArt = this.parseID3CoverArt(arrayBuffer);
            
            if (coverArt) {
                console.log('Cover art found! Format:', coverArt.format);
                // Create blob URL for the image
                const blob = new Blob([coverArt.data], { type: coverArt.format });
                this.coverArtUrl = URL.createObjectURL(blob);
                this.coverArt = coverArt;
                
                // Update UI with cover art
                this.displayCoverArt();
                console.log('Cover art displayed successfully');
                return;
            }
            
            console.log('No cover art found in ID3 tags');
            
            // Try using FileReader to check if there's any image data
            console.log('Trying alternative image detection...');
            const buffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            
            // Look for JPEG or PNG signatures in the file
            for (let i = 0; i < uint8Array.length - 10; i++) {
                // JPEG signature: FF D8 FF
                if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xD8 && uint8Array[i + 2] === 0xFF) {
                    console.log('Found JPEG signature at position:', i);
                    // Try to extract JPEG data
                    const jpegData = this.extractImageFromBuffer(uint8Array, i, 'image/jpeg');
                    if (jpegData) {
                        this.coverArtUrl = URL.createObjectURL(new Blob([jpegData], { type: 'image/jpeg' }));
                        this.displayCoverArt();
                        console.log('JPEG cover art extracted successfully');
                        return;
                    }
                }
                
                // PNG signature: 89 50 4E 47
                if (uint8Array[i] === 0x89 && uint8Array[i + 1] === 0x50 && 
                    uint8Array[i + 2] === 0x4E && uint8Array[i + 3] === 0x47) {
                    console.log('Found PNG signature at position:', i);
                    // Try to extract PNG data
                    const pngData = this.extractImageFromBuffer(uint8Array, i, 'image/png');
                    if (pngData) {
                        this.coverArtUrl = URL.createObjectURL(new Blob([pngData], { type: 'image/png' }));
                        this.displayCoverArt();
                        console.log('PNG cover art extracted successfully');
                        return;
                    }
                }
            }
            
            console.log('No image signatures found, using default cover art');
            this.setDefaultCoverArt();
            
        } catch (error) {
            console.error('Error extracting cover art:', error);
            this.setDefaultCoverArt();
        }
    }

    // Extract image data from buffer starting at position
    extractImageFromBuffer(uint8Array, startPos, mimeType) {
        try {
            let endPos = startPos + 1;
            
            if (mimeType === 'image/jpeg') {
                // Look for JPEG end marker FF D9
                for (let i = startPos + 2; i < uint8Array.length - 1; i++) {
                    if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xD9) {
                        endPos = i + 2;
                        break;
                    }
                }
            } else if (mimeType === 'image/png') {
                // Look for PNG IEND chunk
                for (let i = startPos + 8; i < uint8Array.length - 8; i++) {
                    if (uint8Array[i] === 0x49 && uint8Array[i + 1] === 0x45 && 
                        uint8Array[i + 2] === 0x4E && uint8Array[i + 3] === 0x44) {
                        endPos = i + 8;
                        break;
                    }
                }
            }
            
            if (endPos > startPos && endPos - startPos > 100) { // Ensure reasonable size
                return uint8Array.slice(startPos, endPos);
            }
            
        } catch (error) {
            console.error('Error extracting image from buffer:', error);
        }
        
        return null;
    }

    // Parse ID3v2 tags to extract cover art (improved version)
    parseID3CoverArt(buffer) {
        try {
            const view = new DataView(buffer);
            
            // Check for ID3v2 header (ID3 + version bytes)
            const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
            if (header !== 'ID3') {
                console.log('No ID3v2 header found');
                return null;
            }
            
            const majorVersion = view.getUint8(3);
            const minorVersion = view.getUint8(4);
            const flags = view.getUint8(5);
            
            console.log(`ID3v2.${majorVersion}.${minorVersion} found`);
            
            // Get tag size (synchsafe integer)
            let tagSize = 0;
            for (let i = 0; i < 4; i++) {
                tagSize = (tagSize << 7) | (view.getUint8(6 + i) & 0x7F);
            }
            
            console.log('ID3 tag size:', tagSize);
            
            let offset = 10;
            
            // Skip extended header if present
            if (flags & 0x40) {
                const extHeaderSize = view.getUint32(offset);
                offset += 4 + extHeaderSize;
                console.log('Skipped extended header, new offset:', offset);
            }
            
            const tagEnd = Math.min(10 + tagSize, buffer.byteLength);
            
            // Look for APIC frame (ID3v2.3/2.4) or PIC frame (ID3v2.2)
            while (offset < tagEnd - 10) {
                let frameId = '';
                let frameSize = 0;
                
                if (majorVersion >= 3) {
                    // ID3v2.3 and 2.4
                    frameId = String.fromCharCode(
                        view.getUint8(offset), view.getUint8(offset + 1),
                        view.getUint8(offset + 2), view.getUint8(offset + 3)
                    );
                    
                    if (majorVersion === 4) {
                        // ID3v2.4 uses synchsafe integers
                        for (let i = 0; i < 4; i++) {
                            frameSize = (frameSize << 7) | (view.getUint8(offset + 4 + i) & 0x7F);
                        }
                    } else {
                        // ID3v2.3 uses regular integers
                        frameSize = view.getUint32(offset + 4);
                    }
                    
                    offset += 10; // Frame header is 10 bytes
                    
                } else {
                    // ID3v2.2
                    frameId = String.fromCharCode(
                        view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2)
                    );
                    frameSize = (view.getUint8(offset + 3) << 16) | 
                               (view.getUint8(offset + 4) << 8) | 
                                view.getUint8(offset + 5);
                    offset += 6; // Frame header is 6 bytes
                }
                
                console.log(`Found frame: ${frameId}, size: ${frameSize}`);
                
                if (frameId === 'APIC' || frameId === 'PIC') {
                    console.log('Found picture frame!');
                    return this.extractPictureData(view, offset, frameSize, majorVersion);
                }
                
                // Skip frame data
                offset += frameSize;
                
                // Safety check
                if (frameSize === 0 || offset >= tagEnd) break;
            }
            
            console.log('No APIC/PIC frame found');
            return null;
            
        } catch (error) {
            console.error('Error parsing ID3 tags:', error);
            return null;
        }
    }

    // Extract picture data from APIC/PIC frame
    extractPictureData(view, offset, frameSize, majorVersion) {
        try {
            const frameEnd = offset + frameSize;
            let pos = offset;
            
            // Skip text encoding byte
            const textEncoding = view.getUint8(pos);
            pos++;
            console.log('Text encoding:', textEncoding);
            
            // Read MIME type (null-terminated string)
            let mimeType = '';
            while (pos < frameEnd && view.getUint8(pos) !== 0) {
                mimeType += String.fromCharCode(view.getUint8(pos));
                pos++;
            }
            pos++; // Skip null terminator
            
            console.log('MIME type:', mimeType);
            
            // Skip picture type byte
            const pictureType = view.getUint8(pos);
            pos++;
            console.log('Picture type:', pictureType);
            
            // Skip description (null-terminated string)
            while (pos < frameEnd && view.getUint8(pos) !== 0) {
                pos++;
            }
            pos++; // Skip null terminator
            
            // Remaining data is the image
            const imageDataSize = frameEnd - pos;
            if (imageDataSize > 0) {
                const imageData = new Uint8Array(view.buffer, view.byteOffset + pos, imageDataSize);
                console.log('Extracted image data size:', imageDataSize);
                
                return {
                    format: mimeType || 'image/jpeg',
                    data: imageData
                };
            }
            
        } catch (error) {
            console.error('Error extracting picture data:', error);
        }
        
        return null;
    }

    // Display cover art in UI - Large and centered
    displayCoverArt() {
        const coverBackground = document.getElementById('cover-art-background');
        const coverImage = document.getElementById('cover-art-image');
        
        if (this.coverArtUrl) {
            coverImage.style.backgroundImage = `url(${this.coverArtUrl})`;
            coverImage.classList.add('has-cover');
            coverImage.classList.remove('default-cover');
        } else {
            this.setDefaultCoverArt();
        }
        
        // Show cover art when audio is loaded
        if (this.audioLoaded) {
            coverBackground.classList.add('visible');
        }
    }

    // Set default cover art
    setDefaultCoverArt() {
        const coverBackground = document.getElementById('cover-art-background');
        const coverImage = document.getElementById('cover-art-image');
        
        coverImage.style.backgroundImage = 'none';
        coverImage.classList.remove('has-cover');
        coverImage.classList.add('default-cover');
        coverImage.innerHTML = '🎵';
        
        // Show cover art when audio is loaded
        if (this.audioLoaded) {
            coverBackground.classList.add('visible');
        }
    }

    // Initialize Audio Context
    initializeAudioContext() {
        if (this.isInitialized) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaElementSource(this.audio);
            
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.analyser.fftSize = 256;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            this.isInitialized = true;
            console.log('Audio context initialized');
        } catch (error) {
            console.error('Error initializing audio context:', error);
        }
    }

    // Update UI state
    updateUI() {
        // Show cover art if audio is loaded
        if (this.audioLoaded) {
            this.displayCoverArt();
        }
        
        // Only hide upload elements if BOTH audio AND lyrics are loaded
        if (this.audioLoaded && this.lyricsLoaded) {
            this.hideUploadElements();
        } else if (this.audioLoaded) {
            // If only audio is loaded, hide just the audio upload button
            document.getElementById('audio-label').classList.add('hidden');
        }
        
        // Update lyrics display
        if (this.lyricsLoaded) {
            this.updateLyricsDisplay();
            // If only lyrics are loaded, hide just the lyrics upload button
            if (!this.audioLoaded) {
                document.getElementById('lyrics-label').classList.add('hidden');
            }
        }
    }

    // Update track information
    updateTrackInfo() {
        const duration = this.audio.duration;
        if (duration && !isNaN(duration)) {
            document.getElementById('track-duration').textContent = 
                `0:00 / ${this.formatTime(duration)}`;
            document.getElementById('total-time').textContent = this.formatTime(duration);
        }
    }

    // Update progress bar and lyrics
    updateProgress() {
        const currentTime = this.audio.currentTime;
        const duration = this.audio.duration;
        
        if (duration && !isNaN(duration)) {
            const progress = (currentTime / duration) * 100;
            document.getElementById('enhanced-progress-fill').style.width = `${progress}%`;
            
            // Update time displays
            document.getElementById('current-time').textContent = this.formatTime(currentTime);
            document.getElementById('track-duration').textContent = 
                `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
        }
        
        // Update lyrics
        if (this.lyricsLoaded) {
            this.updateLyricsSync(currentTime);
        }
    }

    // Format time in MM:SS format
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Update lyrics synchronization
    updateLyricsSync(currentTime) {
        if (!this.lyrics || this.lyrics.length === 0) return;
        
        // Find current lyric
        let newLyricIndex = 0;
        for (let i = 0; i < this.lyrics.length; i++) {
            if (currentTime >= this.lyrics[i].time) {
                newLyricIndex = i;
            } else {
                break;
            }
        }
        
        // Update current lyric index
        if (newLyricIndex !== this.currentLyricIndex) {
            this.currentLyricIndex = newLyricIndex;
            this.currentWordIndex = 0;
            this.updateLyricsDisplay();
        }
        
        // Update word-by-word highlighting for current line
        const currentLyric = this.lyrics[this.currentLyricIndex];
        if (currentLyric && currentLyric.words) {
            const nextLyric = this.lyrics[this.currentLyricIndex + 1];
            const lyricDuration = nextLyric ? 
                (nextLyric.time - currentLyric.time) : 4; // Default 4 seconds
            
            const timeIntoLyric = currentTime - currentLyric.time;
            const wordDuration = lyricDuration / currentLyric.words.length;
            const newWordIndex = Math.floor(timeIntoLyric / wordDuration);
            
            if (newWordIndex !== this.currentWordIndex && newWordIndex < currentLyric.words.length) {
                this.currentWordIndex = Math.max(0, newWordIndex);
                this.updateLyricsDisplay();
            }
        }
    }

    // Update lyrics display
    updateLyricsDisplay() {
        const lyricsContainer = document.getElementById('lyrics-display');
        
        if (!this.lyricsLoaded || !this.lyrics || this.lyrics.length === 0) {
            lyricsContainer.innerHTML = '<div class="no-lyrics">🎤 Upload a lyrics file</div>';
            return;
        }
        
        const currentTheme = this.lyricsThemes[this.currentLyricsTheme];
        const currentLyric = this.lyrics[this.currentLyricIndex];
        
        let html = '';
        
        // Show previous lines (context)
        for (let i = Math.max(0, this.currentLyricIndex - 2); i < this.currentLyricIndex; i++) {
            html += `<div class="previous-words">${this.lyrics[i].text}</div>`;
        }
        
        // Show current line with word-by-word highlighting
        if (currentLyric) {
            html += '<div class="current-line">';
            currentLyric.words.forEach((word, wordIndex) => {
                if (wordIndex === this.currentWordIndex) {
                    const themeClass = currentTheme.class ? ` ${currentTheme.class}` : '';
                    html += `<span class="current-word${themeClass}">${word}</span>`;
                } else {
                    html += `<span>${word}</span>`;
                }
            });
            html += '</div>';
        }
        
        // Show upcoming lines (context)
        for (let i = this.currentLyricIndex + 1; i < Math.min(this.lyrics.length, this.currentLyricIndex + 3); i++) {
            html += `<div class="upcoming-words">${this.lyrics[i].text}</div>`;
        }
        
        lyricsContainer.innerHTML = html;
    }

    // Audio control methods
    togglePlayPause() {
        if (!this.audioLoaded) return;
        
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.audioLoaded) return;
        
        // Resume audio context if suspended
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.audio.play().then(() => {
            console.log('Audio playback started');
        }).catch(error => {
            console.error('Error playing audio:', error);
        });
    }

    pause() {
        this.audio.pause();
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.currentLyricIndex = 0;
        this.currentWordIndex = 0;
        this.updateLyricsDisplay();
    }

    setVolume(value) {
        this.audio.volume = value / 100;
    }

    seekAudio(e) {
        if (!this.audioLoaded) return;
        
        const progressBar = e.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = clickX / width;
        
        const newTime = percentage * this.audio.duration;
        this.audio.currentTime = newTime;
    }

    // Handle audio events
    handlePlay() {
        this.isPlaying = true;
        document.getElementById('mini-play-pause').textContent = '⏸️';
    }

    handlePause() {
        this.isPlaying = false;
        document.getElementById('mini-play-pause').textContent = '▶️';
    }

    handleAudioEnd() {
        this.isPlaying = false;
        document.getElementById('mini-play-pause').textContent = '▶️';
        this.currentLyricIndex = 0;
        this.currentWordIndex = 0;
        this.updateLyricsDisplay();
    }

    // Shuffle visualizer colors
    shuffleColors() {
        this.currentHue = (this.currentHue + 60) % 360;
    }

    // Animation loop for visualizer
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (!this.isInitialized || !this.isPlaying) {
            // Draw static bars when not playing
            this.drawStaticBars();
            return;
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        this.drawBars();
    }

    // Draw static bars when not playing
    drawStaticBars() {
        const canvas = this.canvas;
        const ctx = this.ctx;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = canvas.width / 64;
        const maxBarHeight = canvas.height * 0.8;
        
        for (let i = 0; i < 64; i++) {
            const barHeight = Math.random() * maxBarHeight * 0.1; // Very low static bars
            const x = i * barWidth;
            const y = canvas.height - barHeight;
            
            const hue = (this.currentHue + i * 3) % 360;
            ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.3)`;
            ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
    }

    // Draw animated bars based on audio frequency data
    drawBars() {
        const canvas = this.canvas;
        const ctx = this.ctx;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = canvas.width / this.bufferLength;
        const maxBarHeight = canvas.height * 0.9;
        
        for (let i = 0; i < this.bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * maxBarHeight;
            const x = i * barWidth;
            const y = canvas.height - barHeight;
            
            // Create gradient for each bar
            const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
            const hue = (this.currentHue + i * 2) % 360;
            
            gradient.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.9)`);
            gradient.addColorStop(0.5, `hsla(${hue + 20}, 75%, 65%, 0.7)`);
            gradient.addColorStop(1, `hsla(${hue + 40}, 70%, 55%, 0.5)`);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
            
            // Add glow effect
            ctx.shadowColor = `hsla(${hue}, 80%, 70%, 0.5)`;
            ctx.shadowBlur = 5;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
            ctx.shadowBlur = 0;
        }
        
        // Update hue for color animation
        this.currentHue = (this.currentHue + 0.5) % 360;
    }
}

// Initialize the music visualizer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizer();
});