// Millimetres. The component face is +Y, with the USB opening towards -Z.
// XIAO outline, drills and connector centres follow Seeed's ESP32C3 v1.3 KiCad
// project. The GY-521 is reconstructed from the gallery photograph using its
// 2.54 mm header pitch. Its rear header represents the straight-pin option.
const TAU = Math.PI * 2;

function rounded(T, width, height, radius) {
  const path = new T.Shape();
  const x = width / 2, y = height / 2;
  path.moveTo(-x + radius, -y);
  path.lineTo(x - radius, -y);
  path.quadraticCurveTo(x, -y, x, -y + radius);
  path.lineTo(x, y - radius);
  path.quadraticCurveTo(x, y, x - radius, y);
  path.lineTo(-x + radius, y);
  path.quadraticCurveTo(-x, y, -x, y - radius);
  path.lineTo(-x, -y + radius);
  path.quadraticCurveTo(-x, -y, -x + radius, -y);
  return path;
}

function bore(T, shape, x, y, radius) {
  const hole = new T.Path();
  hole.absarc(x, y, radius, 0, TAU, true);
  shape.holes.push(hole);
}

function workbench(T, name) {
  const group = new T.Group();
  group.name = name;
  const surface = (color, metalness = 0, roughness = 0.52) =>
    new T.MeshStandardMaterial({ color, metalness, roughness });
  const materials = {
    silver: surface(0xc5cbce, .67, .29), tin: surface(0xa9b2b4, .63, .38),
    gold: surface(0xd9af55, .58, .33), black: surface(0x1c2229),
    graphite: surface(0x33363b), cream: surface(0xe4d9bd), green: surface(0x8cbd98),
    tan: surface(0xb89465), solderMask: surface(0x17191d), blue: surface(0x15558b),
    core: surface(0x384041), blueEdge: surface(0x57899c), amber: surface(0xc49b50)
  };
  materials.gold.side = T.DoubleSide;
  const instanceGroups = new Map();
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitDisk = new T.CylinderGeometry(.5, .5, 1, 40);
  const sphere = new T.SphereGeometry(.5, 28, 14);
  const transform = new T.Object3D();
  function primitive(geometry, material, x, y, z, w, h, d) {
    if (!instanceGroups.has(geometry)) instanceGroups.set(geometry, new Map());
    const batches = instanceGroups.get(geometry);
    if (!batches.has(material)) batches.set(material, []);
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    batches.get(material).push(transform.matrix.clone());
  }
  function mesh(geometry, material, x, y, z) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    group.add(object);
    return object;
  }
  function plate(shape, material, x, bottom, z, height, edge = material) {
    const geometry = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
    geometry.rotateX(-Math.PI / 2);
    return mesh(geometry, [material, edge], x, bottom, z);
  }
  function finish() {
    for (const [geometry, batches] of instanceGroups) {
      for (const [material, matrices] of batches) {
        const parts = new T.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((matrix, index) => parts.setMatrixAt(index, matrix));
        parts.computeBoundingSphere();
        group.add(parts);
      }
    }
    return group;
  }
  return {
    group, materials, mesh, plate, finish,
    box: (...args) => primitive(unitBox, ...args),
    disk: (...args) => primitive(unitDisk, ...args),
    dome: (...args) => primitive(sphere, ...args)
  };
}

// Draw all silkscreen and visible solder-mask traces for one face in a single
// transparent texture. All drawing coordinates are in millimetres.
function printFace(T, bench, x, y, z, w, h, underside, draw) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(84, 1536 / Math.max(w, h));
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / w, canvas.height / h);
  ctx.translate(w / 2, h / 2);
  const print = {
    text(value, px, pz, size, color = '#ebeeea', angle = 0, weight = 600, maxWidth) {
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.font = weight + ' ' + size + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (maxWidth === undefined) ctx.fillText(value, 0, 0);
      else ctx.fillText(value, 0, 0, maxWidth);
      ctx.restore();
    },
    line(points, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach(([px, pz], i) => i === 0 ? ctx.moveTo(px, pz) : ctx.lineTo(px, pz));
      ctx.stroke();
    },
    spot(px, pz, radius, color) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(px, pz, radius, 0, TAU);
      ctx.fill();
    },
    arc(px, pz, radius, start, end, color, width) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'butt';
      ctx.arc(px, pz, radius, start, end);
      ctx.stroke();
    }
  };
  draw(print);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const material = new T.MeshStandardMaterial({
    map, transparent: true, alphaTest: .05, depthWrite: false, roughness: .72, polygonOffset: true, polygonOffsetFactor: -1
  });
  const model = bench.mesh(new T.PlaneGeometry(w, h), material, x, y, z);
  model.rotation.x = -Math.PI / 2;
  if (underside) model.rotateY(Math.PI);
}

function xiaoOutline(T, rows) {
  const shape = new T.Shape();
  const w = 8.89, h = 10.4775, r = 1.905, notch = .35;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  for (const row of rows) {
    shape.lineTo(w, row - notch);
    shape.absarc(w, row, notch, -Math.PI / 2, Math.PI / 2, true);
  }
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  for (const row of [...rows].reverse()) {
    shape.lineTo(-w, row + notch);
    shape.absarc(-w, row, notch, Math.PI / 2, -Math.PI / 2, true);
  }
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  for (const side of [-1, 1]) {
    for (const row of rows) bore(T, shape, side * 7.62, row, .425);
  }
  return shape;
}

function edgePad(T, b, side, row) {
  const { gold } = b.materials;
  // Use a true half-hole at the outer edge and a separate plated drill inboard.
  const pad = new T.Shape();
  pad.moveTo(0, -.79);
  pad.lineTo(1.27, -.79);
  pad.lineTo(1.27, -.35);
  pad.absarc(1.27, 0, .35, -Math.PI / 2, Math.PI / 2, true);
  pad.lineTo(1.27, .79);
  pad.lineTo(0, .79);
  pad.absarc(0, 0, .79, Math.PI / 2, Math.PI * 1.5, false);
  bore(T, pad, 0, 0, .425);
  for (const level of [-1.625, .002]) {
    const copper = b.plate(pad, gold, side * 7.62, level, row, .025);
    if (side < 0) copper.rotation.y = Math.PI;
  }
  const barrel = new T.CylinderGeometry(.424, .424, 1.6, 28, 1, true);
  b.mesh(barrel, gold, side * 7.62, -.8, row);
  const castellation = new T.CylinderGeometry(.349, .349, 1.6, 20, 1, true, side > 0 ? Math.PI : 0, Math.PI);
  b.mesh(castellation, gold, side * 8.89, -.8, row);
}

function usbC(T, b) {
  const m = b.materials;
  const shell = rounded(T, 8.94, 3.16, 1.04);
  const interior = rounded(T, 8.39, 2.65, .92);
  shell.holes.push(interior);
  const sleeve = new T.ExtrudeGeometry(shell, { depth: 7.2, bevelEnabled: false, curveSegments: 16 });
  b.mesh(sleeve, m.silver, 0, 1.65, -12.05);
  b.box(m.black, 0, 1.68, -6.18, 8.32, 2.61, 2.10);
  b.box(m.black, 0, 1.62, -9.24, 6.46, .56, 4.5);
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * .5;
    for (const y of [1.32, 1.92]) b.box(m.gold, x, y, -10.12, .24, .055, 1.95);
    b.box(m.tin, x, .15, -4.49, .19, .15, .72);
  }
  for (const x of [-4.318, 4.318]) {
    for (const z of [-9.4, -5.21]) {
      b.box(m.tin, x, .34, z, .48, .68, 1.7);
      b.plate(rounded(T, .89, 1.78, .37), m.gold, x, -1.628, z, .036);
    }
  }
  for (const x of [-1.62, 1.62]) {
    b.plate(rounded(T, 1.23, .68, .31), m.graphite, x, 3.237, -7.08, .018);
    b.plate(rounded(T, 1.31, .79, .19), m.graphite, x * .80, 3.237, -5.85, .018);
  }
}

export function controller(T) {
  const b = workbench(T, 'Seeed Studio XIAO ESP32-C3');
  const m = b.materials;
  const rows = Array.from({ length: 7 }, (_, i) => (i - 3) * 2.54 + .0635);
  b.plate(xiaoOutline(T, rows.map(z => -z).reverse()), m.solderMask, 0, -1.6, 0, 1.6, m.core);
  for (const side of [-1, 1]) for (const row of rows) edgePad(T, b, side, row);
  usbC(T, b);

  const shieldZ = 1.8;
  b.plate(rounded(T, 13.0, 11.02, .36), m.tin, 0, .025, shieldZ, 1.60);
  b.plate(rounded(T, 12.72, 10.76, .29), m.silver, 0, 1.625, shieldZ, .14);
  printFace(T, b, 0, 1.782, shieldZ, 12.52, 10.50, false, p => {
    p.text('seeed studio', 0, -3.69, 1.66, '#25272a', 0, 700, 11.2);
    p.text('Model:XIAO-ESP32-C3', 0, -1.97, .93, '#282a2e', 0, 500, 10.8);
    const ink = '#25272b';
    p.line([[-4.93,2.49],[-4.93,-.80],[-3.68,-.80]],ink,.39);
    p.line([[-4.93,.70],[-4.16,.70]],ink,.39);
    for (const radius of [1.48,.91]) p.arc(-2.41,.83,radius,.79,TAU-.79,ink,.39);
    p.arc(2.15,.81,1.6,Math.PI/2,Math.PI*1.5,ink,.42);
    p.arc(4.96,.81,1.6,Math.PI/2,Math.PI*1.5,ink,.42);
    p.line([[3.44,.81],[4.92,.81]],ink,.42);
    p.text('FCC:Z4T-XIAOESP32C3', 0, 4.14, .91, '#282a2e', 0, 500, 10.9);
  });
  for (const x of [-4.445, 4.445]) {
    const z = 8.954;
    b.box(m.black, x, .41, z, 3.52, .79, 2.48);
    b.box(m.silver, x, .87, z, 3.16, .19, 2.31);
    for (const side of [-1, 1]) b.box(m.tin, x + side * 1.71, .2, z, .52, .40, 1.62);
    b.disk(m.graphite, x, 1.12, z, 1.66, .37, 1.66);
  }
  b.plate(rounded(T, 2.65, 2.63, .17), m.cream, 0, .05, 9.08, .62);
  for (const x of [-1.43, 1.43]) b.box(m.tin, x, .2, 9.08, .38, .40, 1.62);
  const rim = new T.Shape();
  rim.absarc(0, 0, .99, 0, TAU);
  bore(T, rim, 0, 0, .74);
  b.plate(rim, m.silver, 0, .61, 9.08, .57);
  b.disk(m.gold, 0, .88, 9.08, .31, .55, .31);
  b.box(m.cream, 5.715, .30, -9.855, 1.02, .58, .52);
  b.box(m.green, 5.715, .61, -9.855, .52, .045, .35);
  printFace(T, b, 0, .048, 0, 17.78, 20.955, false, p => {
    p.text('CH', 5.8, -8.58, .97, '#e7e7df', Math.PI);
    p.text('B', -7.43, 9.49, .86, '#e7e7df', Math.PI);
    p.text('R', 7.38, 9.49, .86, '#e7e7df', Math.PI);
  });
  // Rear pad coordinates mapped from Seeed's KiCad test points.
  for (const x of [-1.27, 1.27]) {
    for (const z of [-8.573, -6.033, -3.493]) b.disk(m.gold, x, -1.624, z, 1.143, .045, 1.143);
  }
  for (const z of [-2.223, -.318]) b.box(m.gold, -4.445, -1.627, z, 2.032, .048, 1.016);
  b.box(m.gold, 2.45, -1.627, .55, 2.7, .048, 2.7);
  printFace(T, b, 0, -1.607, 0, 17.78, 20.955, true, p => {
    for (let i=0;i<5;i++) {
      const lift=i*.25;
      p.line([[-5.25,3.39+lift],[-4.66,2.80+lift],[-4.27,2.80+lift],
        [-3.72,3.35+lift],[4.62-lift,3.35+lift],[6.59,1.38+2*lift]],'#2b2c2c',.13);
    }
    for (const pts of [
      [[-6.85,7.69],[-5.60,7.69],[-5.60,6.42],[-4.80,5.62],[.24,5.62]],
      [[-6.85,5.14],[-5.46,5.14],[-5.06,4.74],[-.14,4.74]],
      [[6.83,-7.56],[5.46,-7.56],[3.81,-5.91],[3.81,-4.99],[2.45,-3.63]],
      [[6.83,-5.02],[5.47,-5.02],[4.81,-4.36],[4.81,-3.17]],
      [[1.28,-8.55],[1.94,-8.55],[2.45,-8.04],[2.45,-5.99],[1.52,-5.06]],
      [[-1.28,-8.55],[-1.28,-7.41],[-1.07,-7.20]],
      [[-.16,5.63],[.29,5.63],[1.26,6.60],[2.79,6.60]]
    ]) p.line(pts,'#292b2b',.14);
    const left = ['VUSB', 'GND', '3V3', 'D10', 'D9', 'D8', 'D7'];
    rows.forEach((z, i) => {
      p.text(left[i], -5.85, z, .76, '#e8e7df', Math.PI / 2, 600, 2.25);
      p.text('D' + i, 5.88, z, .79, '#e8e7df', Math.PI / 2);
    });
    const signals = [['MTDO','MTDI'], ['GND','EN'], ['MTCK','MTMS']];
    [-8.573, -6.033, -3.493].forEach((z, i) => {
      p.text(signals[i][0], -2.43, z, .57, '#e4e4e0', Math.PI / 2, 500, 2.26);
      p.text(signals[i][1], -.03, z, .57, '#e4e4e0', Math.PI / 2, 500, 2.26);
    });
    p.text('BAT', 2.11, -1.18, .79, '#eeeee8', Math.PI / 2);
    p.text('−', 4.45, -3.24, 1.02);
    p.text('+', 4.45, .82, 1.02);
    p.text('seeed studio', 2.13, 5.43, 1.02, '#e3e5df', Math.PI / 2, 700, 7.62);
    p.text('XIAO ESP32C3', -.40, 5.44, .92, '#e3e5df', Math.PI / 2, 600, 7.9);
    p.text('RST', -4.4, 9.66, .66);
    p.text('Boot', 4.4, 9.66, .66);
  });
  return b.finish();
}

// Trace endpoints and component locations on the photographed ITG/MPU layout.
function motionSilk(p, rows) {
  const traces = [
    [[-6.32,-8.89],[-3,-8.89],[-2.8,-8.69],[-2.8,-7.83],[-2.22,-7.25],[.03,-7.25]],
    [[-6.32,-6.35],[-3.61,-6.35],[-3.31,-6.62],[-1.25,-6.62]],
    [[-6.32,-3.81],[-5.10,-3.81],[-4.31,-4.6],[-1.24,-4.6],[-.47,-3.84],[-.47,-2.5]],
    [[-6.32,-1.27],[-5.42,-1.27],[-4.58,-2.1],[-1.85,-2.1],[-1.43,-1.69],[-.6,-1.69]],
    [[-6.32,1.27],[-1.28,1.27],[-.92,.91]],
    [[-6.32,3.81],[-5.16,3.81],[-4.62,3.28],[-1.82,3.28]],
    [[-6.32,6.35],[-5.19,6.35],[-4.46,5.62],[-.58,5.62],[.4,4.66],[.4,2.01]],
    [[-6.32,8.89],[-5.3,8.89],[-4.3,7.89],[.43,7.89],[.85,7.47],[.85,2.01]],
    [[1.33,2],[1.33,3.03],[1.91,3.61],[2.52,3.61]],
    [[1.82,2],[1.82,2.73],[2.33,3.23],[3.37,3.23],[4.28,2.32],[4.28,1.22]],
    [[2.86,-1.45],[3.9,-1.45],[4.32,-1.85],[4.99,-1.85]],
    [[2.87,.97],[4.98,.97]], [[2.87,.47],[4.98,.47]],
    [[.91,-2.41],[.91,-3.97],[1.49,-4.55],[2.43,-4.55]],
    [[.4,-2.41],[.4,-4.39],[1,-4.97],[2.4,-4.97]],
    [[-.12,-2.41],[-.12,-3.45],[-1.12,-3.45]],
    [[.94,-9.1],[2.56,-9.1],[2.56,-6.78],[3.92,-5.42],[5.79,-5.42],[7.33,-3.88]],
    [[.90,-8.68],[2.09,-8.68],[2.09,-6.49],[3.70,-4.87],[5.73,-4.87],[6.39,-4.2],[6.39,-2.41]],
    [[.81,-8.14],[1.58,-8.14],[1.58,-6.28],[2.15,-5.71]]
  ];
  for (const trace of traces) {
    p.line(trace, '#104a79', .29);
    p.line(trace, '#28659a', .17);
  }
  for (const [x,z] of [[-4.1,-7.43],[-2.82,-5.14],[.87,-6.07],[1.66,-6.62],[-.04,-3.9],
    [3.82,-3.05],[4.59,-2.97],[5.5,-3.19],[4.45,-4.80],[1.31,2.91],[-2.58,3.45],
    [-2.82,5.04],[.91,7.25],[3.62,2.8],[4.23,3.76],[2.35,-7.34],[2.85,-3.17]]) {
    p.spot(x,z,.14,'#103446');
    p.spot(x,z,.065,'#0c2934');
  }
  ['VCC','GND','SCL','SDA','XDA','XCL','AD0','INT'].forEach((label,i) =>
    p.text(label,-3.64,rows[i],1.36,'#ebede0',0,500,2.76));
  p.text('ITG/MPU',6.9,-.34,1.28,'#e7ebe3',-Math.PI/2,600,6.86);
  const ink = '#e6eee6';
  p.line([[-1.5,8.52],[.80,8.52],[.45,8.20]],ink,.16);
  p.line([[.80,8.52],[.46,8.81]],ink,.16);
  p.line([[-.20,7.82],[-.47,8.34],[-.43,8.85],[-.19,9.14]],ink,.11);
  p.text('X',1.03,9.23,.93,ink);
  p.line([[2.47,8.04],[2.47,6.06],[2.12,6.43]],ink,.16);
  p.line([[2.47,6.06],[2.80,6.43]],ink,.16);
  p.line([[1.8,7.01],[2.11,7.33],[2.6,7.4],[2.99,7.18]],ink,.12);
  p.text('Y',3.3,6.21,.93,ink);
}

export function motion(T) {
  const b = workbench(T, 'GY-521 / InvenSense MPU-6050');
  const m = b.materials;
  const w = 15.3, h = 20.3, t = 1.35, headerX = -6.26;
  const rows = Array.from({ length: 8 }, (_, i) => (i - 3.5) * 2.54);
  const board = rounded(T, w, h, .17);
  for (const z of [-7.61, 7.61]) bore(T, board, 5.18, -z, 1.51);
  for (const z of rows) bore(T, board, headerX, -z, .49);
  b.plate(board, m.blue, 0, -t, 0, t, m.blueEdge);
  for (const z of [-7.61, 7.61]) {
    const ring = new T.Shape();
    ring.absarc(0,0,1.61,0,TAU);
    bore(T, ring, 0,0,1.51);
    for (const level of [-t-.024,.002]) b.plate(ring, m.amber, 5.18, level, z, .024);
  }
  for (const z of rows) {
    const insulator = rounded(T,2.43,2.47,.22);
    b.plate(insulator,m.black,headerX,-t-2.4,z,2.4);
    b.box(m.tin,headerX,-t-3.99,z,.63,7.86,.63);
    const tip = new T.CylinderGeometry(.447,.23,.36,4);
    tip.rotateY(Math.PI/4);
    b.mesh(tip,m.tin,headerX,-t-8.08,z);
    b.disk(m.gold,headerX,.035,z,1.74,.08,1.74);
    b.dome(m.tin,headerX,.125,z,1.61,1.13,1.61);
    b.box(m.silver,headerX,.58,z,.45,.39,.45);
  }
  printFace(T,b,0,.052,0,w,h,false,p=>motionSilk(p,rows));
  printFace(T,b,0,-t-.031,0,w,h,true,p=>{
    p.text('GY-521',-.35,0,1.38,'#eaf0e8',-Math.PI/2,600);
    ['VCC','GND','SCL','SDA','XDA','XCL','AD0','INT'].forEach((s,i) =>
      p.text(s,3.99,rows[i],.89,'#e4ebe5',0,600,2.1));
  });

  // InvenSense package drawing: 4 × 4 × 0.9 mm, six terminals per edge.
  const chipX = .86, chipZ = -.23;
  for (let i=0;i<6;i++) {
    const offset=(i-2.5)*.50;
    for (const side of [-1,1]) {
      b.box(m.tin,chipX + side*2.04,.115,chipZ+offset,.87,.23,.28);
      b.box(m.tin,chipX+offset,.115,chipZ+side*2.04,.28,.23,.87);
    }
  }
  b.plate(rounded(T,4,4,.1),m.graphite,chipX,.055,chipZ,.90);
  printFace(T,b,chipX,.966,chipZ,3.90,3.90,false,p=>{
    p.spot(-1.48,-1.49,.19,'#a5a89d');
    p.text('INVENSENSE',0,-.57,.52,'#aeb4aa',0,500,3.52);
    p.text('MPU-6050',0,.08,.62,'#aeb4aa',0,500,3.3);
    p.text('D3G156-A1',0,.76,.54,'#aeb4aa',0,500,3.35);
    p.text('EL 1409 E',0,1.41,.52,'#aeb4aa',0,500,3.2);
  });

  function smd(x,z,vertical,body,mark) {
    const half = .77;
    const w = vertical ? .9 : 1.62, d = vertical ? 1.62 : .9;
    b.box(body,x,.31,z,w,.49,d);
    for (const end of [-1,1]) {
      b.box(m.tin,x+(vertical?0:end*half),.33,z+(vertical?end*half:0),
        vertical?.92:.32,.54,vertical?.32:.92);
    }
    if (mark) printFace(T,b,x,.584,z,w,d,false,p=>p.text(mark,0,0,.62,'#e4dfce',Math.PI,500,1.24));
  }
  for (const [x,z] of [[-1.06,-6.57],[2.47,-5.21],[2.47,-3.91],[-1.06,3.65],[2.47,3.65]]) {
    smd(x,z,false,m.tan);
  }
  smd(2.51,-8.78,true,m.tan);
  for (const [x,z,label] of [[-1.06,-5.21,'222'],[-1.06,-3.91,'222'],[-1.06,5.16,'472'],[2.47,5.16,'102']]) {
    smd(x,z,false,m.graphite,label);
  }
  smd(-1.06,6.5,false,m.cream);
  b.box(m.green,-1.16,.59,6.5,.48,.07,.27);
  const regulatorZ = -8.82;
  for (const [x,offsets] of [[-.79,[-.94,0,.94]],[.79,[-.94,.94]]]) {
    for (const offset of offsets) b.box(m.tin,x,.18,regulatorZ+offset,1.12,.34,.39);
  }
  b.plate(rounded(T,1.68,2.9,.12),m.graphite,-.08,.10,regulatorZ,1.0);
  printFace(T,b,-.08,1.115,regulatorZ,1.65,2.84,false,p=>p.text('A249',0,0,.81,'#b6b29a',Math.PI/2,500,2.34));
  const capX = 4.98, capZ = -.30;
  for (const side of [-1,1]) b.box(m.tin,capX,.21,capZ+side*1.62,1.56,.42,.72);
  b.plate(rounded(T,1.75,3.32,.19),m.amber,capX,.16,capZ,1.22);
  printFace(T,b,capX,1.394,capZ,1.65,3.20,false,p=>{
    p.line([[-.79,1.15],[.79,1.15]],'#825b3c',.24);
    p.text('106C',-.34,-.20,.55,'#845d42',-Math.PI/2);
    p.text('3A052',.35,-.20,.55,'#845d42',-Math.PI/2);
  });
  return b.finish();
}
