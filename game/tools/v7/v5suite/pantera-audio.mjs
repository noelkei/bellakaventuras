// R2-G8 (usuario, 12 oct) · Sonido de La Pantera en NO ME GUILLO, medido en el AudioContext real del juego (Chrome headless):
//  · calibración: junto al recuadro de charla, RMS de la música (bus de música) frente a RMS de las VOCES del emisor (ventanas
//    activas); devuelve la ganancia que las iguala (`TUNING.panteraSound.gain`) → criterio: voces/música 0,8–1,25 (±2 dB);
//  · distancia: ganancia monótona decreciente al alejarse por el sector; ≤ 5 % del máximo en el borde del sector; 0 fuera;
//  · charla (E real): el emisor calla durante el diálogo y vuelve al terminar.
import { Report, runTest, launch, openGame, clickStart, sleep, place, r3 } from '../lib.mjs';
const R = new Report('pantera-audio');
const sample = (ms) => new Promise((res) => setTimeout(res, ms));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1500);
    const geo = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.pantherTalk'), a = g.manifest.get('npc.la_pantera'); return { z: [z.pos.x, z.pos.z, z.r], a: [a.pos.x, a.pos.z] }; });
    // junto al recuadro (dentro, de cara a La Pantera)
    const h0 = Math.atan2(geo.a[0] - geo.z[0], geo.a[1] - geo.z[1]);
    await place(page, R, [geo.z[0], 0, geo.z[1]], h0, 'walk', 'recuadro de charla'); await sleep(2500);
    const rows = [];
    for (let i = 0; i < 160; i++) {
      rows.push(await page.evaluate(() => { const A = window.__bk.audio, rms = (an) => { if (!an) return null; const x = new Float32Array(an.fftSize); an.getFloatTimeDomainData(x); return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length); };
        return { m: rms(A.musicTap), e: rms(A.emitterTap), g: window.__bk.panteraGain, info: A.emitterInfo('pantera'), ctx: A.ctx?.state }; }));
      await sample(50);
    }
    const info = rows.at(-1).info, g0 = rows.at(-1).g;
    R.check(!!info?.loaded && !info.error, 'el emisor de La Pantera carga y suena en bucle', 'emulation', { info, ctx: rows.at(-1).ctx });
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const musicIn = med(rows.map((r) => r.m)), eMax = Math.max(...rows.map((r) => r.e));
    const act = rows.filter((r) => r.e > eMax * 0.25).map((r) => r.e), voice = act.length ? Math.sqrt(act.reduce((s, v) => s + v * v, 0) / act.length) : 0;
    // R4: la canción FUERA del recuadro (sin atenuar) como referencia; dentro baja a talkDuck
    const zr = geo.z[2], away = [geo.z[0] + (geo.z[0] - geo.a[0]) / Math.hypot(geo.z[0] - geo.a[0], geo.z[1] - geo.a[1]) * (zr + 2.6), geo.z[1] + (geo.z[1] - geo.a[1]) / Math.hypot(geo.z[0] - geo.a[0], geo.z[1] - geo.a[1]) * (zr + 2.6)];
    await place(page, R, [away[0], 0, away[1]], h0, 'walk', 'fuera del recuadro (+2,6 m)'); await sleep(2500);
    const mo = []; for (let i = 0; i < 80; i++) { mo.push(await page.evaluate(() => { const an = window.__bk.audio.musicTap, x = new Float32Array(an.fftSize); an.getFloatTimeDomainData(x); return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length); })); await sample(50); }
    const musicOut = med(mo), duck = musicIn / Math.max(1e-9, musicOut), ratio = voice / Math.max(1e-9, musicOut);
    R.measure('niveles junto al recuadro', { musicOut: r3(musicOut), musicIn: r3(musicIn), duck: r3(duck), duck_dB: r3(20 * Math.log10(duck)), voice: r3(voice), gain: g0, voz_vs_cancion_dB: r3(20 * Math.log10(ratio || 1e-9)) });
    R.check(duck >= 0.45 && duck <= 0.68, `dentro del recuadro la canción baja (×${r3(duck)}, ${r3(20 * Math.log10(duck))} dB)`, 'emulation', { musicIn, musicOut });
    R.check(ratio >= 1.15 && ratio <= 1.6, `La Pantera algo más alta que la canción sin atenuar (${r3(20 * Math.log10(ratio || 1e-9))} dB; antes calibrada a 0 dB)`, 'emulation', { voice, musicOut, g0 });
    // distancia: hacia el borde del sector y fuera
    const prof = [];
    for (const d of [3, 6, 9, 12, 15, 18, 21, 26]) {
      const p = await page.evaluate((d) => { const g = window.__bk, a = g.manifest.get('npc.la_pantera'), { r, th } = window.__bkPolar ? window.__bkPolar(a.pos) : { r: Math.hypot(a.pos.x, a.pos.z), th: Math.atan2(a.pos.x, -a.pos.z) * 180 / Math.PI };
        // a lo largo del sector (tangente, sentido de θ creciente): misma r que La Pantera
        const t = th * Math.PI / 180 + d / r; return [r * Math.sin(t), r * -Math.cos(t), r, th]; }, d);
      await place(page, R, [p[0], 0, p[1]], 0, 'walk', `a ${d} m por el sector`); await sleep(900);
      const q = await page.evaluate(() => ({ g: window.__bk.panteraGain, zone: window.__bk.zone }));
      prof.push({ d, g: r3(q.g), rel: r3(q.g / Math.max(1e-9, g0)), zone: q.zone, edgeDeg: r3(p[3] + d / p[2] * 180 / Math.PI) });
    }
    R.measure('ganancia por distancia (relativa al recuadro)', prof);
    R.check(prof.every((x, i) => i === 0 || x.g <= prof[i - 1].g + 1e-6), 'la ganancia baja (o se mantiene) al alejarse', 'emulation', prof);
    const edge = prof.find((x) => x.zone !== 'no_me_guillo') ?? prof.at(-1), inside = prof.filter((x) => x.zone === 'no_me_guillo').at(-1);
    R.check(edge.rel <= 0.05, `al salir del sector casi no se oye (${edge.rel} del nivel del recuadro; último punto dentro: ${inside?.d} m → ${inside?.rel})`, 'emulation', { edge, inside });
    // charla ×4 (E real): frases alternas (impares «Fuuuuck...», pares las dos frases) y silencio de canción y ambiente
    const rmsNow = () => page.evaluate(() => { const an = window.__bk.audio.musicTap, x = new Float32Array(an.fftSize); an.getFloatTimeDomainData(x); return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length); });
    const want = ['Fuuuuck...', 'Échate un novio samsung pa que yo no te lo note...', 'Fuuuuck...', 'A mí también me sigue un shinigami...'];
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await place(page, R, [geo.z[0], 0, geo.z[1]], h0, 'walk', `recuadro de charla (${i + 1})`); await sleep(1600);
      await page.keyboard.press('KeyE'); await sleep(1300);
      const during = await page.evaluate(() => ({ g: window.__bk.panteraGain, mode: window.__bk.mode, text: document.getElementById('dialog')?.innerText ?? '' }));
      let mus = 0; for (let k = 0; k < 10; k++) { mus = Math.max(mus, await rmsNow()); await sample(60); }
      seen.push({ ...during, musicRmsMax: r3(mus) });
      await sleep(1500);
      const still = await page.evaluate(() => !document.getElementById('dialog').hidden && window.__bk.mode === 'activity');
      seen.at(-1).sigueAbierta = still;   // R7: no se cierra sola
      await page.click('#dialog-ok'); await sleep(1600);
    }
    const after = await page.evaluate(() => ({ g: window.__bk.panteraGain, mode: window.__bk.mode }));
    R.measure('charlas', seen);
    R.check(seen.every((x, i) => x.text.includes(want[i])), 'frases: 1.ª «Fuuuuck...», 2.ª «Échate un novio samsung…», 3.ª «Fuuuuck...», 4.ª «A mí también me sigue un shinigami...»', 'emulation', seen.map((x) => x.text));
    R.check(seen.every((x) => x.mode === 'activity' && x.g === 0 && x.musicRmsMax < 0.01), 'mientras habla no suenan la canción ni su sonido ambiente', 'emulation', seen);
    R.check(after.mode === 'explore' && after.g > 0.5 * g0, 'al terminar vuelve su sonido', 'emulation', { after, g0 });
    R.check(seen.every((x) => x.sigueAbierta), 'la frase sigue en pantalla 2,8 s después (no se cierra sola: espera a «Vale»)', 'emulation', seen.map((x) => x.sigueAbierta));
  } finally { await b.close(); }
}, { timeoutMs: 180000 });
