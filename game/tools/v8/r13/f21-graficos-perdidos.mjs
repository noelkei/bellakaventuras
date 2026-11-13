// R13 · pérdida del contexto gráfico (móvil al volver de otra app, poca memoria, reinicio de la GPU). Antes la imagen se quedaba negra
// o congelada sin salida. Se provoca de verdad con la extensión WEBGL_lose_context (2 repeticiones):
//  A  aparece el aviso «Se ha perdido la imagen» con el foco en «Continuar»; la partida queda congelada (sin pasos de simulación).
//  B  la partida se guarda al perder la imagen (patatas y punto seguro en el almacenamiento).
//  C  Esc y P no cierran el aviso (cerrarlo dejaba la pantalla negra sin salida).
//  D  «Continuar» recarga; la partida sigue con las mismas patatas y ANMI reaparece en el punto guardado; el juego vuelve a dibujar.
//   node tools/v8/r13/f21-graficos-perdidos.mjs --url pre13 --task R13 --label base
import { Report, runTest, sleep } from '../lib.mjs';
import { launch, abrir, clickStart } from '../r11/f5-lib.mjs';
const R = new Report('r13-f21-graficos-perdidos');
R.expectContextLoss = true;   // V10 R0: esta prueba pierde el contexto A PROPÓSITO (el vigilante del harness no la invalida)
const KEY = 'bellakaventuras.remake.save';
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      const page = await abrir(b, R);
      // ANMI en un sitio conocido, con el punto seguro guardado ahí (como al jugar: 1,5 s apoyada)
      const pre = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.autoMode = false;
        s.teleport(new T.Vector3(-6, 0.03, -40), Math.PI / 2, 'walk'); g.setSafe(true); g.state.save();
        return { total: g.state.total, cp: g.state.p.checkpoint }; });
      R.fixture(`ANMI en (-6, -40) con el punto seguro guardado ahí; ${pre.total} patatas`);
      await sleep(400);
      const r = await page.evaluate(async (KEY) => { const g = window.__bk;
        localStorage.removeItem(KEY);   // para ver que se guarda AL perder la imagen
        const ext = g.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return { sinExt: true };
        ext.loseContext(); await new Promise((r) => setTimeout(r, 600));
        const st0 = g.sim?.now ?? null; await new Promise((r) => setTimeout(r, 500)); const st1 = g.sim?.now ?? null;
        const el = document.getElementById('glost'); const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        return { aviso: !!el && !el.hidden, foco: document.activeElement?.id ?? null, texto: el?.textContent?.replace(/\s+/g, ' ').trim() ?? null, congelada: st0 === st1, st0, st1,
          guardada: !!saved && Array.isArray(saved.collected) && saved.collected.length === g.state.total && !!saved.checkpoint };
      }, KEY);
      if (r.sinExt) { R.invalid(`#${k} el navegador de prueba no ofrece WEBGL_lose_context`, {}); await page.close(); continue; }
      R.check(r.aviso && r.foco === 'btn-glost', `#${k} A al perder la imagen aparece el aviso con el foco en «Continuar» («${r.texto}»)`, 'emulation', r);
      R.check(r.congelada, `#${k} A la partida queda congelada (reloj de simulación ${r.st0} → ${r.st1})`, 'emulation', r);
      R.check(r.guardada, `#${k} B la partida se guarda al perder la imagen`, 'emulation', r);
      await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('KeyP'); await sleep(200);
      const c = await page.evaluate(() => ({ aviso: !document.getElementById('glost')?.hidden && !!document.getElementById('glost'), pausa: !document.getElementById('pause').hidden }));
      R.check(c.aviso, `#${k} C Esc y P no cierran el aviso (aviso ${c.aviso ? 'visible' : 'cerrado'})`, 'input', c);
      if (r.aviso) {
        await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }), page.click('#btn-glost')]);
        await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
        await clickStart(page); await sleep(800);
        const d = await page.evaluate(() => { const g = window.__bk, s = g.skater, gl = g.renderer.getContext(); const f0 = g.renderer.info.render.frame;
          return new Promise((res) => setTimeout(() => res({ total: g.state.total, pie: [s.footPos.x, s.footPos.z].map((q) => +q.toFixed(1)), perdido: gl.isContextLost(), dibuja: g.renderer.info.render.frame > f0 }), 500)); });
        R.check(d.total === pre.total && Math.hypot(d.pie[0] + 6, d.pie[1] + 40) < 1.5 && !d.perdido && d.dibuja,
          `#${k} D «Continuar» recarga y sigue la partida: ${d.total} patatas, ANMI en (${d.pie}), el juego vuelve a dibujar`, 'input', d);
      } else R.check(false, `#${k} D «Continuar» recarga y sigue la partida: no hay aviso que pulsar`, 'input', {});
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
