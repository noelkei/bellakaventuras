// IT8 · candidatos de la revisión de código (V10/IT8/borradores/codigo_*.md) que no tienen prueba propia:
//  N7  · retomar el tutorial guardado en «bájate del skate» (PLA-06): el ejercicio no se da por hecho solo (ANMI ya aparece a pie).
//  N8  · en la plaza blanca del tutorial (SKILLS oculto), las teclas 1–8 no bailan ni grafitean.
//  CE-10 · con mando, tras haber usado el ratón (clic en JUGAR), el foco de la pausa se ve marcado al moverlo con la cruceta.
//  CE-02 · grind con ratón: soltar el clic fuera de la ventana no deja el equilibrio pulsado.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev, S20, toAct, until, pad, padTap, PAD, saveJson } from './lib8.mjs';
const R = new Report('it8-candidatos-extra', { task: arg('task', 'IT8') });
const CASOS = (arg('casos') ?? 'N7,N8,CE-10').split(',');   // CE-02 no se puede emular fielmente (puppeteer entrega el «soltar» a la página aunque sea fuera): solo con --casos CE-02 y como medida
await runTest(R, async () => {
  const b = await launch(); const out = {}; const d = dev('pc720');
  try {
    if (CASOS.includes('N7')) { const page = await open8(b, R, d, 'h', { save: { ...FRESH, settings: { iosAppAsked: true }, narr: { v: 1, estado: 'nuevo', paso: 'PLA-06', practica: false, vistos: ['PLA-01', 'PLA-02', 'PLA-03', 'PLA-05'], ayuda: null } }, query: '?bktest=1' });
      await start8(page, false); const log = [];
      for (let i = 0; i < 24; i++) { await sleep(500); const s = await page.evaluate(() => { const g = window.__bk, d2 = document.getElementById('d2'); return { paso: g.state.p.narr.paso, ex: g.narr.exercise?.id ?? null, d2: d2 && !d2.hidden ? d2.querySelector('.d2-text').textContent.slice(0, 40) : null, loco: g.skater.loco }; }); log.push(s); if (s.ex === 'PLA-06') break; if (s.d2) await page.keyboard.press('KeyE'); }
      await sleep(1500); const tras = await page.evaluate(() => ({ paso: window.__bk.state.p.narr.paso, ex: window.__bk.narr.exercise?.id ?? null, vistos: window.__bk.state.p.narr.vistos.slice(-3) }));
      out.N7 = { log: log.slice(-3), tras };
      R.check(tras.ex === 'PLA-06' || !tras.vistos.includes('PLA-06'), 'N7 · al retomar en «bájate del skate» el ejercicio espera a que el jugador lo haga (no se da por hecho solo)', 'input', out.N7);
      await page.close(); }
    if (CASOS.includes('N8')) { const page = await open8(b, R, d, 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1' }); await start8(page, false);
      await until(page, () => window.__bk.narr.exercise, 30000).then(async () => {}).catch(() => {});
      for (let i = 0; i < 20 && !(await page.evaluate(() => window.__bk.narr.exercise)); i++) { await page.keyboard.press('KeyE'); await sleep(600); }
      const skills = await page.evaluate(() => { const e = document.getElementById('btn-dance'); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; });
      await page.keyboard.press('Digit1'); await sleep(1500); const baila = await page.evaluate(() => window.__bk.activities.find((x) => x.id === 'freeDance').dancing >= 0);
      await page.keyboard.press('KeyW'); await sleep(400); await page.keyboard.press('Digit6'); await sleep(3000);
      const graf = await page.evaluate(() => (window.__bk.state.p.skillGraffiti ?? []).length);
      out.N8 = { skillsVisible: skills, baila, grafitisGuardados: graf, enTutorial: await page.evaluate(() => window.__bk.narr.inTutorial) };
      R.check(skills || (!baila && graf === 0), 'N8 · en la plaza blanca con SKILLS oculto, 1–8 no bailan ni grafitean', 'input', out.N8);
      await page.close(); }
    if (CASOS.includes('CE-10')) { const page = await open8(b, R, dev('pc1080'), 'h', { save: S20 }); await start8(page, false); await sleep(1200);
      await pad(page, {}); await padTap(page, PAD.START); await sleep(600); const marcas = [];
      for (let i = 0; i < 4; i++) { await padTap(page, PAD.DOWN); marcas.push(await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { id: a.id, fv: a.matches(':focus-visible'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, sombra: cs.boxShadow !== 'none' }; })); }
      out['CE-10'] = marcas;
      R.check(marcas.every((m) => m.outline || m.sombra), 'CE-10 · con mando tras usar el ratón, el foco de la pausa se ve marcado', 'input', marcas);
      await page.close(); }
    if (CASOS.includes('CE-02')) { const page = await open8(b, R, d, 'h', { save: S20 }); await start8(page, false); await sleep(1200);
      await toAct(page, 'act.skateTutorial'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await page.keyboard.press('KeyE'); await until(page, () => document.body.classList.contains('grind'), 6000); await sleep(1500);
      const vp = page.viewport(); await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.down({ button: 'left' }); await sleep(300);
      const durante = await page.evaluate(() => window.__bk.input.read().x);
      await page.mouse.move(vp.width + 200, vp.height / 2); await page.evaluate(() => { window.dispatchEvent(new MouseEvent('mouseleave')); document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null })); });
      await page.mouse.up({ button: 'left' }); await sleep(400);
      const tras = await page.evaluate(() => window.__bk.input.read().x);
      out['CE-02'] = { durante, tras };
      R.check(durante !== 0 && tras === 0, 'CE-02 · grind con ratón: soltar el clic fuera de la ventana suelta el equilibrio', 'input', out['CE-02']);
      await page.close(); }
    saveJson('candidatos-extra/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
