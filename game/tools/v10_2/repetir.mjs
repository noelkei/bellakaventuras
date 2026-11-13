// V10.2 · Q12 + R-12 (D-12) + Q05 (D-05a): con la actividad HECHA se repite directamente, sin hablar con nadie ni frase final.
// · NVDA hecha y SIN la pista `nv-fennec-intro` (partidas antiguas, `?escena`, SAVE_20): el botón es REPETIR GRIND, al pulsarlo empieza el
//   grind (nadie habla) y al acabar solo sale el aviso (Bellakat no dice nada).
// · NVDA por primera vez: Bellakat sigue diciendo su frase final.
// · FG sin ganar: BAILAR → Bella dice «¡Gánanos a una batalla de baile y te daremos un regalo!» (literal) y tras «Vale» empieza el baile;
//   al ganar por primera vez: «Bueno, ahí lo tienes, pero nosotras siempre seremos mejores haciendo trends!». FG ganado: BAILAR OTRA VEZ
//   empieza el baile directo y al ganar no hay frase.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH, toZone, ui, waitDialog } from './lib102.mjs';
const R = new Report('repetir');
const FG_START = '¡Gánanos a una batalla de baile y te daremos un regalo!', FG_END = 'Bueno, ahí lo tienes, pero nosotras siempre seremos mejores haciendo trends!';
const nv = (page) => page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); return { phase: a.phase, busy: a.busy }; });
/** Termina el grind en curso como si llegara a la meta (la carrera en sí la cubre nv-grind). */
const finishRun = (page) => page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); a.phase = 'exit'; a.t = 99; });
async function noDialogFor(page, ms) { const t0 = Date.now(); let seen = null; while (Date.now() - t0 < ms) { const s = await ui(page); if (s.dialog) { seen = s.dialog; break; } await sleep(100); } return seen; }
await runTest(R, async () => {
  const b = await launch();
  // NVDA hecha sin pista
  { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page);
    await toZone(page, 'act.skateTutorial'); await sleep(700); const s0 = await ui(page);
    R.check(/REPETIR GRIND/.test(s0.action ?? ''), `NVDA hecha sin la pista: el botón es REPETIR GRIND («${s0.action}»)`, 'input', s0);
    await page.keyboard.press('KeyE'); const d1 = await noDialogFor(page, 1500); const r1 = await nv(page);
    R.check(!d1 && ['mount', 'ride', 'exit'].includes(r1.phase), `al pulsar empieza el grind sin charla (fase ${r1.phase}${d1 ? `; habló ${d1.name}: «${d1.text}»` : ''})`, 'input', { d1, r1 });
    if (['mount', 'ride'].includes(r1.phase)) { await finishRun(page); const d2 = await noDialogFor(page, 3000); const s2 = await ui(page);
      R.check(!d2, `al acabar la repetición Bellakat no dice nada${d2 ? ` (dijo «${d2.text}»)` : ''}; aviso: «${s2.toast ?? '—'}»`, 'input', { d2, s2 }); }
    await page.close(); }
  // NVDA primera vez: la frase final se mantiene
  { const page = await openGame(b, R, { save: { ...FRESH, hints: ['basic', 'nv-fennec-intro'] } }); await clickStart(page);
    await toZone(page, 'act.skateTutorial'); await sleep(700); await page.keyboard.press('KeyE'); await sleep(600);
    const r = await nv(page); if (['mount', 'ride'].includes(r.phase)) await finishRun(page);
    const d = await waitDialog(page, 4000);
    R.check(d.dialog?.name === 'Bellakat', `NVDA la primera vez: Bellakat dice su frase final («${d.dialog?.text ?? '—'}»)`, 'input', d);
    await page.close(); }
  // FG sin ganar: frase de inicio y frase final la primera vez
  { const page = await openGame(b, R, { save: FRESH }); await clickStart(page);
    await toZone(page, 'act.danceCombo'); await sleep(700); await page.keyboard.press('KeyE');
    const d = await waitDialog(page, 3000);
    R.check(d.dialog?.name === 'Bella' && d.dialog.text === FG_START, `FG sin ganar: Bella dice «${FG_START}» (dijo ${d.dialog ? `${d.dialog.name}: «${d.dialog.text}»` : 'nada'})`, 'input', d);
    if (d.dialog) { await sleep(400); await page.keyboard.press('KeyE'); await sleep(600); }   // (los primeros 250 ms el diálogo no se cierra con tecla: R11 MIX-03)
    const st = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); return { busy: a.busy, dance: !document.getElementById('dance').hidden, timer: !!a.timer }; });
    R.check(st.busy && st.dance && st.timer, 'tras «Vale» empieza el baile con su tiempo', 'input', st);
    await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); a.stage = 2; a.stageWon(); a.skipCelebration?.(); });
    await sleep(500); await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); a.celebration?.next?.(); });
    const e = await waitDialog(page, 4000);
    R.check(e.dialog?.name === 'Bella' && e.dialog.text === FG_END, `al ganar la primera vez: «${FG_END}» (dijo ${e.dialog ? `«${e.dialog.text}»` : 'nada'})`, 'input', e);
    await page.close(); }
  // FG ganado: directo, sin frases
  { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page);
    await toZone(page, 'act.danceCombo'); await sleep(700); const s0 = await ui(page); await page.keyboard.press('KeyE');
    const d = await noDialogFor(page, 1500); const st = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); return { busy: a.busy, timer: !!a.timer }; });
    R.check(/OTRA VEZ/.test(s0.action ?? '') && !d && st.busy && st.timer, `FG ganado: «${s0.action}» empieza el baile directo, sin diálogo`, 'input', { s0, d, st });
    await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); a.stage = 2; a.stageWon(); });
    await sleep(500); await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); a.celebration?.next?.(); });
    const e = await noDialogFor(page, 2500);
    R.check(!e, `FG ganado otra vez: nadie dice nada al acabar${e ? ` (dijo «${e.text}»)` : ''}`, 'input', e);
    await page.close(); }
  await b.close();
}, { timeoutMs: 400000 });
