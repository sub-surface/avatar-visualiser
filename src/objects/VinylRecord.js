import * as THREE from 'three';

/**
 * Creates a detailed 12" Vinyl Record with center label sticker and grooved sheen.
 */
export function createVinylRecord(defaultTexture = null) {
  const group = new THREE.Group();
  group.name = 'VinylRecord';

  // Main upright disc holder (vertical orientation)
  const discHolder = new THREE.Group();
  discHolder.name = 'VinylDiscHolder';
  discHolder.rotation.x = Math.PI / 2;
  group.add(discHolder);

  // Vinyl disc: radius 2.6, height 0.04
  const discGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.04, 64);
  const vinylMat = new THREE.MeshStandardMaterial({
    color: 0x111215,
    roughness: 0.28,
    metalness: 0.55,
  });
  const disc = new THREE.Mesh(discGeo, vinylMat);
  discHolder.add(disc);

  // Concentric vinyl groove rings (visual grooves using thin line loops)
  const grooveMat = new THREE.LineBasicMaterial({
    color: 0x22262e,
    transparent: true,
    opacity: 0.6,
  });
  for (let r = 1.15; r <= 2.45; r += 0.12) {
    const ringGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * r, 0.022, Math.sin(theta) * r));
    }
    ringGeo.setFromPoints(pts);
    discHolder.add(new THREE.Line(ringGeo, grooveMat));
    
    // Bottom grooves
    const ringGeoB = new THREE.BufferGeometry();
    const ptsB = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      ptsB.push(new THREE.Vector3(Math.cos(theta) * r, -0.022, Math.sin(theta) * r));
    }
    ringGeoB.setFromPoints(ptsB);
    discHolder.add(new THREE.Line(ringGeoB, grooveMat));
  }

  // Center circular label sticker (top & bottom)
  const labelGeo = new THREE.CircleGeometry(1.0, 48);
  const labelMat = new THREE.MeshStandardMaterial({
    map: defaultTexture || createFallbackVinylLabel('AVATAR', '33⅓ RPM STEREO'),
    roughness: 0.4,
    metalness: 0.05,
    side: THREE.FrontSide,
  });

  const labelTop = new THREE.Mesh(labelGeo, labelMat);
  labelTop.rotation.x = -Math.PI / 2;
  labelTop.position.y = 0.022;
  discHolder.add(labelTop);

  const labelBottom = new THREE.Mesh(labelGeo, labelMat);
  labelBottom.rotation.x = Math.PI / 2;
  labelBottom.position.y = -0.022;
  discHolder.add(labelBottom);

  // Center spindle hole (metallic rim)
  const holeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.045, 24);
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  discHolder.add(hole);

  // Holographic wireframe glitch mesh
  const wireGeo = new THREE.WireframeGeometry(discGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0xff00cc,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  discHolder.add(wireMesh);

  return {
    group,
    labelTop,
    labelBottom,
    labelMat,
    wireMat,
    setLabelTexture(tex) {
      if (tex) {
        tex.needsUpdate = true;
        labelMat.map = tex;
        labelMat.needsUpdate = true;
      }
    }
  };
}

export function createFallbackVinylLabel(title = 'AVATAR', subtitle = 'SIDE A · 33⅓ RPM') {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Background circle
  ctx.fillStyle = '#1e162a';
  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.fill();

  // Outer gold ring
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.stroke();

  // Spindle center cutout
  ctx.fillStyle = '#0a0a0d';
  ctx.beginPath();
  ctx.arc(256, 256, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Typography
  ctx.fillStyle = '#e8d5b0';
  ctx.textAlign = 'center';
  ctx.font = 'bold italic 36px Georgia, serif';
  ctx.fillText(title, 256, 170);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#b090c8';
  ctx.letterSpacing = '3px';
  ctx.fillText(subtitle, 256, 205);

  ctx.font = '14px monospace';
  ctx.fillStyle = '#a2b6c0';
  ctx.fillText('HIGH FIDELITY RECORDING', 256, 340);
  ctx.fillText('SUB-SURFACE TECHNOLOGIES', 256, 365);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
