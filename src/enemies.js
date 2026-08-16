import * as BABYLON from '@babylonjs/core';

// Inamic „slime" — procedural (fără asseturi): sferă turtită care saltă, rătăcește,
// devine agresivă lângă jucător, primește damage, moare și reapare.
class Slime {
  constructor(scene, shadow, home, big = false) {
    this.scene = scene;
    this.home = home.clone();
    this.big = big;
    this.maxHp = big ? 150 : 60;
    this.baseY = big ? 0.72 : 0.47;
    this.root = new BABYLON.TransformNode('slime', scene);
    const body = BABYLON.MeshBuilder.CreateSphere('sbody', { diameter: big ? 2 : 1.3, segments: 10 }, scene);
    body.scaling.set(1, 0.72, 1);
    body.parent = this.root;
    body.position.y = this.baseY;
    const mat = new BABYLON.StandardMaterial('smat', scene);
    mat.diffuseColor = big ? new BABYLON.Color3(0.6, 0.25, 0.55) : new BABYLON.Color3(0.25, 0.75, 0.35);
    mat.specularColor = new BABYLON.Color3(0.3, 0.5, 0.3);
    mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
    body.material = mat;
    // ochi
    for (const sx of [-0.22, 0.22]) {
      const eye = BABYLON.MeshBuilder.CreateSphere('eye', { diameter: 0.18 }, scene);
      eye.parent = body; eye.position.set(sx, 0.15, 0.5);
      const em = new BABYLON.StandardMaterial('em', scene); em.diffuseColor = BABYLON.Color3.Black();
      eye.material = em;
    }
    shadow.addShadowCaster(body);
    this.body = body; this.mat = mat;
    this.reset();
  }

  reset() {
    this.hp = this.maxHp;
    this.dead = false;
    this.root.setEnabled(true);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
    this.pos = this.home.add(new BABYLON.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    this.wander = this._pickWander();
    this.phase = Math.random() * 6.28;
    this.hitFlash = 0; this.squish = 0; this.respawnAt = 0;
  }

  _pickWander() {
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
    return this.home.add(new BABYLON.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  update(dt, playerPos, now) {
    if (this.dead) {
      if (now >= this.respawnAt) this.reset();
      return;
    }
    const toPlayer = playerPos.subtract(this.pos); toPlayer.y = 0;
    const dist = toPlayer.length();
    let dir = null, speed = 1.4;
    if (dist < 8 && dist > 1.3) { dir = toPlayer.scale(1 / dist); speed = 2.6; }   // agresiv
    else if (dist >= 8) {
      const tw = this.wander.subtract(this.pos); tw.y = 0;
      if (tw.length() < 0.6) this.wander = this._pickWander();
      else dir = tw.normalize();
    }
    if (dir) {
      this.pos.addInPlace(dir.scale(speed * dt));
      this.root.rotation.y = Math.atan2(dir.x, dir.z);
    }
    // salt
    this.phase += dt * (dir ? 9 : 5);
    const bounce = Math.abs(Math.sin(this.phase)) * (dir ? 0.32 : 0.16);
    this.root.position.copyFrom(this.pos); this.root.position.y = bounce;
    // reacții la lovire
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.squish = Math.max(0, this.squish - dt * 4);
    this.mat.emissiveColor.set(this.hitFlash * 4, this.hitFlash * 1.5, this.hitFlash * 1.5);
    const s = 1 - this.squish * 0.5;
    this.body.scaling.set(1 + this.squish * 0.4, 0.72 * s, 1 + this.squish * 0.4);
    return dist;
  }

  damage(n, now) {
    if (this.dead) return;
    this.hp -= n; this.hitFlash = 0.18; this.squish = 1;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.root.setEnabled(false); this.respawnAt = now + 6; }
  }
}

export function createEnemies(scene, shadow, count = 7) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, r = 14 + Math.random() * 20;
    const home = new BABYLON.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const big = i % 3 === 2; // ~1/3 slime-uri mari (mov, mai tari)
    list.push(new Slime(scene, shadow, home, big));
  }
  return list;
}
