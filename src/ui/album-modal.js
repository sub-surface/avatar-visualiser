/**
 * album-modal.js — UI controller for the Multi-Track Album Playlist & Continuous Visualizer Suite.
 */
import { albumManager, formatDuration } from '../playlist/album-manager.js';
import { P, syncControls, updateTrackDisplay } from '../../params.js';
import { setColors } from '../../engine.js';
import { skyboxManager } from '../look/skybox.js';
import { applyLookProfile } from '../../look-profiles.js';
import { vcrOsd } from '../vhs/vcr-osd.js';
import { startAlbumExport, isExporting } from '../../export.js';

export class AlbumModal {
  constructor({ onTrackSelected = null, onStartContinuousPlay = null } = {}) {
    this.onTrackSelected = onTrackSelected;
    this.onStartContinuousPlay = onStartContinuousPlay;
    this.isOpen = false;
    this.modalEl = null;
    this.listEl = null;
    this.fileInputEl = null;
    this.summaryEl = null;
  }

  init() {
    this.modalEl = document.getElementById('albumModal');
    this.listEl = document.getElementById('albumTrackList');
    this.fileInputEl = document.getElementById('albumMultiFileInput');
    this.summaryEl = document.getElementById('albumSuiteSummary');

    if (!this.modalEl) return;

    // Close button & scrim click
    document.getElementById('albumBtnClose')?.addEventListener('click', () => this.close());
    document.getElementById('albumBtnDone')?.addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    // Add Tracks button
    document.getElementById('albumBtnAddTracks')?.addEventListener('click', () => {
      this.fileInputEl?.click();
    });

    // Multi-file input
    this.fileInputEl?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        await this.handleFilesAdded(files);
      }
      this.fileInputEl.value = '';
    });

    // Clear Playlist button
    document.getElementById('albumBtnClear')?.addEventListener('click', () => {
      if (confirm('Clear all tracks from the album playlist?')) {
        albumManager.clear();
        this.render();
      }
    });

    // Play Continuous button
    document.getElementById('albumBtnPlayContinuous')?.addEventListener('click', () => {
      this.close();
      if (this.onStartContinuousPlay) {
        this.onStartContinuousPlay();
      }
    });

    // Export Continuous MP4 button
    document.getElementById('albumBtnExportMp4')?.addEventListener('click', () => {
      this.close();
      startAlbumExport(albumManager);
    });

    // Drag and drop onto modal dropzone
    const dropzone = document.getElementById('albumDropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(f.name));
        if (files.length) {
          await this.handleFilesAdded(files);
        }
      });
      dropzone.addEventListener('click', () => this.fileInputEl?.click());
    }

    albumManager.onChange(() => {
      this.render();
      this.updateSummary();
    });

    this.render();
    this.updateSummary();
  }

  open() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'flex';
    this.modalEl.classList.add('open');
    this.isOpen = true;
    this.render();
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
    this.modalEl.classList.remove('open');
    this.isOpen = false;
  }

  async handleFilesAdded(files) {
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Importing ${files.length} audio file${files.length === 1 ? '' : 's'}...` }));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let duration = 0;

      // Extract duration via temporary audio element or AudioContext
      try {
        duration = await this.readAudioDuration(file);
      } catch (e) {
        console.warn('Could not read duration for', file.name, e);
      }

      albumManager.addTrack(file, duration);
    }

    this.render();
    this.updateSummary();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Album playlist updated: ${albumManager.tracks.length} tracks` }));
  }

  readAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration || 0);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    });
  }

  updateSummary() {
    if (!this.summaryEl) return;
    const count = albumManager.tracks.length;
    if (count === 0) {
      this.summaryEl.textContent = 'Single track mode (no album playlist)';
      return;
    }
    const totalDur = formatDuration(albumManager.getTotalDuration());
    this.summaryEl.textContent = `${count} track${count === 1 ? '' : 's'} · ${totalDur} total album duration`;
  }

  applyTrackToDeck(track) {
    if (!track || !track.projectConfig) return;

    // Load track project configuration into live P
    Object.assign(P, track.projectConfig);
    P.title = track.title;
    P.artist = track.artist;
    P.bpm = track.bpm || P.bpm;

    syncControls();
    updateTrackDisplay();
    setColors(P.colorA, P.colorB);
    applyLookProfile(P, P.lookProfile || 'clean');
    vcrOsd.setVisible(!!P.vhsOsd);
    if (skyboxManager) {
      skyboxManager.applyPreset(P.skyboxPreset || 'void', P.skyboxLightTone || 1.0);
    }

    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Active deck loaded: ${track.title}` }));
  }

  render() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    const tracks = albumManager.tracks;
    const activeIndex = albumManager.activeTrackIndex;

    const playBtn = document.getElementById('albumBtnPlayContinuous');
    const exportBtn = document.getElementById('albumBtnExportMp4');
    if (playBtn) playBtn.disabled = tracks.length === 0;
    if (exportBtn) exportBtn.disabled = tracks.length === 0;

    if (tracks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'album-empty-msg';
      empty.textContent = 'No tracks loaded in album playlist. Drag & drop audio files or click "+ Add Tracks" to begin.';
      this.listEl.appendChild(empty);
      return;
    }

    tracks.forEach((track, idx) => {
      const isCurrent = idx === activeIndex;
      const row = document.createElement('div');
      row.className = `album-track-item ${isCurrent ? 'active' : ''}`;

      // 1. Reorder handles
      const orderCol = document.createElement('div');
      orderCol.className = 'album-order-col';

      const btnUp = document.createElement('button');
      btnUp.className = 'album-btn-arr';
      btnUp.textContent = '▲';
      btnUp.disabled = idx === 0;
      btnUp.title = 'Move up';
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        albumManager.reorderTrack(idx, idx - 1);
      });

      const numEl = document.createElement('span');
      numEl.className = 'album-track-num';
      numEl.textContent = String(idx + 1).padStart(2, '0');

      const btnDown = document.createElement('button');
      btnDown.className = 'album-btn-arr';
      btnDown.textContent = '▼';
      btnDown.disabled = idx === tracks.length - 1;
      btnDown.title = 'Move down';
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        albumManager.reorderTrack(idx, idx + 1);
      });

      orderCol.appendChild(btnUp);
      orderCol.appendChild(numEl);
      orderCol.appendChild(btnDown);
      row.appendChild(orderCol);

      // 2. Track info (editable title & artist)
      const infoCol = document.createElement('div');
      infoCol.className = 'album-info-col';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'album-input-title';
      titleInput.value = track.title;
      titleInput.placeholder = 'Track Title';
      titleInput.addEventListener('change', (e) => {
        albumManager.updateTrack(track.id, { title: e.target.value.trim() });
      });

      const subRow = document.createElement('div');
      subRow.className = 'album-sub-row';

      const artistInput = document.createElement('input');
      artistInput.type = 'text';
      artistInput.className = 'album-input-artist';
      artistInput.value = track.artist;
      artistInput.placeholder = 'Artist';
      artistInput.addEventListener('change', (e) => {
        albumManager.updateTrack(track.id, { artist: e.target.value.trim() });
      });

      const durSpan = document.createElement('span');
      durSpan.className = 'album-track-dur';
      durSpan.textContent = formatDuration(track.duration);

      subRow.appendChild(artistInput);
      subRow.appendChild(durSpan);
      infoCol.appendChild(titleInput);
      infoCol.appendChild(subRow);
      row.appendChild(infoCol);

      // 3. Actions: "Edit in Deck" / Active Badge and Delete
      const actionsCol = document.createElement('div');
      actionsCol.className = 'album-actions-col';

      const editBtn = document.createElement('button');
      editBtn.className = `chrome ${isCurrent ? 'btn-active-highlight' : ''}`;
      editBtn.style.fontSize = '0.55rem';
      editBtn.textContent = isCurrent ? '✓ editing in deck' : 'edit visuals';
      editBtn.title = 'Load this track into the studio deck to customize its visual parameters, colors, and skybox';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selected = albumManager.selectTrack(idx, P);
        this.applyTrackToDeck(selected);
        if (this.onTrackSelected) this.onTrackSelected(selected, idx);
      });
      actionsCol.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'chrome album-btn-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove track from album';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        albumManager.removeTrack(track.id);
      });
      actionsCol.appendChild(delBtn);

      row.appendChild(actionsCol);
      this.listEl.appendChild(row);
    });
  }
}

export const albumModal = new AlbumModal();
