// Auditoría de jugabilidad y animación (v2 → v3): sondas medibles sobre el runtime real.
//   node tools/audit.mjs [--url http://localhost:5173/] [--only nombre,nombre]   → captures/audit/*.json, *.png
// Cada sonda devuelve números (no OK/FALLO): la interpretación va en Auditoría 3/05_AUDITORIA_….md
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'audit');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({ width: 960, height: 640 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.removeItem('bellakaventuras.remake.save'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE; document.getElementById('start').hidden = true; g.start(); g.autoMode = true; document.getElementById('hint').hidden = true;
  const A = window.__a = {};
  A.tp = (p, h) => { g.skater.teleport(p.clone(), h); g.rig.snapBehind(g.skater); };
  A.step = async (wish, n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { g.autoWish = wish; g.clock += dt; g.fixedUpdate(dt); g.update(dt); } };
  A.dirW = (h, m = 1) => new T.Vector2(Math.sin(h) * m, Math.cos(h) * m);
  A.bones = {}; g.visual.model.traverse((o) => { if (o.isBone) A.bones[o.name] = o; });
  A.flat = new T.Vector3(-14, 0, 0); // centro sellado: llano y vacío
});
const results = {};
async function probe(name, fn) {
  if (only && !only.includes(name)) return;
  try { results[name] = await page.evaluate(fn); } catch (e) { results[name] = { error: String(e) }; }
  console.log(name.padEnd(18), JSON.stringify(results[name]).slice(0, 400));
}

// 1. Temblor: posición visual a 120 Hz de pantalla con física fija a 60 Hz (sin interpolación) y en 60 Hz
await probe('judder', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater;
  const run = async (hz) => {
    A.tp(A.flat, Math.PI / 2); for (let i = 0; i < 120; i++) { g.autoWish = new T.Vector2(1, 0); g.fixedUpdate(1 / 60); g.update(1 / 60); }
    const dt = 1 / hz; let acc = 0; const xs = []; const tilt = []; let last = g.visual.root.position.x;
    for (let f = 0; f < hz * 2; f++) {
      g.autoWish = new T.Vector2(1, 0); acc += dt; while (acc >= 1 / 60) { g.fixedUpdate(1 / 60); acc -= 1 / 60; }
      g.update(dt); const x = g.visual.root.position.x; xs.push(x - last); last = x;
      const up = new T.Vector3(0, 1, 0).applyQuaternion(g.visual.root.quaternion); tilt.push(Math.acos(Math.min(1, up.y)) * 180 / Math.PI);
    }
    const zero = xs.filter((d) => Math.abs(d) < 1e-6).length; const mean = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return { hz, framesSinMovimiento: zero, de: xs.length, cvPaso: +(sd / mean).toFixed(2), inclinacionMaxDeg: +Math.max(...tilt).toFixed(2), velocidad: +s.speed.toFixed(2) };
  };
  return [await run(60), await run(120), await run(144)];
});

// 2. Suspensión de 3 cm: holgura del controlador (offset del KCC) entre ruedas y suelo
await probe('hover', async () => {
  const g = window.__bk, A = window.__a; A.tp(A.flat, 0); await A.step(null, 30);
  const s = g.skater; const deck = A.bones.Board.getWorldPosition(new window.__bkTHREE.Vector3());
  return { footY: +s.footPos.y.toFixed(3), visualY: +g.visual.root.position.y.toFixed(3), boardBoneY: +deck.y.toFixed(3), sueloY: 0 };
});

// 3. Giro en el sitio y orientación: desde parado, pedir 90° y 180° durante 1,5 s
await probe('turnInPlace', async () => {
  const g = window.__bk, A = window.__a; const s = g.skater; const out = [];
  for (const deg of [90, 180]) {
    A.tp(A.flat, 0); await A.step(null, 10);
    const p0 = s.footPos.clone(), h0 = s.heading; const target = h0 + deg * Math.PI / 180;
    let tReach = null; for (let i = 0; i < 90; i++) { await A.step(A.dirW(target)); if (tReach === null && Math.abs(((s.heading - target + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.1) tReach = i / 60; }
    out.push({ pedido: deg, desplazamientoM: +s.footPos.distanceTo(p0).toFixed(2), tiempoEnOrientarseS: tReach, velocidadFinal: +s.speed.toFixed(2) });
  }
  return out;
});

// 4. Frenado y rodadura: soltar a velocidad de crucero; tirar hacia atrás (exacto y a 120°)
await probe('braking', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = {};
  const prep = async () => { A.tp(new T.Vector3(-150, 0, 0), Math.PI / 2); for (let i = 0; i < 240; i++) await A.step(A.dirW(Math.PI / 2)); return s.footPos.clone(); };
  // fuera de la valla del parque no hay obstáculos en x<−52… usar el borde: medir en el propio llano grande de la losa (−56…56) en diagonal larga
  const lane = async (wishFn, maxS) => { const p0 = s.footPos.clone(), v0 = s.speed; let t = 0; while (s.speed > 0.1 && t < maxS) { await A.step(wishFn()); t += 1 / 60; } return { v0: +v0.toFixed(1), distanciaM: +s.footPos.distanceTo(p0).toFixed(1), tiempoS: +t.toFixed(1), vFinal: +s.speed.toFixed(2) }; };
  // usar el cálculo analítico además de la simulación limitada por el espacio (el centro mide 44 m)
  const T0 = 0.32, low = 1.6;
  out.soltarAnalitico = { de74a25_m: +((7.4 ** 2 - 2.5 ** 2) / (2 * T0)).toFixed(1), de25a0_m: +((2.5 ** 2) / (2 * (T0 + low))).toFixed(1) };
  A.tp(new T.Vector3(-20, 0, 0), Math.PI / 2); for (let i = 0; i < 150; i++) await A.step(A.dirW(Math.PI / 2));
  out.soltar4s = await lane(() => null, 4);
  A.tp(new T.Vector3(-20, 0, 0), Math.PI / 2); for (let i = 0; i < 150; i++) await A.step(A.dirW(Math.PI / 2));
  out.atrasExacto = await lane(() => A.dirW(-Math.PI / 2), 4);
  A.tp(new T.Vector3(-20, 0, 0), Math.PI / 2); for (let i = 0; i < 150; i++) await A.step(A.dirW(Math.PI / 2));
  out.atras120 = await lane(() => A.dirW(Math.PI / 2 + 2.1), 3);
  return out;
});

// 5. Impulso frente a rodar: % del tiempo empujando a crucero en recta y en curva continua
await probe('pushRide', async () => {
  const g = window.__bk, A = window.__a; const s = g.skater;
  const meas = async (fn, n) => { let push = 0, cycles = 0, was = false, vmax = 0; for (let i = 0; i < n; i++) { await A.step(fn(i)); if (s.pushT > 0) { push++; if (!was) cycles++; was = true; } else was = false; vmax = Math.max(vmax, s.speed); } return { empujandoPct: Math.round(push / n * 100), ciclos: cycles, vMax: +vmax.toFixed(1) }; };
  A.tp(A.flat, Math.PI / 2); await A.step(A.dirW(Math.PI / 2), 120);
  const recta = await meas(() => A.dirW(Math.PI / 2), 120);
  A.tp(new window.__bkTHREE.Vector3(-8, 0, 0), Math.PI / 2); await A.step(A.dirW(Math.PI / 2), 90);
  const curva = await meas(() => A.dirW(s.heading + 1.2), 240);
  return { rectaTrasAcelerar2s: recta, curvaContinua4s: curva };
});

// 6. Tiempo de vuelo disponible (trucos y triple backflip)
await probe('airtime', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = {};
  const fly = async () => { let t = 0, up = 0; while (!s.grounded || t < 0.05) { await A.step(s.grounded ? null : A.dirW(s.heading)); t += 1 / 60; up = Math.max(up, s.footPos.y); if (t > 5) break; } return { aireS: +t.toFixed(2), alturaMaxM: +up.toFixed(2) }; };
  A.tp(A.flat, Math.PI / 2); await A.step(A.dirW(Math.PI / 2), 120); g.input.pressJump(); await A.step(A.dirW(Math.PI / 2), 6);
  out.ollieLlano = await fly();
  const ap = g.manifest.get('trick.approach');
  A.tp(ap.pos, ap.heading); let popped = false;
  for (let i = 0; i < 400 && (s.grounded || !popped); i++) { if (!popped && s.grounded && s.footPos.y > 0.75) { g.input.pressJump(); popped = true; } await A.step(A.dirW(ap.heading)); }
  out.lanzaderaConOllie = await fly();
  g.park.setCenter(1); g.centerOpen = true;
  const ap2 = g.manifest.get('final.approach'); A.tp(ap2.pos, ap2.heading); let left = false;
  for (let i = 0; i < 400; i++) { await A.step(A.dirW(Math.PI / 2)); if (!s.grounded && s.footPos.x > -1) { left = true; break; } }
  out.superrampaSinTruco = left ? await fly() : { nota: 'no despegó' };
  A.tp(ap2.pos, ap2.heading); popped = false;
  for (let i = 0; i < 400; i++) { if (!popped && s.grounded && s.footPos.y > 1.6) { g.input.pressJump(); popped = true; } await A.step(A.dirW(Math.PI / 2)); if (popped && !s.grounded && s.footPos.x > -1) break; }
  out.superrampaConOllie = await fly();
  g.park.setCenter(0); g.centerOpen = false;
  // tiempo necesario: 3 vueltas a ~1,5 vueltas/s + 0,15 s de pop + 0,2 s de apertura/catch
  out.necesarioTripleS = +(3 / 1.5 + 0.35).toFixed(2);
  return out;
});

// 7. Activar actividades: aproximarse a crucero, soltar al entrar en la zona y ver si se queda dentro
await probe('activityStop', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = [];
  for (const id of ['act.graffiti', 'act.pantherTalk', 'act.danceCombo', 'act.skateTutorial']) {
    const z = g.park.zones.get(id); const d = z.pos.clone().setY(0).normalize();
    const from = z.pos.clone().addScaledVector(d, -9).setY(0); const h = Math.atan2(z.pos.x - from.x, z.pos.z - from.z);
    A.tp(from, h); let inside = 0, entered = false, frames = 0;
    for (let i = 0; i < 300; i++) { const dist = Math.hypot(s.footPos.x - z.pos.x, s.footPos.z - z.pos.z); const inZ = dist < z.r; if (inZ) { entered = true; inside++; } await A.step(entered ? null : A.dirW(h, 0.6)); frames++; if (entered && !inZ) break; }
    out.push({ zona: id, radio: z.r, entroAMediaMarcha: entered, tiempoDentroS: +(inside / 60).toFixed(2), salioSolo: frames < 300, velocidadAlSalir: +s.speed.toFixed(1) });
  }
  return out;
});

// 8. Cabeza y techo en el túnel (agachado): ¿atraviesa la malla el techo de 1,30?
await probe('crouchHead', async () => {
  const g = window.__bk, A = window.__a; const s = g.skater; const S = g.park.sector('nosvamosdeaqui');
  A.tp(S.P(30.2, -2), S.inward(-2)); g.input.crouchToggle = true; await A.step(null, 60);
  const max = ['mixamorigHeadTop_End', 'mixamorigHead'].map((n) => +A.bones[n].getWorldPosition(new window.__bkTHREE.Vector3()).y.toFixed(3));
  let maxRide = 0; for (let i = 0; i < 90; i++) { await A.step(A.dirW(S.inward(-2), 0.4)); maxRide = Math.max(maxRide, A.bones.mixamorigHeadTop_End.getWorldPosition(new window.__bkTHREE.Vector3()).y); }
  g.input.crouchToggle = false; await A.step(null, 10);
  return { techo: 1.30, capsula: 1.10, cabezaTopeParado: max[0], cabezaTopeRodando: +maxRide.toFixed(3), atraviesaTecho: maxRide > 1.3 };
});

// 9. Saltos entre plataformas del puente: ventana de distancia al borde en la que el ollie sube (0,8 m)
await probe('jumpWindow', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const st = g.park.bridgeStages[0];
  const S = g.park.sector('tratratra'); const h = S.ccw(30); const res = [];
  for (const dEdge of [0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0]) {
    A.tp(S.P(29.1, 32), h); for (let i = 0; i < 200; i++) { await A.step(A.dirW(h)); }
    // posición del borde: distancia del centro de P1 menos media longitud (2,1)
    const edgeDist = () => { const c = st.c; const dx = s.footPos.x - c.x, dz = s.footPos.z - c.z; return Math.hypot(dx, dz) - 2.1; };
    A.tp(S.P(29.1, 32), h); let jumped = false;
    for (let i = 0; i < 400; i++) { if (!jumped && edgeDist() < dEdge) { g.input.pressJump(); jumped = true; } await A.step(A.dirW(h)); if (jumped && s.grounded && i > 40 && s.airTime === 0 && s.footPos.y > 0.5) break; if (jumped && s.grounded && s.footPos.y < 0.2 && i > 90) break; }
    res.push({ distanciaAlBordeM: dEdge, subio: s.footPos.y > 0.7, y: +s.footPos.y.toFixed(2), v: +s.speed.toFixed(1) });
  }
  return res;
});

// 10. Saltos en caliente: picos de rotación de cadera/torso por fotograma (mezclas bruscas) en una sesión variada
await probe('blendPops', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const bones = ['mixamorigHips', 'mixamorigSpine2', 'mixamorigLeftUpLeg', 'mixamorigRightArm', 'Board'].map((n) => A.bones[n]);
  A.tp(A.flat, Math.PI / 2); const prev = bones.map((b) => b.getWorldQuaternion(new T.Quaternion()));
  const worst = {}; const tl = [];
  const script = (i) => { if (i === 60) g.input.pressJump(); if (i === 180) g.input.crouchToggle = true; if (i === 260) g.input.crouchToggle = false; if (i === 300) g.input.pressJump(); if (i === 318) { g.input.move = { x: 0, y: 0 }; g.input.pressJump(); } return A.dirW(i < 120 ? Math.PI / 2 : s.heading + (i % 200 < 100 ? 0.9 : -0.9)); };
  for (let i = 0; i < 480; i++) {
    await A.step(script(i));
    bones.forEach((b, k) => { const q = b.getWorldQuaternion(new T.Quaternion()); const rootQ = g.visual.root.getWorldQuaternion(new T.Quaternion()).invert(); const a = q.clone().premultiply(rootQ), p = prev[k].clone().premultiply(rootQ); const ang = 2 * Math.acos(Math.min(1, Math.abs(a.dot(p)))) * 180 / Math.PI; prev[k] = q; if (!worst[b.name] || ang > worst[b.name].deg) worst[b.name] = { deg: +ang.toFixed(1), frame: i, state: s.state, anim: g.visual.currentName }; });
  }
  return worst;
});

// 11. Aterrizajes: impacto y clasificación en ollie llano y desde plataformas
await probe('landing', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = [];
  let hard = 0, imp = 0; s.onLand = (i, h) => { imp = i; hard = h; };
  A.tp(A.flat, Math.PI / 2); await A.step(A.dirW(Math.PI / 2), 120); g.input.pressJump(); for (let i = 0; i < 120; i++) await A.step(A.dirW(Math.PI / 2));
  out.push({ caso: 'ollie llano', impacto: +imp.toFixed(1), duro: hard });
  const dk = g.manifest.get('bridge.top'); A.tp(dk.pos, dk.heading + Math.PI); g.park.setBridgeOpen(true);
  for (let i = 0; i < 400; i++) { await A.step(A.dirW(Math.PI + dk.heading)); if (s.footPos.y < 0.2) break; }
  out.push({ caso: 'bajar rampa 4,2 m', impacto: +imp.toFixed(1), duro: hard });
  return out;
});

// 12. Coches: distancia mínima a ANMI mientras cruza la banda (cesión)
await probe('carsYield', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater;
  g.park.setCenter(1); g.centerOpen = true; g.cars.setActive(true);
  let minD = 99; const gate = g.park.centerGates[0].mesh.position;
  for (let rep = 0; rep < 3; rep++) { A.tp(gate.clone().multiplyScalar(1.12), Math.atan2(-gate.x, -gate.z)); for (let i = 0; i < 240; i++) { await A.step(A.dirW(Math.atan2(-gate.x, -gate.z), 0.5)); for (const c of g.cars.cars) minD = Math.min(minD, c.g.position.distanceTo(s.footPos.clone().setY(0))); } }
  g.park.setCenter(0); g.centerOpen = false; g.cars.setActive(false);
  return { distanciaMinimaCocheJugadorM: +minD.toFixed(2), envolvente: +g.cars.cars[0].envelope.toFixed(2) };
});


// 4b. Frenado medido limpio: velocidad fijada a 7,4 m/s en el centro (44 m libres) y 1,2 s de cada método
await probe('braking2', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = {};
  const run = async (label, wishFn) => { A.tp(new T.Vector3(-16, 0, 0), Math.PI / 2); s.speed = 7.4; const p0 = s.footPos.clone(); let t = 0; const v = [];
    while (t < 2.0) { await A.step(wishFn()); t += 1 / 60; if (Math.abs(t - 1) < 1 / 120) v.push(+s.speed.toFixed(2)); if (s.speed < 0.15) break; }
    out[label] = { tras1s: v[0] ?? 0, tParadaS: s.speed < 0.15 ? +t.toFixed(2) : '>2', distanciaM: +s.footPos.distanceTo(p0).toFixed(1), braking: s.braking }; };
  await run('soltar', () => null);
  await run('atrasExacto', () => A.dirW(-Math.PI / 2));
  await run('atras150', () => A.dirW(Math.PI / 2 + 2.6));
  await run('atras120', () => A.dirW(Math.PI / 2 + 2.1));
  await run('lateral90', () => A.dirW(Math.PI));
  return out;
});

// 7b. Activar actividades como un jugador: llegar al 60 % del joystick desde 9 m por el lado abierto y soltar al ver el botón
await probe('activityStop2', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const out = [];
  const outward = { 'act.graffiti': -1, 'act.pantherTalk': 1, 'act.danceCombo': -1, 'act.skateTutorial': 1 };
  for (const id of Object.keys(outward)) {
    const z = g.park.zones.get(id); const radial = z.pos.clone().setY(0).normalize();
    const tang = new T.Vector3(-radial.z, 0, radial.x);
    let best = null;
    for (const dir of [tang, tang.clone().negate(), radial.clone().multiplyScalar(outward[id])]) {
      const from = z.pos.clone().setY(0).addScaledVector(dir, 9); const h = Math.atan2(z.pos.x - from.x, z.pos.z - from.z);
      A.tp(from, h); let shown = -1, inside = 0, t = 0, stuckFrames = 0;
      for (let i = 0; i < 480; i++) {
        const vis = !document.getElementById('prompt').hidden; if (vis && shown < 0) shown = i;
        if (vis) inside++;
        await A.step(shown >= 0 ? null : A.dirW(h, 0.6)); t++;
        if (shown >= 0 && !vis) break;
        if (s.speed < 0.05) stuckFrames++; if (stuckFrames > 90) break;
      }
      const r = { desde: dir === tang ? 'tangente+' : dir.equals(tang.clone().negate()) ? 'tangente-' : 'radial', botonVisibleS: +(inside / 60).toFixed(2), seQuedoDentro: !document.getElementById('prompt').hidden, velocidadAlSoltar: null };
      if (!best || r.botonVisibleS > best.botonVisibleS) best = r;
      out.push({ zona: id, ...r });
    }
  }
  return out;
});

// 13. Pie de empuje y brazo trasero: orientación de la puntera respecto a la tabla y posición de la mano trasera
await probe('pushFootArm', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const v = g.visual; const mixer = new T.AnimationMixer(v.model);
  const B = A.bones; const out = {};
  const sample = (clipName, frac) => {
    const clip = v.actions.get(clipName).getClip(); const act = mixer.clipAction(clip); act.play(); mixer.setTime(clip.duration * frac); v.model.updateMatrixWorld(true);
    const board = B.Board.getWorldQuaternion(new T.Quaternion());
    const nose = new T.Vector3(0, 1, 0).applyQuaternion(board); nose.y = 0; nose.normalize();   // eje Y del hueso Board = hacia la nariz
    const foot = B.mixamorigRightFoot.getWorldPosition(new T.Vector3()), toe = B.mixamorigRightToeBase.getWorldPosition(new T.Vector3());
    const fd = toe.sub(foot); fd.y = 0; fd.normalize();
    const ang = Math.atan2(nose.clone().cross(fd).y, nose.dot(fd)) * 180 / Math.PI;
    const hips = B.mixamorigHips.getWorldPosition(new T.Vector3()); const hand = B.mixamorigRightHand.getWorldPosition(new T.Vector3());
    const back = hand.clone().sub(hips); const along = back.dot(nose);
    act.stop(); mixer.uncacheAction(clip);
    return { anguloPuntaVsNarizDeg: +ang.toFixed(0), manoTraseraDelanteDeCaderaM: +along.toFixed(2), manoAltura: +hand.y.toFixed(2) };
  };
  out.push_contacto = sample('SK_Push', 0.45);
  out.ride = sample('SK_Ride', 0.25);
  out.carveR = sample('SK_CarveR', 0.25);
  out.idle = sample('SK_Idle', 0.25);
  return out;
});

// 14. Trucos: salto de la tabla al aterrizar a mitad de giro; tiempo de giro 180→revert
await probe('trickLanding', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const B = A.bones;
  A.tp(A.flat, Math.PI / 2); await A.step(A.dirW(Math.PI / 2), 120);
  g.input.pressJump(); await A.step(A.dirW(Math.PI / 2), 12); g.input.move = { x: 0, y: 0 }; g.input.pressJump();
  let prevQ = B.Board.getWorldQuaternion(new T.Quaternion()); let worst = 0, at = '', progressAtLand = null;
  for (let i = 0; i < 90; i++) {
    const tr = s.trick; const p = s.trickProgress; await A.step(A.dirW(Math.PI / 2));
    if (tr && !s.trick && progressAtLand === null) progressAtLand = +p.toFixed(2);
    const q = B.Board.getWorldQuaternion(new T.Quaternion()); const ang = 2 * Math.acos(Math.min(1, Math.abs(q.dot(prevQ)))) * 180 / Math.PI; if (ang > worst) { worst = ang; at = s.state; } prevQ = q;
  }
  return { saltoMaxTablaDegPorFotograma: +worst.toFixed(0), estado: at, progresoKickflipAlTocarSuelo: progressAtLand, trucos: s.tricksDone.slice(-3) };
});

// 15. Cámara atravesando decorado sin colisión (árboles, palmeras, carteles): rayos de la escena visual
await probe('cameraClip', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const rc = new T.Raycaster();
  const decor = []; g.park.root.traverse((o) => { if (o.isMesh && /leaf|trunk|steel|black/.test(o.name)) decor.push(o); });
  let clipped = 0, total = 0; const where = {};
  for (const id of ['no_me_guillo', 'fashion_girl', 'nosvamosdeaqui']) {
    const S = g.park.sector(id);
    A.tp(S.P(25, -30), S.ccw(-30) + Math.PI); // recorrer el sector por el paseo interior y luego hacia fuera
    for (let i = 0; i < 360; i++) {
      await A.step(A.dirW(i < 180 ? S.out(-30 + i * 0.33) - 0.6 : S.out(0) + Math.sin(i / 20)));
      if (i % 6) continue; total++;
      const cam = g.rig.cam.position.clone(), tgt = s.visualPos.clone().add(new T.Vector3(0, 1.1, 0));
      const dir = cam.clone().sub(tgt); const len = dir.length(); rc.set(tgt, dir.normalize()); rc.far = len;
      const hit = rc.intersectObjects(decor, false)[0];
      if (hit) { clipped++; where[hit.object.name] = (where[hit.object.name] || 0) + 1; }
    }
  }
  return { muestras: total, decoradoEntreCamaraYJugador: clipped, porMalla: where };
});

// 16. Pista de baile: ¿cuerpo o pies por encima del suelo durante bailes y al salir?
await probe('danceFloat', async () => {
  const g = window.__bk, A = window.__a, T = window.__bkTHREE; const s = g.skater; const B = A.bones;
  const c = g.manifest.get('dance.center'); const out = {};
  const lowest = () => Math.min(...['mixamorigLeftToe_End', 'mixamorigRightToe_End', 'mixamorigLeftFoot', 'mixamorigRightFoot'].map((n) => B[n].getWorldPosition(new T.Vector3()).y));
  A.tp(c.pos, c.heading); await A.step(null, 30); out.patinandoSobrePista = { pieMasBajo: +lowest().toFixed(3), suelo: 0.06, footY: +s.footPos.y.toFixed(3) };
  for (const clip of ['Step_Hip_Hop_Dance', 'Hip_Hop_Dance_1', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_3', 'Breakdance_1990', 'FunnyDancing_02']) {
    g.visual.play(clip, { loop: true, fade: 0 }); s.frozen = true; let mn = 9, mx = -9;
    for (let i = 0; i < 120; i++) { await A.step(null); const l = lowest(); mn = Math.min(mn, l); mx = Math.max(mx, l); }
    out[clip] = { pieMasBajoMin: +mn.toFixed(2), pieMasBajoMax: +mx.toFixed(2) };
  }
  g.visual.play('skate', { fade: 0 }); s.frozen = false;
  return out;
});

fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify({ date: new Date().toISOString(), results, errors }, null, 1));
await browser.close();
console.log('errores', errors.length);
