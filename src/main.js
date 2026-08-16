import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createJoystick } from './joystick.js';

const canvas = document.getElementById('renderCanvas');
const loading = document.getElementById('loading');

async function createEngine() {
  if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
    const e = new BABYLON.WebGPUEngine(canvas, { antialias: true, stencil: true });
    await e.initAsync();
    return e;
  }
  return new BABYLON.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
}

async function main() {
  const engine = await createEngine();
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.53, 0.74, 0.86, 1); // cer albăstrui
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogColor = new BABYLON.Color3(0.62, 0.75, 0.72);
  scene.fogDensity = 0.006;

  // ---- lumini ----
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = new BABYLON.Color3(0.35, 0.4, 0.3);
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, -0.6), scene);
  sun.position = new BABYLON.Vector3(40, 60, 40);
  sun.intensity = 1.4;
  const shadow = new BABYLON.ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurScale = 2;

  // ---- teren (iarbă) ----
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 200, height: 200, subdivisions: 4 }, scene);
  const gmat = new BABYLON.StandardMaterial('gmat', scene);
  gmat.diffuseColor = new BABYLON.Color3(0.29, 0.55, 0.3);
  gmat.specularColor = new BABYLON.Color3(0, 0, 0);
  ground.material = gmat;
  ground.receiveShadows = true;

  // câțiva copaci simpli (decor) ca să se vadă mișcarea în lume
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 160, z = (Math.random() - 0.5) * 160;
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
    const h = 3 + Math.random() * 3;
    const trunk = BABYLON.MeshBuilder.CreateCylinder('t', { height: h, diameterTop: 0.4, diameterBottom: 0.6 }, scene);
    trunk.position.set(x, h / 2, z);
    const tm = new BABYLON.StandardMaterial('tm', scene); tm.diffuseColor = new BABYLON.Color3(0.35, 0.25, 0.15); tm.specularColor = BABYLON.Color3.Black();
    trunk.material = tm; shadow.addShadowCaster(trunk);
    const leaves = BABYLON.MeshBuilder.CreateSphere('l', { diameter: 2.5 + Math.random() * 1.5, segments: 6 }, scene);
    leaves.position.set(x, h + 0.6, z);
    const lm = new BABYLON.StandardMaterial('lm', scene); lm.diffuseColor = new BABYLON.Color3(0.2, 0.45, 0.22); lm.specularColor = BABYLON.Color3.Black();
    leaves.material = lm; shadow.addShadowCaster(leaves);
  }

  // ---- personaj ----
  const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', 'HVGirl.glb', scene);
  const hero = res.meshes[0];
  hero.scaling.scaleInPlace(0.1);
  hero.position = new BABYLON.Vector3(0, 0, 0);
  res.meshes.forEach(m => { if (m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m); });

  const groups = res.animationGroups;
  groups.forEach(g => g.stop());
  const pick = (re) => groups.find(g => re.test(g.name));
  const anims = {
    idle: pick(/idle/i) || groups[0],
    walk: pick(/walk/i) || pick(/run/i),
    run: pick(/run/i) || pick(/walk/i),
  };
  console.log('Animații găsite:', groups.map(g => g.name).join(', '));
  let current = null;
  const play = (a) => { if (!a || a === current) return; current?.stop(); a.play(true); current = a; };
  play(anims.idle);

  // ---- cameră third-person (urmărește eroul, rotești cu degetul) ----
  const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1.05, 9, hero.position.clone(), scene);
  camera.lowerRadiusLimit = 4; camera.upperRadiusLimit = 16;
  camera.lowerBetaLimit = 0.35; camera.upperBetaLimit = 1.45;
  camera.wheelPrecision = 40;
  camera.attachControl(canvas, true);
  camera.checkCollisions = false;

  // ---- controale: joystick tactil (mișcare) ----
  const joy = createJoystick(document.getElementById('app'));

  const SPEED_WALK = 3.2, SPEED_RUN = 6.2;
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    const v = joy.value; // { x, y, mag } în [-1,1]
    // direcția relativ la cameră (proiectată pe sol)
    const fwd = hero.position.subtract(camera.position); fwd.y = 0;
    if (fwd.lengthSquared() < 0.001) fwd.set(0, 0, 1);
    fwd.normalize();
    const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), fwd).normalize();
    const move = fwd.scale(-v.y).add(right.scale(v.x)); // sus pe joystick = înainte
    move.y = 0;

    if (v.mag > 0.08 && move.lengthSquared() > 0.0001) {
      move.normalize();
      const running = v.mag > 0.75;
      const speed = running ? SPEED_RUN : SPEED_WALK;
      hero.position.addInPlace(move.scale(speed * dt * Math.min(1, v.mag / 0.75)));
      // rotește eroul spre direcția de mers (lin)
      const targetYaw = Math.atan2(move.x, move.z);
      let cur = hero.rotation.y;
      let diff = ((targetYaw - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
      hero.rotation.y = cur + diff * Math.min(1, dt * 12);
      play(running ? anims.run : anims.walk);
    } else {
      play(anims.idle);
    }

    // camera urmărește eroul
    camera.target = BABYLON.Vector3.Lerp(camera.target, hero.position.add(new BABYLON.Vector3(0, 1.1, 0)), Math.min(1, dt * 8));
  });

  loading.style.display = 'none';
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
}

main().catch(err => {
  console.error(err);
  loading.textContent = 'Eroare la încărcare. Reîncearcă.';
});
