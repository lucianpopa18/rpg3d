// Control cameră pe jumătatea DREAPTĂ: trage cu un deget = rotire orbită,
// două degete = pinch-zoom. Funcționează SIMULTAN cu joystick-ul (stânga).
// Mutează `state` { alpha, beta, radius } în loc.
export function createLookControls(parent, state) {
  const zone = document.createElement('div');
  zone.style.cssText = 'position:fixed;right:0;top:0;width:50%;height:100%;z-index:4;touch-action:none;';
  parent.appendChild(zone);

  const pts = new Map(); // pointerId -> {x,y}
  let rotId = null, lx = 0, ly = 0, pinchDist = 0;
  const ROT = 0.006, ZOOM = 0.04;

  zone.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    zone.setPointerCapture?.(e.pointerId);
    if (pts.size === 1) { rotId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    else if (pts.size === 2) { pinchDist = dist(); }
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const d = dist();
      if (pinchDist > 0) { state.radius = clamp(state.radius - (d - pinchDist) * ZOOM, 4, 18); }
      pinchDist = d;
    } else if (e.pointerId === rotId) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      state.alpha -= dx * ROT;
      state.beta = clamp(state.beta - dy * ROT, 0.35, 1.45);
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (e.pointerId === rotId) rotId = pts.size ? [...pts.keys()][0] : null;
    if (pts.size < 2) pinchDist = 0;
    if (rotId) { const p = pts.get(rotId); if (p) { lx = p.x; ly = p.y; } }
  };
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);

  function dist() {
    const a = [...pts.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
}
