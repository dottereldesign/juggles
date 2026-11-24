// Dimensions are in millimetres. The joint is x=0, the dock is on the -X pole.
const TAU = Math.PI * 2;
const OUTER_RADIUS = 50;
const INNER_RADIUS = 44;
const CORE_RADIUS = 40;
const foamCache = new WeakMap();
const paperCache = new WeakMap();

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function layer(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, image: ctx.createImageData(width, height) };
}

function asTexture(T, canvas, colour = true) {
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = colour ? T.SRGBColorSpace : T.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function smooth(lo, hi, v) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// A coloured pentagon is the projected face cut from one icosahedron vertex.
// Placing all twelve in the same spherical coordinate system keeps the marker
// pattern continuous across the two removable halves.
function footballFaces(T) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    for (const [x,y,z] of [[0,a,b],[a,b,0],[b,0,a]]) {
      const v = new T.Vector3(x,y,z).normalize();
      v.applyEuler(new T.Euler(.21,-.14,.28));
      vertices.push(v);
    }
  }
  return vertices.map(v => {
    const neighbours = vertices.filter(n => Math.abs(v.dot(n) - 1 / Math.sqrt(5)) < .00001);
    const e1 = neighbours[0].clone().addScaledVector(v, -v.dot(neighbours[0])).normalize();
    const e2 = v.clone().cross(e1);
    neighbours.sort((a,b) => Math.atan2(a.dot(e2),a.dot(e1)) - Math.atan2(b.dot(e2),b.dot(e1)));
    const corners = neighbours.map(n => v.clone().multiplyScalar(2).add(n).normalize());
    const edges = corners.map((c,i) => {
      const normal = c.clone().cross(corners[(i+1)%5]).normalize();
      if (normal.dot(v) < 0) normal.negate();
      return normal;
    });
    return {v, edges};
  });
}

function inkCoverage(faces, x, y, z, bead) {
  for (const {v, edges} of faces) {
    if (x*v.x+y*v.y+z*v.z < .924) continue;
    let edge = 1;
    for (const n of edges) edge = Math.min(edge, n.x*x+n.y*y+n.z*z);
    // Small variations in direction and ink absorption leave hand-drawn edges.
    const wobble = .0024 * Math.sin(137*x + 34*y) + .0018 * Math.sin(211*z - 41*x);
    return smooth(-.0023,.0023,edge+wobble+.002*(bead-.5));
  }
  return 0;
}

// A seamless, deterministic field of fused EPS beads. Precomputing cell
// positions keeps the shader inexpensive on phones. Each texel samples the
// nearest and second-nearest bead, giving curved crowns and shallow crevices.
function beadField() {
  const rand = randomSequence(0xb66d5a1);
  const cells = 57, plane = cells*cells;
  const px = new Float32Array(cells*plane), py = new Float32Array(px.length);
  const pz = new Float32Array(px.length), tones = new Uint8Array(px.length);
  for (let z=0;z<cells;z++) for (let y=0;y<cells;y++) for (let x=0;x<cells;x++) {
    const i=x+cells*y+plane*z;
    px[i]=x+.11+.78*rand(); py[i]=y+.11+.78*rand(); pz[i]=z+.11+.78*rand();
    tones[i]=Math.floor(255*rand());
  }
  const out = { seam:0, tone:0, crown:0 };
  return (wx,wy,wz) => {
    // Typical visible bead diameter is around two millimetres.
    const x=28+wx*.485, y=28+wy*.485, z=28+wz*.485;
    const minX=Math.floor(x)-1, minY=Math.floor(y)-1, minZ=Math.floor(z)-1;
    let first=9, second=9, nearest=0;
    for (let dz=0;dz<3;dz++) for (let dy=0;dy<3;dy++) {
      const start=minX+(minY+dy)*cells+(minZ+dz)*plane;
      for (let i=start;i<start+3;i++) {
        const dx=px[i]-x, yy=py[i]-y, zz=pz[i]-z;
        const d=dx*dx+yy*yy+zz*zz;
        if (d < first) { second=first; first=d; nearest=i; }
        else if (d < second) second=d;
      }
    }
    out.seam=smooth(.009,.156,Math.sqrt(second)-Math.sqrt(first));
    out.tone=tones[nearest]/255;
    out.crown=Math.max(0,1-first);
    return out;
  };
}

function foamMaterials(T) {
  if (foamCache.has(T)) return foamCache.get(T);
  const faces=footballFaces(T), sample=beadField(), rand=randomSequence(0xb46af7);
  const w=1024,h=512;
  const skin=layer(w,h), inside=layer(w,h), bump=layer(w,h);
  const skinPixels=skin.image.data, cutPixels=inside.image.data, heights=bump.image.data;
  const cos=new Float32Array(w),sin=new Float32Array(w);
  for (let i=0;i<w;i++) { cos[i]=Math.cos(TAU*(i+.5)/w); sin[i]=Math.sin(TAU*(i+.5)/w); }
  for (let j=0;j<h;j++) {
    const theta=Math.PI*(j+.5)/h, x=Math.cos(theta), radial=Math.sin(theta);
    for (let i=0;i<w;i++) {
      const y=radial*cos[i], z=radial*sin[i], k=4*(j*w+i);
      const bead=sample(x*50,y*50,z*50);
      const grain=rand()-.5;
      const tone=213+bead.seam*20+bead.crown*7+bead.tone*12+grain*7;
      const ink=inkCoverage(faces,x,y,z,bead.tone);
      const strokes=3*Math.sin(y*520+z*165+x*39)+1.7*Math.sin(z*482+y*279);
      const charcoal=39+bead.tone*11+(1-bead.seam)*15+grain*11+strokes;
      skinPixels[k]=(1-ink)*tone+ink*charcoal;
      skinPixels[k+1]=(1-ink)*(tone+1)+ink*(charcoal+2);
      skinPixels[k+2]=(1-ink)*(tone-2)+ink*(charcoal+3);
      skinPixels[k+3]=255;
      const cut=197+bead.seam*30+bead.crown*9+bead.tone*15+grain*7;
      cutPixels[k]=cut+2; cutPixels[k+1]=cut+1; cutPixels[k+2]=cut-5; cutPixels[k+3]=255;
      const height=51+106*bead.seam+63*bead.crown+21*bead.tone+grain*13;
      heights[k]=heights[k+1]=heights[k+2]=height; heights[k+3]=255;
    }
  }
  for (const l of [skin,inside,bump]) l.ctx.putImageData(l.image,0,0);
  const skinMap=asTexture(T,skin.canvas), cutMap=asTexture(T,inside.canvas), bumpMap=asTexture(T,bump.canvas,false);
  for (const tex of [skinMap,cutMap,bumpMap]) tex.wrapS=T.RepeatWrapping;

  const dim=320, edge=layer(dim,dim), edgeBump=layer(dim,dim);
  for (let y=0;y<dim;y++) for (let x=0;x<dim;x++) {
    const b=sample(0,(x+.5)*100/dim-50,(y+.5)*100/dim-50);
    const k=4*(y*dim+x);
    const v=199+b.seam*28+b.tone*16+(rand()-.5)*11;
    edge.image.data[k]=v+3; edge.image.data[k+1]=v+2; edge.image.data[k+2]=v-5; edge.image.data[k+3]=255;
    edgeBump.image.data[k]=edgeBump.image.data[k+1]=edgeBump.image.data[k+2]=45+150*b.seam+35*b.tone;
    edgeBump.image.data[k+3]=255;
  }
  edge.ctx.putImageData(edge.image,0,0); edgeBump.ctx.putImageData(edgeBump.image,0,0);
  const shell = new T.MeshStandardMaterial({map:skinMap,bumpMap,bumpScale:.36,roughness:.95});
  const cavity = new T.MeshStandardMaterial({map:cutMap,bumpMap,bumpScale:.51,roughness:.98});
  const rim = new T.MeshStandardMaterial({map:asTexture(T,edge.canvas),bumpMap:asTexture(T,edgeBump.canvas,false),bumpScale:.46,roughness:1});
  const materials={shell,cavity,rim};
  foamCache.set(T,materials);
  return materials;
}

function radiusAt(side,inner,radial) {
  if (!inner) return OUTER_RADIUS;
  // The receiving coil at the -X pole has a Ø46 mm locally thinned pocket.
  // The outer surface stays continuous, with 2.3 mm of foam at the pole.
  if (side < 0) return INNER_RADIUS+3.7*(1-smooth(23,31,OUTER_RADIUS*radial));
  return INNER_RADIUS;
}

function hemisphere(T,side,inner) {
  const p=[],n=[],uv=[],idx=[];
  const rings=42, segments=144;
  const reverse=(side<0)!==inner;
  for (let i=0;i<=rings;i++) {
    const a=i*Math.PI/(2*rings), radial=Math.sin(a), axial=i===rings?0:Math.cos(a);
    const r=radiusAt(side,inner,radial);
    const delta=.0002;
    const dr=(radiusAt(side,inner,Math.sin(a+delta))-radiusAt(side,inner,Math.sin(a-delta)))/(2*delta);
    const nx=side*(r*axial+dr*radial), nr=r*radial-dr*axial;
    const norm=(inner?-1:1)/Math.hypot(nx,nr);
    for (let j=0;j<=segments;j++) {
      const lon=TAU*j/segments, cy=Math.cos(lon),cz=Math.sin(lon);
      p.push(side*axial*r,radial*cy*r,radial*cz*r);
      n.push(nx*norm,nr*cy*norm,nr*cz*norm);
      uv.push(j/segments,1-Math.acos(side*axial)/Math.PI);
      if(i===rings||j===segments) continue;
      const a0=i*(segments+1)+j, b0=a0+segments+1;
      if(!reverse) { idx.push(a0,b0,b0+1); if(i>0) idx.push(a0,b0+1,a0+1); }
      else { idx.push(a0,b0+1,b0); if(i>0) idx.push(a0,a0+1,b0+1); }
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(p,3));
  geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); geo.setIndex(idx);
  return geo;
}

function cutRim(T,side) {
  const p=[],n=[],uv=[],idx=[],segments=144;
  for (let i=0;i<=segments;i++) {
    const theta=i/segments*TAU;
    for (const r of [INNER_RADIUS,OUTER_RADIUS]) {
      const y=r*Math.cos(theta),z=r*Math.sin(theta);
      p.push(0,y,z); n.push(-side,0,0); uv.push(y/100+.5,.5-z/100);
    }
    if (i===segments) continue;
    const a=2*i;
    if(side<0) idx.push(a,a+1,a+3,a,a+3,a+2);
    else idx.push(a,a+3,a+1,a,a+2,a+3);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(p,3));
  geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); geo.setIndex(idx);
  return geo;
}

export function foamHalf(T,side) {
  if(side!==-1 && side!==1) throw new RangeError('A foam hemisphere side must be -1 or +1.');
  const mat=foamMaterials(T), group=new T.Group();
  group.name=side<0?'Left EPS shell with charging pocket':'Right EPS shell';
  const outer=new T.Mesh(hemisphere(T,side,false),mat.shell);
  const inner=new T.Mesh(hemisphere(T,side,true),mat.cavity);
  const lip=new T.Mesh(cutRim(T,side),mat.rim);
  outer.name='Marker ink on fused foam beads'; inner.name='Hollowed foam interior'; lip.name='Cut equatorial rim';
  group.add(outer,inner,lip);
  addCarrierStops(T,group,side);
  return group;
}

function carrierMaterials(T) {
  if (paperCache.has(T)) return paperCache.get(T);
  const rand=randomSequence(1037741);
  const size=512, paper=layer(size,size), relief=layer(size,size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const k=4*(y*size+x);
    const fibre=(rand()-.5)*15 + 3*Math.sin(.048*x+.005*y) + 2*Math.sin(.029*y-.037*x);
    // Shallow parallel flute impressions sometimes show through the liner.
    const rib=2.5*Math.cos(TAU*x/(size*3.18/80));
    paper.image.data[k]=176+fibre+rib; paper.image.data[k+1]=132+fibre+rib;
    paper.image.data[k+2]=87+fibre+rib; paper.image.data[k+3]=255;
    relief.image.data[k]=relief.image.data[k+1]=relief.image.data[k+2]=122+fibre*2+rib*5;
    relief.image.data[k+3]=255;
  }
  paper.ctx.putImageData(paper.image,0,0);
  relief.ctx.putImageData(relief.image,0,0);
  for (let i=0;i<12500;i++) {
    const x=rand()*size,y=rand()*size,len=.3+rand()*3.1,ang=(rand()-.5)*2.85;
    paper.ctx.strokeStyle=rand()>.42?'rgba(89,61,36,.23)':'rgba(228,200,156,.44)';
    paper.ctx.lineWidth=.26+.63*rand();
    paper.ctx.beginPath(); paper.ctx.moveTo(x,y);
    paper.ctx.lineTo(x+len*Math.cos(ang),y+len*Math.sin(ang)); paper.ctx.stroke();
  }
  const foam=layer(192,192);
  for (let k=0;k<foam.image.data.length;k+=4) {
    const v=45+17*rand()- (rand()<.06?21:0);
    foam.image.data[k]=v-3; foam.image.data[k+1]=v; foam.image.data[k+2]=v;
    foam.image.data[k+3]=255;
  }
  foam.ctx.putImageData(foam.image,0,0);
  const foamMap=asTexture(T,foam.canvas);
  foamMap.wrapS=foamMap.wrapT=T.RepeatWrapping;
  foamMap.repeat.set(4.3,.72);
  const materials={
    paper: new T.MeshStandardMaterial({map:asTexture(T,paper.canvas),bumpMap:asTexture(T,relief.canvas,false),bumpScale:.073,roughness:1}),
    paperEdge: new T.MeshStandardMaterial({color:0xc5a57f,roughness:1}),
    fluting: new T.MeshStandardMaterial({color:0xa7845b,roughness:1,side:T.DoubleSide}),
    eva: new T.MeshStandardMaterial({map:foamMap,roughness:.98})
  };
  paperCache.set(T,materials);
  return materials;
}

// XY profiles are rotated to the YZ plane. Profile X points toward world -Z;
// the notch starts from the world +Z edge, reaches z=32 and is 8 mm wide.
function carrierProfile(T) {
  const shape=new T.Shape(), halfWidth=4, angle=Math.asin(halfWidth/CORE_RADIUS);
  const edge=-Math.sqrt(CORE_RADIUS**2-halfWidth**2);
  shape.moveTo(edge,4);
  shape.absarc(0,0,CORE_RADIUS,Math.PI-angle,-Math.PI+angle,true);
  shape.lineTo(-36,-4);
  shape.absarc(-36,0,4,-Math.PI/2,Math.PI/2,false);
  shape.lineTo(edge,4); shape.closePath();
  return shape;
}

function layerMesh(T,shape,depth,bottom,material,faceWidth,faceHeight,bevel=0) {
  const geometry=new T.ExtrudeGeometry(shape,{
    depth:depth-2*bevel, curveSegments:72, bevelEnabled:bevel>0,
    bevelThickness:bevel, bevelSize:bevel, bevelSegments:3
  });
  const pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++) uv.setXY(i,pos.getX(i)/faceWidth+.5,pos.getY(i)/faceHeight+.5);
  geometry.rotateY(Math.PI/2);
  const m=new T.Mesh(geometry,material);
  m.position.x=bottom+bevel;
  return m;
}

function tabSector(T,inner,outer,angle) {
  const shape=new T.Shape(), a=angle-.095, b=angle+.095;
  shape.moveTo(inner*Math.cos(a),inner*Math.sin(a));
  shape.lineTo(outer*Math.cos(a),outer*Math.sin(a));
  shape.absarc(0,0,outer,a,b,false);
  shape.lineTo(inner*Math.cos(b),inner*Math.sin(b));
  shape.absarc(0,0,inner,b,a,true);
  shape.closePath();
  return shape;
}

function addCarrierStops(T,group,side) {
  const mat=carrierMaterials(T).eva;
  // A 3 mm overlap holds the card axially. The smaller second step leaves a
  // 0.2 mm radial fit clearance. Each half opens with its own three stops.
  for (const theta of [25,150,265]) {
    const angle=Math.PI/2+theta*Math.PI/180;
    const shelf=layerMesh(T,tabSector(T,37,44.4,angle),5.6,side<0?-7:1.4,mat,10,10);
    const stop=layerMesh(T,tabSector(T,40.2,44.4,angle),1.4,side<0?-1.4:0,mat,10,10);
    shelf.name='Scrap EVA carrier ledge'; stop.name='Card edge locating step';
    group.add(shelf,stop);
  }
}

// The fluted medium is a folded sheet with air between its peaks and liners.
// Both the disk perimeter and the wiring notch expose the actual flute mouths.
function paperFlutes(T,material) {
  const p=[],index=[];
  const samples=496, angleWidth=Math.sqrt(CORE_RADIUS**2-4**2);
  const cuts=[-CORE_RADIUS,-angleWidth,-36,-32,CORE_RADIUS];
  for(const upper of [false,true]) for(let region=0;region<cuts.length-1;region++) {
    const start=cuts[region], end=cuts[region+1];
    // No material survives beyond the mouth where the notch spans the disk.
    if(region===0) continue;
    const count=Math.max(2,Math.ceil((end-start)/80*samples));
    const firstVertex=p.length/3;
    for (let i=0;i<=count;i++) {
      const u=start+(end-start)*i/count;
      const outside=Math.sqrt(Math.max(0,CORE_RADIUS**2-u*u));
      const notch=u<=-36?4:u < -32?Math.sqrt(Math.max(0,16-(u+36)**2)):0;
      const y0=upper?Math.min(outside,notch):-outside;
      const y1=upper?outside:-Math.min(outside,notch);
      const centre=1.094*Math.sin(u*TAU/3.18+.09*Math.sin(.43*u));
      p.push(centre-.073,y0,-u,centre-.073,y1,-u,centre+.073,y0,-u,centre+.073,y1,-u);
      if (i===count) continue;
      const v=firstVertex+4*i;
      index.push(v,v+4,v+5,v,v+5,v+1, v+2,v+3,v+7,v+2,v+7,v+6);
      index.push(v,v+2,v+6,v,v+6,v+4, v+1,v+5,v+7,v+1,v+7,v+3);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(p,3)); geo.setIndex(index); geo.computeVertexNormals();
  return new T.Mesh(geo,material);
}

function railProfile(T) {
  const shape=new T.Shape(), w=20.76,h=2.26,r=.83;
  shape.moveTo(-w+r,-h); shape.lineTo(w-r,-h); shape.quadraticCurveTo(w,-h,w,-h+r);
  shape.lineTo(w,h-r); shape.quadraticCurveTo(w,h,w-r,h);
  shape.lineTo(-w+r,h); shape.quadraticCurveTo(-w,h,-w,h-r);
  shape.lineTo(-w,-h+r); shape.quadraticCurveTo(-w,-h,-w+r,-h); shape.closePath();
  return shape;
}

export function carrier(T) {
  const group=new T.Group(), mat=carrierMaterials(T);
  group.name='Recycled corrugated card carrier and EVA pads';
  const profile=carrierProfile(T);
  for(const bottom of [-1.4,1.16]) {
    const liner=layerMesh(T,profile,.24,bottom,[mat.paper,mat.paperEdge],80,80);
    liner.name='Kraft paper liner';
    group.add(liner);
  }
  const flutes=paperFlutes(T,mat.fluting);
  flutes.name='Corrugated kraft medium';
  group.add(flutes);
  for(const y of [-11,11]) {
    const pad=layerMesh(T,railProfile(T),2.5,1.4,mat.eva,42,5,.24);
    pad.name='EVA support pad'; pad.position.y=y; group.add(pad);
  }
  return group;
}
