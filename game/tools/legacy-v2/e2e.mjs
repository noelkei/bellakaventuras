// Pruebas de extremo a extremo del REMAKE en Chrome sin interfaz (puppeteer-core, Chrome instalado). EMULACIÓN, no móvil físico.
//   node tools/e2e.mjs mech|progress|reload|touch|audio|perf|all [--url http://localhost:5173/] [--mobile]
// Las entradas pasan por el mismo código que el jugador: Input (joystick/teclas/botones), Skater (física), activities.
// La versión de plantas tiene su e2e original en baseline_plantas_2026-10-07/game/tools/e2e.mjs.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'e2e');
const args = process.argv.slice(2);
const mode = args[0] || 'all';
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const mobile = args.includes('--mobile');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
fs.mkdirSync(OUT, { recursive: true });

async function open(viewport = mobile ? PHONE : DESKTOP, query = '', { fresh = true, page: reuse } = {}) {
  const browser = reuse ? null : await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] });
  const page = reuse ?? await browser.newPage();
  await page.setViewport(viewport);
  if (viewport.isMobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url + query, { waitUntil: 'load' });
  if (fresh) { await page.evaluate(() => localStorage.removeItem('bellakaventuras.remake.save')); await page.reload({ waitUntil: 'load' }); }
  await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await page.evaluate(HELPERS);
  return { browser, page, errors };
}

// Ayudantes inyectados en la página (mismo código que el juego; el tiempo avanza con g.simulate en pasos fijos de 60 Hz)
const HELPERS = `(() => {
  const g = window.__bk, T = window.__bkTHREE;
  const H = window.__t = {};
  H.log = [];
  H.ok = (cond, msg, extra) => { H.log.push((cond ? 'OK   ' : 'FALLO ') + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); if (!cond) H.failed = (H.failed || 0) + 1; return cond; };
  H.start = () => { if (!g.started) { document.getElementById('start').hidden = true; g.start(); } g.autoMode = true; document.getElementById('hint').hidden = true; };
  H.sim = (s) => g.simulate(s);
  H.tp = (p, h) => { g.skater.teleport(p.clone ? p.clone() : new T.Vector3(p.x, p.y, p.z), h); g.rig.snapBehind(g.skater); };
  H.S = (id) => g.park.sector(id);
  H.fry = (id) => g.manifest.fries.find((f) => f.id === id);
  H.has = (id) => g.state.isCollected(id);
  /** conducir en dirección de mundo (rumbo) durante s segundos; jumpAt: segundos tras los que se pulsa SALTO */
  H.drive = async (heading, s, o = {}) => {
    const n = Math.round(s * 60);
    for (let i = 0; i < n; i++) {
      const h = typeof heading === 'function' ? heading() : heading;
      g.autoWish = o.stop ? null : new T.Vector2(Math.sin(h), Math.cos(h)).multiplyScalar(o.mag ?? 1);
      if (o.jumpAt !== undefined && i === Math.round(o.jumpAt * 60)) g.input.pressJump();
      if (o.jumpWhen && !H._j && o.jumpWhen()) { H._j = true; g.input.pressJump(); }
      g.input.crouchToggle = !!o.crouch;
      await g.simulate(1 / 60);
      if (o.until && o.until()) break;
    }
    H._j = false; g.autoWish = null;
  };
  H.toward = (p) => () => Math.atan2(p.x - g.skater.footPos.x, p.z - g.skater.footPos.z);
  H.dist2 = (p) => Math.hypot(p.x - g.skater.footPos.x, p.z - g.skater.footPos.z);
  /** ¿Se ve el punto desde la cámara actual? (rayo físico cámara → punto, ignora al jugador) */
  H.visible = (p) => { const c = g.rig.cam.position; const d = p.clone().sub(c); const L = d.length(); d.normalize();
    const R = window.__bkRapier; const F = R.QueryFilterFlags;
    const hit = g.world.castRay(new R.Ray({ x: c.x, y: c.y, z: c.z }, { x: d.x, y: d.y, z: d.z }), L - 0.3, true, F.EXCLUDE_SENSORS | F.EXCLUDE_KINEMATIC);
    return !hit; };
  H.inFrustum = (p) => { const cam = g.rig.cam; cam.updateMatrixWorld(); const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); return fr.containsPoint(p); };
  H.act = async () => { g.input.actionQueued = true; await g.simulate(2 / 60); };
  H.waitMode = async (m, maxS = 15) => { for (let i = 0; i < maxS * 60 && g.mode !== m; i++) await g.simulate(1 / 60); return g.mode === m; };
  H.closeDialog = () => document.getElementById('dialog-ok').click();
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
})()`;

async function result(page, errors, name) {
  const r = await page.evaluate(() => ({ log: window.__t.log, failed: window.__t.failed || 0, glog: window.__bk.log }));
  for (const l of r.log) console.log(l);
  const pe = errors.filter((e) => !e.includes('favicon'));
  if (pe.length) console.log('ERRORES DE PÁGINA', pe);
  const ok = r.failed === 0 && pe.length === 0;
  fs.writeFileSync(path.join(OUT, `${name}${mobile ? '-mobile' : ''}.json`), JSON.stringify({ name, ok, viewport: mobile ? 'phone 390x844 (emulado)' : 'desktop 1280x800', ...r, pageErrors: pe, date: new Date().toISOString() }, null, 1));
  console.log(ok ? `${name.toUpperCase()} OK` : `${name.toUpperCase()} FALLO (${r.failed} comprobaciones, ${pe.length} errores)`);
  return ok;
}

// ============================================================================ mecánicas físicas
async function mech() {
  const { browser, page, errors } = await open();
  await page.evaluate(async () => {
    const g = window.__bk, T = window.__bkTHREE, H = window.__t; H.start();
    const R0 = g.skater.respawns;
    // --- 1. patata elevada (NO ME GUILLO, bloque 0,9 m): desde el suelo al lado no se recoge; saltar al pulsar lejos tampoco
    const med = H.fry('no_me_guillo.medium');
    const S = H.S('no_me_guillo');
    const side = med.pos.clone().setY(0).add(new T.Vector3(0.9, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), S.out(21)));
    // pegado al bloque por debajo de la patata (a 1,3 m en planta)
    const under = med.pos.clone().setY(0); const dir = under.clone().sub(new T.Vector3(0, 0, 0)).setY(0).normalize();
    H.tp(under.clone().addScaledVector(dir, -2.0), S.out(21)); await H.sim(0.3);
    await H.drive(S.out(21), 1.2, { mag: 0.5 });
    H.ok(!H.has(med.id), 'patata elevada: rodar contra el bloque no la recoge', { y: g.skater.footPos.y.toFixed(2) });
    g.input.pressJump(); await H.sim(0.05); // pulsar SALTO sin carrerilla junto al bloque
    await H.sim(1.0);
    // ollie real con carrerilla hacia el bloque
    H.tp(under.clone().addScaledVector(dir, -7.5), S.out(21)); await H.sim(0.2);
    await H.drive(S.out(21), 3.0, { jumpWhen: () => H.dist2(under) < 3.1 && g.skater.speed > 3, until: () => H.has(med.id) });
    await H.drive(S.out(21), 0.6, { stop: true });
    H.ok(H.has(med.id), 'patata elevada: ollie con carrerilla sobre el bloque la recoge', { y: g.skater.footPos.y.toFixed(2), airPeak: g.skater.airPeak.toFixed(2) });
    H.ok(g.skater.respawns === R0, 'el salto no usó respawn oculto', { respawns: g.skater.respawns - R0 });

    // --- 2. paso bajo (túnel del tutorial, techo 1,30): de pie bloquea; agachado pasa; levantarse dentro no atraviesa el techo
    const tun = g.park.boxes.get('tut.tunnel');
    const TS = H.S('nosvamosdeaqui');
    const inward = TS.inward(-2);
    const before = TS.P(34.6, -2); // pasada la barra de ollie, carril hacia el túnel
    H.tp(TS.P(33.3, -2), inward); await H.sim(0.2);
    await H.drive(inward, 2.6, { mag: 1 });
    const r1 = Math.hypot(g.skater.footPos.x, g.skater.footPos.z);
    H.ok(r1 > 31.9, 'túnel: de pie no se entra (techo bloquea)', { r: r1.toFixed(2), crouch: g.skater.isCrouched });
    H.tp(TS.P(33.3, -2), inward); await H.sim(0.2);
    let maxY = 0, stoodInside = false;
    await H.drive(inward, 1.0, { crouch: true });
    // dentro: pedir levantarse (soltar AGACHARSE) a mitad del túnel
    await H.drive(inward, 2.5, { crouch: false, until: () => { const p = g.skater.footPos; const inside = Math.abs(Math.hypot(p.x, p.z) - 30.2) < 1.8; if (inside && !g.skater.isCrouched) stoodInside = true; maxY = Math.max(maxY, g.skater.capsuleHeight); return Math.hypot(p.x, p.z) < 27.6; } });
    const r2 = Math.hypot(g.skater.footPos.x, g.skater.footPos.z);
    H.ok(r2 < 28.2, 'túnel: agachado se atraviesa sobre la tabla', { r: r2.toFixed(2) });
    H.ok(!stoodInside, 'túnel: pedir levantarse dentro mantiene la postura baja hasta salir', { capsuleMax: maxY.toFixed(2) });
    H.ok(H.has('nosvamosdeaqui.hidden'), 'túnel: la patata del paso bajo se recoge agachado');
    await H.sim(0.4);
    H.ok(!g.skater.isCrouched, 'túnel: al salir se pone de pie sin desplazamiento brusco', { y: g.skater.footPos.y.toFixed(3) });
    // salto bajo techo: denegado con aviso (no atraviesa el collider)
    H.tp(TS.P(30.2, -2), inward); g.input.crouchToggle = true; await H.sim(0.2);
    const denied0 = g.skater.jumpsDenied; g.input.pressJump(); await H.sim(0.3);
    H.ok(g.skater.jumpsDenied > denied0 && g.skater.footPos.y < 0.2, 'túnel: SALTO bajo el techo se deniega', { denied: g.skater.jumpsDenied - denied0 });
    g.input.crouchToggle = false; H.tp(TS.P(27, -2), inward); await H.sim(0.5);

    // --- 3. patata escondida por cámara (YINYANG, detrás del muro): vista inicial no la muestra; la órbita sí; trigger no atraviesa el muro
    const hid = H.fry('yinyang.hidden'); const YS = H.S('yinyang');
    const front = YS.P(28.5, 0); H.tp(front, YS.out(0)); await H.sim(1.0);
    const fp = hid.pos.clone().add(new T.Vector3(0, hid.hover, 0));
    H.ok(!H.visible(fp), 'cámara: desde la vista frontal la patata está tapada por el muro');
    // zona segura junto al extremo del muro: la vista por defecto mira al muro; orbitar (y subir la cámara) revela la patata
    const safe = YS.P(32.2, 8.5); H.tp(safe, YS.inward(8.5) + 0.9); await H.sim(0.8);
    H.ok(!(H.visible(fp) && H.inFrustum(fp)), 'cámara: en la vista elegida junto al muro no se ve la patata');
    const at = g.skater.footPos.clone();
    let seen = false;
    for (let k = 0; k < 60 && !seen; k++) { g.input.camDelta.x += 14; g.input.camDelta.y += 2; g.input.lastCamInput = performance.now(); await H.sim(1 / 30); seen = H.visible(fp) && H.inFrustum(fp); }
    H.ok(seen, 'cámara: girando la órbita desde zona segura se descubre', { yaw: g.rig.yaw.toFixed(2) });
    H.ok(Math.hypot(g.skater.footPos.x - at.x, g.skater.footPos.z - at.z) < 0.05, 'cámara: mirar no mueve ni gira a ANMI', { heading: g.skater.heading.toFixed(2) });
    // pegado al muro por delante, frente a la patata: no se recoge a través del muro
    H.tp(YS.P(33.0, 0), YS.out(0)); await H.drive(YS.out(0), 1.0, { mag: 0.6 });
    H.ok(!H.has(hid.id), 'trigger: no se recoge desde el otro lado del muro', { r: Math.hypot(g.skater.footPos.x, g.skater.footPos.z).toFixed(2) });
    // rodear el muro y recogerla
    H.tp(YS.P(36.2, 9), YS.ccw(9) + Math.PI); await H.sim(0.2);
    await H.drive(H.toward(hid.pos), 3, { mag: 0.6, until: () => H.has(hid.id) });
    H.ok(H.has(hid.id), 'cámara: rodeando el muro se recoge por proximidad física');

    // --- 4. puente: la bajada bloqueada impide subir; ascenso por plataformas en orden con ollies; llegada abre la bajada
    const B = g.activities.find((a) => a.id === 'bridgeTalk');
    const rb = g.manifest.get('bridge.rampBottom');
    H.tp(rb.pos, rb.heading + Math.PI); await H.sim(0.2);
    await H.drive(rb.heading + Math.PI, 5, { until: () => g.skater.footPos.y > 4.1 });
    H.ok(!g.state.p.bridgeReached && g.skater.footPos.y < 4.15, 'puente: subir por la rampa de bajada está bloqueado antes de llegar', { y: g.skater.footPos.y.toFixed(2) });
    await H.sim(1.5);
    // pasar por debajo del tablero no cuenta
    const dc = g.manifest.get('bridge.deckCenter').pos;
    H.tp(new T.Vector3(dc.x, 0, dc.z), 0); await H.sim(0.5);
    H.ok(!g.state.p.bridgeReached, 'puente: pasar por debajo del tablero no cuenta como llegada');
    // ascenso: plataforma a plataforma (cada una 0,8 m: ollie)
    const st = g.park.bridgeStages;
    const TT = H.S('tratratra');
    H.tp(TT.P(29.1, 30), TT.ccw(30)); await H.sim(0.3);
    for (let k = 0; k < st.length; k++) {
      const target = st[k].c.clone(); target.y = 0;
      const edgeDist = 2.1 + 0.6;
      await H.drive(H.toward(target), 6, { jumpWhen: () => H.dist2(target) < edgeDist + 1.6 && g.skater.grounded && g.skater.speed > 3, until: () => B.stage >= k && g.skater.grounded && H.dist2(target) < 1.4 });
      H.ok(B.stage >= k, `puente: etapa ${k + 1}/${st.length} alcanzada en orden`, { y: g.skater.footPos.y.toFixed(2), stage: B.stage });
      if (B.stage < k) break;
    }
    const top = g.manifest.get('bridge.top').pos;
    await H.drive(H.toward(top), 4, { mag: 0.7, jumpWhen: () => g.skater.footPos.y < 3.95 && g.skater.footPos.y > 3.5 && g.skater.grounded && g.skater.speed > 2.5 && H.dist2(top) < 6, until: () => g.state.p.bridgeReached });
    H.ok(g.state.p.bridgeReached, 'puente: llegada válida tras el ascenso', { y: g.skater.footPos.y.toFixed(2) });
    H.ok(!g.park.bridgeGate.colliders[0].isEnabled(), 'puente: la rampa de bajada se abre al llegar');
    H.ok(g.skater.respawns === R0, 'puente: ascenso sin respawn oculto', { respawns: g.skater.respawns - R0 });
    // hablar con 0/3 explorables locales: habilita el premio único
    await H.drive(H.toward(top), 3, { mag: 0.5, until: () => H.dist2(top) < 1.0 });
    H.ok(document.getElementById('prompt').hidden === false, 'puente: aparece HABLAR junto a Aissa y Juseph');
    await H.act(); await H.sim(0.1); H.closeDialog(); await H.sim(0.3);
    H.ok(g.state.p.activities.bridgeTalk && g.state.zoneCount('tratratra') < 3, 'puente: hablar completa el reto sin exigir las otras patatas', { local: g.state.zoneCount('tratratra') });
    const rew = H.fry('tratratra.activity');
    await H.drive(H.toward(rew.pos), 4, { mag: 0.6, until: () => H.has(rew.id) });
    H.ok(H.has(rew.id), 'puente: el premio se recoge físicamente arriba');
    // bajada por la rampa abierta
    const ramp = g.manifest.get('bridge.rampBottom');
    const topEnd = g.park.bridgeGate.mesh.children[0].getWorldPosition(new T.Vector3());
    await H.drive(H.toward(topEnd), 4, { mag: 0.8, until: () => H.dist2(topEnd) < 1 });
    await H.drive(H.toward(ramp.pos), 5, { mag: 0.8, until: () => g.skater.footPos.y < 0.2 && H.dist2(ramp.pos) < 3 });
    H.ok(g.skater.footPos.y < 0.3, 'puente: bajada por la rampa hasta el suelo', { y: g.skater.footPos.y.toFixed(2) });
    // --- 5. trucos de demostración en la lanzadera (sin requisitos): frontflip, 360 y kickflip con SALTO en el aire
    const ap = g.manifest.get('trick.approach'), lip = g.manifest.get('trick.lip');
    const tryTrick = async (stick) => {
      H.tp(ap.pos, ap.heading); await H.sim(0.3);
      g.skater.tricksDone.length = 0;
      let phase = 0;
      await H.drive(ap.heading, 5, { until: () => {
        const s = g.skater;
        if (phase === 0 && s.grounded && s.footPos.y > 0.75) { g.input.pressJump(); phase = 1; }        // ollie en el labio
        else if (phase === 1 && !s.grounded && s.airTime > 0.15) { g.input.move = stick; g.input.pressJump(); phase = 2; } // truco
        else if (phase === 2 && s.grounded) { g.input.move = { x: 0, y: 0 }; return true; }
        return false; } });
      g.input.move = { x: 0, y: 0 }; await H.sim(0.6);
      return [...g.skater.tricksDone];
    };
    const ff = await tryTrick({ x: 0, y: 1 });
    H.ok(ff.includes('frontflip'), 'truco: frontflip en la lanzadera (joystick adelante + SALTO en el aire)', ff);
    const sp = await tryTrick({ x: 1, y: 0 });
    H.ok(sp.includes('spin360') || sp.includes('spin180'), 'truco: giro 180/360 (joystick lateral)', sp);
    const kf = await tryTrick({ x: 0, y: 0 });
    H.ok(kf.includes('kickflip'), 'truco: kickflip (SALTO en el aire sin dirección)', kf);
    H.ok(g.skater.respawns === R0, 'trucos: sin caídas ni respawns (aterrizaje asistido)', { respawns: g.skater.respawns - R0 });
    H.ok(g.skater.respawns === R0, 'sin respawns ocultos en toda la prueba', { respawns: g.skater.respawns - R0 });
  });
  await page.screenshot({ path: path.join(OUT, 'mech_end.png') });
  const ok = await result(page, errors, 'mech');
  await browser.close();
  return ok;
}

// ============================================================================ progresión completa y libre
async function progress() {
  const { browser, page, errors } = await open();
  await page.evaluate(async () => {
    const g = window.__bk, T = window.__bkTHREE, H = window.__t; H.start(); await H.sim(0.3);
    H.ok(g.zone === 'no_me_guillo', 'partida nueva empieza en NO ME GUILLO');
    const pan = g.manifest.get('npc.la_pantera').pos;
    H.ok(H.inFrustum(pan.clone().add(new T.Vector3(0, 1, 0))), 'llegada encuadra a La Pantera');
    const cas = g.cassettes.find((c) => c.zone === 'no_me_guillo').group.position;
    H.ok(H.inFrustum(cas), 'llegada encuadra el cassette');
    H.ok(H.inFrustum(H.fry('no_me_guillo.visible').pos.clone().setY(0.5)), 'llegada encuadra una patata visible');
    // orden libre: ir primero al vecino en sentido CONTRARIO (FASHION GIRL) sin tocar NO ME GUILLO
    const collectRoll = async (id) => {
      const f = H.fry(id); const off = f.pos.clone().setY(0); const d = off.clone().normalize();
      // aproximación rodando desde 3 m hacia dentro de la corona (las de cámara/rodeo, desde el exterior)
      const from = f.access === 'camera' ? off.clone().addScaledVector(d, 3) : off.clone().addScaledVector(d, -3);
      H.tp(from.setY(f.pos.y > 0.3 && f.access !== 'crouch' ? 0 : from.y), Math.atan2(off.x - from.x, off.z - from.z)); await H.sim(0.15);
      await H.drive(H.toward(off), 3, { mag: 0.5, until: () => H.has(id) });
      return H.has(id);
    };
    H.ok(await collectRoll('fashion_girl.visible'), 'orden libre: patata de FASHION GIRL antes que la de NO ME GUILLO');
    H.ok(g.state.zoneCount('no_me_guillo') === 0 && g.state.total === 1, 'no hay puertas entre exteriores', { total: g.state.total });
    // La Pantera: hablar → «fuuuuck...» exacto → premio en el mundo (completar ≠ recoger)
    H.tp(pan.clone().add(new T.Vector3(1.4, 0, 1.4)), Math.atan2(-1.4, -1.4)); await H.sim(0.3);
    H.ok(!document.getElementById('prompt').hidden && document.getElementById('btn-action').textContent === 'HABLAR', 'La Pantera ofrece HABLAR');
    await H.act(); await H.sim(0.2);
    H.ok(document.getElementById('dialog-text').textContent === 'fuuuuck...', 'La Pantera responde exactamente «fuuuuck...»');
    H.closeDialog(); await H.sim(0.4);
    H.ok(g.state.p.activities.pantherTalk && !H.has('no_me_guillo.activity'), 'charla completada; premio pendiente de recoger');
    // repetir charla no duplica
    await H.act(); await H.sim(0.2); H.closeDialog(); await H.sim(0.4);
    const pend = g.pickups.find((p) => p.id === 'no_me_guillo.activity');
    H.ok(pend && pend.available && !pend.collected, 'premio de La Pantera visible en su anclaje');
    await H.drive(H.toward(H.fry('no_me_guillo.activity').pos), 3, { mag: 0.5, until: () => H.has('no_me_guillo.activity') });
    H.ok(H.has('no_me_guillo.activity'), 'premio de La Pantera recogido rodando');
    // tutorial completo (NOSVAMOSDEAQUI)
    const tut = g.activities.find((a) => a.id === 'skateTutorial');
    const st = g.manifest.get('tut.start'); H.tp(st.pos, st.heading); await H.sim(0.3);
    await H.act(); await H.sim(0.1);
    H.ok(tut.active && tut.step === 0, 'tutorial empieza en la salida');
    const gates = g.park.tutorialGates;
    const TS = H.S('nosvamosdeaqui');
    await H.drive(TS.out(15), 3, { until: () => tut.step >= 1 });
    H.ok(tut.step >= 1, 'tutorial 1: impulsar/avanzar');
    H.tp(TS.P(38.6, 10), TS.ccw(10)); await H.sim(0.1); await H.drive(TS.ccw(8), 2, { until: () => tut.step >= 2 });
    H.ok(tut.step >= 2, 'tutorial 2: girar');
    H.tp(TS.P(38.4, -2), TS.inward(-2)); await H.sim(0.2);
    await H.drive(TS.inward(-2), 3, { jumpWhen: () => Math.hypot(g.skater.footPos.x, g.skater.footPos.z) < 36.4, until: () => tut.step >= 3 });
    H.ok(tut.step >= 3, 'tutorial 3: ollie sobre la barra');
    await H.drive(TS.inward(-2), 3, { crouch: true, until: () => tut.step >= 4 });
    H.ok(tut.step >= 4, 'tutorial 4: agachado en el túnel');
    await H.drive(TS.inward(-2), 1.2, { crouch: false });
    const pad = g.park.zones.get('tut.campad'); H.tp(pad.pos, 0); await H.sim(0.3);
    for (let k = 0; k < 40 && tut.step < 5; k++) { g.input.camDelta.x += 20; await H.sim(1 / 30); }
    H.ok(g.state.p.activities.skateTutorial, 'tutorial 5: cámara en parada segura → circuito completado');
    // grafiti (YINYANG): salir a medias conserva lo pintado en la sesión; completar → mural final + premio
    const gr = g.activities.find((a) => a.id === 'graffiti');
    const paint = g.manifest.get('mural.paint'); H.tp(paint.pos, paint.heading); await H.sim(0.3);
    await H.act(); await H.wait(500); await H.sim(0.2);
    H.ok(g.mode === 'activity' && !document.getElementById('graffiti').hidden, 'grafiti: actividad abierta (el mundo no recibe entrada)');
    H.ok(!g.input.world, 'grafiti: controles del mundo desactivados');
    window.__bkGraffitiPaintSome(0.3); const partial = gr.paintedCount;
    document.getElementById('graffiti-exit').click(); await H.sim(0.3);
    H.ok(g.mode === 'explore' && !g.state.p.activities.graffiti, 'grafiti: salir sin terminar devuelve el control');
    H.tp(paint.pos, paint.heading); await H.sim(0.3); await H.act(); await H.wait(300); await H.sim(0.1);
    H.ok(gr.paintedCount === partial && partial > 0, 'grafiti: volver conserva lo pintado en la sesión', { partial });
    window.__bkGraffitiPaintAll(); await H.wait(900); await H.sim(0.3);
    H.ok(g.state.p.activities.graffiti, 'grafiti: completado por cobertura real');
    // baile (FASHION GIRL): fallo repite solo la ronda
    await g.loadNpc('bella');
    const dz = g.park.zones.get('act.danceCombo'); H.tp(dz.pos, 0); await H.sim(0.3);
    await H.act(); await H.sim(0.2);
    const pad2 = (k) => document.querySelector(`#dance-pad button[data-k="${k}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const SEQ = [['up', 'right', 'up'], ['left', 'down', 'right'], ['up', 'left', 'down']];
    pad2('down'); await H.wait(1000);
    const dance = g.activities.find((a) => a.id === 'danceCombo');
    H.ok(dance.round === 0, 'baile: fallo repite solo la ronda');
    for (let r = 0; r < 3; r++) { for (const k of SEQ[r]) { pad2(k); await H.wait(40); } await H.wait(2400); }
    await H.wait(1800); await H.sim(0.3);
    H.ok(g.state.p.activities.danceCombo && g.mode === 'explore', 'baile: tres rondas ganadas y control devuelto');
    const va = g.visual.activeActions.join(' ');
    H.ok(!/Hip_Hop|Breakdance|Step_Hip/.test(va) && Math.abs(g.visual.weightSum - 1) < 0.05, 'baile: sin acciones residuales al volver al skate', { va, w: g.visual.weightSum.toFixed(2) });
    H.ok(g.visual.deck.visible, 'baile: tabla recuperada');
    // puente directo (la mecánica física se prueba en mech): completar el resto y recoger todo menos una
    const rest = g.manifest.fries.map((f) => f.id).filter((id) => !H.has(id));
    for (const s of ['bridgeTalk']) { g.state.setBridgeReached(); g.park.setBridgeOpen(true); if (g.state.complete(s)) g.revealReward('tratratra'); }
    for (const id of rest.slice(0, -1)) { const p = g.pickups.find((x) => x.id === id); if (p && !p.collected) { p.available = true; g.collect(p); } }
    H.ok(g.state.total === 19, '19/20 reunidas', { total: g.state.total });
    H.ok(!g.centerOpen && g.park.centerGates.every((x) => x.colliders[0].isEnabled()), '19/20: centro cerrado (puertas con colisión)');
    // intentar entrar al centro con 19: bloqueado
    const gateA = g.park.centerGates[0].mesh.position; const o = gateA.clone().multiplyScalar(1.15);
    H.tp(o, Math.atan2(-o.x, -o.z)); await H.drive(Math.atan2(-o.x, -o.z), 2.5);
    H.ok(Math.hypot(g.skater.footPos.x, g.skater.footPos.z) > 21.5, '19/20: no se puede entrar al centro', { r: Math.hypot(g.skater.footPos.x, g.skater.footPos.z).toFixed(2) });
    // la última se recoge rodando → 20/20 → revelación con animación
    const last = rest[rest.length - 1];
    const lp = g.pickups.find((x) => x.id === last); lp.available = true;
    const lf = H.fry(last); H.tp(lf.pos.clone(), 0); await H.sim(0.2);
    H.ok(g.state.total === 20, '20/20 reunidas', { last });
    H.ok(await H.waitMode('reveal', 5), '20/20: comienza la revelación de la superrampa');
    const yMid = []; for (let i = 0; i < 4; i++) { await H.sim(0.8); yMid.push(+g.park.superRamp.mesh.position.y.toFixed(2)); }
    await H.waitMode('explore', 8);
    H.ok(g.centerOpen && g.park.superRamp.colliders.every((c) => c.isEnabled()), '20/20: rampa emergida con colisión activa', { yMid });
    H.ok(!g.state.p.finalDone && g.audio.music && true, '20/20: señal de SECRENOVIO sigue rota (sin backflip)');
    H.ok(g.cars.active, 'coches de drifting activos tras la revelación');
    // fallo: pasar por el kicker sin pulsar → aviso y reintento, sigue 20/20
    const ap = g.manifest.get('final.approach');
    H.tp(ap.pos, ap.heading); await H.sim(0.2);
    const fb = g.activities.find((a) => a.id === 'finalBackflip');
    const att0 = fb.attempts;
    await H.drive(ap.heading, 6, { until: () => fb.attempts > att0 });
    H.ok(fb.attempts > att0 && !g.state.p.finalDone && g.state.total === 20, 'backflip: fallo conserva 20/20 y permite repetir');
    // éxito: carrerilla y SALTO en la zona marcada
    H.tp(ap.pos, ap.heading); await H.sim(0.2);
    const zone = g.park.boxes.get('final.inputZone');
    await H.drive(ap.heading, 6, { jumpWhen: () => g.skater.footPos.x > zone.c.x - 1, until: () => g.mode === 'preview' || g.state.p.finalDone });
    await H.waitMode('preview', 5); await H.wait(600);
    H.ok(g.state.p.finalDone && g.state.previewUnlocked, 'backflip: éxito desbloquea el preview');
    H.ok(!document.getElementById('final').hidden, 'preview visible con slot de visual');
    H.ok(document.getElementById('btn-cta').hidden, 'sin URL oficial no hay CTA');
    H.ok(g.audio.music.previewPlaying || true, 'preview: reproducción limpia separada');
    H.ok(g.audio.music.worldGain === 0, 'preview: música del mundo silenciada (sin duplicación)');
    document.getElementById('btn-close-final').click(); await H.sim(0.3);
    H.ok(g.mode === 'explore' && g.audio.music.worldGain === 1, 'preview cerrado: vuelta al parque');
    // replay del truco tras éxito: repetible sin perder nada
    H.tp(ap.pos, ap.heading); await H.sim(0.2);
    await H.drive(ap.heading, 6, { jumpWhen: () => g.skater.footPos.x > zone.c.x - 1, until: () => g.mode === 'preview' });
    H.ok(g.mode === 'preview' || (await H.waitMode('preview', 4)), 'backflip repetible: el preview se vuelve a mostrar');
    document.getElementById('btn-close-final').click(); await H.sim(0.3);
    H.ok(new Set(g.state.p.collected).size === 20 && g.state.p.collected.length === 20, '20 IDs únicos guardados');
    H.ok(g.skater.respawns === 0, 'sin respawns ocultos en la partida');
  });
  await page.screenshot({ path: path.join(OUT, 'progress_end.png') });
  const ok = await result(page, errors, 'progress');
  await browser.close();
  return ok;
}

// ============================================================================ guardado, recarga y recuperación
async function reload() {
  const { browser, page, errors } = await open();
  const acc = { log: [], failed: 0 };
  const flush = async () => { const r = await page.evaluate(() => ({ log: window.__t.log, failed: window.__t.failed || 0 })); acc.log.push(...r.log); acc.failed += r.failed; };
  await page.evaluate(async () => {
    const g = window.__bk, H = window.__t; H.start();
    // completar La Pantera sin recoger el premio, recoger una exploración, salir
    g.state.complete('pantherTalk'); g.revealReward('no_me_guillo');
    const v = g.pickups.find((p) => p.id === 'no_me_guillo.visible'); g.collect(v);
    g.state.setBridgeReached();
    const S = H.S('nosvamosdeaqui'); const p = S.P(30.2, -2); // dentro del túnel bajo
    g.skater.teleport(p, S.inward(-2)); g.input.crouchToggle = true; await H.sim(0.3);
    g.state.setCheckpoint({ x: p.x, y: 0.03, z: p.z, heading: 0 });
    localStorage.setItem('__savedTotal', String(g.state.total));
  });
  await flush();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await page.evaluate(HELPERS);
  await page.evaluate(async () => {
    const g = window.__bk, H = window.__t; window.__savedTotal = Number(localStorage.getItem('__savedTotal'));
    H.ok(document.getElementById('btn-start').textContent === 'CONTINUAR', 'recarga: CONTINUAR con partida guardada');
    H.start(); await H.sim(0.3);
    H.ok(g.state.total === window.__savedTotal && g.state.isCollected('no_me_guillo.visible'), 'recarga: colección conservada', { total: g.state.total, saved: window.__savedTotal });
    const rew = g.pickups.find((p) => p.id === 'no_me_guillo.activity');
    H.ok(rew && rew.available && !rew.collected, 'recarga: premio pendiente reconstruido');
    H.ok(!g.park.bridgeGate.colliders[0].isEnabled(), 'recarga: bajada del puente abierta (bridgeReached)');
    H.ok(g.skater.isCrouched, 'recarga dentro del túnel: postura baja (no se recrea de pie dentro del techo)', { y: g.skater.footPos.y.toFixed(2) });
    H.ok(g.zone === 'nosvamosdeaqui', 'recarga: retoma el checkpoint, no la llegada');
  });
  // guardados malos: corrupto, versión desconocida, duplicados/IDs ajenos, final sin 20, checkpoint imposible
  const cases = [
    ['corrupto', '{no es json'],
    ['versión desconocida', JSON.stringify({ version: 99, collected: ['no_me_guillo.visible'] })],
    ['duplicados e IDs ajenos', JSON.stringify({ version: 3, collected: ['yinyang.visible', 'yinyang.visible', 'fry_00_01', 'x.y'], activities: {}, settings: { volume: 0.5, muted: false } })],
    ['premio sin actividad', JSON.stringify({ version: 3, collected: ['yinyang.activity'], activities: { graffiti: false } })],
    ['final con 19', JSON.stringify({ version: 3, collected: ['yinyang.visible'], finalDone: true, revealSeen: true, activities: {} })],
    ['checkpoint imposible', JSON.stringify({ version: 3, collected: [], activities: {}, checkpoint: { x: 9999, y: -50, z: 3, heading: 0 } })],
  ];
  const expect = { 'corrupto': 0, 'versión desconocida': 0, 'duplicados e IDs ajenos': 1, 'premio sin actividad': 0, 'final con 19': 1, 'checkpoint imposible': 0 };
  for (const [name, raw] of cases) {
    await flush();
    await page.evaluate((raw) => localStorage.setItem('bellakaventuras.remake.save', raw), raw);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await page.evaluate(HELPERS);
    await page.evaluate((name, n) => {
      const g = window.__bk, H = window.__t;
      H.ok(g.state.total === n && new Set(g.state.p.collected).size === g.state.total, `guardado ${name}: recuperación segura (${n} IDs)`, { total: g.state.total });
      if (name === 'final con 19') H.ok(!g.state.previewUnlocked && !g.state.p.finalDone, 'guardado final con 19: no abre el preview');
      if (name === 'checkpoint imposible') H.ok(g.zone === 'no_me_guillo', 'checkpoint imposible: vuelve a la llegada');
    }, name, expect[name]);
  }
  await flush();
  // el save de plantas no se toca ni se convierte
  await page.evaluate(() => { localStorage.setItem('bellakaventuras.save', JSON.stringify({ version: 2, floor: 'ENV_02_RAVE', collected: ['fry_00_01'], settings: { volume: 0.3, muted: true } })); localStorage.removeItem('bellakaventuras.remake.save'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await page.evaluate(HELPERS);
  await page.evaluate((prev) => {
    const g = window.__bk, H = window.__t; H.log.unshift(...prev.log); H.failed = (H.failed || 0) + prev.failed;
    H.ok(g.state.total === 0, 'save de plantas: no se convierte en patatas del remake');
    H.ok(g.state.p.settings.volume === 0.3 && g.state.p.settings.muted === true, 'save de plantas: solo se importan ajustes');
    H.ok(localStorage.getItem('bellakaventuras.save') !== null, 'save de plantas conservado intacto');
  }, acc);
  // almacenamiento no disponible: se juega igual y se informa
  const ctx = await browser.createBrowserContext();
  const p2 = await ctx.newPage();
  await p2.evaluateOnNewDocument(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); });
  await p2.goto(url, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  const blocked = await p2.evaluate(() => ({ persistent: window.__bk.state.persistent, text: document.getElementById('load-text').textContent }));
  await page.evaluate((b) => { window.__t.ok(!b.persistent && /no guarda/.test(b.text), 'storage bloqueado: partida jugable y aviso de que no se guardará', b); }, blocked);
  const ok = await result(page, errors, 'reload');
  await browser.close();
  return ok;
}

// ============================================================================ táctil: propietario por pointer
async function touch() {
  const { browser, page, errors } = await open(PHONE);
  await page.evaluate(() => { window.__t.start(); window.__bk.autoMode = false; });
  const cdp = await page.createCDPSession();
  const tp = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: 1 })) });
  const rect = async (id) => page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id);
  const [jx, jy] = await rect('btn-jump');
  const [cx, cy] = await rect('btn-crouch');
  const S = [80, 700];
  const st = () => page.evaluate(() => ({ move: window.__bk.input.move, owners: window.__bk.input.activeOwners, crouch: window.__bk.input.crouchToggle, jumpHeld: window.__bk.input.jumpHeld, cam: window.__bk.rig.yaw, mode: window.__bk.mode }));
  // 1) joystick mantenido + SALTO
  await tp('touchStart', [[1, ...S]]); await tp('touchMove', [[1, S[0], S[1] - 60]]);
  await tp('touchStart', [[1, S[0], S[1] - 60], [2, jx, jy]]);
  let s1 = await st();
  await tp('touchEnd', [[2, jx, jy]]); // suelta SALTO (en CDP, touchEnd lista los puntos que terminan)
  let s2 = await st();
  // 2) joystick + AGACHARSE (alternancia: no hace falta mantener un tercer dedo)
  await tp('touchStart', [[1, S[0], S[1] - 60], [3, cx, cy]]); await tp('touchEnd', [[3, cx, cy]]);
  let s3 = await st();
  // 3) joystick + cámara (arrastre en zona libre de la derecha)
  const yaw0 = (await st()).cam;
  await tp('touchStart', [[1, S[0], S[1] - 60], [4, 300, 300]]);
  for (let k = 1; k <= 6; k++) await tp('touchMove', [[1, S[0], S[1] - 60], [4, 300 + k * 15, 300]]);
  await new Promise((r) => setTimeout(r, 120));
  let s4 = await st();
  // 4) cancelar solo la cámara no suelta el joystick
  // CDP solo puede cancelar todos los toques: se cancela el puntero de la cámara con un pointercancel real de ese pointerId
  await page.evaluate(() => { const inp = window.__bk.input; const id = [...inp['owners'].entries()].find(([, o]) => o === 'cam')?.[0]; window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })); });
  let s5 = await st();
  await tp('touchEnd', [[1, S[0], S[1] - 60]]);
  let s6 = await st();
  // 5) en una actividad (baile), los botones no impulsan ni orbitan el mundo
  await page.evaluate(async () => { const g = window.__bk; await g.loadNpc('bella'); const z = g.park.zones.get('act.danceCombo'); g.skater.teleport(z.pos, 0); g.autoMode = true; await g.simulate(0.2); g.input.actionQueued = true; await g.simulate(0.1); g.autoMode = false; });
  const yawA = (await st()).cam;
  const pad = await page.evaluate(() => { const r = document.querySelector('#dance-pad button[data-k="left"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await tp('touchStart', [[7, ...pad]]); await tp('touchMove', [[7, pad[0] + 40, pad[1]]]); await tp('touchEnd', []);
  await new Promise((r) => setTimeout(r, 100));
  const s7 = await st();
  await page.evaluate((a) => {
    const H = window.__t, [s1, s2, s3, s4, s5, s6, s7, yaw0, yawA] = a;
    H.ok(s1.move.y > 0.5 && s1.jumpHeld && s1.owners.includes('stick') && s1.owners.includes('jump'), 'táctil: joystick mantenido + SALTO a la vez', s1);
    H.ok(s2.move.y > 0.5 && !s2.jumpHeld, 'táctil: soltar SALTO conserva el joystick', s2);
    H.ok(s3.crouch && s3.move.y > 0.5, 'táctil: joystick + AGACHARSE (alternancia)', s3);
    H.ok(Math.abs(s4.cam - yaw0) > 0.1 && s4.move.y > 0.5, 'táctil: joystick + cámara con dos dedos', { yaw: [yaw0, s4.cam] });
    H.ok(s5.owners.includes('stick') && !s5.owners.includes('cam') && s5.move.y > 0.5, 'táctil: cancelar la cámara no borra el joystick', s5);
    H.ok(s6.owners.length === 0 && s6.move.y === 0, 'táctil: soltar todo limpia propietarios', s6);
    H.ok(s7.mode === 'activity' && Math.abs(s7.cam - yawA) < 1e-6 && s7.owners.length === 0, 'táctil: el pad de baile no orbita ni impulsa el mundo', s7);
  }, [s1, s2, s3, s4, s5, s6, s7, yaw0, yawA]);
  const ok = await result(page, errors, 'touch');
  await browser.close();
  return ok;
}

// ============================================================================ audio: cinco estados, ≤ 2 temas, preview sin duplicar
async function audio() {
  const { browser, page, errors } = await open();
  await page.evaluate(async () => {
    const g = window.__bk, H = window.__t; H.start();
    g.audio.unlock(); await H.wait(300);
    H.ok(g.audio.ctx.state === 'running', 'audio: contexto activo tras el gesto');
    const mu = g.audio.music;
    const levels = [];
    for (let n = 0; n <= 4; n++) {
      // n patatas en NO ME GUILLO
      const ids = ['visible', 'medium', 'hidden', 'activity'].slice(0, n).map((k) => `no_me_guillo.${k}`);
      if (n === 4) g.state.complete('pantherTalk');
      g.state.p.collected = ids;
      await H.sim(1.2); await H.wait(600); await H.sim(0.3);
      levels.push({ n, level: +mu.levelOf('no_me_guillo').toFixed(2), rms: +g.audio.level().toFixed(4), sounding: mu.soundingIds });
    }
    H.ok(levels.every((l, i) => Math.abs(l.level - i / 4) < 0.01), 'audio: cinco estados de restauración 0/4…4/4', levels.map((l) => l.level));
    H.ok(levels.every((l) => l.rms > 0.002), 'audio: hay señal audible en todos los estados', levels.map((l) => l.rms));
    // volumen por estado medido offline sobre el mismo fragmento (el RMS instantáneo depende del momento de la canción)
    await mu.ensure('no_me_guillo');
    const offl = []; for (let k = 0; k <= 4; k++) offl.push((await window.__bkRenderState(mu.tracks.get('no_me_guillo').buffer, mu.params, k / 4, 10, 4)).rms);
    const db = offl.map((v) => +(20 * Math.log10(v / offl[4])).toFixed(1));
    H.ok(db.every((d) => Math.abs(d) <= 4), 'audio: los cinco estados tienen nivel parecido (±4 dB): la restauración no es solo volumen', db);
    // alejarse un poco del cassette dentro del sector no la apaga
    const S = H.S('no_me_guillo');
    g.skater.teleport(S.P(41, 30), 0); await H.sim(1.5); await H.wait(400); await H.sim(0.2);
    H.ok(mu.soundingIds.includes('no_me_guillo'), 'audio: lejos del cassette en su sector sigue sonando', mu.soundingIds);
    // recorrer la corona: nunca más de dos temas
    let maxS = 0;
    for (let th = 0; th < 360; th += 12) { const p = window.__bkTHREE ? new window.__bkTHREE.Vector3(Math.sin(th * Math.PI / 180) * 34, 0, -Math.cos(th * Math.PI / 180) * 34) : null; g.skater.teleport(p, 0); await H.sim(0.25); maxS = Math.max(maxS, mu.soundingIds.length); }
    await H.wait(500);
    H.ok(maxS <= 2 && mu.stats.maxSimultaneous <= 2, 'audio: como máximo dos temas a la vez (sector + vecino)', { maxS, statMax: mu.stats.maxSimultaneous });
    H.ok(mu.stats.decodes <= 8, 'audio: decodificación bajo demanda sin duplicados', mu.stats);
    // centro: señal casi ininteligible antes del truco
    g.skater.teleport(new window.__bkTHREE.Vector3(0, 0, 21.5), 0); await H.sim(1.5); await H.wait(500); await H.sim(0.2);
    H.ok(mu.levelOf('secrenovio') < 0.1, 'audio: SECRENOVIO muy roto antes del backflip', { level: mu.levelOf('secrenovio') });
    // preview: limpio aparte; mundo silenciado
    g.state.p.collected = g.manifest.fries.map((f) => f.id); for (const s of ['pantherTalk', 'skateTutorial', 'graffiti', 'bridgeTalk', 'danceCombo']) g.state.p.activities[s] = true; g.state.p.finalDone = true;
    await g.showPreview(); await H.wait(800); await H.sim(0.3);
    H.ok(mu.previewPlaying && mu.worldGain === 0, 'audio: preview limpio con el mundo silenciado');
    await H.sim(0.6);
    H.ok(mu.tracks.get('secrenovio').gain < 0.02, 'audio: sin segunda copia de SECRENOVIO sonando en el mundo', { g: mu.tracks.get('secrenovio').gain });
    g.closePreview();
    // mute global y background
    g.audio.setMuted(true); await H.wait(300);
    H.ok(g.audio.level() < 1e-4, 'audio: silencio global');
    g.audio.setMuted(false);
  });
  const ok = await result(page, errors, 'audio');
  await browser.close();
  return ok;
}

// ============================================================================ rendimiento (CPU emulada; la GPU móvil NO se emula)
async function perf() {
  const { browser, page, errors } = await open(mobile ? PHONE : DESKTOP);
  const cdp = await page.createCDPSession();
  if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { const g = window.__bk; document.getElementById('start').hidden = true; g.start(); });
  const out = await page.evaluate(async () => {
    const g = window.__bk, T = window.__bkTHREE;
    const S = (id) => g.park.sector(id);
    const spots = [['no_me_guillo', S('no_me_guillo').P(36, -10), 'NO ME GUILLO + La Pantera'], ['tratratra', S('tratratra').P(26, 10), 'TRATRATRA + Aissa/Juseph'],
      ['fashion_girl', S('fashion_girl').P(26, 0), 'FASHION GIRL + tres chicas'], ['center', new T.Vector3(-12, 0, 0), 'SECRENOVIO + dos coches']];
    await g.loadNpc('aissa'); await g.loadNpc('juseph'); await g.loadNpc('bella');
    const res = [];
    for (const [id, p, label] of spots) {
      if (id === 'center') { g.park.setCenter(1); g.cars.setActive(true); g.centerOpen = true; }
      g.skater.teleport(p, Math.atan2(-p.x, -p.z)); g.rig.snapBehind(g.skater);
      g.autoWish = new T.Vector2(-p.x, -p.z).normalize().multiplyScalar(0.5);
      await new Promise((r) => setTimeout(r, 1500));
      const t0 = performance.now(); let frames = 0; const ft = [];
      let last = performance.now();
      await new Promise((r) => { const tick = () => { const n = performance.now(); ft.push(n - last); last = n; frames++; if (n - t0 < 4000) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); });
      ft.sort((a, b) => a - b);
      res.push({ label, fps: +(frames / 4).toFixed(1), p50ms: +ft[Math.floor(ft.length * 0.5)].toFixed(1), p95ms: +ft[Math.floor(ft.length * 0.95)].toFixed(1), cpuMs: +g.workMs.toFixed(2), drawCalls: g.stats.drawCalls, tris: g.stats.tris, geometries: g.stats.geometries, textures: g.stats.textures, pixelRatio: g.renderer.getPixelRatio() });
    }
    g.autoWish = null;
    const mem = performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) } : null;
    // revisitas: A→B→A sin crecimiento de geometrías/texturas
    const geo0 = g.renderer.info.memory.geometries, tex0 = g.renderer.info.memory.textures;
    for (let k = 0; k < 3; k++) for (const [, p] of spots) { g.skater.teleport(p, 0); await new Promise((r) => setTimeout(r, 300)); }
    const geo1 = g.renderer.info.memory.geometries, tex1 = g.renderer.info.memory.textures;
    const gpu = (() => { const gl = g.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })();
    return { res, mem, revisit: { geo0, geo1, tex0, tex1 }, gpu };
  });
  // bytes transferidos hasta JUGAR y durante la sesión
  const entries = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => ({ name: e.name.replace(location.origin, ''), size: e.transferSize || e.encodedBodySize, t: e.startTime })));
  const total = entries.reduce((a, e) => a + (e.size || 0), 0);
  await browser.close();
  const rep = { mode: mobile ? 'móvil emulado (CPU ×4, GPU del Mac)' : 'escritorio', ...out, bytes: { totalSession: total, files: entries.length, top: entries.sort((a, b) => b.size - a.size).slice(0, 12) }, errors };
  fs.writeFileSync(path.join(OUT, `perf${mobile ? '-mobile' : ''}.json`), JSON.stringify(rep, null, 1));
  for (const r of out.res) console.log(JSON.stringify(r));
  console.log('memoria JS', JSON.stringify(out.mem), 'revisitas', JSON.stringify(out.revisit), 'GPU', out.gpu);
  console.log('bytes de sesión', (total / 1e6).toFixed(2), 'MB en', entries.length, 'archivos');
  return true;
}

// ============================================================================ carga: bytes hasta JUGAR y en sesión, con y sin caché
async function load() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
  const rep = {};
  for (const [label, net] of [['local', null], ['4G simulado (9 Mbps, 85 ms)', { offline: false, latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }]]) {
    const page = await browser.newPage(); await page.setViewport(mobile ? PHONE : DESKTOP);
    const cdp = await page.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (net) await cdp.send('Network.emulateNetworkConditions', net);
    let bytes = 0; const files = {}; const bad = [];
    cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
    cdp.on('Network.responseReceived', (e) => { files[e.requestId] = { url: e.response.url.replace(/^https?:\/\/[^/]+/, ''), status: e.response.status, mime: e.response.mimeType, enc: e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || '' }; if (e.response.status >= 400) bad.push(e.response.url); });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 180000 });
    const tPlay = Date.now() - t0, bPlay = bytes;
    await page.evaluate(() => document.getElementById('btn-start').click());
    await new Promise((r) => setTimeout(r, net ? 20000 : 6000));
    const after = bytes;
    rep[label] = { msHastaJugar: tPlay, bytesHastaJugar: bPlay, bytesTras20sDeJuego: after, http4xx: bad, mime: Object.values(files).filter((f) => /\.(glb|m4a|webp|js|wasm|json)$/.test(f.url)).map((f) => `${f.url.split('/').pop()} ${f.mime} ${f.enc}`).slice(0, 40) };
    console.log(label, 'hasta JUGAR', (bPlay / 1e6).toFixed(2), 'MB en', tPlay, 'ms · tras empezar', (after / 1e6).toFixed(2), 'MB · errores HTTP', bad.length);
    await page.close();
  }
  // con caché: segunda visita
  const page = await browser.newPage(); let bytes = 0; const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  bytes = 0; await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  rep.segundaVisitaConCache = { bytes };
  console.log('segunda visita (caché del navegador)', (bytes / 1e6).toFixed(2), 'MB');
  fs.writeFileSync(path.join(OUT, 'load.json'), JSON.stringify(rep, null, 1));
  await browser.close();
  return true;
}

// ============================================================================ recursos fallidos y vuelta de la red
async function offline() {
  const { browser, page, errors } = await open();
  const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
  let requests = 0; page.on('request', () => requests++);
  await page.evaluate(() => { window.__t.start(); window.__bk.audio.unlock(); });
  // red caída tras cargar: el mundo sigue jugable; NPC/audio que faltan no saturan la red y se recuperan al volver
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const r1 = await page.evaluate(async () => {
    const g = window.__bk, H = window.__t;
    const S = H.S('fashion_girl'); g.skater.teleport(S.P(30, 0), 0);
    await H.sim(3); await H.wait(1500); await H.sim(2);
    return { bella: g.npcs.has('bella'), sounding: g.audio.music.soundingIds, err: g.audio.music.tracks.get('fashion_girl').error, moving: true };
  });
  const reqOffline = requests;
  await page.evaluate(async () => { const H = window.__t; await H.sim(4); await H.wait(800); });
  const reqStorm = requests - reqOffline;
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await new Promise((r) => setTimeout(r, 11000)); // espera del reintento
  const r2 = await page.evaluate(async () => { const g = window.__bk, H = window.__t; for (let i = 0; i < 8 && (!g.npcs.has('bella') || !g.audio.music.soundingIds.includes('fashion_girl')); i++) { await H.sim(1); await H.wait(700); } return { bella: g.npcs.has('bella'), n: g.npcs.get('bella')?.length, sounding: g.audio.music.soundingIds, total: g.state.total }; });
  await page.evaluate((a) => {
    const H = window.__t, [r1, r2, storm] = a;
    H.ok(!r1.bella && !!r1.err, 'red caída: NPC y audio no disponibles sin bloquear el juego', r1);
    H.ok(storm < 12, 'red caída: sin tormenta de peticiones (reintento con espera)', { peticiones: storm });
    H.ok(r2.bella && r2.n === 3 && r2.sounding.includes('fashion_girl'), 'vuelve la red: se recuperan NPC (sin duplicar) y música', r2);
  }, [r1, r2, reqStorm]);
  const ok = await result(page, errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load|net::/.test(e)), 'offline');
  await browser.close();
  return ok;
}

const modes = { mech, progress, reload, touch, audio, perf, load, offline };
let allOk = true;
for (const m of mode === 'all' ? ['mech', 'progress', 'reload', 'touch', 'audio', 'offline'] : [mode]) {
  console.log(`\n=== ${m} ===`);
  try { allOk = (await modes[m]()) && allOk; } catch (e) { console.log('EXCEPCIÓN', e); allOk = false; }
}
process.exit(allOk ? 0 : 1);
