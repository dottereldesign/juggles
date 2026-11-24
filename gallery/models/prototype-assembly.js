import { foamHalf, carrier } from './foam-shell.js';
import { controller as xiao } from './boards.js';
import { battery as pouch, piezo as pickup } from './power.js';

// Millimetres. The mating plane of the foam halves is YZ (x = 0).
// Product envelopes follow ePartners SP0307 and DFRobot DFR0362. The fixtures,
// wire routes, breakout footprints and enclosures are a proposed bench layout.
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

function materials(T) {
  const coat = (color, metalness = 0, roughness = .55) =>
    new T.MeshStandardMaterial({ color, metalness, roughness });
  return {
    dark: coat(0x252a2b), rubber: coat(0x293236, 0, .83), mask: coat(0x235b4d),
    violet: coat(0x69376d), pcbEdge: coat(0x8d9164), gold: coat(0xd4ab58, .63, .36),
    copper: coat(0xa64b24, .58, .32), tin: coat(0xb6c5c7, .65, .34),
    cap: coat(0xc5aa86, .13), red: coat(0xa83b37), black: coat(0x303437),
    blue: coat(0x3679a7), green: coat(0x35876c), yellow: coat(0xdfb851),
    white: coat(0xe4dace), amber: coat(0xad6825), tray: coat(0x526266, .12, .48),
    board: coat(0x9c754f, .08, .67), tape: coat(0xc79644, .10, .35),
  };
}

function mesh(T, group, geometry, material, pos = [0, 0, 0], name = '') {
  const piece = new T.Mesh(geometry, material);
  piece.position.set(...pos);
  piece.name = name;
  group.add(piece);
  return piece;
}

function block(T, group, mat, dimensions, pos, name = '') {
  return mesh(T, group, new T.BoxGeometry(...dimensions), mat, pos, name);
}

function plate(T, group, mat, width, depth, thickness, radius, pos, holes = [], edge = mat) {
  const a = width / 2, b = depth / 2, shape = new T.Shape();
  shape.moveTo(-a + radius, -b);
  shape.lineTo(a - radius, -b); shape.quadraticCurveTo(a, -b, a, -b + radius);
  shape.lineTo(a, b - radius); shape.quadraticCurveTo(a, b, a - radius, b);
  shape.lineTo(-a + radius, b); shape.quadraticCurveTo(-a, b, -a, b - radius);
  shape.lineTo(-a, -b + radius); shape.quadraticCurveTo(-a, -b, -a + radius, -b);
  for (const [x, z, r] of holes) {
    const cut = new T.Path(); cut.absarc(x, -z, r, 0, TAU, true); shape.holes.push(cut);
  }
  const geometry = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  geometry.rotateX(-HALF_PI);
  return mesh(T, group, geometry, [mat, edge], pos);
}

function ring(T, group, mat, pos, inner, outer, thickness) {
  const shape = new T.Shape(); shape.absarc(0, 0, outer, 0, TAU, false);
  const bore = new T.Path(); bore.absarc(0, 0, inner, 0, TAU, true); shape.holes.push(bore);
  const geometry = new T.ExtrudeGeometry(shape, {depth: thickness, bevelEnabled: false, curveSegments: 48});
  geometry.rotateX(-HALF_PI);
  return mesh(T, group, geometry, mat, pos);
}

function silk(T, group, text, pos, w, h, color = '#edeee7') {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.font = 'bold 58px Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, 192, 41, 368);
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
  const layer = mesh(T, group, new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}), pos);
  layer.rotation.x = -HALF_PI;
}

function fixedLead(T, group, mat, points, radius) {
  const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  return mesh(T, group, new T.TubeGeometry(path, 25, radius, 8, false), mat);
}

function chip(T, group, m, x, z, pins, top = 0) {
  block(T, group, m.dark, [3.25, .85, 2.65], [x, top + .425, z]);
  for (let i = 0; i < pins; i++) {
    for (const side of [-1, 1]) {
      block(T, group, m.tin, [.57, .22, .27], [x + side * 1.68, top + .18, z + (i - (pins-1)/2)*.54]);
    }
  }
}

function passive(T, group, m, x, z, vertical = false, top = 0, ceramic = false) {
  const l = vertical ? .77 : 1.54, d = vertical ? 1.54 : .77;
  block(T, group, m.tin, [l, .38, d], [x, top+.20, z]);
  block(T, group, ceramic ? m.cap : m.dark, [vertical ? l : 1.02, .42, vertical ? 1.02 : d],
    [x, top+.23, z]);
}

function bmi160(T, m) {
  const board = new T.Group();
  const holes = [];
  for (let i = -3; i <= 3; i++) holes.push([2.54*i, 4.99, .51]);
  for (let i = -2; i <= 2; i++) holes.push([2.54*i, -4.99, .51]);
  holes.push([-7.1,-2.85,1.37],[7.1,-2.85,1.37]);
  plate(T, board, m.violet, 18, 13, 1.17, .64, [0,-1.17,0], holes, m.pcbEdge);
  for (const [x,z,r] of holes.filter(h => h[2] < 1)) {
    ring(T, board, m.gold, [x,.012,z], r, .89, .035);
    ring(T, board, m.gold, [x,-1.21,z], r, .87, .035);
  }
  chip(T, board, m, .12, .26, 4);
  for (const [x,z,vertical,cap] of [[-4.2,1,1,1],[-6.1,1,1,1],[4.9,1.1,1,0],
    [-2.4,2.95,0,0],[.22,2.95,0,0],[2.9,2.95,0,0],[-.5,-2.45,0,1]]) {
    passive(T, board, m, x,z,vertical,0,cap);
  }
  silk(T,board,'BMI160',[4.5,.046,-1.52],5.4,1.05);
  return board;
}

// Both kit halves have a 43 mm annular winding; the dock contains the powered
// transmitter, and the receiver carries its own rectifier board on the inner side.
function coilModule(T, m, transmitter) {
  const module = new T.Group();
  const turns = 12, r0 = 10.4, r1 = 21.02;
  class Winding extends T.Curve {
    getPoint(t, out = new T.Vector3()) {
      const r = r0 + (r1 - r0) * t, angle = HALF_PI + TAU * turns * t;
      return out.set(r*Math.cos(angle), 0, r*Math.sin(angle));
    }
  }
  const spiral = new Winding(); spiral.arcLengthDivisions = 1250;
  mesh(T, module, new T.TubeGeometry(spiral, 790, .448, 7, false), m.copper);
  // Thin insulation behind the turns, with the aperture left clear.
  ring(T, module, m.amber, [0,-.62,0], 10.02, 21.45, .22);
  for (const a of [.2, 2.32, 4.42]) {
    const strap = block(T,module,m.tape,[1.22,.17,10.8],[15.7*Math.sin(a),.44,15.7*Math.cos(a)]);
    strap.rotation.y = a;
  }
  const boardPos = transmitter ? [0,-6.9,26] : [0,-12,22.4];
  const circuit = new T.Group(); circuit.position.set(...boardPos); module.add(circuit);
  const width = transmitter ? 22 : 24, depth = transmitter ? 13 : 10;
  plate(T,circuit,m.mask,width,depth,1.02,.4,[0,-1.02,0],[],m.pcbEdge);
  chip(T,circuit,m,-1.8,.14,4);
  for (const [x,z,v,c] of [[-6.1,.8,1,1],[1.0,2.2,0,0],[4.2,1.9,1,1],[4.4,-1.9,0,0],[-5.4,-2.1,0,1]]) {
    passive(T,circuit,m,x,z,v,0,c);
  }
  silk(T,circuit,transmitter?'TX 5V':'RX 5V',[.7,.04,-3.62],6.8,1);
  const pairZ = [-1.55,1.55];
  for (let i=0; i<2; i++) {
    const k = i ? 1 : -1;
    block(T,circuit,m.tin,[2.2,.16,1.64],[-width/2+1.22,.09,pairZ[i]]);
    block(T,circuit,m.tin,[2.2,.16,1.64],[width/2-1.22,.09,pairZ[i]]);
    fixedLead(T,module,m.copper,[[0,-.04,i?r1:r0],[-1.9,-1.68,18+i],
      [-8+k,-3.4,22+i],[-width/2-.9,boardPos[1]+2.8,boardPos[2]+pairZ[i]],
      [-width/2+1.22,boardPos[1]+.29,boardPos[2]+pairZ[i]]],.36);
  }
  if (transmitter) {
    // This removable inspection cradle supports the TX winding from behind.
    ring(T,module,m.tray,[0,-2.64,0],15.9,23.4,1.78);
    for (const z of [-14,14]) {
      block(T,module,m.tray,[16.7,4.6,3.1],[25,-5.1,z]);
      block(T,module,m.rubber,[4.0,2.5,3.7],[17.3,-2.9,z]);
    }
    const base = plate(T,module,m.tray,35,54,3.4,3.4,[34.5,-13,0]);
    base.rotation.z = HALF_PI;
    const foot = block(T,module,m.rubber,[1.3,31,49],[35.0,-13,0]);
    foot.name='Non-slip base';
    const terminal = block(T,module,m.dark,[6.6,4.0,7],[16,-7.1,29]);
    terminal.name='External regulated 5 V input';
    for (let i=0; i<2; i++) {
      fixedLead(T,module,i?m.black:m.red,[[9.8,-6.55,26+pairZ[i]],[12,-5.4,27+pairZ[i]],
        [14.1,-5.8,29+pairZ[i]]],.48);
    }
  }
  return module;
}

function signalBoard(T,m) {
  const board = new T.Group();
  plate(T,board,m.board,13.5,8,.85,.58,[0,-.85,0]);
  for (const side of [-1,1]) for (const z of [-2.55,0,2.55]) {
    block(T,board,m.tin,[1.48,.14,1.35],[side*5.74,.08,z]);
  }
  for (const z of [-2.15,.05]) {
    passive(T,board,m,-2.48,z);
    passive(T,board,m,.04,z);
  }
  block(T,board,m.dark,[3.13,1.25,1.47],[2.22,.64,1.73],'Input protection diode');
  block(T,board,m.tin,[.31,1.28,1.49],[3.18,.65,1.73],'Cathode band');
  return board;
}

// Tubes keep their vertices throughout a slider drag. The moving inspection
// view extends the routes; it does not prescribe cut lengths.
function flexibleLead(T, m, name, radius) {
  const segments = 40, sides = 7, vertices = (segments + 1) * sides;
  const points = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3), indices = [];
  for (let i=0; i<segments; i++) for (let j=0; j<sides; j++) {
    const a=i*sides+j, b=i*sides+(j+1)%sides;
    indices.push(a,b,a+sides,b,b+sides,a+sides);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(points,3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));
  geometry.setIndex(indices);
  const cable = new T.Mesh(geometry,m); cable.name=name;
  const centre=new T.Vector3(), tangent=new T.Vector3(), normal=new T.Vector3(), binormal=new T.Vector3();
  const startAxis=new T.Vector3(), prevNormal=new T.Vector3();
  const cosine=Array.from({length:sides},(_,j)=>Math.cos(TAU*j/sides));
  const sine=Array.from({length:sides},(_,j)=>Math.sin(TAU*j/sides));
  const curve=new T.CatmullRomCurve3();
  function update(anchors) {
    curve.points=anchors;
    for (let i=0; i<=segments; i++) {
      const t=i/segments;
      curve.getPoint(t,centre); curve.getTangent(t,tangent);
      if (!i) {
        startAxis.set(0,Math.abs(tangent.y)>.9?0:1,Math.abs(tangent.y)>.9?1:0);
        prevNormal.crossVectors(startAxis,tangent).normalize();
      }
      binormal.crossVectors(tangent,prevNormal).normalize();
      normal.crossVectors(binormal,tangent).normalize();
      prevNormal.copy(normal);
      for(let j=0; j<sides; j++) {
        const k=(i*sides+j)*3;
        normals[k] = normal.x*cosine[j]+binormal.x*sine[j];
        normals[k+1] = normal.y*cosine[j]+binormal.y*sine[j];
        normals[k+2] = normal.z*cosine[j]+binormal.z*sine[j];
        points[k] = centre.x + radius*normals[k];
        points[k+1] = centre.y + radius*normals[k+1];
        points[k+2] = centre.z + radius*normals[k+2];
      }
    }
    geometry.attributes.position.needsUpdate=true; geometry.attributes.normal.needsUpdate=true;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  }
  return {cable,update};
}

// The removable paper band conforms to the foam sphere when closed. As the
// parts separate the same strip coils up above the carrier for inspection.
function maskingTape(T) {
  const tape=new T.Group(), lengthSteps=216, widthSteps=8;
  const position=new Float32Array((lengthSteps+1)*(widthSteps+1)*3);
  const indices=[], uvs=[];
  for(let i=0;i<=lengthSteps;i++) for(let j=0;j<=widthSteps;j++) {
    uvs.push(i/lengthSteps,j/widthSteps);
    if(i===lengthSteps || j===widthSteps) continue;
    const a=i*(widthSteps+1)+j, b=a+widthSteps+1;
    indices.push(a,a+1,b,b,a+1,b+1);
  }
  const geo=new T.BufferGeometry(); geo.setIndex(indices);
  geo.setAttribute('position',new T.BufferAttribute(position,3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=64;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#dfcfa7'; ctx.fillRect(0,0,1024,64);
  let state=2921;
  function random(){ state=(1664525*state+1013904223)>>>0; return state/4294967296; }
  for(let i=0;i<5800;i++) {
    ctx.fillStyle=random()>.55?'rgba(255,250,223,.21)':'rgba(106,90,61,.12)';
    ctx.fillRect(random()*1024,random()*64,.35+random()*3,.35+random()*.6);
  }
  // A crease and exposed adhesive at the folded-back leader.
  ctx.fillStyle='rgba(152,123,70,.36)';ctx.fillRect(1006,0,2,64);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  const mat=new T.MeshStandardMaterial({map,color:0xf8ecd2,side:T.DoubleSide,roughness:.92});
  mesh(T,tape,geo,mat,[0,0,0],'18 mm paper masking tape');
  function update(t) {
    const turns=1.018+2.57*t, yaw=-1.04*t, c=Math.cos(yaw), s=Math.sin(yaw);
    for(let i=0;i<=lengthSteps;i++) {
      const u=i/lengthSteps, free=Math.max(0,u-.92);
      const arcU=u-free*t, angle=TAU*(turns*arcU+.12);
      const fold=Math.max(0,(u-.981)/.019);
      for(let j=0;j<=widthSteps;j++) {
        const w=(j/widthSteps-.5)*18;
        const baseRadius=Math.sqrt(50.35*50.35-w*w);
        const r=baseRadius*1.018/turns+(u-.5)*3.55*t;
        const tail=free*TAU*baseRadius*t;
        const lift=fold*(2.3+2.5*t)+.10*Math.max(0,(u-.974)/.026);
        const cy=(r+lift)*Math.sin(angle)+tail*Math.cos(angle);
        const cz=(r+lift)*Math.cos(angle)-tail*Math.sin(angle);
        const k=(i*(widthSteps+1)+j)*3;
        position[k]=-11*t+w*c+cz*s;
        position[k+1]=64*t+cy;
        position[k+2]=3*t+cz*c-w*s;
      }
    }
    geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();geo.computeBoundingBox();
  }
  return {tape,update};
}

export function buildAssembly(T) {
  const m=materials(T), group=new T.Group();
  group.name='Juggles foam-ball bench prototype';
  const parts={}, poses=[];
  function orient(roll=0, yaw=0, twist=0) {
    return new T.Quaternion().setFromEuler(new T.Euler(0,yaw,roll,'YXZ'))
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),twist));
  }
  function part(key,model,closed,open,closedRotation,openRotation) {
    const mount = new T.Group(); mount.name=key; mount.userData.partId=key;
    mount.add(model); group.add(mount); parts[key]=mount;
    poses.push({mount,closed:new T.Vector3(...closed),open:new T.Vector3(...open),
      closedRotation,openRotation});
    return mount;
  }
  part('shell-left',foamHalf(T,-1),[0,0,0],[-105,5,-4],orient(),orient(0,-.55));
  part('shell-right',foamHalf(T,1),[0,0,0],[155,-1,-4],orient(),orient(0,.90));
  part('carrier',carrier(T),[0,0,0],[1,-.4,-3],orient(),orient(0,-.82));
  const radio=xiao(T);
  plate(T,radio,m.dark,3.9,20,.17,.65,[-11.25,-1.29,-9.75]);
  fixedLead(T,radio,m.black,[[0,1.4,9.08],[-2.1,1.94,10.9],[-8.4,.90,10.2],
    [-11.8,-.52,6.8],[-11.24,-1.08,-.3]],.34);
  mesh(T,radio,new T.CylinderGeometry(.80,.83,.35,16),m.gold,[0,1.44,9.08],'U.FL antenna snap');
  part('controller',radio,[5.52,14,-10.2],[43,26,5],orient(-HALF_PI),orient(-HALF_PI,-.98));
  part('motion',bmi160(T,m),[5.09,14,9.2],[76,22,-2],orient(-HALF_PI),orient(-HALF_PI,-.98));
  part('battery',pouch(T),[6.88,-8,-.5],[63,-21,8],orient(-HALF_PI,0,Math.PI),orient(-HALF_PI,-1.04,Math.PI));
  const disc=pickup(T);
  for(const obj of [...disc.children]) {
    if (/^(Red electrode lead|Black diaphragm lead|Stripped, tinned end)$/.test(obj.name)) {
      disc.remove(obj); obj.geometry.dispose();
    }
  }
  ring(T,disc,m.tape,[0,-.78,0],8.2,9.1,.78);
  part('piezo',disc,[42.1,0,0],[109,5,13],orient(HALF_PI),orient(HALF_PI,1.12));
  part('receiver',coilModule(T,m,false),[-41.9,0,0],[-53,0,12],orient(HALF_PI),orient(HALF_PI,1.09));
  part('dock',coilModule(T,m,true),[-51.45,0,0],[-187,-7,1],orient(-HALF_PI),orient(-HALF_PI,-.82));
  const seam=maskingTape(T);
  seam.tape.name='seam';seam.tape.userData.partId='seam';
  parts.seam=seam.tape;group.add(seam.tape);

  const harness=new T.Group(); harness.name='harness'; harness.userData.partId='harness';
  parts.harness=harness; group.add(harness);
  const conditioning=signalBoard(T,m);
  harness.add(conditioning);
  poses.push({mount:conditioning,closed:new T.Vector3(4.76,29,0),open:new T.Vector3(32,5,19),
    closedRotation:orient(-HALF_PI),openRotation:orient(-HALF_PI,-1.11)});
  const paths=[];
  // Anchors are expressed in each part's own axes to stay on the same solder
  // joint at every pose. Two receiver wires pass through the card's +Z notch.
  const anchors={...parts,conditioning};
  function wire(name,mat,waypoints,radius=.39) {
    const lead=flexibleLead(T,mat,name,radius); harness.add(lead.cable);
    paths.push({lead,waypoints:waypoints.map(([key,x,y,z])=>({mount:anchors[key],p:new T.Vector3(x,y,z),world:new T.Vector3()}))});
  }
  const pin=(side,row)=>['controller',side*7.62,.14,(row-3)*2.54+.0635];
  const imu=(index)=>['motion',(index-3)*2.54,.08,4.99];
  // The four I²C conductors follow the actual XIAO pin locations. The sensor
  // end depicts a representative breakout; read its particular pin labels.
  const imuLinks=[
    ['3V3 to BMI160',m.red,1,2,0],['GND to BMI160',m.black,1,1,1],
    ['SDA • D4 / GPIO6',m.green,-1,4,3],['SCL • D5 / GPIO7',m.blue,-1,5,2]
  ];
  for (const [label,mat,side,row,i] of imuLinks) {
    wire(label,mat,[pin(side,row),['controller',side*10,2.5,6+i*.85],
      ['motion',-9.6+i*.5,2,8.4+i*.62],imu(i)]);
  }
  for(const [polarity,mat] of [[1,m.red],[-1,m.black]]) {
    wire(polarity===1?'Protected pack to BAT+':'Protected pack to BAT−',mat,[
      ['battery',-24.6+polarity,0,-.5],['battery',-24.6+polarity,-.2,-3],
      ['battery',-16+polarity*.6,-.8,-6],['controller',-9.5,-2.3,2+polarity],
      ['controller',-4.445,-1.65,polarity>0?-.318:-2.223]],.48);
  }
  for (const [i,mat] of [[0,m.red],[1,m.black]]) {
    wire(i?'Receiver ground':'Receiver 5 V to input diode',mat,[
      ['receiver',10.8,-11.7,22.4+(i?1.55:-1.55)],
      ['receiver',11.2,-15.9,24+i],['carrier',-4,1.6+1.2*i,34.4],
      ['carrier',4.9,1.7+1.2*i,34.3],['conditioning',-8.8,.5,2.9-i*1.7],
      ['conditioning',-5.74,.18,i?0:2.55]],.43);
  }
  wire('Conditioned RX supply to XIAO 5V',m.red,[['conditioning',5.74,.17,2.55],['conditioning',8,.8,4],
    ['controller',10.6,1.5,-9.4],pin(1,0)],.43);
  wire('Conditioning board common ground',m.black,[['conditioning',5.74,.17,0],['conditioning',8.3,.8,2.5],
    ['controller',10.9,1.2,-7.4],pin(1,1)],.39);
  wire('Upper clamp reference to 3V3',m.white,[['conditioning',5.74,.17,-2.55],['conditioning',7.9,1.4,-4.5],
    ['controller',11.3,.95,-3.1],pin(1,2)]);
  wire('Protected piezo signal to A1',m.yellow,[['conditioning',1,.38,-2.3],['conditioning',-.25,1,-5.2],
    ['controller',-9.7,1.6,-6.4],pin(-1,1)]);
  for (const [i,mat,x,z] of [[0,m.red,-3.25,-3.17],[1,m.black,-7.9,-6.35]]) {
    wire(i?'Piezo brass to common ground':'Piezo ceramic to attenuator',mat,[['piezo',x,.81,z],
      ['piezo',x-1.35,3.2,z-2],['piezo',x-2,7.2,z-3.4],['conditioning',-9,1,-3.5+i*1.7],
      ['conditioning',-5.74,.17,i?0:-2.55]]);
  }
  let last=-1;
  function setExplosion(value) {
    const t=T.MathUtils.clamp(Number(value)||0,0,1); if (t===last) return; last=t;
    seam.update(t);
    for (const p of poses) {
      p.mount.position.lerpVectors(p.closed,p.open,t);
      p.mount.quaternion.slerpQuaternions(p.closedRotation,p.openRotation,t);
    }
    for (const {lead,waypoints} of paths) {
      for (const p of waypoints) p.world.copy(p.p).applyQuaternion(p.mount.quaternion).add(p.mount.position);
      lead.update(waypoints.map(p=>p.world));
    }
  }
  setExplosion(1);
  return {group,parts,setExplosion};
}
