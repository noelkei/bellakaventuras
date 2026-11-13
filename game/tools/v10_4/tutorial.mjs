// V10.4 R7 · guardián del tutorial (dossier 01 §2–3, 02 A–C, 04 §5–6; W-D23, W-D24, W-D35, W-D36, W-D37):
//  · partida nueva: plaza blanca (cerramiento) y PLA-01 literal; ANMI no sale de la plaza;
//  · cada paso avanza por su condición REAL (marca, subir, rodar hasta la otra marca, frenar, bajar, coger la patata de práctica);
//  · la patata de práctica no cuenta (0/20) y antes de PLA-10 se pregunta por el modo ayuda; PLA-10 → CIN-01 sin diálogos → PAR-01;
//  · «Saltar tutorial» (T) → pregunta del modo ayuda → CIN-01 (saltable con Esc) → PAR-01;
//  · partida antigua (sin el campo): sin tutorial; una sola pregunta del modo ayuda.
//  · V10.4 R12 (usuario): al cerrar PLA-03 la cámara se queda enseñando la marca (plano propio, marca en el centro de la imagen);
//    CIN-01 dura ~39 s (R13; ~22 en R12), con bandas de cine que se quitan ANTES de volver a ANMI, y suena su corte de NO ME GUILLO sin la música del parque ni
//    el ambiente; al acabar, el corte se para y vuelve el ambiente de la plaza.
//  · V10.4 R13: sin el paso de frenar; si en 15 s no se hace lo pedido, se repite la frase; antes de la cinemática, «Siéntate y disfruta»
//    y ANMI sentada en el banco de la plaza.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('tutorial');
const Q = '?bktest=1';
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { name: d.querySelector('.d2-name').textContent, text: d.querySelector('.d2-text').textContent, n: d.querySelectorAll('.d2-btn').length } : null; });
const waitD2 = async (page, re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await d2(page); if (d && (!re || re.test(d.text))) return d; await sleep(100); } return null; };
const adv = async (page) => { await sleep(420); await page.keyboard.press('KeyE'); await sleep(250); };
const st = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, c = g.state.p.narr; return { x: s.footPos.x, z: s.footPos.z, riding: s.riding, onFoot: s.onFoot, speed: s.speed, total: g.state.total, narr: { ...c }, mode: g.mode,
  shell: !!g.scene.getObjectByName('TUTORIAL_PLAZA_BLANCA'), marks: (() => { const o = []; g.scene.traverse((m) => { if (m.name === 'TUTORIAL_MARCA') o.push([m.position.x, m.position.z]); }); return o; })() }; });
const face = (page, x, z) => page.evaluate((x, z) => { const s = window.__bk.skater; s.heading = Math.atan2(x - s.footPos.x, z - s.footPos.z); s.prevHeading = s.heading; }, x, z);
const driveTo = async (page, x, z, done, ms = 9000) => { const t0 = Date.now(); await page.keyboard.down('KeyW'); while (Date.now() - t0 < ms) { await face(page, x, z); if (await done()) break; await sleep(60); } await page.keyboard.up('KeyW'); };
await runTest(R, async () => {
  const b = await launch();
  try {
    // ------------------------------------------------------------------ tutorial completo
    { const page = await openGame(b, R, { save: FRESH, query: Q }); await clickStart(page);
      const d = await waitD2(page, /Soy Bellakat/); const s0 = await st(page);
      R.check(!!d && s0.shell && s0.narr.estado === 'nuevo', 'partida nueva: plaza blanca y PLA-01 literal', 'input', { d, shell: s0.shell });
      await adv(page); await waitD2(page, /Bellakroak/); await adv(page); await waitD2(page, /marca del suelo/); await adv(page);
      await sleep(300); let s = await st(page);
      R.check(s.marks.length === 1 && !(await d2(page)), 'PLA-03: se cierra el diálogo y aparece la marca (se juega)', 'input', s);
      // V10.5 (E5-08, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_5-R2): ahora la cámara VIAJA a la marca después de cerrar la
      // frase (1,1 s) y se queda 2 s: se mira cuando ya ha llegado
      await sleep(1700);
      { const cam = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; let m = null; g.scene.traverse((o) => { if (o.name === 'TUTORIAL_MARCA') m = o; });
          const n = m ? m.position.clone().project(g.rig.cam) : null; return { mode: g.rig.mode, ndc: n ? [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(3)] : null }; });
        R.check(cam.mode === 'scripted' && !!cam.ndc && Math.abs(cam.ndc[0]) < 0.6 && Math.abs(cam.ndc[1]) < 0.75 && cam.ndc[2] < 1, `R12: al cerrar PLA-03 la cámara enseña la marca (plano propio, marca en ${JSON.stringify(cam.ndc)})`, 'input', cam); }
      // V10.5: el ejercicio empieza tras el plano limpio y la vuelta a ANMI (antes, 1,1 s)
      for (let i = 0; i < 80 && !(await page.evaluate(() => window.__bk.narr.exercise?.id === 'PLA-03')); i++) await sleep(100);
      // límite de la plaza: andando hacia fuera 4 s no se sale
      { const c = { x: 40, z: -40 }; await face(page, c.x + 30, c.z); await page.keyboard.down('KeyW'); await sleep(4000); await page.keyboard.up('KeyW'); const q = await st(page);
        R.check(Math.hypot(q.x - c.x, q.z - c.z) <= 7.4, `ANMI no sale de la plaza blanca (r ${Math.hypot(q.x - c.x, q.z - c.z).toFixed(2)})`, 'input', q); }
      s = await st(page); const [ax, az] = s.marks[0];
      await driveTo(page, ax, az, async () => !!(await d2(page)));
      R.check(!!(await waitD2(page, /súbete al skate/i, 3000)), 'andando hasta la marca → PLA-05', 'input');
      await adv(page); await page.keyboard.press('KeyQ'); R.check(!!(await waitD2(page, /impulso/i, 6000)), 'subir al skate → PLA-06', 'input');
      await adv(page); await sleep(300); s = await st(page); const [bx, bz] = s.marks[0] ?? [0, 0];
      await driveTo(page, bx, bz, async () => !!(await d2(page)), 12000);
      // V10.4 R13 (usuario: «la parte de frenar del tutorial la quitas»; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_4-R10)
      R.check(!!(await waitD2(page, /bájate/i, 3000)), 'en tabla hasta la otra marca → PLA-08 (sin el paso de frenar)', 'input');
      // R13 (usuario): si en 15 s no se hace lo pedido, se repite la frase
      await adv(page); await sleep(400); { const t0 = Date.now(); const again = await waitD2(page, /bájate/i, 19000);
        R.check(!!again && Date.now() - t0 > 13000, `R13: sin bajarse, a los ~15 s se repite la frase (${((Date.now() - t0) / 1000).toFixed(1)} s)`, 'input', again); }
      await adv(page); await sleep(400); await page.keyboard.press('KeyQ'); R.check(!!(await waitD2(page, /patata/i, 6000)), 'bajar del skate → PLA-09', 'input');
      await adv(page); await sleep(400);
      const pp = await page.evaluate(() => { let p = null; window.__bk.scene.traverse((o) => { if (o.parent === window.__bk.scene && o.children.length && o.position.distanceTo(new window.__bkTHREE.Vector3(40, 0.5, -40)) < 6 && o.name === '') p = p ?? null; }); return null; });
      void pp;
      // la patata de práctica: se busca en el juego (entidad propia de la narrativa)
      const P = await page.evaluate(() => { const k = window.__bk.narr.practice; return k ? [k.base.x, k.base.z] : null; });
      if (P) await driveTo(page, P[0], P[1], async () => !!(await d2(page)), 8000);
      const q1 = await waitD2(page, /mano/i, 4000); s = await st(page);
      R.check(!!P && !!q1 && s.total === 0 && s.narr.practica, `patata de práctica cogida, no cuenta (${s.total}/20) y empieza la pregunta del modo ayuda`, 'input', { P, q1, total: s.total });
      await adv(page); await waitD2(page, /pista/i, 3000); await adv(page); const q3 = await waitD2(page, /decides/i, 3000);
      R.check(!!q3 && q3.n === 2, 'la pregunta trae «Sí, ayúdame» / «No, gracias»', 'input', q3);
      await sleep(420); await page.keyboard.press('KeyE'); await sleep(300); await adv(page);
      s = await st(page); R.check(s.narr.ayuda === 'si', 'responder «Sí» guarda el modo ayuda', 'input', s.narr);
      const p10 = await waitD2(page, /lo básico/i, 4000); R.check(!!p10, 'PLA-10 después de la pregunta (W-D24)', 'input', p10);
      await adv(page);
      // CIN-01: sin diálogo hasta que acaba; luego PAR-01
      // R13 (usuario): antes de la cinemática, «Siéntate y disfruta…» y ANMI se sienta en el banco de la plaza (sentada toda la cinemática)
      let any = false, sitLine = null; const t0 = Date.now(); let par = null; const cs = [];
      while (Date.now() - t0 < 58000) { const dd = await d2(page); const c = await page.evaluate(() => { const g = window.__bk; return { cine: g.narr.inCine, bands: document.body.classList.contains('cine'), clip: !!g.audio.music?.previewPlaying, out: +g.musicOutside.toFixed(2), amb: +g.audio.ambLevel.toFixed(2), t: +g.sim.now.toFixed(2), seated: !!g.visual.sitTarget }; }); cs.push(c);
        if (dd) { if (/bienvenida/i.test(dd.text)) { par = dd; break; } if (/Siéntate/i.test(dd.text) && !cs.some((x) => x.cine)) { sitLine = dd; await adv(page); continue; } any = true; } await sleep(150); }
      { const on = cs.filter((c) => c.cine); R.check(!!sitLine && on.length > 0 && on.every((c) => c.seated), `R13: «${sitLine?.text ?? '—'}» y ANMI sentada en el banco durante toda la cinemática`, 'input', { sitLine, seated: on.filter((c) => c.seated).length, n: on.length }); }
      R.check(!!par && !any, `CIN-01 sin diálogos ni retratos y después PAR-01 (${((Date.now() - t0) / 1000).toFixed(1)} s)`, 'input', { par, any });
      { const on = cs.filter((c) => c.cine), dur = on.length ? on.at(-1).t - on[0].t : 0, banded = on.filter((c) => c.bands), ret = on.filter((c) => !c.bands && on.indexOf(c) > 0);
        R.measure('cin01', { dur, n: on.length, banded: banded.length, ret: ret.length });
        R.check(dur >= 37 && dur <= 41.5, `R13: CIN-01 dura ~39 s (${dur.toFixed(1)} s)`, 'input', { dur });
        R.check(banded.length > 0 && ret.length > 0 && on.findIndex((c) => !c.bands) > on.findIndex((c) => c.bands), 'R12: bandas de cine durante la cinemática, quitadas antes de volver a ANMI', 'input', { banded: banded.length, ret: ret.length });
        R.check(banded.length > 0 && banded.slice(2).every((c) => c.clip && c.out === 0 && c.amb === 0), 'R12: con las bandas suena el corte de NO ME GUILLO, sin música del parque ni ambiente', 'input', banded.filter((c) => !(c.clip && c.out === 0 && c.amb === 0)).slice(0, 4)); }
      await sleep(2200); { const a = await page.evaluate(() => ({ clip: !!window.__bk.audio.music?.previewPlaying, amb: +window.__bk.audio.ambLevel.toFixed(2) }));
        R.check(!a.clip && a.amb > 0.9, `R12: tras la cinemática se para el corte y vuelve el ambiente de la plaza (${JSON.stringify(a)})`, 'input', a); }
      s = await st(page); R.check(!s.shell, 'sin cerramiento blanco tras la cinemática', 'static');
      for (let i = 0; i < 5; i++) await adv(page);   // PAR-02…05
      const n1 = await waitD2(page, /NO ME GUILLO/i, 4000); R.check(!!n1, 'NMG-01 tras la bienvenida', 'input', n1);
      await adv(page); const n2 = await waitD2(page, /primera/i, 8000); R.check(!!n2, 'viaje de cámara y NMG-02 sobre la patata', 'input', n2);
      await adv(page); await sleep(2600); s = await st(page);
      R.check(s.mode === 'explore' && s.narr.estado === 'hecho' && s.total === 0, 'vuelve el control: tutorial hecho y 0/20', 'input', { mode: s.mode, narr: s.narr });
      await page.close(); }
    // ------------------------------------------------------------------ Saltar tutorial (T) → pregunta → CIN-01 saltada con Esc → PAR-01
    { const page = await openGame(b, R, { save: FRESH, query: Q }); await clickStart(page); await waitD2(page, /Soy Bellakat/);
      await sleep(300); await page.keyboard.press('KeyT'); const q = await waitD2(page, /mano/i, 5000);
      R.check(!!q, 'Saltar tutorial (T) → la pregunta del modo ayuda', 'input', q);
      await adv(page); await adv(page); await sleep(420); await page.keyboard.press('ArrowRight'); await sleep(100); await page.keyboard.press('Enter'); await sleep(300); await adv(page);
      // R13: antes de la cinemática, «Siéntate y disfruta» y ANMI al banco; Esc ya con la cinemática en marcha
      await waitD2(page, /Siéntate/i, 5000); await adv(page);
      for (let k = 0; k < 60 && !(await page.evaluate(() => window.__bk.narr.inCine)); k++) await sleep(150);
      await sleep(1200); await page.keyboard.press('Escape'); const par = await waitD2(page, /bienvenida/i, 8000); const s = await st(page);
      R.check(!!par && s.narr.ayuda === 'no' && !s.narr.practica, 'tras saltar: «No, gracias» guardado, la cinemática se salta con Esc y llega PAR-01', 'input', { par, narr: s.narr });
      await page.close(); }
    // ------------------------------------------------------------------ partida antigua (sin el campo): sin tutorial, una pregunta
    { const old = { ...SAVE_20, collected: SAVE_20.collected.slice(0, 7) }; delete old.narr;
      const page = await openGame(b, R, { save: old, query: Q }); await clickStart(page);
      const q = await waitD2(page, /mano|vuelto/i, 8000); const s = await st(page);
      R.check(!!q && !s.shell && s.narr.estado === 'antigua', 'partida antigua: sin tutorial ni plaza blanca; pregunta del modo ayuda una vez (W-D36)', 'input', { q, narr: s.narr });
      await adv(page); await sleep(420); await page.keyboard.press('Enter'); await sleep(300); await adv(page);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(4000);
      R.check(!(await d2(page)), 'al recargar no vuelve a preguntar', 'input');
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
