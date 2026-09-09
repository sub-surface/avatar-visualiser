/**
 * soundcloud-modal.js — SoundCloud URL resolver, metadata & album artwork importer.
 */

export class SoundCloudImporter {
  constructor({ onTrackLoaded, onArtworkLoaded }) {
    this.onTrackLoaded = onTrackLoaded;
    this.onArtworkLoaded = onArtworkLoaded;

    this.scrim = document.getElementById('scModal');
    this.urlInput = document.getElementById('scUrlInput');
    this.btnResolve = document.getElementById('scBtnResolve');
    this.btnCancel = document.getElementById('scBtnCancel');
    this.btnApply = document.getElementById('scBtnApply');
    this.resultBox = document.getElementById('scResult');
    this.thumbImg = document.getElementById('scThumb');
    this.titleTxt = document.getElementById('scTrackTitle');
    this.artistTxt = document.getElementById('scTrackArtist');
    this.statusTxt = document.getElementById('scStatus');

    this.currentData = null;
    this.initEvents();
  }

  initEvents() {
    if (!this.scrim) return;

    // Close on cancel or outside click
    this.btnCancel?.addEventListener('click', () => this.close());
    this.scrim.addEventListener('click', (e) => {
      if (e.target === this.scrim) this.close();
    });

    // Enter key triggers resolve
    this.urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.resolveUrl();
    });

    this.btnResolve?.addEventListener('click', () => this.resolveUrl());

    this.btnApply?.addEventListener('click', () => {
      if (!this.currentData) return;
      
      // Notify parent listeners
      if (this.onTrackLoaded) {
        this.onTrackLoaded({
          title: this.currentData.title,
          artist: this.currentData.author_name || this.currentData.artist || '',
          url: this.currentData.url,
          artworkUrl: this.currentData.highResArt,
        });
      }

      if (this.onArtworkLoaded && this.currentData.highResArt) {
        this.onArtworkLoaded(this.currentData.highResArt);
      }

      this.close();
    });
  }

  open() {
    if (!this.scrim) return;
    this.scrim.classList.add('open');
    this.urlInput?.focus();
  }

  close() {
    if (!this.scrim) return;
    this.scrim.classList.remove('open');
    if (this.statusTxt) this.statusTxt.textContent = '';
  }

  async resolveUrl() {
    const rawUrl = this.urlInput?.value?.trim();
    if (!rawUrl) {
      if (this.statusTxt) this.statusTxt.textContent = 'Please paste a valid SoundCloud URL';
      return;
    }

    if (this.statusTxt) this.statusTxt.textContent = 'Fetching track metadata & artwork...';
    if (this.btnResolve) this.btnResolve.disabled = true;

    try {
      // Official CORS-accessible SoundCloud oEmbed endpoint
      const oembedEndpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`;
      const res = await fetch(oembedEndpoint);
      
      if (!res.ok) {
        throw new Error(`SoundCloud returned status ${res.status}`);
      }

      const data = await res.json();
      
      // Parse high-resolution artwork
      // SoundCloud thumbnail URLs typically end with -large.jpg or -t300x300.jpg
      let artUrl = data.thumbnail_url || '';
      if (artUrl) {
        artUrl = artUrl.replace('-large.', '-t500x500.').replace('-t300x300.', '-t500x500.');
      }

      // Separate title and artist if title is formatted "Artist - Title"
      let parsedTitle = data.title || 'SoundCloud Track';
      let parsedArtist = data.author_name || '';

      if (parsedTitle.includes(' - ')) {
        const parts = parsedTitle.split(' - ');
        parsedArtist = parts[0].trim();
        parsedTitle = parts.slice(1).join(' - ').trim();
      }

      this.currentData = {
        title: parsedTitle,
        author_name: parsedArtist,
        thumbnail_url: data.thumbnail_url,
        highResArt: artUrl,
        url: rawUrl,
      };

      // Show result card
      if (this.thumbImg && artUrl) {
        this.thumbImg.src = artUrl;
        this.thumbImg.style.display = 'block';
      }
      if (this.titleTxt) this.titleTxt.textContent = parsedTitle;
      if (this.artistTxt) this.artistTxt.textContent = parsedArtist || 'SoundCloud Artist';
      if (this.resultBox) this.resultBox.style.display = 'flex';
      if (this.btnApply) this.btnApply.disabled = false;
      if (this.statusTxt) {
        this.statusTxt.textContent = 'Track resolved! Click "Apply to Deck" to load artwork & metadata.';
      }
    } catch (err) {
      console.warn('[SoundCloudImporter] Resolution error:', err);
      if (this.statusTxt) {
        this.statusTxt.textContent = `Could not resolve track: ${err.message}. Ensure the track is public.`;
      }
    } finally {
      if (this.btnResolve) this.btnResolve.disabled = false;
    }
  }
}
