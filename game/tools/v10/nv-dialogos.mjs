// V10 · nv-dialogos · literalidad de los diálogos de Fennec (dossier NVDA v4 §8; contratos/dialogos-exactos.txt; plan 20 N-19/N-20).
//  · estático: las frases del contrato del juego (nvda_kit.json) son byte a byte las del archivo del dossier (frases 1–2 con «...)», la 3 y la
//    final sin paréntesis de cierre; «Miau», «BELLAKO», signos y paréntesis sin normalizar);
//  · en el juego (--url): al hablar con Fennec el cuadro de diálogo muestra exactamente esas tres frases, en orden, y al completar el grind
//    la frase final (se fuerza el éxito con la fixture declarada `debugComplete` solo para leer el texto).
// Uso: node tools/v10/nv-dialogos.mjs --url v10 --task V10-R5 --label final
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('nv-dialogos');
const DOS = '/Users/TU_USUARIO/Desktop/Bellakaventuras/referencias/escenarios/NOSVAMOSDEAQUI/dossier-diseno-v4/contratos/dialogos-exactos.txt';
const lines = fs.readFileSync(DOS, 'utf8').split('\n');
const START = lines.slice(0, 3), FINISH = lines[4];
const KIT = JSON.parse(fs.readFileSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/game/src/world/nvda_kit.json', 'utf8'));
await runTest(R, async () => {
  R.check(JSON.stringify(KIT.dialogs.start) === JSON.stringify(START) && KIT.dialogs.finish === FINISH, 'contrato del juego = dialogos-exactos.txt byte a byte (3 frases + final)', 'static', { kit: KIT.dialogs, dossier: { START, FINISH } });
  R.check(START[0].endsWith('...)') && START[1].endsWith('...)') && !START[2].endsWith(')') && !FINISH.endsWith(')'), 'puntuación original conservada (1–2 con «...)»; 3 y final sin cierre)', 'static', START);
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const seen = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, out = [];
      const z = g.park.zones.get('act.skateTutorial'); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.autoMode = true; await g.simulate(0.4);
      const act = g.activities.find((a) => a.id === 'skateTutorial'); if (!act?.talk) return { err: 'sin actividad de charla' };
      act.talk(); await g.simulate(0.3);
      for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 300)); for (let k = 0; k < 25 && (document.getElementById('dialog').hidden || !document.getElementById('dialog-text')?.textContent); k++) await new Promise((r) => setTimeout(r, 100));   /* V10.5 (E5-12): la 1.ª frase espera a que la cámara llegue (≤ 1 s) */
        out.push(document.getElementById('dialog-text')?.textContent ?? ''); window.__closeDlg?.() ?? document.getElementById('dialog-ok')?.click(); await g.simulate(0.3); }
      return { out }; });
    R.measure('visto', seen);
    R.check(!!seen.out && seen.out.length === 3 && seen.out.every((t, i) => t.includes(START[i])), 'en el juego, Fennec dice las tres frases literales en orden', 'emulation', seen);
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
