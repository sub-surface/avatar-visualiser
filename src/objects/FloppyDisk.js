import * as THREE from 'three';

/**
 * Creates a detailed retro 3.5" Floppy Disk with sliding metal shutter and custom sticker label.
 */
export function createFloppyDisk(defaultTexture = null) {
  const group = new THREE.Group();
  group.name = 'FloppyDisk';

  // Body dimensions: 3.5 x 3.6 x 0.35
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e28, // Classic dark navy/black diskette plastic
    roughness: 0.6,
    metalness: 0.1,
  });

  const bodyGeo = new THREE.BoxGeometry(3.5, 3.6, 0.3);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Metal shutter at top
  const shutterMat = new THREE.MeshStandardMaterial({
    color: 0xc8cdd6,
    roughness: 0.25,
    metalness: 0.85,
  });
  const shutterGeo = new THREE.BoxGeometry(1.8, 1.4, 0.32);
  const shutter = new THREE.Mesh(shutterGeo, shutterMat);
  shutter.position.set(0.1, 1.15, 0);
  group.add(shutter);

  // Sticker label (front bottom)
  const labelGeo = new THREE.PlaneGeometry(2.8, 2.0);
  const labelMat = new THREE.MeshStandardMaterial({
    map: defaultTexture || createFallbackFloppyLabel('AVATAR', '2HD · 1.44 MB'),
    roughness: 0.5,
    metalness: 0.05,
  });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.position.set(0, -0.65, 0.155);
  group.add(label);

  // Wireframe glitch mesh
  const wireGeo = new THREE.WireframeGeometry(bodyGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
  group.add(wireMesh);

  return {
    group,
    shutter,
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

export function createFallbackFloppyLabel(title = 'AVATAR', subtitle = '2HD · 1.44 MB') {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  // Paper background
  ctx.fillStyle = '#f8f8f4';
  ctx.fillRect(0, 0, 512, 384);

  // Top accent bar
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, 512, 36);

  // Title
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 120);

  // Grid lines
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 2;
  for (let y = 160; y <= 320; y += 40) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(482, y);
    ctx.stroke();
  }

  // Subtitle
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(subtitle, 256, 200);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
