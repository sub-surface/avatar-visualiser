import * as THREE from 'three';

/**
 * Creates a detailed retro Compact Cassette tape with rotating spools and customizable sticker label.
 */
export function createCassetteTape(defaultTexture = null) {
  const group = new THREE.Group();
  group.name = 'CassetteTape';

  // Shell body: width 4.0, height 2.6, depth 0.45
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x242830,
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 0.94,
  });

  const shellGeo = new THREE.BoxGeometry(4.0, 2.6, 0.45);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  group.add(shell);

  // Bottom trapezoidal tape head guard
  const guardGeo = new THREE.BoxGeometry(3.2, 0.55, 0.48);
  const guard = new THREE.Mesh(guardGeo, new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.6 }));
  guard.position.set(0, -1.05, 0);
  group.add(guard);

  // Tape spools (left & right white cogs)
  const spoolGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.48, 16);
  const spoolMat = new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 0.5 });
  
  const spoolL = new THREE.Mesh(spoolGeo, spoolMat);
  spoolL.rotation.x = Math.PI / 2;
  spoolL.position.set(-0.88, 0.05, 0);
  group.add(spoolL);

  const spoolR = new THREE.Mesh(spoolGeo, spoolMat);
  spoolR.rotation.x = Math.PI / 2;
  spoolR.position.set(0.88, 0.05, 0);
  group.add(spoolR);

  // Center sticker label (top face)
  const labelGeo = new THREE.PlaneGeometry(3.6, 1.8);
  const labelMat = new THREE.MeshStandardMaterial({
    map: defaultTexture || createFallbackCassetteLabel('AVATAR', 'C-90 CHROME TAPE'),
    roughness: 0.45,
    metalness: 0.05,
  });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.position.set(0, 0.15, 0.23);
  group.add(label);

  // Holographic wireframe glitch mesh
  const wireGeo = new THREE.WireframeGeometry(shellGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x39ff14,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  group.add(wireMesh);

  return {
    group,
    spoolL,
    spoolR,
    label,
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

export function createFallbackCassetteLabel(title = 'AVATAR', subtitle = 'TYPE II · CHROME') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f0ebe1';
  ctx.fillRect(0, 0, 512, 256);

  // Red & Black tape header bars
  ctx.fillStyle = '#cc1122';
  ctx.fillRect(0, 0, 512, 24);
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 24, 512, 12);

  // Window cutout shape in center
  ctx.fillStyle = '#22252a';
  ctx.fillRect(100, 70, 312, 116);
  ctx.clearRect(110, 80, 292, 96);

  // Side marker
  ctx.fillStyle = '#cc1122';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('A', 24, 85);

  // Title
  ctx.fillStyle = '#111111';
  ctx.font = 'bold italic 32px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 58);

  // Subtitle
  ctx.fillStyle = '#555555';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(subtitle, 256, 215);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
