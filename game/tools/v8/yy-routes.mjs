// V8 · yy-routes: recorrido INTEGRADO de YINYANG con TECLADO REAL y sin teletransportes entre tramos. Única fixture: la colocación
// inicial en el paseo interior frente al sector. R1–R10 del usuario (dos niveles, rampas de 0,70 m subibles a pie): paseo → deck →
// E1 (baja andando) → N1 → R2 abajo a N2 → R2 arriba a pie → otra vez a N2 → fondo bajo el rótulo → R3b arriba a N1 derecho →
// vuelta por N2 → R2 arriba → E1 arriba → deck → cuello de P1 → anillo de P1 (frente de T1). `--clip` guarda fotogramas.
import { Report, runTest, launch, openGame, clickStart, sleep, flag, recStart } from './lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { W, HD, loc, yy, goL } from './yy-lib.mjs';
const R = new Report('yy-routes');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R); await clickStart(page);
    await page.evaluate((p, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, 'walk'); g.rig.snapBehind(g.skater); document.getElementById('hint').hidden = true; }, W(-9.6, 25.0), HD(0, 1));
    R.fixture('ANMI colocada a pie en el paseo interior frente a E1 (única colocación)', W(-9.6, 25.0));
    await sleep(800);
    const P = new Pilot(page, R); const L = async () => { const s = await yy(page); return { ...loc(s), loco: s.loco, g: s.grounded, resp: s.respawns }; };
    const frames = []; let shot = 0;
    const clip = async (tag) => { if (!flag('clip')) return; const f = R.file_(`clip_${String(++shot).padStart(2, '0')}_${tag}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 70 }); frames.push({ t: Date.now(), tag, f }); };
    await clip('inicio');
    // 1 · deck y E1 hacia abajo
    let r = await goL(P, [[-10.7, 27.6], [-10.6, 31.4], [-9.6, 31.4], [-8.6, 31.4], [-7.3, 31.3], [-6.0, 31.1]]); let s = await L();
    R.check(r.ok && Math.abs(s.h + 1.0) < 0.08 && s.resp === 0, 'baja andando por E1 (cinco contrahuellas) hasta N1 (−1,00)', 'input', s); await clip('N1');
    // 2 · R2 abajo a N2 y R2 arriba a pie (rampa de 0,70 m)
    r = await goL(P, [[-4.9, 30.9], [-3.0, 30.6]]); await sleep(700); s = await L();
    R.check(Math.abs(s.h + 1.75) < 0.08 && s.resp === 0 && s.loco === 'walk', 'baja andando por R2 al fondo N2 (−1,75) sin recuperación ni bail', 'input', s); await clip('N2');
    r = await goL(P, [[-5.6, 31.0]], { maxMs: 8000 }); s = await L();
    R.check(Math.abs(s.h + 1.0) < 0.08 && s.resp === 0, 'sube andando por R2 de N2 a N1 (−1,00)', 'input', s);
    // 3 · otra vez a N2, cruza el fondo bajo el rótulo y sube R3b a N1 a la derecha de T1
    r = await goL(P, [[-3.0, 30.0], [-1.2, 28.3], [1.4, 27.9], [4.0, 28.2], [5.8, 29.6], [6.0, 31.0], [6.0, 33.3]], { maxMs: 40000 }); s = await L();
    R.check(r.ok && Math.abs(s.h + 1.0) < 0.08 && s.resp === 0, 'cruza N2 por el paso bajo el rótulo y sube andando R3b a N1 (a la derecha de T1)', 'input', { r: r.why, s }); await clip('N1_derecha');
    // 4 · vuelta: R3b abajo, N2, R2 arriba
    r = await goL(P, [[6.0, 30.5], [4.0, 28.2], [1.4, 27.9], [-1.2, 28.3], [-3.0, 30.0], [-5.6, 31.0]], { maxMs: 40000 }); s = await L();
    R.check(r.ok && Math.abs(s.h + 1.0) < 0.08 && s.resp === 0, 'vuelve por N2 y sube R2 a N1 sin tabla (del vaso solo se sale por E1)', 'input', { r: r.why, s });
    // 5 · sube E1 andando y sale al deck
    r = await goL(P, [[-7.2, 31.3], [-8.4, 31.4], [-9.6, 31.4]]); await sleep(500); s = await L();
    R.check(Math.abs(s.h) < 0.06 && s.resp === 0, 'sube E1 andando y sale al deck (cota 0)', 'input', s); await clip('deck');
    // 6 · por el deck al cuello de P1 y al anillo frente a T1
    r = await goL(P, [[-9.8, 35.6], [-4.0, 36.9], [1.2, 36.2], [1.3, 34.6], [1.0, 33.4], [0.2, 32.6], [-0.1, 31.1], [1.4, 30.35]], { maxMs: 40000 }); s = await L();
    R.check(r.ok && Math.abs(s.h) < 0.06 && s.resp === 0, 'deck → cuello → anillo de P1 hasta el frente de T1 sin caer al vaso', 'input', { r: r.why, s }); await clip('P1_frente');
    R.measure('frames', frames.map((f) => ({ t: f.t, tag: f.tag })));
  } finally { await browser.close(); }
}, { timeoutMs: 600000 });
