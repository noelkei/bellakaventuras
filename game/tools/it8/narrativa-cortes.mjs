// IT8 · guardián de cortes del recorrido narrativo (candidatos de la revisión de código V10/IT8/borradores/codigo_narrativa.md):
//  N1 · «Volver a la plaza» (pausa → confirmar) con la 1.ª frase de una presentación (PAS-01) en pantalla: al terminar, la cámara vuelve a
//       seguir a ANMI (modo «follow») y al andar 1,5 s la cámara la acompaña (distancia cámara–ANMI < 9 m) y el juego queda limpio.
//  N2 · «Saltar tutorial» (T) con la pregunta del modo ayuda en pantalla: la pregunta no se pierde (al final hay respuesta o se vuelve a hacer).
//  N3 · recargar con la 1.ª frase de PAS-01 en pantalla SIN confirmarla: al volver, la presentación se ofrece y se termina.
//  N4 · modo ayuda: la pista de los 60 s no congela a ANMI en el aire ni a toda velocidad (espera a que esté en el suelo y casi parada, como
//       la narrativa en narrativa.ts:82).
//  N10 · «Volver a la plaza» en mitad de la escena final: la despedida (DES) sale o queda pendiente para la próxima vez (no se pierde).
// En ordenador (teclado), partida con narrativa (?bktest=1).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev, S0, S20, S20F, N, BASE_VISTOS, TODO_VISTO, collectFry, cleanState, drainUI, until, reload8, saveJson } from './lib8.mjs';
const R = new Report('it8-narrativa-cortes', { task: arg('task', 'IT8') });
const CASOS = (arg('casos') ?? 'N1,N2,N3,N4,N10').split(',');
const d2t = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { t: d.querySelector('.d2-text').textContent.slice(0, 60), n: d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length } : null; });
const narr = (page) => page.evaluate(() => { const g = window.__bk, n = g.state.p.narr; return { estado: n.estado, vistos: n.vistos.slice(), ayuda: n.ayuda, busy: g.narr.busy, cola: g.narr.queue?.slice?.() ?? [], mode: g.mode, cam: g.rig.mode }; });
const S_NMG3 = { ...S0, collected: ['no_me_guillo.visible', 'no_me_guillo.medium', 'no_me_guillo.hidden'], activities: { ...S0.activities, pantherTalk: true } };
async function pas1(page) {   // la 4.ª patata de NMG → PAS-01 en pantalla (sin confirmar)
  await page.evaluate(() => { const g = window.__bk, x = g.pickups.find((q) => q.id === 'no_me_guillo.activity'); x.available = true; x.group.visible = true; });
  await collectFry(page, 'no_me_guillo.activity', 2500);
  return until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 60) : null; }, 15000);
}
async function plaza(page) { await page.keyboard.press('Escape'); await sleep(700); await page.click('#btn-plaza'); await sleep(600); await page.click('#btn-plaza-yes'); await sleep(1500); }
await runTest(R, async () => {
  const b = await launch(); const out = {}; const d = dev('pc720');
  try {
    if (CASOS.includes('N1')) { const errors = []; const page = await open8(b, R, d, 'h', { save: S_NMG3, query: '?bktest=1', errors }); await start8(page, false); await sleep(1500); await drainUI(page, false, 10000);
      const p = await pas1(page); if (!p) R.invalid('N1: no salió PAS-01'); else {
        await plaza(page); const fin = await drainUI(page, false, 45000); await sleep(1500);
        const n = await narr(page); const a = await page.evaluate(() => { const g = window.__bk; return g.rig.cam.position.distanceTo(g.skater.footPos); });
        await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW'); await sleep(600);
        const c = await page.evaluate(() => { const g = window.__bk; return { dist: +g.rig.cam.position.distanceTo(g.skater.footPos).toFixed(2), cam: g.rig.mode }; });
        out.N1 = { pas: p, fin, n, antes: a, despues: c };
        R.check(c.cam === 'follow' && c.dist < 9 && fin?.ok, 'N1 · «Volver a la plaza» en mitad de una presentación: al acabar, la cámara vuelve a seguir a ANMI y el juego queda limpio', 'input', out.N1);
      }
      R.check(!errors.length, 'N1 · sin errores', 'emulation', errors.slice(0, 3)); await page.close(); }
    if (CASOS.includes('N2')) { const page = await open8(b, R, d, 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1' }); await start8(page, false);
      // avanzar el tutorial hasta la pregunta (2 botones) sin contestarla
      let q = null; const t0 = Date.now();
      while (Date.now() - t0 < 120000) { const s = await d2t(page); if (s?.n >= 2) { q = s; break; } const n = await page.evaluate(() => window.__bk.narr.exercise?.id ?? null);
        if (n) { await page.evaluate(() => { const g = window.__bk; const ex = g.narr.exercise; if (ex) ex.check = () => true; }); await sleep(800); continue; }
        if (s) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(300); }
      if (!q) R.invalid('N2: no llegó la pregunta del modo ayuda'); else {
        await sleep(500); await page.keyboard.press('KeyT'); await sleep(1500);
        // seguir como un jugador: saltar la cinemática (Esc), avanzar frases (E); si vuelve la pregunta, se apunta (y se contesta «No»)
        const sigue = async (ms) => { let pregunta = false; const t1 = Date.now();
          while (Date.now() - t1 < ms) { const n = await narr(page); if (n.estado === 'hecho' && !n.busy) break;
            if (await page.evaluate(() => window.__bk.narr.inCine)) { await page.keyboard.press('Escape'); await sleep(800); continue; }
            const s2 = await d2t(page); if (s2?.n >= 2) { pregunta = true; await sleep(450); await page.evaluate(() => { const bs = [...document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')]; bs.at(-1).click(); }); }
            else if (s2) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(300); }
          return pregunta; };
        const p1 = await sigue(120000); const n1 = await narr(page);
        let p2 = false, n2 = null; if (n1.ayuda === null && !p1) { await reload8(page); await start8(page, false); await sleep(1500); p2 = await sigue(120000); n2 = await narr(page); }
        out.N2 = { pregunta: q, vuelvePregunta: p1, trasSaltar: { ...n1, vistos: n1.vistos.length }, trasRecargar: n2 ? { ...n2, vistos: n2.vistos.length } : null, preguntaTrasRecargar: p2 };
        R.check(n1.ayuda !== null || p1 || p2 || (n2 && n2.ayuda !== null), 'N2 · «Saltar tutorial» con la pregunta del modo ayuda en pantalla: la pregunta no se pierde (hay respuesta o se vuelve a hacer)', 'input', out.N2);
      } await page.close(); }
    if (CASOS.includes('N3')) { const page = await open8(b, R, d, 'h', { save: S_NMG3, query: '?bktest=1' }); await start8(page, false); await sleep(1500); await drainUI(page, false, 10000);
      const p = await pas1(page); if (!p) R.invalid('N3: no salió PAS-01'); else {
        await sleep(600); const a = await narr(page);
        await reload8(page); await start8(page, false); await sleep(1500);
        let ok = false; const t0 = Date.now(); while (Date.now() - t0 < 60000) { const n = await narr(page); if (n.vistos.includes('PAS-02')) { ok = true; break; } await drainUI(page, false, 3000); }
        out.N3 = { pas: p, antes: a.vistos.slice(-3), final: (await narr(page)).vistos.slice(-4) };
        R.check(ok, 'N3 · recargar con la 1.ª frase de una presentación en pantalla: al volver se ofrece y se termina', 'input', out.N3);
      } await page.close(); }
    if (CASOS.includes('N4')) { const page = await open8(b, R, d, 'h', { save: { ...S0, collected: ['no_me_guillo.visible'], narr: N(BASE_VISTOS, 'si') }, query: '?bktest=1' }); await start8(page, false); await sleep(1500); await drainUI(page, false, 10000);
      // a toda velocidad en tabla por el paseo exterior y ollie; en el aire, el contador de la pista llega a 60 s
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.input.clear(); s.teleport(new T.Vector3(0, 0.05, -40), Math.PI / 2, 'ride'); s.vel.set(6, 0, 0); g.rig.snapBehind(s); });
      await sleep(300); await page.keyboard.press('Space'); await until(page, () => !window.__bk.skater.grounded, 1500);
      const antes = await page.evaluate(() => { const g = window.__bk, s = g.skater; g.ayuda.idle = 59.99; return { aire: !s.grounded, v: Math.hypot(s.vel.x, s.vel.z), on: g.ayuda.on }; });
      await sleep(200);
      const r = await page.evaluate(() => { const g = window.__bk, s = g.skater, d = document.getElementById('d2'); return { d2: !!d && !d.hidden, frozen: s.frozen, aire: !s.grounded, y: +s.footPos.y.toFixed(2), v: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), mode: g.mode }; });
      out.N4 = { antes, despues: r };
      if (!antes.aire || !antes.on) R.invalid('N4: no se llegó al estado (en el aire con el modo ayuda)', antes);
      else R.check(!(r.frozen && (r.aire || antes.v > 3)), 'N4 · la pista del modo ayuda no congela a ANMI en el aire ni rodando a toda velocidad', 'input', out.N4);
      await drainUI(page, false, 8000); await page.close(); }
    if (CASOS.includes('N10')) { const page = await open8(b, R, d, 'h', { save: { ...S20F, narr: N(TODO_VISTO) }, query: '?bktest=1' }); await start8(page, false); await sleep(1500);
      await page.evaluate(async () => { await window.__bk.loadSnCast?.(); window.__bk.showPreview(); }); await until(page, () => window.__bk.mode === 'preview', 8000); await sleep(3000);
      await page.keyboard.press('Escape'); await sleep(600); const enPausa = await page.evaluate(() => window.__bk.paused);
      if (!enPausa) await page.evaluate(() => window.__bk.setPaused(true)); await sleep(400);
      await page.click('#btn-plaza').catch(() => {}); await sleep(600); await page.click('#btn-plaza-yes').catch(() => {}); await sleep(5000);
      await drainUI(page, false, 20000); const n1 = await narr(page);
      await reload8(page); await start8(page, false); await sleep(5000); await drainUI(page, false, 20000); const n2 = await narr(page);
      out.N10 = { pausa: enPausa, trasPlaza: n1, trasRecargar: n2 };
      R.check(n1.vistos.includes('DES') || n2.vistos.includes('DES'), 'N10 · cortar la escena final con «Volver a la plaza»: la despedida sale (ahora o al volver)', 'input', out.N10);
      await page.close(); }
    saveJson('narrativa-cortes/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
