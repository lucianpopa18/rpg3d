import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createJoystick } from './joystick.js';
import { createLookControls } from './camera.js';

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

  // ---- cameră third-person condusă manual (fără attachControl) ----
  const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1.0, 9, hero.position.clone(), scene);
  camera.fov = 0.85;
  camera.minZ = 0.1;
  const camState = { alpha: -Math.PI / 2, beta: 1.0, radius: 9 };
  const camFocus = hero.position.add(new BABYLON.Vector3(0, 1.2, 0));

  const app = document.getElementById('app');
  const joy = createJoystick(app);          // stânga = mișcare
  createLookControls(app, camState);         // dreapta = rotire + zoom

  const SPEED_WALK = 3.0, SPEED_RUN = 6.4;
  let curSpeed = 0; // rampă de viteză pentru pornire/oprire lină

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    const v = joy.value; // { x, y, mag } în [-1,1]

    // direcția orizontală „înainte" (dinspre cameră spre erou, în scenă)
    const fwd = new BABYLON.Vector3(-Math.cos(camState.alpha), 0, -Math.sin(camState.alpha));
    const right = new BABYLON.Vector3(-fwd.z, 0, fwd.x); // perpendicular pe fwd (dreapta)
    // sus pe joystick (v.y negativ) = înainte
    const move = fwd.scale(-v.y).add(right.scale(v.x));
    move.y = 0;

    const wantMove = v.mag > 0.12 && move.lengthSquared() > 0.0001;
    if (wantMove) {
      move.normalize();
      const running = v.mag > 0.7;
      const targetSpeed = running ? SPEED_RUN : SPEED_WALK;
      curSpeed += (targetSpeed - curSpeed) * Math.min(1, dt * 8);
      hero.position.addInPlace(move.scale(curSpeed * dt));
      // rotește eroul lin spre direcția de mers
      const targetYaw = Math.atan2(move.x, move.z);
      const diff = ((targetYaw - hero.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      hero.rotation.y += diff * Math.min(1, dt * 14);
      play(running ? anims.run : anims.walk);
    } else {
      curSpeed += (0 - curSpeed) * Math.min(1, dt * 10);
      if (curSpeed > 0.05) hero.position.addInPlace(move.lengthSquared() > 0 ? move.normalize().scale(curSpeed * dt) : BABYLON.Vector3.Zero());
      play(anims.idle);
    }

    // camera urmărește lin eroul + aplică alpha/beta/radius din control
    BABYLON.Vector3.LerpToRef(camFocus, hero.position.add(new BABYLON.Vector3(0, 1.2, 0)), Math.min(1, dt * 10), camFocus);
    camera.target.copyFrom(camFocus);
    camera.alpha += (camState.alpha - camera.alpha) * Math.min(1, dt * 16);
    camera.beta += (camState.beta - camera.beta) * Math.min(1, dt * 16);
    camera.radius += (camState.radius - camera.radius) * Math.min(1, dt * 12);
  });

  loading.style.display = 'none';
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
}

main().catch(err => {
  console.error(err);
  loading.textContent = 'Eroare la încărcare. Reîncearcă.';
});
