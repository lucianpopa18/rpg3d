import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createJoystick } from './joystick.js';
import { createLookControls } from './camera.js';
import { createEnemies } from './enemies.js';
import { createPlayerHud, createAttackButton, createEnemyBar, createXpBar, spawnDamageNumber } from './ui.js';

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
  const model = res.meshes[0];
  model.scaling.scaleInPlace(0.1);
  model.position.set(0, 0, 0);
  res.meshes.forEach(m => { if (m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m); });

  // Nod „player" curat, controlat cu Euler (glTF __root__ are un quaternion de flip
  // care ignoră .rotation — de aceea învelim modelul într-un nod al nostru).
  const hero = new BABYLON.TransformNode('player', scene);
  model.parent = hero;
  hero.position.set(0, 0, 0);
  hero.rotation = new BABYLON.Vector3(0, 0, 0);
  const MODEL_YAW = 0; // offset de orientare al modelului (HVGirl)

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

  // ---- combat: inamici + HP + atac ----
  const enemies = createEnemies(scene, shadow, 6);
  const hud = createPlayerHud(app);
  const xpBar = createXpBar(app);
  const enemyBars = enemies.map(() => createEnemyBar(app));
  let playerHp = 100; const PLAYER_MAX = 100;
  let attackCd = 0, lastBite = 0, slashT = 0, attackAnimT = 0;
  const ATTACK_RANGE = 3.0, ATTACK_DMG = 26;
  // XP / nivel
  let level = 1, xp = 0, xpNeed = 100;
  xpBar.set(0, xpNeed, level);

  // efect de lovire (disc care se extinde și dispare)
  const slash = BABYLON.MeshBuilder.CreateDisc('slash', { radius: 1, tessellation: 24 }, scene);
  const slashMat = new BABYLON.StandardMaterial('slashMat', scene);
  slashMat.emissiveColor = new BABYLON.Color3(1, 1, 0.8); slashMat.disableLighting = true;
  slashMat.alpha = 0; slash.material = slashMat; slash.rotation.x = Math.PI / 2; slash.setEnabled(false);

  const grantXp = (n) => {
    xp += n;
    while (xp >= xpNeed) { xp -= xpNeed; level++; xpNeed = Math.round(xpNeed * 1.35); playerHp = PLAYER_MAX; spawnDamageNumber(app, window.innerWidth / 2, window.innerHeight * 0.4, 'NIVEL ' + level + '! ⬆️', true); }
    xpBar.set(xp, xpNeed, level);
  };

  const doAttack = () => {
    if (attackCd > 0) return;
    attackCd = 0.5; attackAnimT = 0.28; slashT = 0.22; slash.setEnabled(true);
    let best = null, bestD = ATTACK_RANGE;
    for (const e of enemies) { if (e.dead) continue; const d = e.pos.subtract(hero.position); d.y = 0; const dl = d.length(); if (dl < bestD) { bestD = dl; best = e; } }
    if (best) {
      const dir = best.pos.subtract(hero.position); dir.y = 0; dir.normalize();
      hero.rotation.y = Math.atan2(dir.x, dir.z) + MODEL_YAW;
      const crit = Math.random() < 0.2;
      const dmg = crit ? Math.round(ATTACK_DMG * 1.8) : ATTACK_DMG;
      const wasAlive = !best.dead;
      best.damage(dmg, performance.now() / 1000);
      // număr de damage la poziția inamicului pe ecran
      const p = BABYLON.Vector3.Project(best.pos.add(new BABYLON.Vector3(0, 1.4, 0)), BABYLON.Matrix.Identity(), scene.getTransformMatrix(), new BABYLON.Viewport(0, 0, canvas.clientWidth, canvas.clientHeight));
      if (p.z > 0 && p.z < 1) spawnDamageNumber(app, p.x, p.y, String(dmg), crit);
      if (wasAlive && best.dead) grantXp(best.big ? 80 : 35);
    }
  };
  createAttackButton(app, doAttack);
  const viewport = () => new BABYLON.Viewport(0, 0, canvas.clientWidth, canvas.clientHeight);

  const SPEED_WALK = 3.0, SPEED_RUN = 6.6;
  let curSpeed = 0;                          // rampă de viteză
  const lastDir = new BABYLON.Vector3(0, 0, 1); // ultima direcție validă (pt. oprire lină, fără NaN)

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    const v = joy.value; // { x, y, mag }

    // direcția orizontală „înainte" (dinspre cameră spre erou, în scenă)
    const fwd = new BABYLON.Vector3(-Math.cos(camState.alpha), 0, -Math.sin(camState.alpha));
    const right = new BABYLON.Vector3(fwd.z, 0, -fwd.x); // dreapta ecranului (corectat, nu în oglindă)
    const move = fwd.scale(-v.y).add(right.scale(v.x)); move.y = 0;

    const wantMove = v.mag > 0.15 && move.lengthSquared() > 0.0001;
    if (wantMove) {
      move.normalize();
      lastDir.copyFrom(move);
      const running = v.mag > 0.72;
      const targetSpeed = running ? SPEED_RUN : SPEED_WALK;
      curSpeed += (targetSpeed - curSpeed) * Math.min(1, dt * 9);
      // rotește eroul lin spre direcția de mers
      const targetYaw = Math.atan2(move.x, move.z) + MODEL_YAW;
      const diff = ((targetYaw - hero.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      hero.rotation.y += diff * Math.min(1, dt * 16);
      play(running ? anims.run : anims.walk);
    } else {
      curSpeed += (0 - curSpeed) * Math.min(1, dt * 12);
      play(anims.idle);
    }
    // deplasare (folosește ultima direcție validă la decelerare — fără NaN)
    if (curSpeed > 0.02) hero.position.addInPlace(lastDir.scale(curSpeed * dt));

    // camera: urmărire lină a focusului + rotire/zoom aproape 1:1 (crisp)
    BABYLON.Vector3.LerpToRef(camFocus, hero.position.add(new BABYLON.Vector3(0, 1.25, 0)), Math.min(1, dt * 12), camFocus);
    camera.target.copyFrom(camFocus);
    camera.alpha += (camState.alpha - camera.alpha) * Math.min(1, dt * 24);
    camera.beta += (camState.beta - camera.beta) * Math.min(1, dt * 24);
    camera.radius += (camState.radius - camera.radius) * Math.min(1, dt * 14);

    // ---- combat ----
    const nowS = performance.now() / 1000;
    attackCd = Math.max(0, attackCd - dt);

    // animație de atac: thrust scurt înainte (lunge)
    attackAnimT = Math.max(0, attackAnimT - dt);
    model.position.z = Math.sin((1 - attackAnimT / 0.28) * Math.PI) * (attackAnimT > 0 ? 0.5 : 0);

    // efect de lovire (disc în fața eroului)
    if (slashT > 0) {
      slashT -= dt;
      const yaw = hero.rotation.y - MODEL_YAW;
      const f = new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      slash.position.copyFrom(hero.position.add(f.scale(1.3))); slash.position.y = 0.7;
      const k = 1 - Math.max(0, slashT) / 0.22;
      slash.scaling.setAll(0.5 + k * 1.6); slashMat.alpha = (1 - k) * 0.75;
      if (slashT <= 0) slash.setEnabled(false);
    }

    // inamici + bare de HP + damage de contact
    const vp = viewport();
    const tm = scene.getTransformMatrix();
    let contactDmg = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const d = e.update(dt, hero.position, nowS);
      if (!e.dead && typeof d === 'number' && d < (e.big ? 1.9 : 1.4)) contactDmg = Math.max(contactDmg, e.big ? 15 : 8);
      const bar = enemyBars[i];
      if (e.dead || e.hp >= e.maxHp) { bar.set(0, 0, 0, false); continue; }
      const p = BABYLON.Vector3.Project(e.pos.add(new BABYLON.Vector3(0, 1.6, 0)), BABYLON.Matrix.Identity(), tm, vp);
      bar.set(p.x, p.y, e.hp / e.maxHp, p.z > 0 && p.z < 1);
    }

    // damage de contact spre jucător
    if (contactDmg > 0 && nowS - lastBite > 0.7) { playerHp = Math.max(0, playerHp - contactDmg); lastBite = nowS; }
    if (playerHp <= 0) { playerHp = PLAYER_MAX; hero.position.set(0, 0, 0); }
    hud.setHp(playerHp, PLAYER_MAX);
  });

  loading.style.display = 'none';
  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
}

main().catch(err => {
  console.error(err);
  loading.textContent = 'Eroare la încărcare. Reîncearcă.';
});
