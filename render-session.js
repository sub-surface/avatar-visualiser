import { SharedAnalyzer } from './signal.js';

/**
 * Owns the stateful part of a rendering clock. A realtime preview and a
 * fixed-step export differ only in the time/dt values passed to these methods.
 */
export class RenderSession {
  constructor(project, {
    analyzer = new SharedAnalyzer(),
    field = null,
    mode = 'sphere',
    columns = () => Math.round(project.complexity) * 32,
  } = {}) {
    this.project = project;
    this.analyzer = analyzer;
    this.field = field;
    this.mode = mode;
    this.columns = columns;
    this.frame = null;
    this.field?.setMode(mode);
  }

  reset({ clearField = true } = {}) {
    this.analyzer.reset();
    this.frame = null;
    if (clearField && this.field) this.field.resetHistory(this.project.rows);
  }

  setMode(mode, options) {
    this.mode = mode;
    this.field?.setMode(mode, options);
  }

  commit(frame) {
    this.frame = frame;
    this.field?.update(frame, this.project, { cols: this.columns() });
    return frame;
  }

  stepPcm(channelL, channelR, sampleIndex, { dt, time, sampleRate }) {
    return this.commit(this.analyzer.stepPcm(channelL, channelR, sampleIndex, {
      dt,
      time,
      sampleRate,
      params: this.project,
    }));
  }

  stepBins(freqL, freqR, { dt, time, sampleRate }) {
    return this.commit(this.analyzer.stepBins(freqL, freqR, {
      dt,
      time,
      sampleRate,
      params: this.project,
    }));
  }
}
