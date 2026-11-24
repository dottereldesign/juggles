/* Draw a silhouette from the visible pixels of the selected part, including
   disconnected pieces such as wires. The depth pass hides occluded edges. */
export function createOutline(T, renderer) {
  const mask = new T.WebGLRenderTarget(1, 1);
  const depth = new T.MeshBasicMaterial({ colorWrite: false, side: T.DoubleSide });
  const white = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, toneMapped: false });
  const size = new T.Vector2();
  const quadScene = new T.Scene();
  const screen = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const edge = new T.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { maskMap: { value: mask.texture }, stepUV: { value: new T.Vector2() } },
    vertexShader: 'varying vec2 pos; void main(){ pos=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `
      varying vec2 pos;
      uniform sampler2D maskMap;
      uniform vec2 stepUV;
      void main() {
        float centre = texture2D(maskMap, pos).r;
        float outer = 0.;
        for(int i=0;i<8;i++) {
          float angle = float(i)*0.78539816;
          outer = max(outer,texture2D(maskMap,pos+stepUV*vec2(cos(angle),sin(angle))).r);
        }
        gl_FragColor=vec4(0.54,1.0,0.32,outer*(1.-centre)*0.95);
      }`
  });
  quadScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), edge));
  let selected;
  return {
    select(part) {
      selected?.traverse(node => node.layers.disable(1));
      selected = part;
      selected?.traverse(node => node.layers.enable(1));
    },
    resize() {
      renderer.getDrawingBufferSize(size);
      mask.setSize(size.x, size.y);
      const radius = 2 * renderer.getPixelRatio();
      edge.uniforms.stepUV.value.set(radius / size.x, radius / size.y);
    },
    draw(scene, camera) {
      const layers = camera.layers.mask;
      renderer.setRenderTarget(mask);
      renderer.clear();
      renderer.autoClear = false;
      scene.overrideMaterial = depth;
      renderer.render(scene, camera);
      camera.layers.set(1);
      scene.overrideMaterial = white;
      renderer.render(scene, camera);
      camera.layers.mask = layers;
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, screen);
      renderer.autoClear = true;
    }
  };
}
