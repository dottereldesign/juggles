const stage = document.querySelector("#assembly-stage");
const picker = document.querySelector("#assembly-part");
const spacing = document.querySelector("#assembly-spread");
const reset = document.querySelector("#assembly-reset");
const help = document.querySelector("#assembly-help");
const marker = stage.querySelector(".assembly-marker");
const poster = stage.querySelector("img");
const details = {
  seam: ["Paper masking tape", "A removable strip holds the empty-fit prototype closed while you turn it by hand. Fold the end back on itself to make a pull tab.", "Bridges the outer edges of both foam covers. Peel it back before lifting out the card carrier."],
  "shell-left": ["Left foam cover", "One half of a 100 mm craft sphere encloses the electronics. A shallow seat at the pole brings the charging receiver close to the outside dock.", "Removable tape joins its rim to the other half. The receiver sits just inside the marked charging face."],
  "shell-right": ["Right foam cover", "Lift this half away to reach the electronics and inspect the piezo mounting after a hand tap.", "Meets the left cover at the taped seam. The contact disc bears against the inner surface."],
  carrier: ["Removable card carrier", "A disc cut from corrugated packaging holds the boards near the centre. Small EVA strips support them and leave clearance underneath.", "Seats between the shell halves. A notch carries the leads between the boards, cell, charging receiver and shell sensor."],
  controller: ["Seeed XIAO ESP32C3", "Samples the sensors, groups readings into touches and sends the count to a phone over Bluetooth. Its onboard charger manages the cell.", "I²C links D4/SDA and D5/SCL to the motion board. A1 reads the protected piezo signal. BAT pads connect to the cell; the wireless receiver feeds the 5 V input through a diode."],
  motion: ["BMI160 motion board", "Measures acceleration and angular speed. Mount it firmly so the recorded movement follows the prototype.", "Four leads to the XIAO carry 3.3 V, ground, SDA and SCL. The gallery above also shows a GY-521 alternative."],
  piezo: ["Piezo contact disc", "The ceramic and brass disc flexes with the shell to register a sharp contact. Secure the rim and give the wires slack.", "Feeds the XIAO’s A1 input through the resistor and clamp circuit shown in the tutorial. The return lead goes to ground."],
  battery: ["Protected 500 mAh cell", "A single 3.7 V pouch powers the bench electronics. Use a dummy of the same size for the first fit and balance test.", "Connects to BAT+ and BAT− on the XIAO. Its onboard charger controls the charge current."],
  receiver: ["DFR0362 receiver", "The coil inside the shell picks up power when its face lines up with the transmitter in the dock.", "The receiver board supplies 5 V through a low-drop diode to the XIAO’s 5 V input, with a shared ground. The power link across the shell is wireless."],
  dock: ["External charging dock", "A matched transmitter stays on the workbench. Align its coil with the receiver under the foam and test the gap through the actual materials.", "A regulated 5 V supply powers the transmitter. Its magnetic field couples to the receiver. The electronics in the ball have no wired connection to the dock."],
  harness: ["Signal and power wiring", "The wires stay attached as you open the view. Green and blue carry I²C data and clock. The yellow branch carries the piezo signal through the conditioning board.", "The motion board shares power and I²C with the XIAO. The piezo uses input protection, the cell uses the BAT pads and the receiver supplies the charging input."],
};
const name = document.querySelector("#assembly-name");
const purpose = document.querySelector("#assembly-purpose");
const connection = document.querySelector("#assembly-connection");
let graphics;
function inspect(id, point) {
  const entry = details[id];
  if (!entry) return;
  if (picker.value !== id || name.textContent !== entry[0]) {
    picker.value = id;
    [name.textContent, purpose.textContent, connection.textContent] = entry;
  }
  graphics?.mark(id, point);
}
picker.addEventListener("change", () => inspect(picker.value));
inspect(picker.value);

async function initialise() {
  const [T, {OrbitControls}, {RoomEnvironment}, {buildAssembly}] = await Promise.all([
    import("three"), import("./vendor/OrbitControls.js"), import("./vendor/RoomEnvironment.js"), import("./models/prototype-assembly.js"),
  ]);
  const renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const {group,parts,setExplosion} = await buildAssembly(T);
  const scene = new T.Scene();
  scene.add(group);
  const room = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, .04).texture;
  scene.environmentIntensity = .78;
  room.dispose(); pmrem.dispose();
  scene.add(new T.HemisphereLight(0xfff8dc,0x64778a,1.1));
  const key = new T.DirectionalLight(0xffedcf,2.3);
  key.position.set(-150,310,240); scene.add(key);
  const rim = new T.DirectionalLight(0xb5dcff,1.8);
  rim.position.set(210,70,-190); scene.add(rim);
  const camera = new T.OrthographicCamera(-1,1,1,-1,.1,5000);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label","Rotatable exploded foam prototype");
  if (help) canvas.setAttribute("aria-describedby","assembly-help");
  stage.append(canvas);
  const orbit = new OrbitControls(camera,canvas);
  orbit.enablePan = false; orbit.minZoom = .5; orbit.maxZoom = 7;
  const ray = new T.Raycaster();
  const pickRoots = Object.values(parts);
  const ids = new Map(Object.entries(parts).map(([id,part]) => [part,id]));
  let selectedPart, anchor, width, height;
  const outline = marker ? null : (await import("./selection-outline.js")).createOutline(T, renderer);
  const projected = new T.Vector3();
  function draw() {
    if (!width || !height || renderer.getContext().isContextLost()) return;
    renderer.render(scene,camera);
    if (!selectedPart) return;
    if (outline) { outline.draw(scene, camera); return; }
    projected.copy(anchor); selectedPart.localToWorld(projected); projected.project(camera);
    marker.hidden = Math.abs(projected.x) > .97 || Math.abs(projected.y) > .94;
    marker.style.left = (projected.x*.5+.5)*100+"%";
    marker.style.top = (.5-projected.y*.5)*100+"%";
  }
  function mark(id, point) {
    if (outline && selectedPart === parts[id]) return;
    selectedPart = parts[id];
    outline?.select(selectedPart);
    if (!selectedPart) return;
    if (outline) { draw(); return; }
    anchor = (point || new T.Box3().setFromObject(selectedPart).getCenter(new T.Vector3())).clone();
    selectedPart.worldToLocal(anchor);
    draw();
  }
  setExplosion(1);
  group.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(group);
  const centre = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  const viewDirection = new T.Vector3(.39,.31,1).normalize();
  function frame() {
    orbit.target.copy(centre);
    camera.position.copy(centre).addScaledVector(viewDirection,size.length()*2);
    camera.up.set(0,1,0);
    camera.zoom=1; camera.updateProjectionMatrix();
    orbit.update(); draw();
  }
  // Fit the projected corners of the entire exploded assembly, including the dock.
  // Keep that framing as the layers close so their movement remains legible.
  function resize() {
    ({width,height}=stage.getBoundingClientRect());
    if(!width || !height)return;
    const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),viewDirection).normalize();
    const up=new T.Vector3().crossVectors(viewDirection,right);
    const extent=axis=>Math.abs(axis.x)*size.x+Math.abs(axis.y)*size.y+Math.abs(axis.z)*size.z;
    const aspect=width/height;
    const half=Math.max(extent(up),extent(right)/aspect)*.53;
    camera.left=-half*aspect;camera.right=half*aspect;
    camera.top=half;camera.bottom=-half;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);outline?.resize();draw();
  }
  frame(); resize();
  new ResizeObserver(resize).observe(stage);
  orbit.addEventListener("change",draw);
  function hit(event) {
    const rect=canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    const first=ray.intersectObjects(pickRoots,true)[0];
    if(!first)return;
    let node=first.object;
    while(node && !ids.has(node))node=node.parent;
    if(node)inspect(ids.get(node),first.point);
  }
  let pressed,dragged=false;
  canvas.addEventListener("pointerdown",e=>{pressed=[e.clientX,e.clientY];dragged=false;});
  canvas.addEventListener("pointermove",e=>{
    if(pressed){if(Math.hypot(e.clientX-pressed[0],e.clientY-pressed[1])>5)dragged=true;return;}
    if(e.pointerType==="mouse" && !e.buttons)hit(e);
  });
  canvas.addEventListener("pointerup",e=>{if(pressed&&!dragged)hit(e);pressed=null;});
  canvas.addEventListener("pointercancel",()=>{pressed=null;});
  canvas.addEventListener("keydown",e=>{
    const spherical=new T.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    if(e.key==="ArrowLeft")spherical.theta-=.15;
    else if(e.key==="ArrowRight")spherical.theta+=.15;
    else if(e.key==="ArrowUp")spherical.phi-=.15;
    else if(e.key==="ArrowDown")spherical.phi+=.15;
    else if(e.key==="Home"){e.preventDefault();frame();return;}
    else return;
    e.preventDefault();spherical.makeSafe();
    camera.position.setFromSpherical(spherical).add(orbit.target);orbit.update();draw();
  });
  spacing.addEventListener("input",()=>{
    setExplosion(Number(spacing.value)/100);
    if (marker && (picker.value === "seam" || picker.value === "harness")) mark(picker.value);
    else draw();
  });
  reset?.addEventListener("click",()=>{spacing.value="100";setExplosion(1);frame();inspect("shell-left");});
  renderer.domElement.addEventListener("webglcontextlost",e=>{
    e.preventDefault();poster.hidden=false;canvas.hidden=true;if (marker) marker.hidden=true;
    if (reset) reset.disabled=true;spacing.disabled=true;
  });
  canvas.addEventListener("webglcontextrestored",()=>{
    poster.hidden=true;canvas.hidden=false;if (reset) reset.disabled=false;spacing.disabled=false;draw();
  });
  graphics={mark};
  poster.hidden=true;if (reset) reset.disabled=false;spacing.disabled=false;
  mark(picker.value);
}
function start() {
  initialise().catch(error=>{
    const canvas=stage.querySelector("canvas"); if(canvas)canvas.hidden=true;
    poster.hidden=false;if (marker) marker.hidden=true;
    if (help) help.textContent="Showing the exploded reference image. Use the part list to explore each connection.";
    console.warn("Prototype assembly:",error);
  });
}
if("IntersectionObserver" in window) {
  const watch=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){watch.disconnect();start();}
  },{rootMargin:"300px"});
  watch.observe(stage);
} else start();
