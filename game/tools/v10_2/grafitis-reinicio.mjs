// V10.2 · Q14 + R-14 (usuario: «obviamente los grafitis si reinicias la partida desaparecen»):
// · una partida que solo tiene grafitis de SKILLS cuenta como partida: CONTINUAR y «Borrar y empezar» visibles;
// · «Borrar y empezar» los borra (estado, guardado y mundo);
// · TODOS los campos de progreso, cada uno solo, cuentan en `hasSave` y en la fusión entre pestañas (una pestaña con solo ese campo no
//   adopta el linaje de otra);
// · R-14b: dos pestañas del mismo linaje no se pisan los grafitis (quedan los de las dos).
import { Report, runTest, launch, openGame, sleep, argUrl, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from './lib102.mjs';
const R = new Report('grafitis-reinicio');
const G1 = { i: 0, p: [0, 0.02, 4], n: [0, 1, 0], u: [0, 0, 1], s: 0.7 }, G2 = { i: 3, p: [2, 0.02, 4], n: [0, 1, 0], u: [0, 0, 1], s: 0.5 };
await runTest(R, async () => {
  const b = await launch();
  // partida normal: «Borrar y empezar» desde el inicio se puede confirmar
  { const page = await openGame(b, R, { save: SAVE_20 }); await page.click('#btn-reset-start'); await sleep(300);
    const top = await page.evaluate(() => { const r = document.getElementById('btn-confirm-yes').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e?.id || e?.closest('section')?.id || null; });
    R.check(top === 'btn-confirm-yes', `partida normal: el aviso de borrar queda encima del inicio («${top}» en el centro del botón)`, 'input', { top });
    await page.close(); }
  { const page = await openGame(b, R, { save: { ...FRESH, saveEpoch: 'prueba-1', skillGraffiti: [G1] } });
    const s = await page.evaluate(() => ({ start: document.getElementById('btn-start').textContent, reset: !document.getElementById('btn-reset-start').hidden }));
    R.check(s.start === 'CONTINUAR' && s.reset, `solo con grafitis: «${s.start}» y «Borrar y empezar» ${s.reset ? 'visible' : 'OCULTO'}`, 'fixture', s);
    if (s.reset) { await page.click('#btn-reset-start'); await sleep(300);
      // el aviso tiene que quedar ENCIMA de la pantalla de inicio (en 5241 lo tapaba: el clic caía en el inicio y no se borraba nada)
      const top = await page.evaluate(() => { const r = document.getElementById('btn-confirm-yes').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e?.id || e?.closest('section')?.id || null; });
      R.check(top === 'btn-confirm-yes', `«¿Borrar el progreso?» se ve encima del inicio y se puede pulsar (en el centro del botón está «${top}»)`, 'input', { top }); await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#btn-confirm-yes')]);
      await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const a = await page.evaluate(() => ({ n: (window.__bk.state.p.skillGraffiti ?? []).length, disk: (JSON.parse(localStorage.getItem('bellakaventuras.remake.save') ?? '{}').skillGraffiti ?? []).length, decals: window.__bk.activities.find((x) => x.id === 'freeDance').decals.length, start: document.getElementById('btn-start').textContent }));
      R.check(a.n === 0 && a.disk === 0 && a.decals === 0 && a.start === 'JUGAR', `tras «Borrar y empezar»: ${a.n} en la partida, ${a.disk} guardados, ${a.decals} en el mundo, botón «${a.start}»`, 'fixture', a);
    }
    // R-14: cada campo de progreso, solo, cuenta como partida y en la fusión
    const fields = await page.evaluate(() => {
      const st = window.__bk.state, keep = JSON.stringify(st.p), out = [];
      const sets = { collected: (p) => { p.collected = ['no_me_guillo.visible']; }, pantherTalk: (p) => { p.activities.pantherTalk = true; }, skateTutorial: (p) => { p.activities.skateTutorial = true; }, graffiti: (p) => { p.activities.graffiti = true; },
        bridgeTalk: (p) => { p.activities.bridgeTalk = true; }, danceCombo: (p) => { p.activities.danceCombo = true; }, bridgeReached: (p) => { p.bridgeReached = true; }, finalDone: (p) => { p.finalDone = true; }, revealSeen: (p) => { p.revealSeen = true; },
        checkpoint: (p) => { p.checkpoint = { pos: [0, 0, 0], heading: 0, loco: 'walk' }; }, tutorialStarted: (p) => { p.partials.tutorialStarted = true; }, bridgeHeardAissa: (p) => { p.partials.bridgeHeard.aissa = true; },
        graffitiMask: (p) => { p.partials.graffitiMask = 'AAAA'; }, graffitiIntro: (p) => { p.partials.graffitiIntro = true; }, skillGraffiti: (p) => { p.skillGraffiti = [{ i: 0, p: [0, 0.02, 4], n: [0, 1, 0], u: [0, 0, 1], s: 0.7 }]; } };
      for (const [k, f] of Object.entries(sets)) {
        st.p = JSON.parse(keep); f(st.p); const has = st.hasSave;
        // fusión: el disco tiene OTRO linaje; con este campo la pestaña no está vacía → no adopta el del disco (queda obsoleta)
        const disk = JSON.parse(keep); disk.saveEpoch = 'otro-linaje'; const before = st.p.saveEpoch; st.stale = false; st.diskSeen = null;
        localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(disk)); st.mergeFromDisk(); const adopted = st.p.saveEpoch !== before;
        out.push({ k, has, adopted, stale: st.stale }); st.stale = false; }
      st.p = JSON.parse(keep); localStorage.setItem('bellakaventuras.remake.save', keep); st.diskSeen = null; return out; });
    for (const f of fields) R.check(f.has && !f.adopted, `R-14 · ${f.k}: cuenta como partida (hasSave ${f.has}) y no se pierde al fusionar con otra pestaña (adopta otro linaje: ${f.adopted})`, 'fixture', f);
    await page.close(); }
  // R-14b: dos pestañas del mismo linaje
  { const save = { ...FRESH, saveEpoch: 'prueba-2', skillGraffiti: [] };
    const p1 = await openGame(b, R, { save }); await p1.click('#btn-start'); await sleep(600);
    const p2 = await b.newPage(); await p2.setViewport({ width: 1280, height: 800 }); await p2.goto(argUrl() + '?bktest=1&narr=off', { waitUntil: 'load' });
    await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await p2.click('#btn-start'); await sleep(600);
    await p1.evaluate((g) => window.__bk.state.addSkillGraffiti(g), G1); await sleep(200);
    await p2.evaluate((g) => window.__bk.state.addSkillGraffiti(g), G2); await sleep(200);
    await p1.evaluate(() => window.__bk.state.save()); await sleep(200);
    const disk = await p1.evaluate(() => (JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).skillGraffiti ?? []).map((g) => g.i));
    R.check(disk.includes(0) && disk.includes(3), `R-14b · dos pestañas: en el guardado quedan los grafitis de las dos (${JSON.stringify(disk)})`, 'fixture', disk);
    await p1.close(); await p2.close(); }
  await b.close();
}, { timeoutMs: 400000 });
