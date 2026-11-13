// T5-01/T5-02 · Preview con audio exclusivo (HUM-A5-010, REV04-008, DT-19). Guardado con el final hecho (fixture
// declarada: preview desbloqueado). Instrumentación: analizadores EN PARALELO (no alteran la señal) en el bus del parque
// (music.bus), el bus de efectos (audio.sfxBus, incluye rodadura, grind y motores) y previewGain.
// Casos (entrada real: W, Espacio, Escape y clics):
//  · «triple-real»: guardado 20/20 sin el final (fixture), ventana sin coches OBSERVADA, ancla `final.approach`, W + SALTO en
//    la ventana → triple → preview automático; se mide igual. Además, «repetición rápida»: dos pulsaciones seguidas de
//    «desde el principio» → una sola fuente de preview.
//  · «menú-NMG-rodando»: en tabla a ~5 m/s, Escape → «Escuchar el preview otra vez»; se mide TODO el preview (19 s) +
//    el final con el modal abierto + la salida (Escape) y 2 s después.
//  · «menú-centro»: igual, parada en el centro.
// Contrato: RMS(parque) y RMS(efectos) < 1e-4 desde 0,5 s tras entrar hasta salir; preview con señal (> 1e-3); al salir el
// parque vuelve en ≤ 1,5 s; sin voces duplicadas (liveCount ≤ antes).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, r3 } from './lib.mjs';

const R = new Report('preview-audio');
const SAVE = { ...SAVE_20 };   // 20/20 revelado, final sin hacer: el primer caso es el triple real

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
    const carAngles = () => page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
    const ahead = (a, t) => ((a - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const waitSafe = async () => { for (let i = 0; i < 400; i++) { const a = await carAngles(); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) return true; await sleep(40); } return false; };
    await fixture(page, R, 'analizadores en paralelo: music.bus, audio.sfxBus, music.previewGain (solo lectura)', () => {
      const g = window.__bk, A = g.audio, c = A.ctx, M = A.music;
      const mk = (node) => { const an = c.createAnalyser(); an.fftSize = 2048; node.connect(an); return an; };
      window.__taps = { park: mk(M.bus), sfx: mk(A.sfxBus), prev: mk(M.previewGain) };
      window.__rms = () => { const o = {}; for (const [k, an] of Object.entries(window.__taps)) { const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); o[k] = Math.sqrt(b.reduce((a, v) => a + v * v, 0) / b.length); } return o; };
      return { ctx: c.state };
    });
    const sample = async (ms, tag, out) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await page.evaluate(() => ({ ...window.__rms(), mode: window.__bk.mode, live: window.__bk.audio.music.liveCount, sounding: window.__bk.audio.music.soundingIds.join(',') })); out.push({ t: Date.now() - t0, tag, ...r }); await sleep(250); } };
    const cases = [];
    for (const kase of ['triple-real', 'menu-NMG-rodando', 'menu-centro']) {
      if (kase === 'triple-real') {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          await waitSafe();
          await fixture(page, R, 'ancla final.approach en tabla (ventana sin coches observada)', () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); return { x: a.pos.x }; });
          await sleep(200); await page.keyboard.down('KeyW');
          for (let i = 0; i < 600; i++) { const x = await page.evaluate(() => window.__bk.skater.footPos.x); if (x > -7.8 - 2.6 + 0.5) break; await sleep(8); }
          await page.keyboard.press('Space'); await sleep(400); await page.keyboard.up('KeyW');
          for (let i = 0; i < 200; i++) { if ((await page.evaluate(() => window.__bk.mode)) === 'preview') { ok = true; break; } await sleep(50); }
          if (!ok) { R.invalid(`triple-real intento ${attempt}: no llegó al preview`, await page.evaluate(() => ({ mode: window.__bk.mode, log: (window.__bk.log || []).slice(-3) }))); await sleep(4000); }
        }
        if (!ok) continue;
      } else {
        const unlocked = await page.evaluate(() => window.__bk.state.previewUnlocked);
        if (!unlocked) { R.invalid(`${kase}: preview no desbloqueado`); continue; }
      }
      if (kase === 'menu-centro') await fixture(page, R, 'teleport al centro (cerca del cassette central)', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(3, 0, 4), 0, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      else await fixture(page, R, 'teleport a la llegada NMG en tabla', () => { const g = window.__bk; const m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'ride'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(2500);
      const rows = [];
      let liveBefore = 1;
      if (kase !== 'triple-real') {
        if (kase === 'menu-NMG-rodando') { await page.keyboard.down('KeyW'); await sleep(1300); await page.keyboard.up('KeyW'); }
        await sample(800, 'antes', rows);
        liveBefore = rows.at(-1).live;
        await page.keyboard.press('Escape'); await sleep(400);
        await page.click('#btn-preview-again');
      }
      const tEnter = Date.now();
      await sample(kase === 'triple-real' ? 4000 : 21000, 'preview', rows);
      if (kase === 'triple-real') {
        // repetición rápida: dos pulsaciones seguidas de «desde el principio» → una sola fuente y el parque sigue callado
        await page.click('#btn-play-preview'); await sleep(60); await page.click('#btn-play-preview');
        await sample(20500, 'preview', rows);
        const srcs = await page.evaluate(() => { const mu = window.__bk.audio.music; return { playing: !!mu.previewSrc, state: mu.previewState, gen: mu.previewGen }; });
        R.measure('repeticion_rapida', srcs);
      }
      await sample(2000, 'fin-modal-abierto', rows);
      await page.keyboard.press('Escape');
      await sample(2500, 'salida', rows);
      const prev = rows.filter((r) => r.tag === 'preview');
      const steady = prev.filter((r) => r.t >= 500);
      const park = Math.max(...steady.map((r) => r.park)), sfx = Math.max(...steady.map((r) => r.sfx)), pv = Math.max(...prev.map((r) => r.prev));
      const endModal = rows.filter((r) => r.tag === 'fin-modal-abierto');
      const exit = rows.filter((r) => r.tag === 'salida'); const back = exit.find((r) => r.park > 1e-3);
      const row = { kase, liveBefore, parkMaxPreview: park, sfxMaxPreview: sfx, previewMax: pv, parkEndModal: Math.max(...endModal.map((r) => r.park)), sfxEndModal: Math.max(...endModal.map((r) => r.sfx)),
        backAfterMs: back ? back.t : null, liveAfter: exit.at(-1).live, modes: [...new Set(rows.map((r) => r.mode))], tEnter };
      cases.push({ ...row, rows }); console.log(JSON.stringify(row));
    }
    R.measure('casos', cases);
    for (const c of cases) {
      R.check(c.parkMaxPreview < 1e-4 && c.parkEndModal < 1e-4, `${c.kase}: bus del parque en silencio durante el preview y con el modal final abierto`, 'input', { park: c.parkMaxPreview, endModal: c.parkEndModal });
      R.check(c.sfxMaxPreview < 1e-4 && c.sfxEndModal < 1e-4, `${c.kase}: bus de efectos (rodadura, motor) en silencio durante el preview`, 'input', { sfx: c.sfxMaxPreview, endModal: c.sfxEndModal });
      R.check(c.previewMax > 1e-3, `${c.kase}: el preview suena`, 'input', { prev: c.previewMax });
      R.check(c.backAfterMs !== null && c.backAfterMs <= 1500 && c.liveAfter <= Math.max(1, c.liveBefore), `${c.kase}: al salir el parque vuelve en ≤1,5 s sin voces duplicadas`, 'input', { backAfterMs: c.backAfterMs, liveBefore: c.liveBefore, liveAfter: c.liveAfter });
    }
    R.pendingHuman('Escucha humana del preview y su entrada/salida (G8-A)');
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
