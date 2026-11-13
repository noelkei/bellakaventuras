// ANIM-06 / ACT-05: batalla de baile con teclado real. Entra por la zona a pie, juega las tres rondas con flechas y mide:
// guardado al acertar, celebración ENTERA (duración en tiempo de simulación frente al clip), salto de celebración,
// salida a mitad del baile final sin perder el premio ni dejar entrada de baile activa, vuelta a andar con la tabla;
// durante toda la sesión, cuerpo deformado sobre el suelo y ANMI de cara a la cámara.
//   node tools/v3/dance.mjs → captures/v3/P2/ANIM-06/dance.json + dance.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P2/ANIM-06', 'dance', { method: 'teclado real (flechas/E/W) sobre la actividad; fixture: posición declarada a 3 m de la zona; tiempos en reloj de simulación; suelo = vértice más bajo del cuerpo skinned respecto a la raíz cada ~0,1 s' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const shots = [];
const shot = async (label) => shots.push({ label, buf: await page.screenshot({ type: 'jpeg', quality: 72 }) });
const st = () => page.evaluate(() => {
  const g = window.__bk, v = g.visual;
  return { clock: +g.clock.toFixed(3), clip: v.currentName, round: document.getElementById('dance-round')?.textContent, msg: document.getElementById('dance-msg')?.textContent,
    overlay: !document.getElementById('dance').hidden, frozen: g.skater.frozen, mode: g.mode, partial: g.state.p.partials.danceRounds, done: !!g.state.p.activities.danceCombo,
    saved: (() => { try { const p = JSON.parse(localStorage.getItem('bellakaventuras.remake.save')); return { partial: p?.partials?.danceRounds ?? null, done: !!p?.activities?.danceCombo }; } catch { return null; } })(),
    pos: g.skater.footPos.toArray().map((x) => +x.toFixed(2)), loco: g.skater.loco };
});
const press = async (k, gap = 220) => { await page.keyboard.press(k); await sleep(gap); };
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const SEQS = [['up', 'right', 'up'], ['left', 'down', 'right'], ['up', 'left', 'down']];
const waitFor = async (fn, ms, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await sleep(step); } return null; };

try {
  await clickStart(page);
  await page.evaluate(() => {
    document.getElementById('hint').hidden = true;
    const g = window.__bk, T = window.__bkTHREE, v = g.visual;
    const c = g.manifest.get('dance.center');
    // fixture declarada: a pie, 3 m antes del centro de la pista, mirando hacia él
    const dir = new T.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
    g.skater.teleport(c.pos.clone().addScaledVector(dir, 3.0), c.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear();
    // monitor: suelo y orientación hacia la cámara durante la sesión de baile
    let body = null; v.model.traverse((o) => { if (o.isSkinnedMesh && /ANMI_BODY/.test(o.name)) body = o; });
    const hips = []; v.model.traverse((o) => { if (o.isBone && o.name === 'mixamorigHips') hips.push(o); });
    const P = new T.Vector3(), Q = new T.Quaternion();
    const mon = window.__danceMon = { rows: [] };
    setInterval(() => {
      if (document.getElementById('dance').hidden || !body) return;
      v.model.updateMatrixWorld(true); body.skeleton.update();
      let low = Infinity; const n = body.geometry.attributes.position.count;
      let li = -1; for (let i = 0; i < n; i += 2) { body.getVertexPosition(i, P); P.applyMatrix4(body.matrixWorld); if (P.y < low) { low = P.y; li = i; } }
      const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight; let bi = 0, bw = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(li, k) > bw) { bw = sw.getComponent(li, k); bi = si.getComponent(li, k); }
      const lowBone = body.skeleton.bones[bi]?.name;
      const ground = v.root.position.y;   // la raíz visual está en el apoyo (pista elevada 6 cm)
      hips[0].getWorldQuaternion(Q); const f = new T.Vector3(0, 0, 1).applyQuaternion(Q); f.y = 0; f.normalize();
      const toCam = g.rig.cam.position.clone().sub(v.root.position); toCam.y = 0; toCam.normalize();
      const mix = [...v.actions].filter(([, a]) => a.isRunning() && a.getEffectiveWeight() > 0.05).map(([n, a]) => `${n}:${a.getEffectiveWeight().toFixed(2)}`).join(' ');
      mon.rows.push({ t: +g.clock.toFixed(2), clip: v.currentName, mix, lowBone, lowMm: +((low - ground) * 1000).toFixed(1), faceDeg: +(Math.acos(Math.max(-1, Math.min(1, f.dot(toCam)))) * 180 / Math.PI).toFixed(0) });
    }, 100);
  });
  await page.keyboard.down('KeyW'); await sleep(1300); await page.keyboard.up('KeyW');
  const offer = await page.waitForFunction(() => /BAILAR/.test((document.getElementById('prompt')?.hidden ? '' : document.getElementById('btn-action')?.textContent ?? '')), { timeout: 4000 }).then(() => true).catch(() => false);
  R.check(offer, 'andando hasta la pista aparece la acción BAILAR', 'input', await st());
  await press('KeyE', 600);
  let s = await st();
  R.check(s.overlay && s.frozen && s.clip === 'Step_Hip_Hop_Dance', 'E abre la batalla: interfaz, jugador fijo y baile de espera', 'input', s);
  const parked = await page.evaluate(() => { const g = window.__bk; const a = g.manifest.get('board.park'); return { deckVisible: !!g.visual.deck?.visible, prop: a.pos.distanceTo(g.skater.footPos) }; });
  R.check(!parked.deckVisible && parked.prop > 1.5, 'tabla aparcada fuera del paso (≥1,5 m) y no en el cuerpo', 'input', parked);
  await sleep(800); await shot('espera');

  // ronda 1: celebración entera
  for (const k of SEQS[0]) await press(KEY[k]);
  s = await st();
  R.check(s.partial === 1 && s.saved?.partial === 1, 'ronda 1: se guarda al acertar (antes de la celebración)', 'input', s);
  R.check(s.clip === 'Hip_Hop_Dance_1', 'ronda 1: suena su baile de celebración', 'input', s);
  const t1 = s.clock; await sleep(1500); await shot('celebración ronda 1');
  const meta = await page.evaluate(() => Object.fromEntries(['Hip_Hop_Dance_1', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_3', 'FunnyDancing_02'].map((n) => [n, window.__bk.visual.meta[n]?.seconds])));
  s = await waitFor((x) => x.clip === 'Step_Hip_Hop_Dance' && x.round === '2', 12000);
  R.check(!!s && Math.abs(s.clock - t1 - (meta.Hip_Hop_Dance_1 - 0.25)) < 0.35, `ronda 1: la celebración dura el clip entero (${meta.Hip_Hop_Dance_1} s) antes de la ronda 2`, 'input', { elapsed: s && +(s.clock - t1).toFixed(2), clip: meta.Hip_Hop_Dance_1 });

  // ronda 2: celebración saltada con una flecha
  for (const k of SEQS[1]) await press(KEY[k]);
  await sleep(900);
  s = await st(); const before = s.clip;
  await press('ArrowUp', 300);
  s = await st();
  R.check(before === 'Hip_Hop_Dance_2' && s.round === '3' && s.partial === 2, 'ronda 2: una flecha durante la celebración la salta y pasa a la ronda 3 (ronda guardada)', 'input', { before, after: s });
  await sleep(400);

  // ronda 3: completar y salir a mitad del baile final
  for (const k of SEQS[2]) await press(KEY[k]);
  s = await st();
  R.check(s.done && s.saved?.done && s.clip === 'FunnyDancing_02', 'ronda 3: combo completo guardado y baile final', 'input', s);
  await sleep(1800); await shot('final');
  await page.click('#dance-exit'); await sleep(500);
  s = await st();
  R.check(!s.overlay && !s.frozen && s.done && s.saved?.done, 'salir a mitad del baile final: interfaz cerrada, control devuelto y premio conservado', 'input', s);
  await press('ArrowLeft', 200); await press('ArrowDown', 300);
  const s2 = await st();
  R.check(!s2.overlay && s2.partial === s.partial && s2.done, 'las flechas ya no actúan sobre el baile tras salir', 'input', s2);
  const p0 = s2.pos; await page.keyboard.down('KeyW'); await sleep(1200); await shot('andar tras salir'); await page.keyboard.up('KeyW'); await sleep(300);
  s = await st();
  const moved = Math.hypot(s.pos[0] - p0[0], s.pos[2] - p0[2]);
  const deck = await page.evaluate(() => !window.__bk.visual['boardHidden']);
  R.check(moved > 0.8 && deck, 'tras el baile se anda con la tabla de vuelta', 'input', { moved: +moved.toFixed(2), clip: s.clip, loco: s.loco, deck });

  // repetición: final entero sin salir (celebraciones 1–2 saltadas)
  await page.evaluate(() => { const g = window.__bk, c = g.manifest.get('dance.center'); g.skater.teleport(c.pos.clone(), c.heading, 'walk'); g.input.clear(); });
  await sleep(500);
  const again = await page.waitForFunction(() => /BAILAR OTRA VEZ/.test(document.body.innerText), { timeout: 4000 }).then(() => true).catch(() => false);
  await press('KeyE', 600);
  for (let r = 0; r < 2; r++) { for (const k of SEQS[r]) await press(KEY[k]); await sleep(600); await press('ArrowUp', 400); }
  for (const k of SEQS[2]) await press(KEY[k]);
  const tf = (await st()).clock;
  s = await waitFor((x) => !x.overlay, 15000, 100);
  R.check(again && !!s && Math.abs(s.clock - tf - (meta.FunnyDancing_02 - 0.25)) < 0.4 && !s.frozen, `repetición: el baile final se ve entero (${meta.FunnyDancing_02} s) y devuelve el control`, 'input', { again, elapsed: s && +(s.clock - tf).toFixed(2) });

  const rows = await page.evaluate(() => window.__danceMon.rows);
  const byClip = {};
  for (const r of rows) { const b = byClip[r.clip] ??= { n: 0, lowMinMm: Infinity, faceMaxDeg: 0, faceMeanDeg: 0 }; b.n++; b.lowMinMm = Math.min(b.lowMinMm, r.lowMm); b.faceMaxDeg = Math.max(b.faceMaxDeg, r.faceDeg); b.faceMeanDeg += r.faceDeg; }
  for (const b of Object.values(byClip)) b.faceMeanDeg = +(b.faceMeanDeg / b.n).toFixed(0);
  R.data.monitor = byClip;
  R.data.lowSamples = rows.filter((r) => r.lowMm < -10);
  for (const [clip, b] of Object.entries(byClip)) {
    R.check(b.lowMinMm >= -15, `${clip}: el cuerpo no atraviesa la pista (mín ≥ −15 mm; muestreo de 1 de cada 2 vértices)`, 'input', b);
    R.check(b.faceMeanDeg <= 45, `${clip}: de cara a la cámara/público (media ≤45°)`, 'input', b);
  }
  const W = 450, H = 310; const tiles = await Promise.all(shots.map((x) => sharp(x.buf).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: i * W, top: 0 }))).jpeg({ quality: 80 }).toFile(path.join(R.dir, 'dance.jpg'));
  R.data.shots = shots.map((x) => x.label);
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
