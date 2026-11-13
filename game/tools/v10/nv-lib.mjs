// V10 · utilidades de NOSVAMOSDEAQUÍ para pruebas y campaña: marco local del sector (x tangencial, y radial, h) con el eje que da el JUEGO,
// estado del grind, piloto de equilibrio (pulsa A/D contra la caída con anticipación y C en el aviso de la vuelta) y charla con Fennec.
// Solo leen el estado y pulsan teclas (entrada real).
export const nvW = (page, x, y, h = 0) => page.evaluate((x, y, h) => { const A = window.__bkSectors.find((q) => q.id === 'nosvamosdeaqui').axis * Math.PI / 180, c = Math.cos(A), s = Math.sin(A); return [x * c + y * s, h, x * s - y * c]; }, x, y, h);
export const nvState = (page) => page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'skateTutorial'), s = g.skater, c = g.rig.cam.position, RA = window.__bkRapier;
  const camHit = g.world.intersectionWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.1), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (cc) => !g.npcColliders.has(cc.handle) && !g.park.cameraIgnore.has(cc.handle) && !g.park.b.thin.has(cc.handle));
  return { phase: a.phase, s: a.s, lean: a.lean, leanV: a.leanV, warned: a.warned, k: a.slowK, crouched: a.crouched, fails: a.failures.length, ok: a.successes, mode: g.mode, done: g.state.p.activities.skateTutorial,
    col: g.state.p.collected.slice(), foot: [s.footPos.x, s.footPos.y, s.footPos.z], dialog: !document.getElementById('dialog').hidden ? document.getElementById('dialog-text').textContent : null, camIn: camHit ? g.park.colliderName(camHit.handle) : null,
    action: !document.getElementById('btn-action')?.hidden ? document.getElementById('btn-action')?.textContent : null }; });
/** Piloto de equilibrio del grind de RG1 (teclado real). */
export async function nvPilot(page, { crouch = true, maxMs = 30000 } = {}) {
  let held = null, ch = false; const t0 = Date.now(), log = { camIn: [], maxLean: 0 };
  const press = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  while (Date.now() - t0 < maxMs) {
    const s = await nvState(page); if (s.camIn && log.camIn.length < 5) log.camIn.push(s.camIn); log.maxLean = Math.max(log.maxLean, Math.abs(s.lean ?? 0));
    if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await new Promise((r) => setTimeout(r, 40)); continue; } break; }
    const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18;
    await press(pred > 0.03 ? 'KeyA' : pred < -0.03 ? 'KeyD' : null);   // inclina a la derecha → corrige a la izquierda (A)
    if (crouch && s.warned && !ch) { ch = true; await page.keyboard.down('KeyC'); }
    await new Promise((r) => setTimeout(r, 25));
  }
  await press(null); if (ch) await page.keyboard.up('KeyC');
  return log;
}
/** HABLAR (frases con su botón) → EMPEZAR (la segunda vez directamente EMPEZAR/REPETIR). Devuelve las frases leídas. */
export async function nvTalkAndStart(page) {
  const lines = [];
  for (let i = 0; i < 10; i++) { const s = await nvState(page); if (s.dialog) { lines.push(s.dialog); await page.click('#dialog-ok'); await new Promise((r) => setTimeout(r, 250)); continue; }
    if (s.action && /EMPEZAR|REPETIR/.test(s.action)) { await page.keyboard.press('KeyE'); await new Promise((r) => setTimeout(r, 300)); return { ok: true, lines }; }
    if (s.action && /HABLAR/.test(s.action)) { await page.keyboard.press('KeyE'); await new Promise((r) => setTimeout(r, 450)); continue; } await new Promise((r) => setTimeout(r, 250)); }
  return { ok: false, lines };
}
