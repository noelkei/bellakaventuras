// V10.4 R13 · guardián (usuario: «cuando las tienes todas aún hay un filtro de radio, queremos quitarlo cuando tengas las 4»): en NO ME GUILLO,
// con 4/4 su canción suena por la salida limpia (sin radio) y con 3/4 todavía con radio. Al volumen de siempre (mismo `trims`).
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('radio-limpia');
const Z = 'no_me_guillo';
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [n, col] of [['3/4', ['visible', 'medium', 'hidden']], ['4/4', ['visible', 'medium', 'hidden', 'activity']]]) {
      const page = await openGame(b, R, { save: { ...FRESH, collected: col.map((k) => `${Z}.${k}`), activities: { ...FRESH.activities, pantherTalk: col.length === 4 } } }); await clickStart(page); await sleep(1500);
      await page.evaluate((z) => { const g = window.__bk, T = window.__bkTHREE, p = g.park.sector(z).P(31, 0); g.skater.teleport(new T.Vector3(p.x, 0, p.z), 0, 'walk'); }, Z);
      let m = null; for (let k = 0; k < 40; k++) { await sleep(250); m = await page.evaluate((z) => { const t = window.__bk.audio.music?.tracks.get(z); return t ? { playing: t.playing, clean: t.isClean, gain: +t.gain.toFixed(2) } : null; }, Z); if (m?.playing && m.gain > 0.3) break; }
      R.check(!!m?.playing && m.clean === (n === '4/4'), `${n} en NO ME GUILLO: su canción suena ${n === '4/4' ? 'limpia (sin radio)' : 'con radio'}`, 'input', m);
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
