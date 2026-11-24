import { cadMeshes } from './microlipo-cad.js';

// All dimensions are in millimetres. The labelled surface faces +Y.
function finish(THREE, color, metalness = 0, roughness = 0.5, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function addMesh(THREE, group, name, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function box(THREE, group, name, sizes, position, material) {
  return addMesh(THREE, group, name, new THREE.BoxGeometry(...sizes), material, ...position);
}

function wire(THREE, group, name, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return addMesh(THREE, group, name, new THREE.TubeGeometry(curve, 32, radius, 12, false), material);
}

function canvasTexture(THREE, width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function flatMark(THREE, group, name, width, height, position, texture) {
  const ink = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1
  });
  const mark = addMesh(THREE, group, name, new THREE.PlaneGeometry(width, height), ink, ...position);
  mark.rotation.x = -Math.PI / 2;
  return mark;
}

function solder(THREE, group, x, y, z, sizes, material) {
  const dome = new THREE.SphereGeometry(1, 20, 12, 0, 2 * Math.PI, 0, Math.PI / 2);
  const joint = addMesh(THREE, group, 'Solder fillet', dome, material, x, y, z);
  joint.scale.set(...sizes);
  return joint;
}

// A 20 mm brass carrier, fired ceramic and silver electrode. Lead routing is illustrative.
export function piezo(THREE) {
  const group = new THREE.Group();
  group.name = '20 mm wired piezoelectric diaphragm';
  const brass = finish(THREE, 0xcaa656, .57, .37);
  const ceramic = finish(THREE, 0xe5dac1, .04, .78);
  const electrode = finish(THREE, 0xc2bbb0, .38, .52);
  const silver = finish(THREE, 0xc8c8be, .75, .27);
  addMesh(THREE, group, 'Brass diaphragm, both faces', new THREE.CylinderGeometry(10, 10, .18, 112), brass, 0, .09, 0);
  addMesh(THREE, group, 'Piezoceramic wafer', new THREE.CylinderGeometry(7.35, 7.38, .21, 112), ceramic, 0, .285, 0);
  addMesh(THREE, group, 'Silver top electrode', new THREE.CylinderGeometry(6.81, 6.86, .026, 112), electrode, 0, .403, 0);

  // Deterministic, low-contrast grain on the fired silver face. The underside remains bare brass.
  const grain = canvasTexture(THREE, 384, 384, (ctx, w, h) => {
    ctx.fillStyle = '#c4c1b7'; ctx.fillRect(0, 0, w, h);
    let state = 16331;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4800; i++) {
      ctx.fillStyle = random() > .5 ? 'rgba(84,78,63,.15)' : 'rgba(246,244,228,.39)';
      ctx.fillRect(random() * w, random() * h, .5 + random() * 1.7, .4 + random());
    }
  });
  const face = addMesh(THREE, group, 'Fired electrode finish', new THREE.CircleGeometry(6.80, 112),
    finish(THREE, 0xffffff, .3, .56, { map: grain }), 0, .422, 0);
  face.rotation.x = -Math.PI / 2;

  for (const [isRed, x, z] of [[true, -2.1, -2.0], [false, -6.75, -5.18]]) {
    const offset = isRed ? 0 : -1.4;
    const startY = isRed ? .422 : .18;
    solder(THREE, group, x, startY, z, [1.09, .56, .91], silver);
    wire(THREE, group, 'Tinned wire at joint',
      [[x, startY + .16, z], [x - .55, .73, z - .34], [x - 1.15, .81, z - 1.17]], .15, silver);
    const last = [-27 + offset, .18, 8.3 + offset];
    wire(THREE, group, isRed ? 'Red electrode lead' : 'Black diaphragm lead', [
      [x - 1.08, .82, z - 1.05], [-9 + offset, 1.28, -7.1 + offset], [-16 + offset, .83, -10.4 + offset],
      [-22 + offset, .29, -7.2 + offset], [-24.5 + offset, .23, .3 + offset], last
    ], .43, finish(THREE, isRed ? 0xb52b24 : 0x232321, .01, .45));
    wire(THREE, group, 'Stripped, tinned end', [last, [last[0] - .4, .18, last[2] + 1.1],
      [last[0] - 1.1, .21, last[2] + 2.65]], .185, silver);
  }
  return group;
}

// Cross-sections give the aluminium laminate a raised face, rolled corners and a thin perimeter weld.
function pouchGeometry(THREE) {
  const sections = [
    [-2.94, 10.2, 15.35, 2.0], [-2.69, 11.13, 16.2, 1.7], [-2.0, 11.73, 16.72, 1.15],
    [-.46, 11.98, 17.04, .94], [-.13, 12.46, 17.29, .81], [.09, 12.48, 17.3, .81],
    [.43, 12.01, 17.04, .94], [2.03, 11.73, 16.71, 1.15], [2.69, 11.13, 16.2, 1.7],
    [2.96, 10.2, 15.35, 2.0]
  ];
  const positions = [], indices = [];
  const pointsPerCorner = 9, ringCount = 4 * pointsPerCorner;
  for (const [y, halfWidth, halfLength, radius] of sections) {
    for (let corner = 0; corner < 4; corner++) {
      const cx = (corner === 0 || corner === 3 ? 1 : -1) * (halfWidth - radius);
      const cz = (corner < 2 ? 1 : -1) * (halfLength - radius);
      for (let j = 0; j < pointsPerCorner; j++) {
        const angle = (corner + j / (pointsPerCorner - 1)) * Math.PI / 2;
        positions.push(cx + radius * Math.cos(angle), y, cz + radius * Math.sin(angle));
      }
    }
  }
  for (let row = 0; row < sections.length - 1; row++) {
    for (let j = 0; j < ringCount; j++) {
      const a = row * ringCount + j, b = row * ringCount + (j + 1) % ringCount;
      indices.push(a, a + ringCount, b, b, a + ringCount, b + ringCount);
    }
  }
  for (let j = 1; j < ringCount - 1; j++) {
    const last = (sections.length - 1) * ringCount;
    indices.push(0, j, j + 1, last, last + j + 1, last + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function batteryPlug(THREE, group, x, z, ivory, metal) {
  const housing = new THREE.Group();
  housing.name = 'JST PH two-position socket housing';
  housing.position.set(x, 0, z); group.add(housing);
  // Two open front cavities and two inspection windows expose the crimp contacts.
  box(THREE, housing, 'Housing floor', [4.46, .53, 6.9], [0, -1.46, 0], ivory);
  for (const side of [-1, 1]) {
    box(THREE, housing, 'Housing sidewall', [.48, 3.12, 6.9], [side * 1.99, .08, 0], ivory);
    box(THREE, housing, 'Keying rail', [.24, .62, 4.7], [side * 2.31, .50, -.27], ivory);
    box(THREE, housing, 'Socket contact floor', [1.01, .14, 3.45], [side, -.85, .15], metal);
    box(THREE, housing, 'Crimp spring', [.16, .60, 3.2], [side + .41, -.51, .18], metal);
    box(THREE, housing, 'Crimp spring', [.16, .60, 3.2], [side - .41, -.51, .18], metal);
  }
  box(THREE, housing, 'Terminal divider', [.28, 3.0, 6.9], [0, .20, 0], ivory);
  box(THREE, housing, 'Front roof', [4.22, .53, 1.86], [0, 1.45, -2.52], ivory);
  box(THREE, housing, 'Back roof', [4.22, .54, 2.76], [0, 1.46, 2.10], ivory);
  box(THREE, housing, 'Positive latch shoulder', [3.43, .43, .74], [0, 1.94, 1.05], ivory);
}

export function battery(THREE) {
  const group = new THREE.Group();
  group.name = 'TAC 602535 protected 500 mAh pouch';
  const foil = finish(THREE, 0xc6cbd1, .58, .31);
  addMesh(THREE, group, 'Aluminium laminate and welded edge', pouchGeometry(THREE), foil);
  const board = finish(THREE, 0x514324, .12, .47);
  const solderMetal = finish(THREE, 0xc4bfaa, .67, .28);
  const amber = finish(THREE, 0xd68e1b, .09, .30, { transparent: true, opacity: .67, depthWrite: false });
  box(THREE, group, 'Protection PCB at the terminal end', [22.8, 3.27, 1.75], [0, -.02, -17.12], board);
  box(THREE, group, 'Protection IC under tape', [3.1, 1.1, 1.22], [2.6, 1.66, -17.2], finish(THREE, 0x242723));
  for (const x of [-9.1, -7.2, 7.4, 9.1]) {
    box(THREE, group, 'Terminal-board solder pad', [1.23, .19, 1.21], [x, 1.7, -17.17], solderMetal);
  }
  box(THREE, group, 'Polyimide tape, front fold', [23.5, .13, 3.19], [0, 2.89, -15.37], amber);
  box(THREE, group, 'Polyimide tape, reverse fold', [23.6, .14, 3.45], [0, -2.84, -15.30], amber);
  box(THREE, group, 'Tape across protection-board end', [23.45, 5.66, .15], [0, .01, -17.94], amber);
  for (const x of [-11.69, 11.69]) {
    box(THREE, group, 'Folded tape corner', [.17, 5.48, 3.0], [x, .03, -16.39], amber);
  }
  const print = canvasTexture(THREE, 960, 550, (ctx) => {
    ctx.fillStyle = '#323735'; ctx.font = '600 65px monospace';
    ctx.fillText('Li-ion', 56, 131); ctx.fillText('UFX 602535 3.7V', 56, 257);
    ctx.fillText('500mAh 1.85Wh 2C', 56, 382);
  });
  flatMark(THREE, group, 'Capacity and cell identification', 20.3, 11.63, [0, 2.992, 1.2], print);
  // Use a relaxed route for the two flying leads so the plug and the cell fit in the same inspection view.
  const plugX = -24.6, plugZ = 3.15;
  for (const polarity of [-1, 1]) {
    const track = polarity * .6;
    wire(THREE, group, polarity === 1 ? 'Positive lead to pin 2' : 'Negative lead to pin 1', [
      [-6.9 + track, .15, -17.96], [-10.7 + track, .67, -20.6], [-18.3 + track, .67, -19.0],
      [-27.3 + track, .02, -12.4], [-31.8 + track, -.23, -1.7], [-30.2 + track, -.10, 8.0],
      [-26.4 + track, 0, 10.0], [plugX + polarity, 0, plugZ + 3.16]
    ], .49, finish(THREE, polarity === 1 ? 0xc42d27 : 0x262628, .015, .45));
  }
  batteryPlug(THREE, group, plugX, plugZ, finish(THREE, 0xe7e4d6, .01, .43), solderMetal);
  return group;
}

function decodeAs(text, ArrayType) {
  const raw = atob(text);
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  return new ArrayType(bytes.buffer);
}

export function charger(THREE) {
  const group = new THREE.Group();
  group.name = 'Adafruit MicroLipo V2, PID 1304';
  const textures = new THREE.TextureLoader();
  function boardFace(side) {
    const image = textures.load(new URL('./microlipo-' + side + '.webp', import.meta.url).href);
    image.colorSpace = THREE.SRGBColorSpace;
    image.anisotropy = 4;
    return finish(THREE, 0xffffff, .16, .53, { map: image });
  }
  const materials = {
    boardTop: boardFace('top'), boardBottom: boardFace('bottom'),
    boardEdge: finish(THREE, 0x4a402c, .12, .53), resin: finish(THREE, 0x262625),
    tin: finish(THREE, 0xc2c4bd, .65, .29), terminal: finish(THREE, 0xe1bd81, .59, .35),
    ivory: finish(THREE, 0xf0e6d1, 0, .46), ceramic: finish(THREE, 0xc0a16c, .14, .5),
    amberLens: finish(THREE, 0xeab077, .14, .25), greenLens: finish(THREE, 0xaac89c, .14, .29),
    lensBase: finish(THREE, 0xe1dfc9, .01, .44)
  };
  const list = Object.values(materials), keys = Object.keys(materials);
  // STEP positions quantised to micrometres. Change CAD +Z up to Three.js +Y up.
  for (const source of cadMeshes) {
    const encoded = decodeAs(source.position, Int16Array);
    const positions = new Float32Array(encoded.length);
    const normals = decodeAs(source.normal, Int8Array);
    const uvs = new Float32Array(2 * encoded.length / 3);
    for (let i = 0; i < encoded.length; i += 3) {
      const x = (encoded[i] + 15000) / 1000;
      const y = (encoded[i + 1] + 6000) / 1000;
      positions[i] = x - 15.175;
      positions[i + 1] = y - 6.03;
      positions[i + 2] = encoded[i + 2] / 1000;
      uvs[2 * i / 3] = normals[i + 2] < 0 ? 1 - x / 30.35 : x / 30.35;
      uvs[2 * i / 3 + 1] = y / 12.06;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(decodeAs(source.index, Uint16Array), 1));
    for (const [material, start, count] of source.groups) {
      geometry.addGroup(start, count, keys.indexOf(material));
    }
    const mesh = addMesh(THREE, group, source.name, geometry, list);
    mesh.rotation.x = -Math.PI / 2;
  }
  return group;
}
