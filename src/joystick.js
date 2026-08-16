// Joystick tactil dinamic: apare unde apeși (jumătatea stângă), ține mișcarea.
// Jumătatea dreaptă rămâne liberă pentru rotirea camerei.
export function createJoystick(parent) {
  const zone = document.createElement('div');
  zone.style.cssText = 'position:fixed;left:0;top:0;width:50%;height:100%;z-index:5;touch-action:none;';
  const base = document.createElement('div');
  base.style.cssText = 'position:fixed;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.35);'
    + 'background:rgba(0,0,0,.18);display:none;pointer-events:none;transform:translate(-50%,-50%);z-index:6;';
  const knob = document.createElement('div');
  knob.style.cssText = 'position:absolute;left:50%;top:50%;width:54px;height:54px;border-radius:50%;'
    + 'background:rgba(255,255,255,.5);border:2px solid rgba(255,255,255,.75);transform:translate(-50%,-50%);';
  base.appendChild(knob);
  parent.appendChild(base);
  parent.appendChild(zone);

  const R = 54; // raza maximă a knob-ului (px)
  const value = { x: 0, y: 0, mag: 0 };
  let pid = null, cx = 0, cy = 0;

  const reset = () => { pid = null; base.style.display = 'none'; value.x = value.y = value.mag = 0; };

  zone.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; cx = e.clientX; cy = e.clientY;
    base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.style.display = 'block';
    knob.style.left = '50%'; knob.style.top = '50%';
    zone.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    const cl = Math.min(d, R), ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * cl, ky = Math.sin(ang) * cl;
    knob.style.left = 60 + kx + 'px'; knob.style.top = 60 + ky + 'px';
    value.x = kx / R; value.y = ky / R; value.mag = Math.min(1, d / R);
  });
  const up = (e) => { if (e.pointerId === pid) reset(); };
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  window.addEventListener('pointerup', up);

  return { value };
}
