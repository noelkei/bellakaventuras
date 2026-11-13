// R7 (usuario, 12 oct) · La Pantera se levanta: (1) para HABLAR (E real): se levanta (raíz adelantada ≈ 0,45 m), hace Talk de
// pie en bucle mirando a ANMI y la frase sigue en pantalla 6 s después; «Vale» → vuelve a sentarse en su sitio (SitIdle);
// (2) BAILAR dentro del recuadro de charla (tecla 3 real): se levanta y baila el MISMO baile que ANMI, sincronizado (tiempo de
// ambas acciones ≤ 0,08 s de diferencia durante 3 s); al parar (BAILAR) vuelve a sentarse; cambiar de baile la cambia también;
// (3) control: bailando FUERA del recuadro sigue sentada.
import { Report, runTest, launch, openGame, clickStart, sleep, place, directShot, SAVE_20, r3 } from '../lib.mjs';
const R = new Report('pantera-npc');
const st = () => { const g = window.__bk, pan = g.npcs.get('la_pantera')[0], a = g.manifest.get('npc.la_pantera'), v = g.visual;
  const an = v.actions?.get(v.currentName);
  return { pan: pan.current?.getClip().name, panT: pan.current?.time ?? null, standing: pan.standing, off: +Math.hypot(pan.root.position.x - a.pos.x, pan.root.position.z - a.pos.z).toFixed(3),
    anmi: v.currentName, anmiT: an ? an.time : null, dialog: !document.getElementById('dialog').hidden, text: document.getElementById('dialog-text').textContent, mode: g.mode }; };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
    const z = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.pantherTalk'), a = g.manifest.get('npc.la_pantera'); return [z.pos.x, z.pos.z, Math.atan2(a.pos.x - z.pos.x, a.pos.z - z.pos.z)]; });
    const s0 = await page.evaluate(st);
    R.check(s0.pan === 'SitIdle' && !s0.standing, 'en reposo, La Pantera está sentada (SitIdle)', 'emulation', s0);
    // (1) charla
    await place(page, R, [z[0], 0, z[1]], z[2], 'walk', 'recuadro de charla'); await sleep(700);
    await page.keyboard.press('KeyE'); await sleep(1200);
    const t1 = await page.evaluate(st);
    await R.shot(page, 'charla_de_pie');
    R.check(t1.pan === 'Talk' && t1.standing && t1.off > 0.35 && t1.dialog, `al hablar se levanta (raíz +${t1.off} m) y habla de pie (Talk) con la frase en pantalla`, 'emulation', t1);
    await sleep(6000);
    const t2 = await page.evaluate(st);
    R.check(t2.dialog && t2.pan === 'Talk' && t2.standing && t2.mode === 'activity', 'a los 7 s la frase sigue y ella sigue de pie hablando (no se cierra sola)', 'emulation', t2);
    await page.click('#dialog-ok'); await sleep(1200);
    const t3 = await page.evaluate(st);
    R.check(!t3.dialog && t3.pan === 'SitIdle' && !t3.standing && t3.off < 0.03 && t3.mode === 'explore', `«Vale» → vuelve a sentarse en su sitio (desvío ${t3.off} m)`, 'emulation', t3);
    // (2) baile sincronizado dentro del recuadro
    await place(page, R, [z[0], 0, z[1]], z[2], 'walk', 'recuadro (baile)'); await sleep(700);
    await page.keyboard.press('Digit3'); await sleep(700);
    const d0 = await page.evaluate(st);
    const diffs = []; for (let i = 0; i < 12; i++) { const q = await page.evaluate(st); if (q.panT != null && q.anmiT != null) diffs.push(Math.abs(q.panT - q.anmiT)); await sleep(250); }
    await R.shot(page, 'bailando_juntas');
    { const q = await page.evaluate(() => { const g = window.__bk, p = g.skater.footPos, a = g.manifest.get('npc.la_pantera').pos; return [p.x, p.z, a.x, a.z]; });
      const mx = (q[0] + q[2]) / 2, mz = (q[1] + q[3]) / 2, dx = q[2] - q[0], dz = q[3] - q[1], L = Math.hypot(dx, dz);
      await directShot(page, R, 'bailando_juntas_lateral', [mx - dz / L * 4.2, 1.5, mz + dx / L * 4.2], [mx, 0.9, mz], 55); }
    const dmax = Math.max(...diffs);
    R.check(d0.pan === 'Dance_Hip_Hop_Dance_2' && d0.anmi === 'Hip_Hop_Dance_2' && d0.standing, 'dentro del recuadro, baile 3: La Pantera se levanta y baila el mismo baile', 'emulation', d0);
    R.check(diffs.length >= 10 && dmax <= 0.08, `sincronizadas: diferencia de tiempo máx ${r3(dmax)} s en 3 s`, 'emulation', { diffs: diffs.map(r3) });
    await page.keyboard.press('Digit6'); await sleep(500);
    const d1 = await page.evaluate(st);
    R.check(d1.pan === 'Dance_FunnyDancing_03' && d1.anmi === 'FunnyDancing_03' && Math.abs(d1.panT - d1.anmiT) <= 0.08, 'cambiar al baile 6 la cambia también (sincronizada)', 'emulation', d1);
    await page.click('#btn-dance'); await sleep(1100);
    const d2 = await page.evaluate(st);
    R.check(d2.pan === 'SitIdle' && !d2.standing && d2.off < 0.03, 'al parar de bailar vuelve a sentarse', 'emulation', d2);
    // (3) fuera del recuadro: sigue sentada
    await place(page, R, [z[0] - Math.sin(z[2]) * 7, 0, z[1] - Math.cos(z[2]) * 7], z[2], 'walk', 'a 7 m'); await sleep(700);
    await page.keyboard.press('Digit1'); await sleep(800);
    const o = await page.evaluate(st);
    R.check(o.anmi === 'Step_Hip_Hop_Dance' && o.pan === 'SitIdle' && !o.standing, 'bailando fuera del recuadro, La Pantera sigue sentada', 'emulation', o);
  } finally { await b.close(); }
}, { timeoutMs: 150000 });
