const stage = document.querySelector("#model-stage");
const photo = document.querySelector("#model-photo");
const help = document.querySelector("#model-help");
const toolbar = document.querySelector(".model-tools");
const choices = [...document.querySelectorAll("[data-model]")];
const imports = {
  controller: () => import("./models/boards.js"),
  motion: () => import("./models/boards.js"),
  battery: () => import("./models/power.js"),
  charger: () => import("./models/power.js"),
  piezo: () => import("./models/power.js"),
  receiver: () => import("./models/coils.js"),
  transmitter: () => import("./models/coils.js"),
};
const accuracy = {
  controller: "The 20.96 × 17.78 mm outline, holes and pads follow Seeed’s v1.3 KiCad drawing. Shield and connector shapes are reconstructed.",
  motion: "Nominal 20 × 15 mm breakout. Component locations are reconstructed from the gallery board.",
  piezo: "20 mm disc example. Wire paths and solder joints vary by assembly.",
  battery: "The pouch follows the TAC 602535 cell dimensions. Foil folds, lead routing and connector details are illustrative.",
  transmitter: "The 68.58 × 54.61 mm circuit board follows Seeed’s v1.0 Eagle layout. Lead bends and coil profile are reconstructed.",
  receiver: "The original flex revision has a 48 × 32 mm backing and a 41 × 29 mm winding. Individual turns and reverse-side routing are reconstructed.",
  charger: "The 31 solid bodies come from Adafruit’s MicroLipo V2 STEP file, with front and back artwork from its Fusion design. Overall size is 30.35 × 12.06 × 6.37 mm.",
};
const references = {
  controller: "https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/",
  motion: "https://commons.wikimedia.org/wiki/File:GY-521_MPU-6050_Module_3_Axis_Gyroscope_%2B_Accelerometer_0487.jpg",
  piezo: "https://surplustronics.co.nz/products/9335-piezo-disc-element-leads",
  battery: "https://www.ivent.co.nz/product/3.7v-500mah-li-ion-prismatic-battery/39784",
  transmitter: "https://wiki.seeedstudio.com/Qi_Wireless_Charger_Transmitter/",
  receiver: "https://media.digikey.com/pdf/Data%20Sheets/Adafruit%20PDFs/1901_Web.pdf",
  charger: "https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/1304%20MicroLipo%20Charger",
};
let selected = choices[0];
let engine;
let active = false;
let request = 0;
const modelCache = new Map();

async function createEngine() {
  const [THREE, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import("three"), import("./vendor/OrbitControls.js"), import("./vendor/RoomEnvironment.js"),
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-describedby", "model-help");
  stage.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 0.7;
  controls.maxDistance = 12;
  controls.rotateSpeed = 0.8;
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(room, 0.04);
  scene.environment = studio.texture;
  scene.environmentIntensity = 0.85;
  room.dispose();
  pmrem.dispose();
  const light = new THREE.DirectionalLight(0xfffaf0, 2.2);
  light.position.set(-3, 6, 3);
  scene.add(light, new THREE.HemisphereLight(0xffffff, 0xb3c7b4, 1.25));
  const mount = new THREE.Group();
  scene.add(mount);

  function draw() {
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
  }
  controls.addEventListener("change", draw);
  THREE.DefaultLoadingManager.onLoad = draw;
  const observer = new ResizeObserver(() => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  });
  observer.observe(stage);

  function setView(view) {
    const distance = 1.12 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
    const direction = view === "reset" ? new THREE.Vector3(0.55, 1.55, 1.15) :
      new THREE.Vector3(0, view === "top" ? 1 : -1, 0.0001);
    controls.target.set(0, 0, 0);
    camera.position.copy(direction.normalize().multiplyScalar(distance));
    controls.update();
    draw();
  }

  canvas.addEventListener("keydown", event => {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    switch (event.key) {
      case "ArrowLeft": spherical.theta -= Math.PI / 12; break;
      case "ArrowRight": spherical.theta += Math.PI / 12; break;
      case "ArrowUp": spherical.phi -= Math.PI / 12; break;
      case "ArrowDown": spherical.phi += Math.PI / 12; break;
      case "+": case "=": spherical.radius /= 1.2; break;
      case "-": spherical.radius *= 1.2; break;
      case "Home": event.preventDefault(); setView("reset"); return;
      default: return;
    }
    event.preventDefault();
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, .0001, Math.PI - .0001);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.setFromSpherical(spherical);
    controls.update();
    draw();
  });
  for (const button of toolbar.querySelectorAll("button")) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    canvas.hidden = true;
    showPhoto("The 3D view was interrupted. Showing the reference photo.");
  });
  canvas.addEventListener("webglcontextrestored", () => loadSelected());
  return { THREE, mount, canvas, setView, renderer };
}

function showPhoto(message) {
  photo.hidden = false;
  toolbar.hidden = true;
  help.textContent = message;
}
async function loadSelected() {
  const version = ++request;
  const id = selected.dataset.model;
  const title = selected.dataset.title;
  try {
    engine ??= createEngine();
    const viewer = await engine;
    if (version !== request) return;
    viewer.canvas.hidden = true;
    if (viewer.renderer.getContext().isContextLost()) throw new Error("WebGL unavailable");
    if (!modelCache.has(id)) {
      const module = await imports[id]();
      if (version !== request) return;
      const model = await module[id](viewer.THREE);
      const bounds = new viewer.THREE.Box3().setFromObject(model);
      const sphere = bounds.getBoundingSphere(new viewer.THREE.Sphere());
      if (!(sphere.radius > 0 && Number.isFinite(sphere.radius))) throw new Error("Empty model");
      const centred = new viewer.THREE.Group();
      model.position.sub(sphere.center);
      centred.add(model);
      centred.scale.setScalar(1 / sphere.radius);
      modelCache.set(id, centred);
    }
    if (version !== request) return;
    viewer.mount.clear();
    viewer.mount.add(modelCache.get(id));
    viewer.canvas.setAttribute("aria-label", "Rotate " + title);
    viewer.canvas.hidden = false;
    photo.hidden = true;
    toolbar.hidden = false;
    help.textContent = "Drag to rotate. Scroll or pinch to zoom. With the model focused, use arrow keys to turn and + or − to zoom.";
    viewer.setView("reset");
  } catch (error) {
    if (version === request) {
      showPhoto("3D is unavailable in this browser. Showing the reference photo.");
      console.warn("Part viewer:", error);
    }
  }
}
function select(button) {
  selected = button;
  for (const choice of choices) choice.setAttribute("aria-pressed", String(choice === button));
  const { model, title, detail } = button.dataset;
  photo.src = button.querySelector("img").src;
  photo.alt = title + " reference photo";
  document.querySelector("#model-title").textContent = title;
  document.querySelector("#model-detail").textContent = detail;
  document.querySelector("#model-accuracy").textContent = accuracy[model];
  document.querySelector("#model-reference").href = "#" + model;
  document.querySelector("#model-source").href = references[model];
  showPhoto("Loading 3D view…");
  if (active) loadSelected();
}
for (const button of choices) button.addEventListener("click", () => select(button));
select(selected);
function start() {
  active = true;
  loadSelected();
}
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      start();
    }
  }, { rootMargin: "300px" });
  observer.observe(stage);
} else start();
