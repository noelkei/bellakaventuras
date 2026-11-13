// V10.6.1 · guardián de sitio del cronómetro de speedrun: con los paneles de las actividades abiertos (grind, grafiti, baile) y con un aviso
// arriba, el cronómetro no tapa nada suyo (las capas a pantalla completa no cuentan) y sigue dentro de la pantalla y sin tocar la pausa.
// Ordenador, iPhone 12–15 y SE en vertical y horizontal. Los paneles se abren a mano (sin jugar la actividad): mide la maquetación.
// Uso: node tools/v10_6_1/huecos.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev } from '../it8/lib8.mjs';
const R = new Report('v1061-huecos', { task: arg('task', 'V10-6-1') });
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [di, o, t] of [['ip14', 'v', true], ['and360', 'v', true], ['se1', 'v', true], ['ip14', 'h', true], ['and412', 'h', true], ['se1', 'h', true], ['pc720', 'h', false]]) {   // móvil vertical > horizontal > ordenador; iPhone = Android
      const errors = [], page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&narr=off', errors });
      try {
        await start8(page, t); await sleep(800);
        for (const id of ['grind-hud', 'graffiti', 'dance', 'toast']) {
          const r = await page.evaluate((id) => { const e = document.getElementById(id); e.hidden = false; if (id === 'toast') e.textContent = '¡Patata de NO ME GUILLO! 3/20';
            const box = (x) => { const q = x.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map(Math.round); };
            return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
              const c = box(document.getElementById('crono')), p = box(document.getElementById('btn-pause'));
              const cruza = (b) => b[0] < c[2] && c[0] < b[2] && b[1] < c[3] && c[1] < b[3];
              const hits = [...e.querySelectorAll('*'), e].filter((x) => x.offsetWidth && getComputedStyle(x).visibility !== 'hidden' && getComputedStyle(x).opacity !== '0').map((x) => ({ id: x.id || x.className, b: box(x) }))
                .filter(({ b }) => cruza(b) && !(b[0] <= 0 && b[2] >= innerWidth - 1 && b[1] <= 0));   // capas a pantalla completa no cuentan
              e.hidden = true; res({ c, hits: hits.slice(0, 4), pausa: cruza(p), dentro: c[0] >= 0 && c[1] >= 0 && c[2] <= innerWidth && c[3] <= innerHeight }); }))); }, id);
          R.check(!r.hits.length && !r.pausa && r.dentro, `${di} ${o} · ${id}: el cronómetro no tapa nada`, 'emulation', r);
        }
        R.check(!errors.length, `${di} ${o}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
