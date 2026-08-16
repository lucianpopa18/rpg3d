// UI simplu peste scena 3D: HP jucător, bare de HP flotante peste inamici, buton atac.
export function createPlayerHud(parent) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:14px;top:calc(env(safe-area-inset-top,0px) + 14px);z-index:8;'
    + 'width:200px;max-width:44vw;font-family:-apple-system,system-ui,sans-serif;color:#fff;pointer-events:none;';
  wrap.innerHTML = '<div style="font-weight:800;font-size:12px;text-shadow:0 1px 2px #000;margin-bottom:3px;">🛡️ Erou</div>'
    + '<div style="height:16px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.3);overflow:hidden;">'
    + '<div id="phpfill" style="height:100%;width:100%;background:linear-gradient(90deg,#e74c3c,#ff7a6b);transition:width .15s;"></div></div>';
  parent.appendChild(wrap);
  const fill = wrap.querySelector('#phpfill');
  return { setHp: (cur, max) => { fill.style.width = Math.max(0, (cur / max) * 100) + '%'; } };
}

export function createAttackButton(parent, onAttack) {
  const btn = document.createElement('button');
  btn.textContent = '⚔️';
  btn.style.cssText = 'position:fixed;right:calc(env(safe-area-inset-right,0px) + 22px);'
    + 'bottom:calc(env(safe-area-inset-bottom,0px) + 30px);z-index:8;width:78px;height:78px;border-radius:50%;'
    + 'border:2px solid rgba(255,255,255,.5);background:rgba(200,60,50,.85);color:#fff;font-size:32px;'
    + 'box-shadow:0 6px 18px rgba(0,0,0,.4);touch-action:none;';
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onAttack(); btn.style.transform = 'scale(.9)'; });
  btn.addEventListener('pointerup', () => { btn.style.transform = 'scale(1)'; });
  parent.appendChild(btn);
  return btn;
}

export function createXpBar(parent) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:14px;top:calc(env(safe-area-inset-top,0px) + 56px);z-index:8;'
    + 'width:200px;max-width:44vw;font-family:-apple-system,system-ui,sans-serif;color:#fff;pointer-events:none;';
  wrap.innerHTML = '<div id="lvltxt" style="font-weight:800;font-size:11px;text-shadow:0 1px 2px #000;margin-bottom:2px;">Nivel 1</div>'
    + '<div style="height:9px;border-radius:5px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.3);overflow:hidden;">'
    + '<div id="xpfill" style="height:100%;width:0%;background:linear-gradient(90deg,#f1c40f,#ffe694);transition:width .2s;"></div></div>';
  parent.appendChild(wrap);
  const fill = wrap.querySelector('#xpfill'), txt = wrap.querySelector('#lvltxt');
  return { set: (cur, need, lvl) => { fill.style.width = Math.min(100, (cur / need) * 100) + '%'; txt.textContent = 'Nivel ' + lvl; } };
}

export function spawnDamageNumber(parent, x, y, text, crit) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:9;pointer-events:none;'
    + 'font-family:-apple-system,system-ui,sans-serif;font-weight:900;transform:translate(-50%,-50%);'
    + 'text-shadow:0 2px 3px #000;' + (crit ? 'color:#ffd23f;font-size:26px;' : 'color:#fff;font-size:19px;')
    + 'transition:transform .6s ease-out,opacity .6s ease-out;';
  parent.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-140%)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 650);
}

export function createEnemyBar(parent) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;width:56px;height:7px;border-radius:4px;background:rgba(0,0,0,.5);'
    + 'border:1px solid rgba(255,255,255,.35);overflow:hidden;transform:translate(-50%,-50%);pointer-events:none;'
    + 'z-index:7;display:none;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#2ecc71,#7bed9f);';
  wrap.appendChild(fill);
  parent.appendChild(wrap);
  return {
    set(x, y, ratio, visible) {
      wrap.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
      fill.style.width = Math.max(0, ratio * 100) + '%';
    },
  };
}
