// NPC-01: conversación con los humanos desde la CÁMARA DE JUEGO con teclado real. Pantera (NMG): llegar andando a su
// recuadro y pulsar E; Aissa/Juseph (descanso alto de TRATRATRA): fixture declarada «puente alcanzado» + posición en el
// recuadro. Mide: gesto Talk activo, ANMI y NPC dentro del encuadre (cabezas proyectadas con margen), sin solaparse,
// vuelta al reposo al terminar y control devuelto.  → captures/v3/P2/NPC/talk.json + talk.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P2/NPC', 'talk', { method: 'teclado real (W/E); fixture de posición declarada; encuadre = cabezas proyectadas por la cámara de juego dentro de |x|,|y| ≤ 0,85 NDC' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const shots = [];
const frame = (ids) => page.evaluate((ids) => {
  const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam;
  const head = (root) => { let h = null; root.traverse((o) => { if (o.isBone && /Head$/.test(o.name) && !h) h = o; }); return h.getWorldPosition(new T.Vector3()); };
  const pts = { ANMI: head(g.visual.model) };
  for (const id of ids) pts[id] = head(g.npcs.get(id)[0].model);
  const ndc = {}; for (const [k, p] of Object.entries(pts)) { const v = p.clone().project(cam); ndc[k] = [+v.x.toFixed(2), +v.y.toFixed(2), v.z < 1]; }
  const gap = Object.fromEntries(ids.map((id) => [id, +g.skater.footPos.distanceTo(g.npcs.get(id)[0].root.position).toFixed(2)]));
  const acts = Object.fromEntries(ids.map((id) => { const a = g.npcs.get(id)[0]; return [id, [...a.actions].find(([, x]) => x === a.current)?.[0]]; }));
  const dlg = document.getElementById('dialog');
  return { ndc, gap, acts, dialog: dlg && !dlg.hidden ? dlg.textContent.trim().slice(0, 80) : null, mode: g.mode, frozen: g.skater.frozen, camMode: g.rig.mode };
}, ids);
const inFrame = (f) => Object.values(f.ndc).every(([x, y, front]) => front && Math.abs(x) <= 0.85 && Math.abs(y) <= 0.85);
try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });

  // ---- Pantera
  await page.evaluate(async () => {
    const g = window.__bk, T = window.__bkTHREE; await g.loadNpc('la_pantera');
    const n = g.manifest.get('npc.la_pantera'); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading));
    g.skater.teleport(n.pos.clone().addScaledVector(d, 4.0), n.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear();
  });
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  const offer = await page.waitForFunction(() => !document.getElementById('prompt').hidden && /HABLAR/.test(document.getElementById('btn-action').textContent), { timeout: 4000 }).then(() => true).catch(() => false);
  R.check(offer, 'Pantera: andando a su recuadro aparece HABLAR', 'input');
  await page.keyboard.press('KeyE'); await sleep(900);
  let f = await frame(['la_pantera']);
  shots.push(await page.screenshot({ type: 'jpeg', quality: 75 }));
  R.check(f.acts.la_pantera === 'Talk' && !!f.dialog, 'Pantera: gesto Talk y diálogo «fuuuuck...»', 'input', f);
  R.check(inFrame(f), 'Pantera: ANMI y Pantera dentro del encuadre de la cámara de juego', 'input', f);
  R.check(f.gap.la_pantera >= 0.7, 'Pantera: sin solaparse (pies a ≥0,7 m)', 'input', f);
  await sleep(3800);
  f = await frame(['la_pantera']);
  R.check(f.acts.la_pantera === 'Idle' && f.mode === 'explore' && !f.frozen, 'Pantera: vuelve al reposo y se devuelve el control', 'input', f);

  // ---- Aissa y Juseph
  await page.evaluate(async () => {
    const g = window.__bk; await g.loadNpc('aissa'); await g.loadNpc('juseph');
    g.state.p.bridgeReached = true;   // fixture declarada: el descanso alto ya se alcanzó (la subida se prueba en ACT-04)
    const z = g.park.zones.get('act.bridgeTalk'), mid = g.manifest.get('npc.aissa').pos.clone().lerp(g.manifest.get('npc.juseph').pos, 0.5);
    const p = z.pos.clone().lerp(mid, 0.15); p.y = z.pos.y;
    g.skater.teleport(p, Math.atan2(mid.x - p.x, mid.z - p.z), 'walk'); g.rig.snapBehind(g.skater); g.input.clear();
  });
  await sleep(600);
  const offer2 = await page.waitForFunction(() => !document.getElementById('prompt').hidden && /HABLAR/.test(document.getElementById('btn-action').textContent), { timeout: 4000 }).then(() => true).catch(() => false);
  R.check(offer2, 'Aissa/Juseph: en el descanso alto aparece HABLAR', 'input');
  await page.keyboard.press('KeyE'); await sleep(1000);
  f = await frame(['aissa', 'juseph']);
  shots.push(await page.screenshot({ type: 'jpeg', quality: 75 }));
  R.check(f.acts.aissa === 'Talk' && f.acts.juseph === 'Talk' && !!f.dialog, 'Aissa/Juseph: gesto Talk y diálogo', 'input', f);
  R.check(inFrame(f), 'Aissa/Juseph: ANMI y ambos dentro del encuadre', 'input', f);
  R.check(f.gap.aissa >= 0.7 && f.gap.juseph >= 0.7, 'Aissa/Juseph: sin solaparse (≥0,7 m)', 'input', f);
  await sleep(4200);
  f = await frame(['aissa', 'juseph']);
  R.check(f.acts.aissa === 'Idle' && f.acts.juseph === 'Idle' && f.mode === 'explore' && !f.frozen, 'Aissa/Juseph: vuelven al reposo y se devuelve el control', 'input', f);

  const W = 450, H = 310; const tiles = await Promise.all(shots.map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: i * W, top: 0 }))).jpeg({ quality: 80 }).toFile(path.join(R.dir, 'talk.jpg'));
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
