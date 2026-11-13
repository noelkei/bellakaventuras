// EXT-02: grind 50-50 con TECLADO REAL sobre el rail opcional del perímetro (esquina 315°). Fixture declarada: posición
// de salida (ancla rail.approach, o una salida cruzada a 60° para G4) y, en G5, una losa de prueba entre cuerpo y rail.
//   G1 EXTRA mantenido + ollie → enganche → deslizar → salida por el extremo
//   G2 enganche → SALTO a mitad de rail (salida con ollie)     G3 enganche → soltar EXTRA
//   G4 cruzar el rail a 60° de su eje con EXTRA → sin enganche   G5 losa entre cuerpo y rail → sin enganche (grind-blocked)
// Mide distancia de enganche (lateral/vertical en el instante del cambio a grind), velocidad conservada, altura de la
// tabla (plano de ruedas) respecto a la parte alta del rail durante el deslizamiento y motivo de salida.
//   node tools/v3/grind.mjs → captures/v3/P5/EXT-02/grind.json + G1.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P5/EXT-02', 'grind', { method: 'teclado real; fixture = posición de salida declarada (y caja de prueba en G5); enganche medido en setLoco("grind")' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const down = (k) => page.keyboard.down(k), up = (k) => page.keyboard.up(k), press = (k) => page.keyboard.press(k);

async function setup(mode) {
  await page.evaluate((mode) => {
    const g = window.__bk, T = window.__bkTHREE, s = g.skater, r = g.park.rails.find((x) => x.name === 'grind_rail');
    const u = r.b.clone().sub(r.a).setY(0).normalize(), L = r.b.clone().sub(r.a).setY(0).length();
    let p, h;
    if (mode === 'cross') {   // salida cruzada: 60° respecto al eje, apuntando al centro del rail
      const mid = r.a.clone().addScaledVector(u, L / 2); const d = u.clone().applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 3);
      p = mid.clone().addScaledVector(d, -4.5); h = Math.atan2(d.x, d.z);
    } else { const a = g.manifest.get('rail.approach'); p = a.pos.clone(); h = a.heading; }
    s.teleport(p, h, 'ride'); g.rig.snapBehind(s); g.input.clear();
    window.__gr = { rows: [], catch: null, out: null, board: [], ev0: s.events.length, t0: null };
    if (!s.__wrapped) {
      const orig = s.setLoco.bind(s); s.__wrapped = true;
      s.setLoco = (l) => {
        if (l === 'grind' && window.__gr) {
          const rr = g.park.rails.find((x) => x.name === 'grind_rail'), uu = rr.b.clone().sub(rr.a).setY(0).normalize();
          const ap = s.footPos.clone().sub(rr.a); ap.y = 0;
          window.__gr.catch = { lat: +Math.abs(ap.x * uu.z - ap.z * uu.x).toFixed(3), dy: +(s.footPos.y - rr.top).toFixed(3), along: +ap.dot(uu).toFixed(2), speed: +s.speed.toFixed(2) };
        }
        return orig(l);
      };
    }
    let bone = null; g.visual.model.traverse((o) => { if (o.isBone && o.name === 'Board') bone = o; });
    clearInterval(window.__grIv);
    window.__grIv = setInterval(() => {
      if (s.loco === 'grind') {
        window.__gr.t0 ??= performance.now();
        const w = bone.getWorldPosition(new T.Vector3());
        // la pose pasa de aire (tabla recogida) a grind en ~0,15 s: la altura se mide desde 0,2 s tras el enganche
        if (performance.now() - window.__gr.t0 > 200) window.__gr.board.push(+(w.y - 0.07 - r.top).toFixed(3));
        window.__gr.rows.push(+s.speed.toFixed(2));
      }
    }, 16);
  }, mode);
  await sleep(300);
}
const state = () => page.evaluate(() => { const s = window.__bk.skater; return { loco: s.loco, speed: +s.speed.toFixed(2), ev: s.events.slice(window.__gr?.ev0 ?? -10).map((e) => e.e), gr: window.__gr }; });
const railStartDist = () => page.evaluate(() => { const g = window.__bk, r = g.park.rails.find((x) => x.name === 'grind_rail'), p = g.skater.footPos; return Math.hypot(p.x - r.a.x, p.z - r.a.z); });
const out = (st) => st.ev.find((e) => e.startsWith('grind-out:'));   // primera salida de este intento
async function approach(jumpAt = 1.3) {
  await down('KeyF'); await down('KeyW');
  const t0 = Date.now(); while (Date.now() - t0 < 5000) { if ((await railStartDist()) < jumpAt) break; await sleep(10); }
  await press('Space'); await up('KeyW');
}

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  const res = {};

  // G1
  await setup('rail');
  const film = (async () => { const shots = []; for (let i = 0; i < 18; i++) { shots.push(await page.screenshot({ type: 'jpeg', quality: 70 })); await sleep(70); } return shots; })();
  await approach(); await sleep(2200); await up('KeyF');
  let st = await state(); res.G1 = st;
  const shots = await film;
  const W = 300, H = 207; const tiles = await Promise.all(shots.slice(0, 16).map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * 8, height: H * 2, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * W, top: Math.floor(i / 8) * H }))).jpeg({ quality: 78 }).toFile(path.join(R.dir, 'G1.jpg'));
  const c1 = st.gr.catch, b1 = st.gr.board;
  R.check(!!c1 && c1.lat <= 0.32 && c1.dy <= 0.32 && c1.dy >= -0.22, 'G1: EXTRA + ollie engancha dentro de la ventana (≤0,32 m; sin teletransporte)', 'input', c1);
  R.check(out(st) === 'grind-out:fin' && st.loco === 'ride', 'G1: desliza y sale por el extremo rodando', 'input', { out: out(st), loco: st.loco, ev: st.ev });
  R.check(b1.length > 10 && Math.min(...b1) >= -0.09 && Math.max(...b1) <= 0.03, 'G1: plano de ruedas a −9…+3 cm de la parte alta del rail (trucks sobre el rail, sin atravesarlo)', 'input', { n: b1.length, min: Math.min(...b1), max: Math.max(...b1) });
  R.check(st.gr.rows.length > 5 && st.gr.rows[st.gr.rows.length - 1] >= st.gr.rows[0] - 1.5, 'G1: conserva velocidad tangencial con pérdida acotada', 'input', { first: st.gr.rows[0], last: st.gr.rows[st.gr.rows.length - 1] });

  // G2: salto a mitad
  await setup('rail'); await approach();
  await page.waitForFunction(() => window.__bk.skater.loco === 'grind', { timeout: 3000 }).catch(() => {});
  await sleep(250); await up('KeyF'); await press('Space'); await sleep(1200);
  st = await state(); res.G2 = st;
  R.check(out(st) === 'grind-out:ollie', 'G2: SALTO a mitad de rail sale con ollie', 'input', { out: out(st), ev: st.ev });

  // G3: soltar EXTRA
  await setup('rail'); await approach();
  await page.waitForFunction(() => window.__bk.skater.loco === 'grind', { timeout: 3000 }).catch(() => {});
  await sleep(250); await up('KeyF'); await sleep(1000);
  st = await state(); res.G3 = st;
  R.check(out(st) === 'grind-out:soltar' && st.loco !== 'bail', 'G3: soltar EXTRA termina el grind sin quedarse pegado ni caer', 'input', { out: out(st), loco: st.loco, ev: st.ev });

  // G4: cruce a 60°
  await setup('cross');
  await down('KeyF'); await down('KeyW');
  const mid = () => page.evaluate(() => { const g = window.__bk, r = g.park.rails.find((x) => x.name === 'grind_rail'), m = r.a.clone().add(r.b).multiplyScalar(0.5), p = g.skater.footPos; return Math.hypot(p.x - m.x, p.z - m.z); });
  { const t0 = Date.now(); while (Date.now() - t0 < 5000) { if ((await mid()) < 1.4) break; await sleep(10); } }
  await press('Space'); await up('KeyW'); await sleep(1300); await up('KeyF');
  st = await state(); res.G4 = st;
  R.check(!st.gr.catch && !st.ev.some((e) => e.startsWith('grind-out')), 'G4: cruzar el rail a 60° de su eje no engancha', 'input', { catch: st.gr.catch, ev: st.ev, loco: st.loco });

  // G5: obstáculo entre cuerpo y rail
  await setup('rail');
  await page.evaluate(() => {
    const g = window.__bk, RAPIER = window.__bkRapier, r = g.park.rails.find((x) => x.name === 'grind_rail');
    const u = r.b.clone().sub(r.a).setY(0).normalize();
    const c = r.a.clone().addScaledVector(u, 1.6);
    // losa fina 17 cm por encima del rail en su primer tramo: el rayo cuerpo→rail la atraviesa en la ventana de enganche
    const yaw = Math.atan2(u.x, u.z);
    const desc = RAPIER.ColliderDesc.cuboid(0.25, 0.02, 1.2).setTranslation(c.x, r.top + 0.17, c.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    window.__testWall = g.world.createCollider(desc);
  });
  await approach();
  await sleep(1500); await up('KeyF');
  st = await state(); res.G5 = st;
  await page.evaluate(() => { window.__bk.world.removeCollider(window.__testWall, false); });
  R.check(!st.gr.catch || st.ev.includes('grind-blocked'), 'G5: con una losa entre el cuerpo y el rail no hay enganche', 'input', { catch: st.gr.catch, ev: st.ev });
  R.data.runs = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { catch: v.gr?.catch, out: out(v), loco: v.loco, ev: v.ev }]));
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
