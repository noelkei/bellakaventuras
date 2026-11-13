// ANIM-04: mezclas y continuidad en el RUNTIME con teclado real. Durante cada secuencia se muestrea en cada RAF la
// orientación mundial de huesos clave y se registra el mayor salto angular entre fotogramas consecutivos (normalizado a
// 60 Hz), junto con los clips activos y capturas cada ~0,25 s.  node tools/v3/anim-blends.mjs [--only a,b]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const R = new Report('P2/ANIM-04', 'blends', { method: 'teclado real + RAF; muestreo por fotograma de cuaterniones mundiales de Board/brazos/cadera/torso; fixture de posición declarada', limitDegPerFrame60: { Board: 35, arms: 30, Hips: 18, Spine2: 18, boardDuringBoardFlip: '1,25 × pico esperado del giro (360°·1,5/(ventana·dur))' } });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
await clickStart(page);
await page.evaluate(() => {
  document.getElementById('hint').hidden = true;
  const g = window.__bk, T = window.__bkTHREE, v = g.visual;
  const bones = {}; v.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const watch = { Board: bones.Board, ArmR: bones.mixamorigRightArm, ArmL: bones.mixamorigLeftArm, ForeR: bones.mixamorigRightForeArm, Hips: bones.mixamorigHips, Spine2: bones.mixamorigSpine2 };
  const rec = window.__rec = { on: false, rows: [], last: null, lastT: 0 };
  const q = new T.Quaternion(), rootInv = new T.Quaternion();
  const orig = g.present.bind(g);
  g.present = (dt) => {
    orig(dt);
    if (!rec.on) return;
    // orientación relativa a la raíz del jugador: el giro de rumbo (que es del controlador) no cuenta como salto de pose
    v.root.getWorldQuaternion(rootInv); rootInv.invert();
    const cur = {}; for (const [k, b] of Object.entries(watch)) { b.getWorldQuaternion(q); cur[k] = rootInv.clone().multiply(q); }
    const t = performance.now();
    if (rec.last) {
      const k60 = Math.max(1e-3, (t - rec.lastT) / (1000 / 60));
      const d = {}; for (const k of Object.keys(watch)) d[k] = +(cur[k].angleTo(rec.last[k]) * 180 / Math.PI / k60).toFixed(1);
      const tr = g.skater.trick;
      // giro de tabla buscado (kickflip/heelflip): pico de la curva ease (×1,5) en la ventana de liberación del clip
      const rel = v.meta?.SK_FlipKick?.release ?? [0.23, 0.85];
      const bfx = tr && (tr.kind === 'kickflip' || tr.kind === 'heelflip') ? +(360 * 1.5 / ((rel[1] - rel[0]) * tr.dur) / 60).toFixed(1) : 0;
      rec.rows.push({ t: +g.clock.toFixed(3), st: g.skater.state, clip: v.currentName, trick: tr?.kind ?? null, d, bfx });
    }
    rec.last = cur; rec.lastT = t;
  };
});
const place = (x, z, h, loco) => page.evaluate(({ x, z, h, loco }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(x, 0, z), h, loco); g.rig.snapBehind(g.skater); g.input.clear(); window.__rec.last = null; }, { x, z, h, loco });
const startRec = () => page.evaluate(() => { window.__rec.on = true; window.__rec.rows = []; window.__rec.last = null; });
const stopRec = () => page.evaluate(() => { window.__rec.on = false; return window.__rec.rows; });
const flat = await page.evaluate(() => { const S = window.__bk.park.sector('no_me_guillo'); const p = S.P(44, -10); return { x: p.x, z: p.z, h: S.ccw(-10) + Math.PI }; });
const shots = {};
async function seq(name, fn, needTricks = []) {
  if (only && !only.includes(name)) return;
  await place(flat.x, flat.z, flat.h, name.startsWith('walk') ? 'walk' : 'ride');
  await sleep(300);
  await startRec();
  shots[name] = [];
  const t0 = Date.now(); let busy = true;
  const shooter = (async () => { while (busy) { shots[name].push(await page.screenshot({ type: 'jpeg', quality: 70 })); await sleep(220); } })();
  await fn();
  busy = false; await shooter;
  const rows = await stopRec();
  const lim = { Board: 35, ArmR: 30, ArmL: 30, ForeR: 30, Hips: 18, Spine2: 18 };
  // exceso sobre el límite de cada fila: la tabla durante un flip de tabla se juzga contra 1,25 × su giro esperado
  const limOf = (k, r) => (k === 'Board' && r.bfx ? Math.max(lim.Board, r.bfx * 1.25) : lim[k]);
  const worst = {}; for (const k of Object.keys(lim)) { let w = { v: 0, over: -Infinity }; for (const r of rows) { const o = r.d[k] - limOf(k, r); if (o > w.over) w = { v: r.d[k], lim: +limOf(k, r).toFixed(1), over: o, t: r.t, st: r.st, clip: r.clip, trick: r.trick }; } worst[k] = w; }
  const bad = Object.entries(worst).filter(([, w]) => w.over > 0);
  const tricks = [...new Set(rows.map((r) => r.trick).filter(Boolean))];
  if (needTricks.length) R.check(needTricks.every((k) => tricks.includes(k)), `${name}: se ejecutan ${needTricks.join(' y ')} con teclado real`, 'input', { tricks });
  R.check(!bad.length, `${name}: sin saltos de pose entre fotogramas (límites/60 Hz: tabla 35°, brazos 30°, cadera/torso 18°)`, 'input', { worst, frames: rows.length, states: [...new Set(rows.map((r) => r.st))], tricks, clips: [...new Set(rows.map((r) => r.clip))], ms: Date.now() - t0 });
  const W = 300, H = 207; const fr = shots[name].slice(0, 24);
  const tiles = await Promise.all(fr.map((f) => sharp(f).resize(W, H).toBuffer()));
  const cols = 8, rws = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: W * cols, height: H * rws, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).jpeg({ quality: 80 }).toFile(path.join(R.dir, `${name}.jpg`));
}
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); };

try {
  await seq('ride-loop', async () => { await hold(['KeyW'], 2600); await hold(['KeyW', 'KeyA'], 1100); await hold(['KeyW', 'KeyD'], 1100); await hold(['KeyS'], 900); await sleep(900); });
  await seq('ollie-flip-land', async () => {
    // kickflip (sin dirección) y heelflip (derecha) de tabla en llano; los flips de cuerpo no caben en el aire de un ollie
    await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW');
    await page.keyboard.press('Space'); await sleep(140); await page.keyboard.press('Space'); await sleep(1300);
    await page.keyboard.press('Space'); await sleep(110); await page.keyboard.down('KeyD'); await sleep(50); await page.keyboard.press('Space'); await sleep(120); await page.keyboard.up('KeyD'); await sleep(1300);
  }, ['kickflip', 'heelflip']);
  await seq('crouch-scoot', async () => { await page.keyboard.down('KeyC'); await hold(['KeyW'], 2200); await page.keyboard.up('KeyC'); await hold(['KeyW'], 1200); });
  await seq('walk-mount-dismount', async () => { await hold(['KeyW'], 200); await sleep(500); await hold(['KeyW'], 2600); await sleep(2600); });
  await seq('brake-dismount', async () => { await hold(['KeyW'], 2400); await hold(['KeyS'], 1600); await sleep(1600); });
  await seq('manual', async () => { await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.down('KeyF'); await sleep(1500); await page.keyboard.up('KeyF'); await sleep(700); await page.keyboard.up('KeyW'); });
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
