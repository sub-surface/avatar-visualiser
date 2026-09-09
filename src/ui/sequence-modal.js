/**
 * sequence-modal.js — Export Scene Sequence manager and popup modal controller.
 *
 * Allows users to select (checkbox) and reorder (HTML5 drag-and-drop or up/down arrows)
 * the scenes that AVATAR cycles through on musical cue points during video export.
 */
import { P, saveParams } from '../../params.js';

export const SCENE_DEFINITIONS = Object.freeze([
  { id: 'cartridge', label: 'Game Cartridge', type: 'item', tag: '3D Item' },
  { id: 'sphere', label: 'Cyber Sphere', type: 'field', tag: 'Wireframe' },
  { id: 'vinyl', label: 'Vinyl Record', type: 'item', tag: '3D Item' },
  { id: 'wave', label: 'Wave Field', type: 'field', tag: 'Wireframe' },
  { id: 'cassette', label: 'Cassette Tape', type: 'item', tag: '3D Item' },
  { id: 'cathedral', label: 'Signal Cathedral', type: 'field', tag: 'Wireframe' },
  { id: 'floppy', label: 'Floppy Disk', type: 'item', tag: '3D Item' },
  { id: 'tunnel', label: 'Feedback Tunnel', type: 'field', tag: 'Wireframe' },
  { id: 'bowl', label: 'Bowl Basin', type: 'field', tag: 'Wireframe' },
  { id: 'polar', label: 'Polar Scope', type: 'field', tag: 'Wireframe' },
  { id: 'topology', label: 'Topology Fold', type: 'field', tag: 'Wireframe' },
  { id: 'ribbon', label: 'Stereo Ribbon', type: 'field', tag: 'Wireframe' },
  { id: 'custom', label: 'Custom 3D Model', type: 'item', tag: '3D Item' },
]);

export const DEFAULT_SEQUENCE = Object.freeze([
  'cartridge',
  'sphere',
  'vinyl',
  'wave',
  'cassette',
  'cathedral',
  'floppy',
  'tunnel',
]);

export class SequenceModalController {
  constructor() {
    this.modal = null;
    this.listEl = null;
    this.summaryEl = null;
    this.draggedIndex = null;
    this.itemsOrder = []; // Array of scene objects in current display order
  }

  init(onSequenceChange = null) {
    this.onSequenceChange = onSequenceChange;
    if (typeof document === 'undefined') return;
    this.modal = document.getElementById('sequenceModal');
    this.listEl = document.getElementById('seqList');
    this.summaryEl = document.getElementById('seqSummary');
    if (!this.modal || !this.listEl) return;

    // Button Triggers
    const btnOpen = document.getElementById('btnEditSceneSequence');
    const btnClose = document.getElementById('seqBtnClose');
    const btnDone = document.getElementById('seqBtnDone');
    const btnSelectAll = document.getElementById('seqBtnSelectAll');
    const btnFieldOnly = document.getElementById('seqBtnFieldOnly');
    const btnItemsOnly = document.getElementById('seqBtnItemsOnly');
    const btnReset = document.getElementById('seqBtnReset');

    btnOpen?.addEventListener('click', () => this.open());
    btnClose?.addEventListener('click', () => this.close());
    btnDone?.addEventListener('click', () => this.close());

    // Click outside modal box to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    btnSelectAll?.addEventListener('click', () => this.selectAll());
    btnFieldOnly?.addEventListener('click', () => this.selectGroup('field'));
    btnItemsOnly?.addEventListener('click', () => this.selectGroup('item'));
    btnReset?.addEventListener('click', () => this.resetDefault());

    this.syncFromProject();
  }

  open() {
    this.syncFromProject();
    this.render();
    this.modal.style.display = 'flex';
  }

  close() {
    this.modal.style.display = 'none';
    this.updateSummary();
  }

  syncFromProject() {
    const rawSeq = Array.isArray(P.exportSceneSequence) && P.exportSceneSequence.length
      ? P.exportSceneSequence
      : [...DEFAULT_SEQUENCE];

    // Build ordered items list: scenes in sequence first, then remaining scenes
    const seqSet = new Set(rawSeq);
    const ordered = [];

    // 1. Add checked scenes in user order
    for (const id of rawSeq) {
      const def = SCENE_DEFINITIONS.find((d) => d.id === id);
      if (def) ordered.push({ ...def, checked: true });
    }

    // 2. Append unselected scenes
    for (const def of SCENE_DEFINITIONS) {
      if (!seqSet.has(def.id)) {
        ordered.push({ ...def, checked: false });
      }
    }

    this.itemsOrder = ordered;
    this.saveSequence();
  }

  saveSequence() {
    const activeIds = this.itemsOrder.filter((i) => i.checked).map((i) => i.id);
    P.exportSceneSequence = activeIds.length > 0 ? activeIds : ['cartridge'];
    saveParams();
    this.updateSummary();
    this.onSequenceChange?.(P.exportSceneSequence);
  }

  updateSummary() {
    if (!this.summaryEl) return;
    const count = (P.exportSceneSequence || []).length;
    this.summaryEl.textContent = `${count} scene${count === 1 ? '' : 's'} in export sequence`;
  }

  render() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    let activeRank = 1;

    this.itemsOrder.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `seq-item ${item.checked ? 'active-item' : 'disabled-item'}`;
      row.draggable = true;
      row.dataset.index = index;

      const rankBadge = item.checked ? `${activeRank++}` : '—';
      const isItemType = item.type === 'item';

      row.innerHTML = `
        <span class="seq-drag-handle" title="Drag to reorder">⠿</span>
        <span class="seq-rank">${rankBadge}</span>
        <input type="checkbox" class="seq-check" ${item.checked ? 'checked' : ''} title="Toggle scene inclusion">
        <span class="seq-label">${item.label}</span>
        <span class="seq-badge ${isItemType ? 'badge-item' : 'badge-field'}">${item.tag}</span>
        <div class="seq-btns">
          <button class="seq-btn-arrow" data-dir="up" title="Move up" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button class="seq-btn-arrow" data-dir="down" title="Move down" ${index === this.itemsOrder.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      `;

      // Drag & Drop Handlers
      row.addEventListener('dragstart', (e) => {
        this.draggedIndex = index;
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        document.querySelectorAll('.seq-item').forEach((el) => el.classList.remove('drag-over'));
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (this.draggedIndex === null || this.draggedIndex === index) return;

        // Reorder array
        const [moved] = this.itemsOrder.splice(this.draggedIndex, 1);
        this.itemsOrder.splice(index, 0, moved);
        this.draggedIndex = null;
        this.saveSequence();
        this.render();
      });

      // Checkbox click
      const check = row.querySelector('.seq-check');
      check.addEventListener('change', () => {
        item.checked = check.checked;
        this.saveSequence();
        this.render();
      });

      // Up/Down Arrows
      row.querySelector('[data-dir="up"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index > 0) {
          const [moved] = this.itemsOrder.splice(index, 1);
          this.itemsOrder.splice(index - 1, 0, moved);
          this.saveSequence();
          this.render();
        }
      });

      row.querySelector('[data-dir="down"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (index < this.itemsOrder.length - 1) {
          const [moved] = this.itemsOrder.splice(index, 1);
          this.itemsOrder.splice(index + 1, 0, moved);
          this.saveSequence();
          this.render();
        }
      });

      this.listEl.appendChild(row);
    });
  }

  selectAll() {
    this.itemsOrder.forEach((item) => { item.checked = true; });
    this.saveSequence();
    this.render();
  }

  selectGroup(type) {
    this.itemsOrder.forEach((item) => {
      item.checked = (item.type === type);
    });
    this.saveSequence();
    this.render();
  }

  resetDefault() {
    P.exportSceneSequence = [...DEFAULT_SEQUENCE];
    this.syncFromProject();
    this.render();
  }
}

export const sequenceModal = new SequenceModalController();
