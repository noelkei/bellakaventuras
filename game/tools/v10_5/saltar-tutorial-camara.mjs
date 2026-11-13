// V10.5 r3 · guardián (D5-26): «Saltar tutorial» a mitad de un ejercicio, en ordenador (clic de ratón), y después, libre por la plaza:
//  · el juego vuelve a explorar con la cámara siguiendo a ANMI (no clavada en el último plano del tutorial) y ANMI no está congelada;
//  · con W ANMI se mueve y la cámara la sigue (la distancia cámara–ANMI no crece sin límite);
//  · arrastrar el ratón gira la cámara.
import { Report, runTest, launch, sleep } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('saltar-tutorial-camara');
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await sleep(150); } return null; }
const estado = (page) => page.evaluate(() => { const g = window.__bk, p = g.skater.visualPos, c = g.rig.cam.position;
  return { mode: g.mode, rig: g.rig.mode, frozen: !!g.skater.frozen, x: p.x, z: p.z, dist: Math.hypot(c.x - p.x, c.z - p.z), yaw: g.rig.yaw }; });

await runTest(R, async () => {
  const b = await launch(); const errors = [];
  try {
    const D = dev('pc720'), page = await open7(b, R, D, 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors });
    await start7(page, false);
    const ex = await until(page, () => { const n = window.__bk.narr; if (n.exercise) return n.exercise.id; const d = document.getElementById('d2'); if (d && !d.hidden) document.querySelector('#d2 .d2-btn.primary')?.click(); return null; }, 40000);
    await sleep(1500);
    const s = await page.evaluate(() => { const e = document.getElementById('btn-tuto-skip'); const r = e?.getBoundingClientRect(); return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    if (s) await page.mouse.click(s.x, s.y);
    // Pregunta del modo ayuda, cinemática y frases: se contesta / salta / avanza como un jugador hasta quedar libre 3 s seguidos.
    let libre = 0; const t0 = Date.now();
    while (Date.now() - t0 < 60000 && libre < 3000) {
      const st = await page.evaluate(() => { const g = window.__bk, d = document.getElementById('d2'), cs = document.getElementById('btn-cine-skip');
        if (cs && cs.getBoundingClientRect().width > 0 && !cs.closest('[hidden]')) { cs.click(); return 'cine'; }
        if (d && !d.hidden) { (d.querySelector('.d2-btn.primary') ?? d.querySelector('.d2-row .d2-btn:not(.d2-skip)'))?.click(); return 'd2'; }
        return g.mode === 'explore' && !g.narr.inCine && !g.narr.exercise ? 'libre' : g.mode; });
      libre = st === 'libre' ? libre + 300 : 0; await sleep(300);
    }
    const a = await estado(page);
    R.check(!!ex && !!s && libre >= 3000, `se salta el tutorial con el ratón durante el ejercicio ${ex ?? '—'} y se queda libre por la plaza`, 'input', { ex, boton: s, libre, a });
    R.check(a.mode === 'explore' && a.rig === 'follow' && !a.frozen, 'después: explorando, cámara en «seguir» y ANMI sin congelar', 'input', a);
    await page.mouse.move(640, 360); await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW'); await sleep(800);
    const m = await estado(page), mov = Math.hypot(m.x - a.x, m.z - a.z);
    R.check(mov > 1.5 && m.dist < 12, `con W ANMI anda (${mov.toFixed(2)} m) y la cámara la sigue (a ${m.dist.toFixed(2)} m)`, 'input', { a, m, mov });
    await page.mouse.move(640, 360); await page.mouse.down(); for (let i = 1; i <= 12; i++) { await page.mouse.move(640 + i * 25, 360); await sleep(30); } await page.mouse.up(); await sleep(400);
    const r = await estado(page), dy = Math.abs(Math.atan2(Math.sin(r.yaw - m.yaw), Math.cos(r.yaw - m.yaw)));
    R.check(dy > 0.1, `arrastrar el ratón gira la cámara (${dy.toFixed(2)} rad)`, 'input', { m, r });
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
    await page.close();
  } finally { await b.close(); }
}, { timeoutMs: 240000 });
