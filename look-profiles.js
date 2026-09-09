export const LOOK_PROFILES = Object.freeze({
  clean: {
    label: 'clean',
    width: 0,
    height: 0,
    cadence: 'display',
    pixelSnap: 0,
    colorBits: 8,
    dither: 0,
    scanlines: 0,
    interlace: 0,
    chroma: 0,
    noise: 0,
    feedback: 0,
  },
  'ps2-480': {
    label: 'PS2 480p',
    width: 640,
    height: 480,
    cadence: '30',
    pixelSnap: 0.35,
    colorBits: 6,
    dither: 0.2,
    scanlines: 0.12,
    interlace: 0.08,
    chroma: 0.06,
    noise: 0.025,
    feedback: 0,
  },
  'ps2-240': {
    label: 'PS2 240p',
    width: 320,
    height: 240,
    cadence: '30',
    pixelSnap: 0.8,
    colorBits: 5,
    dither: 0.35,
    scanlines: 0.22,
    interlace: 0.18,
    chroma: 0.08,
    noise: 0.04,
    feedback: 0,
  },
  tape: {
    label: 'tape',
    width: 640,
    height: 480,
    cadence: '30',
    pixelSnap: 0.15,
    colorBits: 7,
    dither: 0.08,
    scanlines: 0.18,
    interlace: 0.3,
    chroma: 0.65,
    noise: 0.25,
    feedback: 0.08,
  },
  ghost: {
    label: 'ghost',
    width: 640,
    height: 480,
    cadence: '30',
    pixelSnap: 0.2,
    colorBits: 6,
    dither: 0.15,
    scanlines: 0.12,
    interlace: 0.06,
    chroma: 0.16,
    noise: 0.06,
    feedback: 0.82,
  },
  'vhs-master': {
    label: 'VHS master',
    width: 640,
    height: 480,
    cadence: '30',
    pixelSnap: 0.2,
    colorBits: 6,
    dither: 0.25,
    scanlines: 0.35,
    interlace: 0.45,
    chroma: 0.75,
    noise: 0.35,
    feedback: 0.12,
    vhsTracking: 0.85,
    vhsSyncDrop: 0.5,
    vhsCurvature: 0.15,
    vhsOsd: true,
  },
  'crt-90s': {
    label: '90s CRT TV',
    width: 640,
    height: 480,
    cadence: '60',
    pixelSnap: 0.1,
    colorBits: 7,
    dither: 0.15,
    scanlines: 0.45,
    interlace: 0.1,
    chroma: 0.25,
    noise: 0.08,
    feedback: 0.02,
    vhsTracking: 0.1,
    vhsSyncDrop: 0.05,
    vhsCurvature: 0.6,
    vhsOsd: false,
  },
  'ps1-retro': {
    label: 'PS1 low-poly',
    width: 320,
    height: 240,
    cadence: '24',
    pixelSnap: 1.0,
    colorBits: 5,
    dither: 0.5,
    scanlines: 0.2,
    interlace: 0.15,
    chroma: 0.1,
    noise: 0.05,
    feedback: 0,
    vhsTracking: 0,
    vhsSyncDrop: 0,
    vhsCurvature: 0,
    vhsOsd: false,
  },
});

export function applyLookProfile(project, profileId) {
  const profile = LOOK_PROFILES[profileId] ?? LOOK_PROFILES.clean;
  project.lookProfile = LOOK_PROFILES[profileId] ? profileId : 'clean';
  project.lookPixelSnap = profile.pixelSnap;
  project.lookColorBits = profile.colorBits;
  project.lookDither = profile.dither;
  project.lookScanlines = profile.scanlines;
  project.lookInterlace = profile.interlace;
  project.lookChroma = profile.chroma;
  project.lookNoise = profile.noise;
  project.lookFeedback = profile.feedback;
  project.lookCadence = profile.cadence;
  if (profile.vhsTracking !== undefined) project.vhsTracking = profile.vhsTracking;
  if (profile.vhsSyncDrop !== undefined) project.vhsSyncDrop = profile.vhsSyncDrop;
  if (profile.vhsCurvature !== undefined) project.vhsCurvature = profile.vhsCurvature;
  if (profile.vhsOsd !== undefined) project.vhsOsd = profile.vhsOsd;
  return project;
}

export function getInternalSize(project, viewportWidth, viewportHeight) {
  const profile = LOOK_PROFILES[project.lookProfile] ?? LOOK_PROFILES.clean;
  if (!profile.width || !profile.height) {
    return {
      width: Math.max(2, Math.round(viewportWidth)),
      height: Math.max(2, Math.round(viewportHeight)),
    };
  }

  const isVertical = project.exportOrientation === 'vertical';
  const isFourThree = project.exportAspect === '4:3';
  const baseWidth = profile.width;
  const baseHeight = isFourThree ? profile.height : Math.round(profile.width * 9 / 16);
  return isVertical
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight };
}

export function cadenceFps(project) {
  if (project.lookCadence === 'display') return 0;
  const value = Number(project.lookCadence);
  return Number.isFinite(value) ? value : 0;
}
