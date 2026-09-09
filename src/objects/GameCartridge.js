import * as THREE from 'three';

/**
 * Creates a detailed retro game cartridge (SNES/N64 style) with a customizable front sticker label.
 */
export function createGameCartridge(defaultTexture = null) {
  const group = new THREE.Group();
  group.name = 'GameCartridge';

  // Body dimensions: ~ width 3.6, height 4.2, depth 0.6
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x4a4d52, // Classic matte grey plastic
    roughness: 0.65,
    metalness: 0.1,
  });

  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x36393e,
    roughness: 0.8,
    metalness: 0.05,
  });

  // Main shell body
  const shellGeo = new THREE.BoxGeometry(3.6, 4.2, 0.6);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  group.add(shell);

  // Top grip ridge notch
  const topGripGeo = new THREE.BoxGeometry(3.2, 0.4, 0.62);
  const topGrip = new THREE.Mesh(topGripGeo, gripMat);
  topGrip.position.set(0, 1.85, 0);
  group.add(topGrip);

  // Side grip ribs (3 on each side)
  for (let i = 0; i < 3; i++) {
    const y = 1.3 - i * 0.45;
    const ribL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.62), gripMat);
    ribL.position.set(-1.75, y, 0);
    group.add(ribL);

    const ribR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.62), gripMat);
    ribR.position.set(1.75, y, 0);
    group.add(ribR);
  }

  // Bottom edge connector lip
  const connGeo = new THREE.BoxGeometry(3.0, 0.35, 0.45);
  const conn = new THREE.Mesh(connGeo, new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.9 }));
  conn.position.set(0, -2.15, 0);
  group.add(conn);

  // Gold connector pins inside lip
  const pinGeo = new THREE.BoxGeometry(2.6, 0.1, 0.08);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 });
  const pins = new THREE.Mesh(pinGeo, pinMat);
  pins.position.set(0, -2.2, 0);
  group.add(pins);

  // Front sticker label face
  // Recessed slightly into the cartridge face: z = 0.305
  const labelGeo = new THREE.PlaneGeometry(2.8, 2.7);
  const labelMat = new THREE.MeshStandardMaterial({
    map: defaultTexture || createFallbackLabel('AVATAR', 'CARTRIDGE 64'),
    roughness: 0.35,
    metalness: 0.05,
  });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(0, -0.2, 0.306);
  group.add(labelMesh);

  // Wireframe glitch overlay mesh
  const wireGeo = new THREE.WireframeGeometry(shellGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  group.add(wireMesh);

  return {
    group,
    labelMesh,
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

/** Fallback retro cartridge label */
export function createFallbackLabel(title = 'AVATAR', subtitle = '64-BIT STEREO') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#1c2230');
  grad.addColorStop(0.5, '#2e1c36');
  grad.addColorStop(1, '#0d0f14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Red top banner (Nintendo style)
  ctx.fillStyle = '#cc0022';
  ctx.fillRect(0, 0, 512, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PSYCHOGRAPH ENTERTAINMENT', 256, 40);

  // Center wireframe circle logo
  ctx.strokeStyle = '#a2b6c0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 240, 110, 0, Math.PI * 2);
  ctx.stroke();

  // Geometric lines
  for (let i = -80; i <= 80; i += 20) {
    ctx.beginPath();
    ctx.moveTo(256 + i, 240 - Math.sqrt(Math.max(0, 110 * 110 - i * i)));
    ctx.lineTo(256 + i, 240 + Math.sqrt(Math.max(0, 110 * 110 - i * i)));
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold italic 44px Georgia, serif';
  ctx.fillText(title, 256, 410);

  // Subtitle
  ctx.fillStyle = '#a2b6c0';
  ctx.font = '20px monospace';
  ctx.letterSpacing = '4px';
  ctx.fillText(subtitle, 256, 445);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
