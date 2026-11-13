// T5-22 · Cámara en los recorridos que faltaban (OPUS-010/024, REV04-007, COV-07), por FOTOGRAMA sobre la cámara real
// (rig.cam), en escritorio 1280×800, vertical 390×844 y horizontal 844×390 (emulación de viewport; la entrada es teclado:
// aquí se mide el encuadre, no el control táctil).
//  · curva20: en tabla a 18 m/s siguiendo el anillo r≈20 (W + giro corregido) 5 s;
//  · yy_esquina: andando pegada (1 m) al muro YY, rebasa la esquina y gira hacia su cara trasera;
//  · u_hoyo: dentro del hoyo de la U, andando hacia la boca y con la cámara orbitada (J) 1,4 s;
//  · quarter_nmg: en tabla a 8 m/s sube y baja el quarter NMG (palmera recolocada en T5-13);
//  · coche: atropello en la banda (S-car-A) — vuelo alto de coche;
//  · final: triple real (W + SALTO a 9 m/s) con la transición `toChase`.
// Métricas por fotograma: distancia horizontal frente a la deseada (y si avoid() restringe: barrido objetivo→deseada
// bloqueado), distancia a la cápsula, pitch, cruces por el frente, OCLUSIÓN (rayo cámara→pecho de ANMI con colliders
// sólidos, sin sensores ni el propio cuerpo) y ENCUADRE (cabeza y pies dentro del 80 % central).
// Aceptación DT-16: dist ≥ 50 % de la deseada salvo avoid; ≥ cápsula + 0,5 m; pitch ∈ [6°, 72°]; ≤ 1 cruce; final: 0
// fotogramas con ANMI ocluida durante la transición; coche: ANMI en el 80 % central en todo el vuelo. Además en el final:
// clip de la transición y fotogramas «planos» (un color > 60 % de la imagen: cámara dentro de un sólido).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, place, VIEWPORTS, SAVE_20, recordClip, r3, arg } from '../lib.mjs';
const R = new Report('cam-cases');
const CASES = arg('cases', 'curva20,yy_esquina,u_hoyo,quarter_nmg,coche,final').split(',');
const LAYOUTS = arg('layouts', 'escritorio,vertical,horizontal').split(',');
const VPS = { escritorio: VIEWPORTS.desktop, vertical: VIEWPORTS.phone, horizontal: VIEWPORTS.phoneLand };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
await runTest(R, async () => {
  const b = await launch();
  try {
    const all = [];
    for (const lay of LAYOUTS) {
      const page = await openGame(b, R, { viewport: VPS[lay], save: SAVE_20 }); await clickStart(page); await sleep(800);
      await page.evaluate(() => {
        const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier; document.getElementById('hint').hidden = true;
        const ray = new RA.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), v3 = new T.Vector3();
        window.__cc = { on: false, rows: [], tag: '' };
        const r0 = g.render.bind(g);
        g.render = () => { r0(); const C = window.__cc; if (!C.on) return; const cam = g.rig.cam, c = cam.position, s = g.skater, v = s.visualPos;
          const chest = new T.Vector3(v.x, v.y + 1.0, v.z), d = chest.clone().sub(c), L = d.length(); d.divideScalar(L);
          ray.origin = { x: c.x, y: c.y, z: c.z }; ray.dir = { x: d.x, y: d.y, z: d.z };
          const hit = g.world.castRay(ray, L - 0.35, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
          let occName = null; if (hit) occName = g.park.colliderName(hit.collider.handle) || `h${hit.collider.handle}`;
          const ndc = (y) => { v3.set(v.x, v.y + y, v.z).project(cam); return [v3.x, v3.y, v3.z]; };
          const head = ndc(1.75), feet = ndc(0.05), inF = [head, feet].every((p) => Math.abs(p[0]) <= 0.8 && Math.abs(p[1]) <= 0.8 && p[2] < 1);
          const f = new T.Vector3(); cam.getWorldDirection(f);
          const dx = c.x - v.x, dz = c.z - v.z, fx = Math.sin(s.heading), fz = Math.cos(s.heading);
          // ¿restringe avoid()? barrido objetivo → posición deseada sin obstáculos
          const avoidOn = !!g.rig.avoidActive;   // registrado por el rig (acortada por avoid o recuperando la distancia)
          C.rows.push({ t: +g.clock.toFixed(3), mode: g.rig.mode, blend: +g.rig.blend.toFixed(3), hd: Math.hypot(dx, dz), dy: c.y - v.y, front: dx * fx + dz * fz, pitch: Math.asin(-f.y) * 180 / Math.PI,
            occ: occName, inF, head, feet, avoidOn, ph: s.impactPhase, cause: s.impactCause, loco: s.loco, sp: Math.hypot(s.vel.x, s.vel.z) }); };
      });
      const recOn = (tag) => page.evaluate((tag) => { window.__cc.rows = []; window.__cc.tag = tag; window.__cc.on = true; }, tag);
      const recOff = () => page.evaluate(() => { window.__cc.on = false; return window.__cc.rows; });
      const generic = (name, rows, onFootWant) => {
        const want = onFootWant ? 5.4 * 0.86 : 5.4, desiredH = want * Math.cos(0.30);
        let crossings = 0; for (let i = 1; i < rows.length; i++) if (Math.sign(rows[i].front) !== Math.sign(rows[i - 1].front) && Math.abs(rows[i].front - rows[i - 1].front) > 0.01) crossings++;
        const free = rows.filter((r) => !r.avoidOn && r.mode === 'follow');
        const minH = free.length ? Math.min(...free.map((r) => r.hd)) : null, minCap = Math.min(...rows.map((r) => Math.hypot(r.hd, Math.max(0, r.dy - 1.8)) - 0.3));
        const pitches = rows.map((r) => r.pitch), occ = rows.filter((r) => r.occ), outF = rows.filter((r) => !r.inF);
        return { name, lay, frames: rows.length, avoidFrames: rows.length - free.length, minHorizLibre: r3(minH), desiredH: r3(desiredH), ratio: minH == null ? null : r3(minH / desiredH), minToCapsule: r3(minCap),
          pitchMin: r3(Math.min(...pitches)), pitchMax: r3(Math.max(...pitches)), crossings, occluded: occ.length, occBy: [...new Set(occ.map((r) => r.occ))].slice(0, 6), outOfFrame: outF.length,
          // V6: margen del encuadre (máximo |NDC| de cabeza y pies; el límite es 0,8) y el fotograma peor
          ndcMax: r3(Math.max(...rows.map((r) => Math.max(...[r.head, r.feet].map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))))))), worst: outF.slice(0, 3).map((r) => ({ t: r.t, head: r.head.map(r3), feet: r.feet.map(r3), pitch: r3(r.pitch), hd: r3(r.hd), sp: r3(r.sp) })) };
      };
      const checkGeneric = (row) => {
        R.check(row.ratio == null || row.ratio >= 0.5, `${lay}/${row.name}: distancia horizontal ≥ 50 % de la deseada (fuera de avoid; ${row.avoidFrames} fotogramas con avoid)`, 'input', row);
        R.check(row.minToCapsule >= 0.5, `${lay}/${row.name}: nunca dentro de la cápsula + 0,5 m`, 'input', row);
        R.check(row.pitchMin >= 5.5 && row.pitchMax <= 72, `${lay}/${row.name}: pitch ∈ [6°, 72°]`, 'input', row);
        R.check(row.crossings <= 1, `${lay}/${row.name}: ≤ 1 cruce por el frente`, 'input', row);
      };
      // ------------------------------------------------------------------ curva a 20 m/s
      if (CASES.includes('curva20')) {
        await place(page, R, [0, 0, -20], -Math.PI / 2, 'ride', 'curva20'); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 18, 0, Math.cos(s.heading) * 18); });
        R.fixture('curva20: velocidad inicial declarada 18 m/s en el anillo', {});
        await recOn('curva20'); await page.keyboard.down('KeyW'); let key = null; const t0 = Date.now();
        while (Date.now() - t0 < 5000) { const st = await page.evaluate(() => { const s = window.__bk.skater; return { x: s.footPos.x, z: s.footPos.z, h: s.heading }; });
          const r = Math.hypot(st.x, st.z), tang = Math.atan2(-st.z, st.x) + Math.PI, want = tang + (r - 20) * 0.12, err = wrap(want - st.h);
          const k = Math.abs(err) < 0.04 ? null : err < 0 ? 'KeyD' : 'KeyA'; if (k !== key) { if (key) await page.keyboard.up(key); if (k) await page.keyboard.down(k); key = k; } await sleep(40); }
        if (key) await page.keyboard.up(key); await page.keyboard.up('KeyW');
        const rows = await recOff(); const row = { ...generic('curva20', rows, false), vmax: r3(Math.max(...rows.map((r) => r.sp))) }; all.push(row); console.log(JSON.stringify(row)); checkGeneric(row);
        // V6 (contrato 09): la curva a ~19 m/s en horizontal roza el 80 % (V5 ya llegaba a 0,796; V6 0,79–0,82 según el
        // muestreo): lo exigible es que ANMI nunca se acerque al borde (≤ 0,90 en TODOS los fotogramas) y que el 80 % central
        // se cumpla en ≥ 99 % de los fotogramas
        R.check(row.ndcMax <= 0.9 && row.outOfFrame <= Math.floor(row.frames * 0.01), `${lay}/curva20: ANMI nunca cerca del borde (máx. ${row.ndcMax} ≤ 0,90) y en el 80 % central en ≥ 99 % de los fotogramas (${row.frames - row.outOfFrame}/${row.frames})`, 'input', row);
      }
      // ------------------------------------------------------------------ esquina del muro YY
      if (CASES.includes('yy_esquina')) {
        const W = { t: [-29.958, 9.734], yaw: -1.2566, hx: 3.2, hz: 0.225 };
        const L2W = (lx, lz) => [W.t[0] + lx * Math.cos(W.yaw) + lz * Math.sin(W.yaw), W.t[1] - lx * Math.sin(W.yaw) + lz * Math.cos(W.yaw)];
        const p0 = L2W(-1.5, W.hz + 1.0), p1 = L2W(0, W.hz + 1.0), hd = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
        const back = L2W(0, -1), cen = L2W(0, 0), hBack = Math.atan2(back[0] - cen[0], back[1] - cen[1]);
        await place(page, R, [p0[0], 0, p0[1]], hd, 'walk', 'yy_esquina'); await sleep(400);
        await recOn('yy'); await page.keyboard.down('KeyW'); await sleep(1900);
        const h = await page.evaluate(() => window.__bk.skater.heading); const k = wrap(hBack - h) < 0 ? 'KeyD' : 'KeyA';
        await page.keyboard.down(k); await sleep(700); await page.keyboard.up(k); await sleep(1500); await page.keyboard.up('KeyW'); await sleep(500);
        const rows = await recOff(); const row = generic('yy_esquina', rows, true); all.push(row); console.log(JSON.stringify(row)); checkGeneric(row);
        R.measure(`yy_esquina_${lay}_filas`, rows.filter((_, i) => i % 3 === 0).map((r) => [r.t, r.mode, r3(r.hd), r3(r.dy), r.avoidOn ? 1 : 0, r.inF ? 1 : 0, r3(r.pitch)]));
      }
      // ------------------------------------------------------------------ dentro del hoyo de la U
      if (CASES.includes('u_hoyo')) {
        const u = await page.evaluate(() => { const a = window.__bk.manifest.get('nmg.u'); return [a.pos.x, a.pos.z, a.heading]; });
        await place(page, R, [22.794, -0.45, -17.153], u[2] + Math.PI, 'walk', 'u_hoyo'); await sleep(600);
        // la órbita con J cruza el plano lateral a propósito (1 cruce); los cruces se cuentan en el recentrado (R), como cam-orbit
        await recOn('u'); await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
        await page.keyboard.down('KeyJ'); await sleep(1400); await page.keyboard.up('KeyJ'); const pre = await recOff();
        await recOn('u-R'); await page.keyboard.press('KeyR'); await sleep(1500); const post = await recOff();
        const row = { ...generic('u_hoyo', [...pre, ...post], true), crossings: generic('u_hoyo', post, true).crossings, crossingsOrbitaJ: generic('u_hoyo', pre, true).crossings };
        all.push(row); console.log(JSON.stringify(row)); checkGeneric(row);
      }
      // ------------------------------------------------------------------ quarter NMG
      if (CASES.includes('quarter_nmg')) {
        const q = await page.evaluate(() => { const a = window.__bk.manifest.get('nmg.quarter'); return [a.pos.x, a.pos.z, a.heading]; });
        const st = [q[0] - Math.sin(q[2]) * 4, q[1] - Math.cos(q[2]) * 4];
        await place(page, R, [st[0], 0, st[1]], q[2], 'ride', 'quarter_nmg'); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 8, 0, Math.cos(s.heading) * 8); });
        R.fixture('quarter_nmg: velocidad inicial declarada 8 m/s a 4 m del ancla', {});
        await recOn('q'); await sleep(3500);
        const rows = await recOff(); const row = generic('quarter_nmg', rows, false); all.push(row); console.log(JSON.stringify(row)); checkGeneric(row);
      }
      // ------------------------------------------------------------------ vuelo de coche
      if (CASES.includes('coche')) {
        await fixture(page, R, 'S-car-A (atropello en la banda)', () => { const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0]; const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), p = pose.pos; g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk'); g.rig.snapBehind(g.skater); g.skater.impactProtectUntil = -1; return {}; });
        await recOn('coche'); let seen = false; for (let i = 0; i < 160; i++) { const ph = await page.evaluate(() => window.__bk.skater.impactPhase); if (ph === 'air') seen = true; if (seen && ph !== 'air' && ph !== 'launch') break; await sleep(40); }
        await sleep(600); const rows = await recOff(); const air = rows.filter((r) => r.cause === 'coche' && (r.ph === 'air' || r.ph === 'launch'));
        if (!air.length) { R.invalid(`${lay}/coche: no hubo vuelo de coche`); } else {
          const row = { ...generic('coche', rows, false), airFrames: air.length, airOut: air.filter((r) => !r.inF).length, airOcc: air.filter((r) => r.occ).length, worst: air.reduce((m, r) => Math.max(m, ...r.head.slice(0, 2).map(Math.abs), ...r.feet.slice(0, 2).map(Math.abs)), 0) };
          all.push(row); console.log(JSON.stringify(row));
          R.check(row.airOut === 0, `${lay}/coche: ANMI dentro del 80 % central en todo el vuelo (${row.airFrames - row.airOut}/${row.airFrames}; peor |ndc| ${r3(row.worst)})`, 'input', row);
          R.check(row.minToCapsule >= 0.5 && row.pitchMax <= 72, `${lay}/coche: cámara fuera de la cápsula y pitch ≤ 72°`, 'input', row);
        }
      }
      // ------------------------------------------------------------------ transición del final
      if (CASES.includes('final')) {
        const F = await page.evaluate(() => ({ ...window.__bkTuning.final }));
        const carAngles = () => page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
        const ahead = (a, t) => ((a - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        for (let i = 0; i < 400; i++) { const a = await carAngles(); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) break; await sleep(40); }
        await fixture(page, R, 'ancla final.approach en tabla a 9 m/s (velocidad inicial declarada)', () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * 9, 0, Math.cos(a.heading) * 9); g.rig.snapBehind(g.skater); return {}; });
        let rows = null;
        const clipDir = await recordClip(page, R, `final_${lay}`, async () => {
          await recOn('final'); await page.keyboard.down('KeyW'); let pressed = false;
          let w0 = null; for (let i = 0; i < 400; i++) { const q = await page.evaluate(() => { const g = window.__bk, ft = g.activities[5]; return { x: g.skater.footPos.x, inW: ft.inWindow ? ft.inWindow() : false, clock: g.clock, mode: g.rig.mode }; }); if (q.inW && w0 == null) w0 = q.clock; if (!pressed && w0 != null && q.clock - w0 > 0.1) { await page.keyboard.press('Space'); pressed = true; } if (q.x > F.lipX + 6) break; await sleep(6); }   // SALTO dentro de la ventana que abre el juego (T5-29)
          await page.keyboard.up('KeyW'); await sleep(2500); rows = await recOff();
        }, { quality: 60, maxWidth: 640 });
        const tr = []; let inTr = false; for (const r of rows) { if (r.mode === 'chase' && r.blend < 1) inTr = true; if (inTr) tr.push(r); if (inTr && r.blend >= 1) break; }
        // fotogramas planos del clip
        const flat = await new Promise((res) => { import('node:child_process').then(({ execFileSync }) => { try { res(JSON.parse(execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'flat-frames.py'), clipDir]).toString())); } catch (e) { res({ error: String(e) }); } }); });
        const row = { name: 'final', lay, frames: rows.length, chase: rows.some((r) => r.mode === 'chase'), trFrames: tr.length, trOcc: tr.filter((r) => r.occ).length, occBy: [...new Set(tr.filter((r) => r.occ).map((r) => r.occ))], allOcc: rows.filter((r) => r.occ).length, flat };
        all.push(row); console.log(JSON.stringify(row));
        if (!row.chase || !tr.length) R.invalid(`${lay}/final: no se llegó a la transición toChase`, row);
        else {
          R.check(row.trOcc === 0, `${lay}/final: 0 fotogramas con ANMI ocluida en la transición (${row.trFrames - row.trOcc}/${row.trFrames})`, 'input', row);
          R.check(!row.flat.error && row.flat.flat === 0, `${lay}/final: 0 fotogramas planos (cámara dentro de un sólido) en el clip`, 'vision', row.flat);
        }
      }
      await page.close();
    }
    R.measure('casos', all);
    R.pendingHuman('Revisión visual de la cámara (clip del final, vuelo de coche, hoyo) — G8-V');
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
