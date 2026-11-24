// Millimetres, with the winding face in +Y. The transmitter artwork and component
// coordinates are derived from Seeed Studio's Qi Wireless Charger Transmitter v1.0
// Eagle board (wiki.seeedstudio.com/Qi_Wireless_Charger_Transmitter/), CC BY-SA 4.0.
// The Adafruit PID 1901 reconstruction represents the original amber flex revision.

function surface(T, color, metalness = 0, roughness = 0.5) {
  return new T.MeshStandardMaterial({color, metalness, roughness});
}

function place(T, group, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function box(T, group, material, x, y, z, width, height, depth) {
  return place(T, group, new T.BoxGeometry(width, height, depth), material, x, y, z);
}

function faceMaterial(T, file, fallback, back = false) {
  const material = surface(T, fallback, 0.18, 0.46);
  if (back) material.side = T.BackSide;
  if (typeof document !== 'undefined') {
    const texture = new T.TextureLoader().load(new URL(file, import.meta.url).href, map => {
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = 4;
      material.color.set(0xffffff);
      material.map = map;
      material.needsUpdate = true;
    }, undefined, () => texture.dispose());
  }
  return material;
}

function roundedBoard(T, width, depth, radius, holes = []) {
  const shape = new T.Shape();
  shape.moveTo(radius, 0);
  shape.lineTo(width - radius, 0);
  shape.quadraticCurveTo(width, 0, width, radius);
  shape.lineTo(width, depth - radius);
  shape.quadraticCurveTo(width, depth, width - radius, depth);
  shape.lineTo(radius, depth);
  shape.quadraticCurveTo(0, depth, 0, depth - radius);
  shape.lineTo(0, radius);
  shape.quadraticCurveTo(0, 0, radius, 0);
  for (const [x, z, r] of holes) {
    const hole = new T.Path();
    hole.absarc(x, z, r, 0, 2 * Math.PI, true);
    shape.holes.push(hole);
  }
  return shape;
}

// A flat board with real cut-outs and separately textured faces. Its top-view
// coordinates correspond to an Eagle drawing in XY, mapped into world X/-Z.
function board(T, group, width, depth, thickness, radius, holes, front, back, edge) {
  const shape = roundedBoard(T, width, depth, radius, holes);
  const solid = new T.ExtrudeGeometry(shape, {depth: thickness, bevelEnabled: false, curveSegments: 18});
  solid.rotateX(-Math.PI / 2);
  place(T, group, solid, edge);
  for (const [material, y] of [[front, thickness + .008], [back, -.008]]) {
    const geom = new T.ShapeGeometry(shape, 18);
    const {position, uv} = geom.attributes;
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width, position.getY(i) / depth);
    geom.rotateX(-Math.PI / 2);
    place(T, group, geom, material, 0, y);
  }
}

function lead(T, group, material, points, radius) {
  const path = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
  return place(T, group, new T.TubeGeometry(path, 40, radius, 8, false), material);
}

function winding(T, group, material, points, radius, heightScale, y) {
  const path = new T.CatmullRomCurve3(points);
  path.arcLengthDivisions = points.length * 2;
  const wire = new T.TubeGeometry(path, points.length, radius, 8, false);
  wire.scale(1, heightScale, 1);
  return place(T, group, wire, material, 0, y);
}

// Keep the individual pins, ceramic bodies and terminations as geometry while
// drawing equal materials together on mobile GPUs.
function boxBatch(T, group) {
  const batches = new Map();
  const geometry = new T.BoxGeometry(1, 1, 1);
  const transform = new T.Object3D();
  return {
    add(material, x, y, z, w, h, d, angle = 0) {
      transform.position.set(x, y, z);
      transform.scale.set(w, h, d);
      transform.rotation.set(0, angle, 0);
      transform.updateMatrix();
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(transform.matrix.clone());
    },
    finish() {
      for (const [material, matrices] of batches) {
        const mesh = new T.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
  };
}

// Measured component origins and rotations from the released PCB layout.
const transmitterParts = {
  "VQFN48": [
    [20.954, 41.91, 0],
  ],
  "SOIC8-6.0": [
    [38.48, 13.589, 270], [38.48, 21.209, 270],
  ],
  "R0603": [
    [17.779, 34.925, 90], [19.43, 34.925, 90], [20.827, 50.673, 90], [23.367, 34.925, 270],
    [24.891, 34.925, 270], [17.779, 50.673, 270], [14.731, 50.673, 270], [12.064, 47.117, 180],
    [12.064, 44.069, 180], [12.064, 42.545, 180], [12.064, 39.497, 180], [12.064, 41.021, 180],
    [24.637, 49.911, 180], [24.637, 51.435, 180], [26.923, 50.673, 90], [41.274, 43.815, 270],
    [36.321, 43.815, 270], [44.83, 15.494, 180], [44.83, 11.684, 180], [44.83, 23.114, 180],
    [44.83, 19.304, 180], [36.448, 25.527, 180], [40.385, 28.194, 270], [28.574, 27.432, 0],
    [7.619, 32.004, 270], [34.289, 43.815, 270], [28.574, 24.511, 180], [28.574, 20.701, 180],
    [28.574, 22.606, 180], [16.255, 34.925, 270], [20.954, 34.925, 270],
  ],
  "LED-0603": [
    [26.415, 34.925, 90],
  ],
  "C0603": [
    [42.163, 28.194, 270], [16.255, 50.673, 270], [12.064, 50.165, 0], [27.939, 45.72, 270],
    [27.939, 41.275, 270], [26.288, 47.244, 90], [28.447, 50.673, 90], [41.274, 40.64, 270],
    [44.83, 13.589, 0], [44.83, 21.209, 0], [28.574, 28.956, 0], [12.064, 37.973, 0],
    [14.985, 26.797, 90], [44.83, 17.399, 180], [44.83, 24.892, 180], [19.303, 50.673, 90],
    [12.064, 45.593, 180], [12.064, 48.641, 0], [26.415, 41.275, 270],
  ],
  "C0805": [
    [29.844, 45.72, 270], [29.844, 41.275, 270], [44.068, 28.194, 270], [39.877, 25.527, 0],
    [13.08, 26.543, 90], [12.064, 34.163, 180], [12.064, 36.195, 180], [34.289, 47.244, 270],
    [36.321, 47.244, 270],
  ],
  "C1206": [
    [58.165, 28.575, 0], [58.165, 25.4, 0], [58.165, 22.225, 0], [58.165, 19.05, 0],
  ],
  "R2512": [
    [50.037, 28.321, 0],
  ],
  "SOT23-5": [
    [37.21, 28.194, 270],
  ],
  "SOT23": [
    [32.13, 28.194, 90], [12.064, 31.242, 180],
  ],
  "SOD123": [
    [38.861, 42.545, 270], [38.861, 48.514, 270],
  ],
  "SOP8": [
    [50.545, 13.589, 270], [50.545, 21.209, 270],
  ],
  "3P-5X5X2.5H": [
    [30.479, 36.83, 0],
  ],
};

function populateTransmitter(T, root, colors) {
  const batch = boxBatch(T, root);
  const boardTop = 1.6;
  for (const [pkg, positions] of Object.entries(transmitterParts)) {
    for (const [x, north, degrees] of positions) {
      const angle = degrees * Math.PI / 180;
      const item = (mat, dx, dz, rise, w, h, depth) => {
        const px = x + dx * Math.cos(angle) + dz * Math.sin(angle);
        const pz = -north - dx * Math.sin(angle) + dz * Math.cos(angle);
        batch.add(mat, px, boardTop + rise, pz, w, h, depth, angle);
      };
      if (/^[RC]\d|^LED|^SOD/.test(pkg)) {
        const [w, d, h] = ({
          C0805: [2, 1.25, .75], C1206: [3.2, 1.6, 1.24], R2512: [6.35, 3.18, .58],
          SOD123: [3, 1.55, 1.35], 'LED-0603': [1.6, .8, .7]
        })[pkg] || [1.6, .8, pkg[0] === 'C' ? .72 : .48];
        const mat = pkg[0] === 'C' ? colors.ceramic : pkg === 'R2512' ? colors.chalk :
          pkg === 'LED-0603' ? colors.led : colors.chip;
        item(mat, 0, 0, h / 2 + .03, w * .75, h, d);
        for (const end of [-1, 1]) item(colors.tin, end * w * .43, 0, h / 2, w * .19, h * .98, d);
      } else if (pkg === 'VQFN48') {
        item(colors.chip, 0, 0, .52, 6.9, .95, 6.9);
        for (let i = 0; i < 12; i++) {
          const offset = (i - 5.5) * .5;
          for (const sign of [-1, 1]) {
            item(colors.tin, sign * 3.47, offset, .11, .52, .21, .23);
            item(colors.tin, offset, sign * 3.47, .11, .23, .21, .52);
          }
        }
      } else if (pkg === '3P-5X5X2.5H') {
        item(colors.chip, 0, 0, 1.29, 5.0, 2.5, 5.0);
        const bore = new T.CylinderGeometry(.51, .51, .035, 16);
        place(T, root, bore, colors.black, x + .5, boardTop + 2.55, -north - .29);
      } else {
        const small = pkg.startsWith('SOT');
        const legs = small ? (pkg === 'SOT23-5' ? [3, 2] : [2, 1]) : [4, 4];
        const w = small ? 2.9 : 4.9;
        const d = small ? 1.4 : 3.92;
        const h = small ? .95 : 1.5;
        item(colors.chip, 0, 0, h / 2 + .12, w, h, d);
        legs.forEach((count, side) => {
          const sign = side ? 1 : -1;
          for (let i = 0; i < count; i++) {
            const xpin = (i - (count - 1) / 2) * (small ? (count === 2 ? 1.9 : .95) : 1.27);
            item(colors.tin, xpin, sign * (d / 2 + .21), .35, small ? .32 : .39, .41, .51);
            item(colors.tin, xpin, sign * (d / 2 + .57), .13, small ? .32 : .39, .22, .54);
          }
        });
      }
    }
  }
  batch.finish();
}

export function transmitter(T) {
  const root = new T.Group();
  root.name = 'Seeed Studio Qi wireless transmitter v1.0';
  const colors = {
    tin: surface(T, 0xc4c4bd, .82, .28), chip: surface(T, 0x262728, .09, .63),
    ceramic: surface(T, 0xb29c69, .12, .54), chalk: surface(T, 0xd8d5ba, .13, .46),
    led: surface(T, 0x87382a, .15, .4), black: surface(T, 0x101214)
  };
  const holes = [[3.429,3.429],[65.15,3.429],[65.15,51.181],[3.429,51.181]].map(([x,y]) => [x,y,1.6002]);
  board(T, root, 68.58, 54.61, 1.6, 3.86, holes,
    faceMaterial(T, './transmitter-front.webp', 0x172120),
    faceMaterial(T, './transmitter-back.webp', 0x192221, true), surface(T, 0x756747, .1, .65));
  populateTransmitter(T, root, colors);

  // Open micro-B receptacle: shell, captive tongue, five contacts and two
  // solder tabs. The opening points out from the PCB's left edge.
  const usbZ = -26.035;
  box(T, root, colors.tin, 2.2, 4.23, usbZ, 5.6, .26, 7.45);
  box(T, root, colors.tin, 2.2, 1.89, usbZ, 5.6, .23, 6.35);
  box(T, root, colors.black, 4.82, 3.07, usbZ, .45, 2.22, 6.87);
  box(T, root, colors.chip, 1.96, 2.75, usbZ, 4.41, .65, 4.98);
  for (const side of [-1, 1]) {
    const wall = box(T, root, colors.tin, 2.2, 3.13, usbZ + side * 3.4, 5.6, 2.45, .28);
    wall.rotation.x = side * .19;
    box(T, root, colors.tin, 4.2, 1.85, usbZ + side * 3.6, 1.38, .26, 1.12);
  }
  const gold = surface(T, 0xb59248, .7, .28);
  for (let i = -2; i <= 2; i++) box(T, root, gold, 1.7, 3.1, usbZ + i * .64, 2.6, .06, .29);

  // Coil diameter and relative position are photo-scaled against the four
  // documented PCB holes. The two leads return to COIL1 and COII2.
  const cx = 99.5, cz = -23;
  const ferrite = new T.Shape();
  ferrite.absarc(0, 0, 23, 0, 2 * Math.PI);
  const centre = new T.Path();
  centre.absarc(0, 0, 2.4, 0, 2 * Math.PI, true);
  ferrite.holes.push(centre);
  const disk = new T.ExtrudeGeometry(ferrite, {depth: 1.65, bevelEnabled: false, curveSegments: 72});
  disk.rotateX(-Math.PI / 2);
  place(T, root, disk, surface(T, 0x373832, .13, .78), cx, 0, cz);
  const wire = surface(T, 0xe4b28f, .66, .30);
  const points = [];
  const turns = 11;
  for (let i = 0; i <= turns * 94; i++) {
    const f = i / (turns * 94);
    const radius = 9.1 + 10.55 * f;
    const a = Math.PI + 2 * Math.PI * turns * f;
    points.push(new T.Vector3(cx + radius * Math.cos(a), 0, cz + radius * Math.sin(a)));
  }
  winding(T, root, wire, points, .475, .92, 2.10);
  const tape = surface(T, 0xefad32, .15, .39);
  tape.transparent = true; tape.opacity = .78; tape.depthWrite = false;
  box(T, root, tape, cx - 14.3, 2.66, cz + 2.35, 10.65, .09, 7.0);
  lead(T, root, wire, [[cx-9.1,2.10,cz],[cx-10.2,2.9,cz-1.3],[cx-18.5,2.95,cz-.9],
    [75.1,2.63,-22.5],[70.8,3.3,-19.2],[64.9,2.01,-17.78]], .46);
  lead(T, root, wire, [[cx-19.65,2.10,cz],[cx-20,2.15,cz+3.1],[76.5,2.67,-16.9],
    [70.6,3.20,-12.6],[64.9,2.01,-11.049]], .46);
  for (const z of [-17.78, -11.049]) {
    const solder = place(T, root, new T.SphereGeometry(1, 16, 10), colors.tin, 64.95, 1.77, z);
    solder.scale.set(1.55, .65, 1.07);
  }
  return root;
}

function loopOutline(T, width, length, corner) {
  const w = width / 2, d = length / 2, r = corner;
  const path = new T.Path();
  path.moveTo(0, d);
  path.lineTo(w-r, d);
  path.absarc(w-r, d-r, r, Math.PI / 2, 0, true);
  path.lineTo(w, -d+r);
  path.absarc(w-r, -d+r, r, 0, -Math.PI / 2, true);
  path.lineTo(-w+r, -d);
  path.absarc(-w+r, -d+r, r, -Math.PI / 2, -Math.PI, true);
  path.lineTo(-w, d-r);
  path.absarc(-w+r, d-r, r, Math.PI, Math.PI / 2, true);
  path.lineTo(0, d);
  return path;
}

export function receiver(T) {
  const root = new T.Group();
  root.name = 'Adafruit PID 1901 Qi receiver, original flex revision';
  const graphite = surface(T, 0x333230, .15, .87);
  const liner = surface(T, 0xc1c3c0, .12, .71);
  const copper = surface(T, 0xd37c50, .75, .32);
  const silver = surface(T, 0xbebbb1, .79, .26);
  const polyimide = surface(T, 0xb47327, .18, .39);

  // Shielding panel, adhesive backing and independent enamelled winding.
  // The 2014 product drawing gives a 48 × 32 × 0.5 mm backing and a
  // 41 × 29 mm copper coil. The winding density is inferred from its photo.
  box(T, root, graphite, 0, .245, 0, 32, .49, 48);
  box(T, root, liner, 0, -.013, 0, 31.93, .035, 47.93);
  const outer = loopOutline(T, 28.63, 40.63, 8.8);
  const inner = loopOutline(T, 11.8, 23.8, 1.25);
  const points = [];
  const turns = 23, perTurn = 124;
  for (let i = 0; i <= turns * perTurn; i++) {
    const t = (i % perTurn) / perTurn;
    const progress = i / (turns * perTurn);
    const p = inner.getPoint(t).lerp(outer.getPoint(t), progress);
    points.push(new T.Vector3(p.x, 0, p.y));
  }
  winding(T, root, copper, points, .183, .77, .73);
  const underside = surface(T, 0x9f5d2a, .48, .38);
  // The inner tail runs beneath the turns. Only its exit and the two flying
  // ends between the shield and the flex are visible from the top.
  lead(T, root, underside, [[0,.73,11.9],[-.75,.54,12.7],[-1.08,.52,17.4],[-1.15,.55,20.4],
    [-1.44,.65,22.2],[-1.70,.57,24.25],[-1.76,.14,25.32]], .18);
  lead(T, root, copper, [[0,.73,20.315],[.72,.75,20.85],[1.72,.68,21.72],[2.15,.54,23.93],
    [2.15,.14,25.28]], .18);

  // Amber two-sided flexible PCB, with traces on the outward face and
  // component population on the reverse. No phone, cable or battery included.
  const flex = new T.Group();
  flex.position.set(-18, .10, 35.93);
  root.add(flex);
  board(T, flex, 36, 11.5, .30, .26, [],
    faceMaterial(T, './receiver-front.webp', 0xc58b2c),
    faceMaterial(T, './receiver-back.webp', 0xb7782f, true), polyimide);
  const black = surface(T, 0x232526, .08, .6);
  const ceramic = surface(T, 0xaaa38b, .13, .47);
  const batch = boxBatch(T, root);
  // Coordinates are referenced to the underside photo, from its left edge
  // and from the coil-end edge. The two faces are mirror views.
  const component = (m, x, z, w, h, d) => batch.add(m, 18 - x, .095 - h / 2, 24.43 + z, w, h, d);
  const passives = [
    [10.2,2.15],[11.45,2.15],[12.7,2.15],[10.2,5.12],[11.45,5.12],[12.7,5.12],
    [17.9,3.8],[19.1,3.8],[17.9,7.2],[19.15,7.2],[16.95,7.2],
    [22.8,1.8],[24.05,1.8],[25.35,1.8],[26.5,1.8],[27.8,1.8],[29.0,1.8],
    [30.8,2.1],[31.75,2.1],[31.8,4.35],[31.8,6.5],[30.85,6.5]
  ];
  for (const [x,z] of passives) {
    component(ceramic, x, z, .73, .45, 1.05);
    component(silver, x, z-.57, .78, .46, .31);
    component(silver, x, z+.57, .78, .46, .31);
  }
  component(black, 27.9, 7.12, 4.45, .84, 4.2);
  for (let i = 0; i < 8; i++) {
    const centre = (i - 3.5) * .48;
    for (const dir of [-1, 1]) {
      component(silver, 27.9 + centre, 7.12 + dir * 2.17, .19, .21, .38);
      component(silver, 27.9 + dir * 2.29, 7.12 + centre, .38, .21, .19);
    }
  }
  for (const [x,z] of [[15.85,1.22],[20.05,1.22],[18,10.0],[20.7,10.0]]) {
    component(silver, x, z, 1.62, .15, 1.45);
    const solder = place(T, root, new T.SphereGeometry(1, 16, 10), silver, 18 - x, .05, 24.43 + z);
    solder.scale.set(.79, .42, .74);
  }
  batch.finish();
  return root;
}
