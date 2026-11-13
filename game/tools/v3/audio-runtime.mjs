// AUD-01 / AUD-02 / AUD-04 en ejecución (Chrome sin interfaz: EMULACIÓN; el analizador/ganancias no demuestran salida
// audible y nada de esto vale como prueba en iPhone físico).
//   F  frontera: teclado real dando vueltas sobre la intersección de dos sectores junto al centro; por muestra cuenta voces
//      vivas (colas incluidas) y voces con ganancia real > umbral; ruido solo con su voz; descargas por tema; buffers vivos;
//      fase al revisitar (offset de arranque = reloj de la pista, no 0)
//   C  ciclos: dos ciclos y pico de cada bucle por la cadena del juego (4/4), costuras medidas y WAV fuera de public
//   S  sesión: navigator.audioSession simulada (orden: playback antes del contexto), API que lanza, resume que falla →
//      «Activar sonido» → clic → suena; pausa/reanudar sin fuentes nuevas; mute persiste tras recargar
//   P  preview: abrir/cerrar cinco veces con carga lenta (clics reales), onended antiguo inofensivo, fallo de red
//   node tools/v3/audio-runtime.mjs [FCSP] → captures/v3/P4/AUD-RT/audio-runtime.json
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, GAME } from './lib.mjs';

const which = (process.argv[2] ?? 'FCSP').toUpperCase();
const fx = (n) => fs.readFileSync(path.join(GAME, 'tools', 'fixtures', n + '.json'), 'utf8');
const R = new Report('P4/AUD-RT', 'audio-runtime', { method: 'teclado/ratón reales y bucle RAF; fixtures declaradas (posición, guardado, red lenta, API simulada); EMULACIÓN' });
const browser = await launch();
const clickSel = async (page, sel) => { const h = await page.$(sel); const b = await h.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
const AUDIBLE = 0.01;   // umbral declarado: ganancia real de salida de la voz (≈ −40 dB)

try {
  if (which.includes('F')) {
    const page = await openGame(browser, R, { save: null });
    const reqs = {}; page.on('request', (rq) => { const m = rq.url().match(/\/audio\/([^/?]+)/); if (m) reqs[m[1]] = (reqs[m[1]] ?? 0) + 1; });
    // registro de arranques de fuentes (duración del buffer, offset pedido y hora del contexto) para comprobar la fase
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    await page.evaluate(() => {
      const mu = window.__bk.audio.music; window.__starts = [];
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, off, ...rest) {
        if (this.buffer && this.buffer.duration > 5) { const t = [...mu.tracks.values()].find((x) => x.buffer === this.buffer); if (t) window.__starts.push({ id: t.id, off: off ?? 0, now: mu.ctx.currentTime, t0: t.t0, dur: this.buffer.duration }); }
        return orig.call(this, when, off, ...rest);
      };
    });
    R.fixture('posición de salida en la intersección NO ME GUILLO / NOSVAMOSDEAQUI junto al centro (r 25, θ 2°)', 'teleport inicial; el recorrido es teclado real');
    await page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'), a = S.P(25, -34), b = S.P(25, -33); g.skater.teleport(a, Math.atan2(b.x - a.x, b.z - a.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
    await sleep(500);
    const samples = []; let stop = false;
    const sampler = (async () => {
      while (!stop) {
        samples.push(await page.evaluate((AUD) => {
          const g = window.__bk, mu = g.audio.music, now = mu.ctx.currentTime, p = g.skater.footPos;
          const ts = [...mu.tracks.values()];
          return { r: Math.hypot(p.x, p.z), th: (Math.atan2(p.x, -p.z) * 180 / Math.PI + 360) % 360,   // misma convención que toPolar
            live: ts.filter((t) => t.playing || t.endingUntil > now).length,
            audible: ts.filter((t) => t.out.gain.value > AUD).map((t) => t.id),
            strayNoise: ts.filter((t) => !t.playing && t.noise).length,
            buffers: ts.filter((t) => t.buffer).length, w: Object.fromEntries(Object.entries(g.musicDebug).filter(([, v]) => v > 0.01).map(([k, v]) => [k, +v.toFixed(2)])) };
        }, AUDIBLE));
        await sleep(40);
      }
    })();
    // vueltas: W + giro alternando sentido, 3 tramos de 6 s; la trayectoria cruza la frontera y entra/sale de la influencia del centro
    for (const turn of ['KeyA', 'KeyD', 'KeyA']) { await page.keyboard.down('KeyW'); await page.keyboard.down(turn); await sleep(6000); await page.keyboard.up(turn); await sleep(700); }
    await page.keyboard.up('KeyW');
    // revisita: alejarse a pleno NOSVAMOSDEAQUI no basta (sigue sonando); ir a YINYANG en línea recta y volver
    R.fixture('traslado a YINYANG y regreso (posición), para comprobar la fase al revisitar', 'teleport de recorrido largo; la música se mide en tiempo real');
    await page.evaluate(() => { const g = window.__bk, S = g.park.sector('yinyang'), a = S.P(34, 0); g.skater.teleport(a, 0, 'walk'); g.input.clear(); });
    await sleep(5000);
    await page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'), a = S.P(34, 0); g.skater.teleport(a, 0, 'walk'); g.input.clear(); });
    await sleep(3000);
    stop = true; await sampler;
    const starts = await page.evaluate(() => window.__starts);
    const stats = await page.evaluate(() => ({ ...window.__bk.audio.music.stats }));
    const nearX = samples.filter((s) => s.r < 30 && (s.th < 12 || s.th > 348));
    const threeW = samples.filter((s) => Object.keys(s.w).length >= 3).length;
    R.data.frontier = { n: samples.length, nearIntersection: nearX.length, withThreeWeights: threeW, trace: samples.filter((_, i) => i % 5 === 0) };
    R.check(nearX.length > 40 && threeW > 10, 'el recorrido pasa por la intersección (tres pesos > 0: dos sectores y centro)', 'input', { nearX: nearX.length, threeW });
    R.check(samples.every((s) => s.live <= 2), 'nunca más de dos voces de canción vivas (colas incluidas)', 'input', { maxLive: Math.max(...samples.map((s) => s.live)), stats });
    R.check(samples.every((s) => s.audible.length <= 2), `nunca más de dos voces con ganancia de salida > ${AUDIBLE}`, 'input', { maxAudible: Math.max(...samples.map((s) => s.audible.length)) });
    R.check(samples.every((s) => s.strayNoise === 0), 'el ruido de radio solo existe con su voz (sin estática suelta tras parar)', 'input');
    R.check(samples.every((s) => s.buffers <= 3), 'como mucho tres buffers decodificados vivos', 'input', { maxBuffers: Math.max(...samples.map((s) => s.buffers)) });
    R.check(Object.values(reqs).every((n) => n === 1), 'cada corte se descarga una sola vez (sin descargas por fotograma ni tras expulsar)', 'input', reqs);
    const ph = starts.map((s) => ({ ...s, expect: (((s.now - s.t0) % s.dur) + s.dur) % s.dur }));
    const re = ph.filter((s, i) => ph.slice(0, i).some((q) => q.id === s.id));
    R.data.starts = ph; console.log("arranques", JSON.stringify(ph.map((s) => [s.id, +s.off.toFixed(2), +s.expect.toFixed(2)])));
    R.check(re.length > 0 && re.every((s) => Math.abs(s.off - s.expect) < 0.05 && s.off > 0.2), 'al revisitar, la pista retoma su fase (offset = reloj de la pista, no vuelve a 0)', 'input', re);
    await page.close();
  }

  if (which.includes('C')) {
    const page = await openGame(browser, R, { save: null });
    const res = await page.evaluate(async () => {
      const g = window.__bk; g.audio.unlock(); const mu = g.audio.music, out = {};
      for (const id of mu.tracks.keys()) {
        await mu.ensure(id); const t = mu.tracks.get(id), dur = t.buffer.duration;
        const x = await window.__bkRenderState(t.buffer, mu.params, id === 'secrenovio' ? -1 : 1, 0, dur * 2.25, 22050, mu.cfg.trims?.[id] ?? 0, mu.cfg.trimsPre?.[id] ?? 0);
        const b = x.buffer, sr = b.sampleRate, L = b.getChannelData(0), Rr = b.getChannelData(1), n = L.length;
        // potencia estéreo (L y R por separado: la suma mono cancela material abierto); ventana 250 ms en exteriores y 1 s en
        // el estado central (sus cortes de señal aleatorios hacen ruidosa una ventana corta)
        const rms = (a, len) => { let s = 0; for (let i = a; i < a + len; i++) s += L[i] * L[i] + Rr[i] * Rr[i]; return Math.sqrt(s / (2 * len)); };
        const W = 80, winMax = (a) => { let mj = 0; for (let i = a; i < a + W; i++) mj = Math.max(mj, Math.abs(L[i] - L[i - 1]), Math.abs(Rr[i] - Rr[i - 1])); return mj; };
        // referencia: percentil 99 del salto máximo en ventanas de 80 muestras del propio render (misma métrica que en la costura)
        const ref = []; for (let a = 1; a + W < n; a += 997) ref.push(winMax(a)); ref.sort((a, c) => a - c); const p99 = ref[Math.floor(ref.length * 0.99)];
        const w = Math.round(sr * (id === 'secrenovio' ? 1 : 0.25)), seams = [];
        for (const k of [1, 2]) { const at = Math.round(dur * k * sr); seams.push({ at: +(dur * k).toFixed(2), jump: +winMax(at - W / 2).toFixed(4), dDb: +(20 * Math.log10(rms(at, w) / rms(at - w, w))).toFixed(2) }); }
        // WAV mono 16 bit para escucha posterior (fuera de public)
        const pcm = new Int16Array(n); for (let i = 0; i < n; i++) pcm[i] = Math.max(-1, Math.min(1, (L[i] + Rr[i]) / 2)) * 32767;
        let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        out[id] = { loopS: +dur.toFixed(3), cycles: +(n / sr / dur).toFixed(2), p99: +p99.toFixed(4), seams, sr, pcm: btoa(bin) };
      }
      return out;
    });
    for (const [id, v] of Object.entries(res)) {
      const pcm = Buffer.from(v.pcm, 'base64'); delete v.pcm;
      const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
      hdr.writeUInt32LE(v.sr, 24); hdr.writeUInt32LE(v.sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
      fs.writeFileSync(path.join(R.dir, `ciclos_${id}.wav`), Buffer.concat([hdr, pcm]));
      R.check(v.cycles >= 2 && v.seams.every((s) => s.jump <= v.p99 * 1.2 && Math.abs(s.dDb) <= 3), `${id}: dos ciclos por la cadena del juego sin chasquido (salto ≤ 1,2 × p99 de ventanas iguales) ni salto de nivel (±3 dB)`, 'static', v);
    }
    R.note('Los WAV ciclos_*.wav (mono, 22,05 kHz, estado 4/4; SECRENOVIO en estado central) quedan para escucha: costura MEDIDA, no aprobada de oído.');
    await page.close();
  }

  if (which.includes('S')) {
    // API de sesión simulada: registra el orden respecto a la creación del contexto
    const page = await openGame(browser, R, { save: null });
    await page.evaluateOnNewDocument(() => {
      window.__order = [];
      const AS = { _type: 'auto', state: 'inactive', onstatechange: null, get type() { return this._type; }, set type(v) { window.__order.push('session:' + v); this._type = v; } };
      Object.defineProperty(navigator, 'audioSession', { value: AS, configurable: true });
      const Orig = window.AudioContext; let failResume = 1;
      window.AudioContext = class extends Orig {
        constructor(o) { window.__order.push('ctx'); super(o); this.suspend(); }
        resume() { if (failResume-- > 0) { window.__order.push('resume-reject'); return Promise.reject(new DOMException('simulado', 'NotAllowedError')); } window.__order.push('resume'); return super.resume(); }
      };
    });
    R.fixture('navigator.audioSession simulada y AudioContext cuyo primer resume() se rechaza', 'evaluateOnNewDocument');
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await clickStart(page); await sleep(600);
    const s1 = await page.evaluate(() => ({ order: window.__order, session: window.__bk.audio.session, ctx: window.__bk.audio.ctx.state, need: window.__bk.audio.needsGesture, fixVisible: !document.getElementById('btn-sound-fix').hidden }));
    R.check(s1.order[0] === 'session:playback' && s1.order.indexOf('ctx') > 0 && s1.session.type === 'playback', 'con la API presente: type = playback antes de crear el contexto', 'input', s1);
    R.check(s1.ctx !== 'running' && s1.need && s1.fixVisible, 'resume() rechazado: sin excepción y aparece «Activar sonido» (distinto de silenciar)', 'input', s1);
    await clickSel(page, '#btn-sound-fix'); await sleep(800);
    const s2 = await page.evaluate(() => ({ ctx: window.__bk.audio.ctx.state, fixVisible: !document.getElementById('btn-sound-fix').hidden, live: window.__bk.audio.music.liveCount, starts: window.__bk.audio.music.stats.starts, unlocks: window.__bk.audio.unlockCount, errors: window.__bk.audio.log.filter((l) => /fail|throw/.test(l)).length }));
    R.check(s2.ctx === 'running' && !s2.fixVisible && s2.live >= 1 && s2.live <= 2, 'clic en «Activar sonido»: contexto en marcha, botón oculto, una voz de música', 'input', s2);
    // pausa/reanudar: las fuentes viven en el contexto suspendido; volver no arranca otra
    await page.keyboard.press('Escape'); await sleep(500);
    const s3 = await page.evaluate(() => ({ ctx: window.__bk.audio.ctx.state, paused: window.__bk.paused }));
    await clickSel(page, '#btn-resume'); await sleep(1200);
    const s4 = await page.evaluate(() => ({ ctx: window.__bk.audio.ctx.state, live: window.__bk.audio.music.liveCount, starts: window.__bk.audio.music.stats.starts, fixVisible: !document.getElementById('btn-sound-fix').hidden }));
    R.check(s3.paused && s3.ctx === 'suspended' && s4.ctx === 'running' && s4.starts === s2.starts && s4.live === s2.live && !s4.fixVisible, 'pausa suspende y reanudar no duplica fuentes ni pide gesto', 'input', { s3, s4, before: s2 });
    // silenciar en la pausa → recargar → sigue silenciado (y «Activar sonido» no aparece con el juego en silencio)
    await page.keyboard.press('Escape'); await sleep(300); await clickSel(page, '#btn-mute'); await sleep(300);
    const m1 = await page.evaluate(() => ({ muted: window.__bk.audio.muted, master: window.__bk.audio.master.gain.value, saved: JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings?.muted }));
    await clickSel(page, '#btn-resume'); await sleep(2500);
    const m1b = await page.evaluate(() => ({ master: +window.__bk.audio.master.gain.value.toFixed(4), audible: [...window.__bk.audio.music.tracks.values()].filter((t) => t.out.gain.value > 0.01).length }));
    R.check(m1.muted && m1.saved === true && m1b.master < 0.001 && m1b.audible === 0, 'Silenciar: master a 0, música del mundo sin ganancia y ajuste guardado', 'input', { m1, m1b });
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    const m2 = await page.evaluate(() => ({ label: document.getElementById('btn-sound-start').textContent, muted: window.__bk.audio.muted }));
    await clickStart(page); await sleep(800);
    const m3 = await page.evaluate(() => ({ master: window.__bk.audio.master.gain.value, fixVisible: !document.getElementById('btn-sound-fix').hidden, need: window.__bk.audio.needsGesture }));
    R.check(m2.muted && /no/.test(m2.label) && m3.master < 0.001 && !m3.fixVisible, 'tras recargar: sigue en silencio y no se ofrece «Activar sonido» aunque el contexto no arranque', 'input', { m2, m3 });
    await page.close();
    // API que lanza al asignar type: el juego arranca igual
    const p2 = await openGame(browser, R, { save: null });
    await p2.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'audioSession', { value: { get type() { return 'auto'; }, set type(v) { throw new TypeError('no soportado'); } }, configurable: true }); });
    R.fixture('navigator.audioSession cuyo setter de type lanza', 'evaluateOnNewDocument');
    await p2.reload({ waitUntil: 'load' }); await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await clickStart(p2); await sleep(800);
    const t1 = await p2.evaluate(() => ({ started: window.__bk.started, ctx: window.__bk.audio.ctx.state, session: window.__bk.audio.session }));
    R.check(t1.started && t1.ctx === 'running' && /no soportado/.test(t1.session.error ?? ''), 'si la API lanza: se registra el error, sin excepción, y Web Audio sigue', 'input', t1);
    await p2.close();
  }

  if (which.includes('P')) {
    const page = await openGame(browser, R, { save: fx('v4-triple-ganado') });
    R.fixture('guardado v4 con triple ganado; red: el corte de SECRENOVIO tarda 2,5 s en las tres primeras peticiones y la 4.ª falla', 'tools/fixtures/v4-triple-ganado.json + interceptación');
    await page.setRequestInterception(true);
    let nReq = 0; page.on('request', (rq) => { if (/secrenovio-test/.test(rq.url())) { nReq++; setTimeout(() => rq.continue(), 2500); } else rq.continue(); });
    await clickStart(page);
    const sample = () => page.evaluate(() => { const m = window.__bk.audio.music; return { mode: window.__bk.mode, state: m.previewState, playing: m.previewPlaying, exclusion: m.previewExclusion, worldAudible: [...m.tracks.values()].filter((t) => t.out.gain.value > 0.01).length, previewGain: m.previewGain.gain.value }; });
    const cyc = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape'); await sleep(200); await clickSel(page, '#btn-preview-again'); await sleep(150 + i * 120);
      const a = await sample(); await clickSel(page, '#btn-close-final'); await sleep(250); const b = await sample(); cyc.push({ a, b });
    }
    await sleep(3500);
    const late = await sample();
    R.check(cyc.every((c) => c.a.mode === 'preview' && c.b.mode === 'explore' && !c.b.playing) && !late.playing && late.exclusion === 1, 'abrir/cerrar cinco veces durante la carga lenta: nada suena tarde y el mundo recupera la música', 'input', { cyc, late });
    // abrir y dejar sonar: el mundo calla; repetir vuelve al principio
    await page.keyboard.press('Escape'); await sleep(200); await clickSel(page, '#btn-preview-again'); await page.waitForFunction(() => window.__bk.audio.music.previewPlaying, { timeout: 8000 }).catch(() => {}); await sleep(1500);
    const pl = await sample();
    R.check(pl.playing && pl.worldAudible === 0 && pl.exclusion === 0, 'preview sonando: canciones del parque sin ganancia', 'input', pl);
    // onended antiguo: parar la fuente vieja tras abrir otra no toca el estado nuevo
    const od = await page.evaluate(() => { const m = window.__bk.audio.music, old = m.previewSrc; const h = old.onended; m.stopPreview(); return { hadHandler: typeof h === 'function', cleared: old.onended === null, state: m.previewState }; });
    R.check(od.hadHandler && od.cleared, 'stopPreview desactiva el onended de la fuente parada (idempotente, no pisa un preview nuevo)', 'static', od);
    await clickSel(page, '#btn-close-final').catch(() => {}); await sleep(400);
    await page.close();
    // fallo de red en la primera carga: estado error, mundo recuperado
    const p3 = await openGame(browser, R, { save: fx('v4-triple-ganado') });
    await p3.setRequestInterception(true);
    p3.on('request', (rq) => { if (/secrenovio-test/.test(rq.url())) rq.abort('failed'); else rq.continue(); });
    R.fixture('red: el corte de SECRENOVIO falla', 'interceptación');
    await clickStart(p3); await p3.keyboard.press('Escape'); await sleep(200); await clickSel(p3, '#btn-preview-again'); await sleep(1500);
    const er = await p3.evaluate(() => { const m = window.__bk.audio.music; return { state: m.previewState, mode: window.__bk.mode, text: document.getElementById('final').innerText.slice(0, 300) }; });
    await clickSel(p3, '#btn-close-final'); await sleep(500);
    const er2 = await p3.evaluate(() => ({ mode: window.__bk.mode, exclusion: window.__bk.audio.music.previewExclusion }));
    R.check(er.state === 'error' && er2.mode === 'explore' && er2.exclusion === 1, 'fallo de red: preview en estado error y al cerrar el mundo vuelve', 'input', { er, er2 });
    R.data.errors = R.data.errors.filter((e) => !/secrenovio-test|net::ERR_FAILED|música no disponible/.test(e));
    await p3.close();
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
