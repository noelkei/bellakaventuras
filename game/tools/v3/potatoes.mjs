// ACT-02: acceso REAL a cada una de las 20 patatas. Por ID: salida declarada a ~6 m elegida automáticamente (suelo
// transitable y línea de acceso coherente con su tipo), entrada real de teclado (rodar / ollie a ~2,3 m / agachado),
// recogida aceptada por el estado, vuelta rodando sin atasco. Negativos: patatas en alto no se recogen rodando contra el
// bloque sin saltar; patatas tras muro no se recogen empujando desde el lado equivocado. Las de actividad se habilitan con
// la actividad completada como fixture declarada (las actividades se prueban en ACT-03…05).
//   node tools/v3/potatoes.mjs [id,id] → captures/v3/P3/ACT-02/potatoes.json
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null;
const R = new Report('P3/ACT-02', 'potatoes', { method: 'teclado real; fixture por patata = posición de salida declarada (y actividad completada para las de premio); recogida leída de state.p.collected' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const down = (k) => page.keyboard.down(k), up = (k) => page.keyboard.up(k);

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  const fries = await page.evaluate(() => window.__bk.park.manifest.fries.map((f) => ({ id: f.id, zone: f.zone, kind: f.kind, access: f.access, pos: f.pos.toArray(), hint: f.hint })));
  R.data.manifest = fries.map((f) => ({ id: f.id, access: f.access, pos: f.pos.map((x) => +x.toFixed(2)) }));
  R.check(fries.length === 20 && new Set(fries.map((f) => f.id)).size === 20, 'manifiesto: 20 IDs únicos (4 por zona)', 'static', { n: fries.length });

  // planificador de salidas (en la página: rayos contra el mundo real)
  const plan = (f, negative = null) => page.evaluate(({ f, negative }) => {
    const g = window.__bk, T = window.__bkTHREE, RAPIER = window.__bkRapier, W = g.world;
    const P = new T.Vector3(...f.pos);
    const groundAt = (x, z) => { const h = W.castRay(new RAPIER.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 12, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS); return h ? 6 - h.timeOfImpact : null; };
    let lastNy = null;
    const ray = (a, b) => { const d = b.clone().sub(a); const L = d.length(); d.normalize(); const h = W.castRayAndGetNormal(new RAPIER.Ray(a, d), L, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS); lastNy = h ? h.normal.y : null; return h ? h.timeOfImpact : null; };
    const R0 = 6, out = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, d = new T.Vector3(Math.sin(a), 0, Math.cos(a));
      const S = P.clone().addScaledVector(d, R0); const gy = groundAt(S.x, S.z); if (gy === null || Math.hypot(S.x, S.z) > 50) continue;
      const sameLevel = Math.abs(gy - P.y) < 0.15 && P.y > 0.3;   // p. ej. tablero alto del puente
      const lowerRest = gy > 0.3 && P.y - gy > 0.3 && P.y - gy < 1.0; // descanso inferior del ascenso (se sube por rampa)
      if (Math.abs(gy) > 0.12 && !sameLevel && !lowerRest) continue;
      S.y = gy;
      // el camino: tres alturas (pies, cintura, cabeza agachado)
      const tgt = P.clone(); tgt.y = P.y + 0.45;
      const elevated = P.y - gy > 0.3 && f.access !== 'crouch';
      // elevadas: rayo horizontal a 0,3 m (mide el borde real del bloque); resto: hacia la patata
      const h03 = ray(S.clone().setY(gy + 0.3), tgt.clone().setY(elevated ? gy + 0.3 : f.access === 'crouch' ? P.y + 0.3 : tgt.y));
      const hit = h03 === null ? R0 : h03; const faceNy = lastNy;
      let ok;
      if (negative === 'wall') ok = h03 !== null && hit < R0 - 0.3 && hit > R0 - 2.0;            // muro entre medias, cerca de la patata
      else if (elevated) ok = h03 !== null && hit > R0 - 2.6 && hit < R0 - 0.2;                  // el bloque/plataforma justo antes
      else ok = h03 === null || hit > R0 - 0.9;                                                    // libre hasta la patata
      // y una franja de 2 m antes de la salida también libre (para coger velocidad)
      if (ok && negative !== 'wall') { const back = S.clone().addScaledVector(d, 2).setY(gy + 0.3); if (ray(S.clone().setY(gy + 0.3), back) !== null) ok = false; }
      if (ok) out.push({ S: S.toArray(), heading: Math.atan2(-d.x, -d.z), hit: +hit.toFixed(2), steep: faceNy !== null && Math.abs(faceNy) < 0.5 });
    }
    return out;
  }, { f, negative });

  const results = {};
  for (const f of fries) {
    if (only && !only.includes(f.id)) continue;
    const r = results[f.id] = { access: f.access, kind: f.kind };
    // disponibilidad: las de actividad necesitan la actividad completada (fixture declarada)
    if (f.kind === 'activity') {
      r.fixture = 'actividad completada';
      await page.evaluate((id) => { const g = window.__bk, zone = id.split('.')[0]; const act = { no_me_guillo: 'pantherTalk', nosvamosdeaqui: 'skateTutorial', yinyang: 'graffiti', tratratra: 'bridgeTalk', fashion_girl: 'danceCombo' }[zone]; g.activities.find((x) => x.id === act).debugComplete(); }, f.id);
      await sleep(400);
    }
    const starts = await plan(f);
    r.candidates = starts.length;
    if (!starts.length) { R.check(false, `${f.id}: hay una salida transitable con acceso coherente a ~6 m`, 'input', r); continue; }
    let got = false, tries = 0;
    for (const st of starts.slice(0, 4)) {
      tries++;
      await page.evaluate(({ S, heading }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(...S), heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, st);
      await sleep(250);
      if (f.access === 'crouch') await down('KeyC');
      await down('KeyW');
      let jumped = false, jumpD = null, ymax = 0; const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        const s = await page.evaluate((id) => { const g = window.__bk, P = g.park.manifest.fries.find((q) => q.id === id).pos, p = g.skater.footPos; return { got: g.state.p.collected.includes(id), d: Math.hypot(p.x - P.x, p.z - P.z), y: p.y }; }, f.id);
        ymax = Math.max(ymax, s.y);
        if (s.got) { got = true; break; }
        // ollie ~1,0 m antes del borde del bloque (distancia patata→borde = 6 − impacto del rayo del planificador)
        // ollie solo ante una cara vertical (no ante rampa), ~1,35 m antes del borde: la cápsula (r 0,3) no debe tocar la arista subiendo
        if (!jumped && st.steep && f.pos[1] - st.S[1] > 0.3 && f.access !== 'crouch' && s.d < (6 - st.hit) + 1.35) { jumpD = +s.d.toFixed(2); await page.keyboard.press('Space'); jumped = true; }
        await sleep(15);
      }
      await up('KeyW'); if (f.access === 'crouch') await up('KeyC');
      (r.attempts ??= []).push({ hit: st.hit, jumpD, ymax: +ymax.toFixed(2), got });
      if (got) { r.start = st; break; }
    }
    r.tries = tries;
    R.check(got, `${f.id} (${f.access}): recogida con entrada real desde una salida declarada`, 'input', r);
    if (got) {
      // vuelta: girar y salir rodando sin atasco
      const p0 = await page.evaluate(() => window.__bk.skater.footPos.toArray());
      if (f.access === 'crouch') { await down('KeyC'); await down('KeyW'); await sleep(2200); await up('KeyW'); await up('KeyC'); }   // sale agachado por el otro lado
      // vuelta: frenar, girar empujando y dejar rodar (sin carrera ciega a fondo, que acababa en choques >8,5 m/s)
      else { await down('KeyS'); await sleep(900); await up('KeyS'); await down('KeyA'); await down('KeyW'); await sleep(1300); await up('KeyA'); await up('KeyW'); await sleep(1400); }
      const s1 = await page.evaluate(() => ({ p: window.__bk.skater.footPos.toArray(), loco: window.__bk.skater.loco, ev: window.__bk.skater.events.slice(-14).map((e) => `${e.t}:${e.e}`) }));
      r.returnEv = s1.ev;
      r.returnMoved = +Math.hypot(s1.p[0] - p0[0], s1.p[2] - p0[2]).toFixed(2);
      R.check(r.returnMoved > 1.5 && s1.p[1] > -0.2 && s1.loco !== 'bail', `${f.id}: vuelta desde la patata sin atasco`, 'input', { moved: r.returnMoved, y: s1.p[1], loco: s1.loco });
    }
  }
  // sin doble premio: completar otra vez una actividad no habilita una segunda patata; tras recargar nada reaparece
  if (!only) {
    const again = await page.evaluate(() => { const g = window.__bk; const before = g.state.total; g.activities.find((x) => x.id === 'pantherTalk').debugComplete(); const avail = g.pickups.filter((p) => p.available && !p.collected).length; return { before, after: g.state.total, avail }; });
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await clickStart(page); await sleep(500);
    const rl = await page.evaluate(() => { const g = window.__bk; return { total: g.state.total, collected: g.state.p.collected.length, visible: g.pickups.filter((p) => !p.collected && p.available).length }; });
    R.check(again.after === again.before && again.avail === 0 && rl.total === 20 && rl.collected === 20 && rl.visible === 0, 'sin doble premio: repetir una actividad no da otra patata y tras recargar las 20 siguen recogidas sin reaparecer', 'input', { again, reload: rl });
  }
  // negativos: elevadas sin saltar y ocultas desde el lado del muro (sobre patatas aún no recogidas: partida nueva)
  await page.evaluate(() => { localStorage.removeItem('bellakaventuras.remake.save'); });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  for (const f of fries) {
    if (only && !only.includes(f.id)) continue;
    const elevated = f.pos[1] > 0.3 && f.access !== 'crouch';
    const mode = elevated ? 'below' : f.kind === 'hidden' && f.access === 'camera' ? 'wall' : null;
    if (!mode || f.kind === 'activity') continue;
    const starts = mode === 'wall' ? await plan(f, 'wall') : await plan(f);
    if (!starts.length) {
      if (mode === 'wall') {
        // sin muro a <2 m: comprobación geométrica. Desde el otro lado el centro del jugador queda a ≥ (muro más cercano +
        // grosor ≥0,15 + radio 0,3); si eso supera la ventana de recogida (0,8 m) no se puede coger a través del muro
        const dmin = await page.evaluate((f) => { const g = window.__bk, T = window.__bkTHREE, RAPIER = window.__bkRapier; const P = new T.Vector3(...f.pos); let m = 99; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; const h = g.world.castRay(new RAPIER.Ray({ x: P.x, y: P.y + 0.5, z: P.z }, { x: Math.sin(a), y: 0, z: Math.cos(a) }), 6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS); if (h) m = Math.min(m, h.timeOfImpact); } return m; }, f);
        R.check(dmin + 0.15 + 0.3 > 0.8, `${f.id}: no se puede recoger a través del muro (muro más cercano a ${dmin.toFixed(2)} m: fuera de la ventana de ±0,8 m)`, 'static', { dmin });
      } else R.note({ id: f.id, negative: mode, skipped: 'sin salida para el caso negativo' });
      continue;
    }
    const st = starts[0];
    await page.evaluate(({ S, heading }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(...S), heading, 'ride'); g.input.clear(); }, st);
    await sleep(250); await down('KeyW'); await sleep(3500); await up('KeyW'); await sleep(300);
    const got = await page.evaluate((id) => window.__bk.state.p.collected.includes(id), f.id);
    R.check(!got, `${f.id}: no se recoge ${mode === 'below' ? 'desde abajo rodando contra el bloque sin saltar' : 'empujando desde el otro lado del muro'}`, 'input', { start: st });
  }
  R.data.results = results;
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
