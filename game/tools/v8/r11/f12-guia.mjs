// R11 · F12 · guía y textos (simulación determinista para el tiempo; textos leídos del HUD real).
//  GUIA-01  NMG con la actividad hecha y 3/4: tras 46 s en la zona sin recoger, el objetivo dice dónde está la que falta («Falta: …U…»).
//  SIS-24   en NMG (completa) con solo FASHION GIRL pendiente (sector vecino en sentido horario): «Siguiente: FASHION GIRL (sentido horario)».
//  GUIA-05  en el disco central con zonas pendientes: el objetivo nombra la siguiente zona (no solo el total).
//  GUIA-02  TRA TRA TRA con la charla pendiente: el objetivo dice que hay que subir a la limo.
//  GUIA-03  YINYANG con el grafiti pendiente: el objetivo nombra a la rana.
//  ING-01   FASHION GIRL con el baile pendiente: el objetivo dice «pista de baile» y «BAILAR» (bloqueo de la partida ingenua B11).
//  PADX-01  circuito tutorial (V10: grind de NOSVAMOSDEAQUÍ) con mando: ningún paso habla de teclas de teclado (Espacio, C, W, Q, ratón).
//  No empeorar: con teclado los textos del tutorial son los de siempre (Espacio / Mantén C).
//   node tools/v8/r11/f12-guia.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, sleep, SAVE_20 } from './f5-lib.mjs';
const R = new Report('r11-f12-guia');
const sin = (ids, acts = {}) => ({ ...SAVE_20, collected: SAVE_20.collected.filter((c) => !ids.includes(c)), activities: { ...SAVE_20.activities, ...acts }, finalDone: false, finalProof: null, revealSeen: false });
const OBJ = () => document.getElementById('objective')?.textContent ?? '';
const en = async (page, p, h = 0, sec = 0.5) => { await page.evaluate(async (p, h, sec) => { const g = window.__bk, T = window.__bkTHREE; window.__R11.releaseAll(); g.skater.teleport(new T.Vector3(p[0], p[1], p[2]), h, 'walk'); g.autoMode = true; await g.simulate(sec); g.updateObjective(); }, p, h, sec); return page.evaluate(OBJ); };
const pol = (r, th) => [r * Math.sin(th * Math.PI / 180), 0.02, -r * Math.cos(th * Math.PI / 180)];
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      { const page = await abrir(b, R, { save: sin(['no_me_guillo.hidden']) });
        const o0 = await en(page, pol(30, 36), 0, 1); const o1 = await en(page, pol(30, 36), 0, 46);
        R.check(/Falta:/.test(o1) && /U/.test(o1) && !/Falta:/.test(o0), `#${k} GUIA-01 NMG 3/4: a los 46 s el objetivo dice dónde está la que falta («${o1}»; al llegar «${o0}»)`, 'input', { o0, o1 });
        await page.close(); }
      { const page = await abrir(b, R, { save: sin(['fashion_girl.hidden']) });
        const o = await en(page, pol(30, 36));
        R.check(/FASHION GIRL/.test(o) && /sentido horario/.test(o) && !/antihorario/.test(o), `#${k} SIS-24 en NMG con solo FASHION GIRL pendiente: «${o}» (sector vecino, sentido horario)`, 'input', { o });
        const c = await en(page, [0.5, 0.02, 0.5]);
        R.check(/Siguiente: FASHION GIRL/.test(c), `#${k} GUIA-05 en el disco central: el objetivo nombra la siguiente zona («${c}»)`, 'input', { c });
        await page.close(); }
      { const page = await abrir(b, R, { save: sin(['tratratra.activity', 'yinyang.activity', 'fashion_girl.activity'], { bridgeTalk: false, graffiti: false, danceCombo: false }) });
        const t = await en(page, pol(30, 180)); const y = await en(page, pol(30, 252)); const fgo = await en(page, pol(30, 108));
        R.check(/pista de baile/i.test(fgo) && /BAILAR/.test(fgo), `#${k} ING-01 FASHION GIRL con el baile pendiente: «${fgo}» (dónde y cómo empezar)`, 'input', { fgo });
        R.check(/limo/i.test(t), `#${k} GUIA-02 TRA TRA TRA con la charla pendiente: «${t}» (dice que hay que subir a la limo)`, 'input', { t });
        R.check(/Bellakroak/.test(y), `#${k} GUIA-03 YINYANG con el grafiti pendiente: «${y}» (nombra a Bellakroak: V10.1 P08)`, 'input', { y });
        await page.close(); }
      { const page = await abrir(b, R);
        // V10 (cambio de diseño aprobado): el circuito tutorial se sustituye por el grind de NOSVAMOSDEAQUÍ (misma clave `skateTutorial`);
        // sus textos de ayuda son el de equilibrio (balanceText) y el aviso de agacharse en la vuelta (crouchText). Teclado: «A/D» y «mantén C».
        const txt = await page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'skateTutorial'), out = { pad: [], key: [] }, s0 = a.step;
          for (const src of ['gamepad', 'keyboard']) { g.input.source = src; const o = out[src === 'gamepad' ? 'pad' : 'key'];
            if (a.stepText) { for (let i = 0; i < 5; i++) { a.step = i; o.push(a.stepText()[1]); } } else o.push(a.balanceText(), a.crouchText()); }
          a.step = s0; g.input.source = 'keyboard'; return out; });
        const malo = txt.pad.filter((t) => /Espacio|Mantén C|\bW\b|\bQ\b|ratón|J\/L/.test(t));
        R.check(malo.length === 0, `#${k} PADX-01 circuito con mando: ningún paso habla de teclas de teclado (${malo.length} lo hacen)`, 'input', txt);
        R.check(txt.key.length === 2 ? /A\/D/.test(txt.key[0]) && /mantén C/i.test(txt.key[1]) : /Espacio/.test(txt.key[2]) && /Mantén C/.test(txt.key[3]), `#${k} no empeorar: con teclado los textos dicen las teclas (NVDA: A/D y mantén C; circuito: Espacio / Mantén C)`, 'input', txt);
        await page.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
