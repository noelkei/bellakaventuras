// P0 / BASE-03 + ACT-01 + AUD-02(crítico) + UX-05: tiempo, pausa, cancelación, guardado y migración.
//   node tools/v3/p0-time.mjs [--url …] [--only a,b]
// Entradas: clics/teclas reales. Fixtures: guardados de tools/fixtures y posiciones declaradas.
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, VIEWPORTS, GAME } from './lib.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = (n) => !only || only.includes(n);
const fx = (n) => fs.readFileSync(path.join(GAME, 'tools', 'fixtures', n + '.json'), 'utf8');
const R = new Report('P0', 'time-cancel-save', { method: 'clics/teclas reales; fixtures de guardado y posición declarados' });
const browser = await launch();
const st = (page) => page.evaluate(() => { const g = window.__bk; return { mode: g.mode, paused: g.paused, clock: +g.clock.toFixed(3) }; });
const clickSel = async (page, sel) => { const h = await page.$(sel); const b = await h.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };

try {
  if (want('preview')) {
    // Preview cerrado mientras el audio todavía se descarga: no debe sonar después ni dejar el mundo mudo
    const page = await openGame(browser, R, { save: fx('v4-triple-ganado') });
    R.fixture('guardado v4 con triple ganado y centro abierto', 'tools/fixtures/v4-triple-ganado.json');
    await page.setRequestInterception(true);
    page.on('request', (rq) => { if (/secrenovio-test/.test(rq.url())) setTimeout(() => rq.continue(), 3500); else rq.continue(); });
    await clickStart(page);
    await page.keyboard.press('Escape'); await sleep(250);
    R.check((await st(page)).paused, 'Escape pausa el juego', 'input');
    await clickSel(page, '#btn-preview-again'); await sleep(300);
    const open = await page.evaluate(() => ({ mode: window.__bk.mode, state: window.__bk.audio.music.previewState, visible: !document.getElementById('final').hidden }));
    R.check(open.mode === 'preview' && open.visible && open.state === 'loading', 'abrir preview desde la pausa (carga lenta en curso)', 'input', open);
    await clickSel(page, '#btn-close-final'); await sleep(4500);
    const after = await page.evaluate(() => { const m = window.__bk.audio.music; return { mode: window.__bk.mode, playing: m.previewPlaying, state: m.previewState, exclusion: m.previewExclusion, finalHidden: document.getElementById('final').hidden, inputModal: window.__bk.input.modal }; });
    R.check(after.mode === 'explore' && !after.playing && after.exclusion === 1 && after.finalHidden && !after.inputModal, 'cerrar durante la carga: no suena tarde y el mundo recupera música/control', 'input', after);
    // reabrir: ahora sí suena (buffer ya cargado) y Escape lo cierra
    await page.keyboard.press('Escape'); await sleep(200); await clickSel(page, '#btn-preview-again'); await sleep(900);
    const p2 = await page.evaluate(() => ({ playing: window.__bk.audio.music.previewPlaying, state: window.__bk.audio.music.previewState, live: window.__bk.audio.music.liveCount }));
    R.check(p2.playing && p2.state === 'playing', 'reabrir preview: suena limpio', 'input', p2);
    await page.keyboard.press('Escape'); await sleep(400);
    const p3 = await page.evaluate(() => ({ mode: window.__bk.mode, playing: window.__bk.audio.music.previewPlaying }));
    R.check(p3.mode === 'explore' && !p3.playing, 'Escape cierra el preview y lo detiene', 'input', p3);
    await page.close();
  }

  if (want('dance')) {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('dance.center'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); });
    R.fixture('en la pista de FASHION GIRL a pie', 'teleport al centro de baile');
    await sleep(500); await page.keyboard.press('KeyE'); await sleep(600);
    R.check(await page.evaluate(() => !document.getElementById('dance').hidden), 'E inicia el baile', 'input');
    for (const k of ['ArrowUp', 'ArrowRight', 'ArrowUp']) { await page.keyboard.press(k); await sleep(120); }
    await sleep(200);
    const r0 = await page.evaluate(() => ({ round: window.__bk.activities[4].round, saved: window.__bk.state.p.partials.danceRounds }));
    await page.keyboard.press('Escape'); await sleep(4000);
    const r1 = await page.evaluate(() => ({ round: window.__bk.activities[4].round, paused: window.__bk.paused, dance: !document.getElementById('dance').hidden }));
    R.check(r0.saved === 1, 'la ronda ganada se guarda al acertar (parcial 1/3)', 'input', r0);
    R.check(r1.paused && r1.round === r0.round && r1.dance, 'en pausa 4 s la celebración no avanza de ronda', 'input', { r0, r1 });
    await page.keyboard.press('ArrowLeft'); await sleep(100); // en pausa no se aceptan entradas de combo
    const idx = await page.evaluate(() => window.__bk.activities[4].idx);
    R.check(idx === 0 || idx === 3, 'en pausa una flecha no cuenta como paso del combo', 'input', { idx });
    await page.keyboard.press('Escape'); await sleep(2800);
    const r2 = await page.evaluate(() => ({ round: window.__bk.activities[4].round, paused: window.__bk.paused }));
    R.check(!r2.paused && r2.round === 1, 'al reanudar la celebración termina y aparece la ronda 2', 'input', r2);
    // salir a mitad y recargar: conserva la ronda ganada
    await clickSel(page, '#dance-exit'); await sleep(400);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled);
    const saved = await page.evaluate(() => window.__bk.state.p.partials.danceRounds);
    R.check(saved === 1, 'recarga tras salir: conserva 1 ronda ganada', 'input', { saved });
    await page.close();
  }

  if (want('reveal')) {
    const page = await openGame(browser, R, { save: fx('v4-20-sin-revelar') });
    R.fixture('guardado 20/20 sin revelación vista', 'tools/fixtures/v4-20-sin-revelar.json');
    await clickStart(page); await sleep(1500);
    const a = await page.evaluate(() => ({ mode: window.__bk.mode, t: window.__bk.park.superRamp.mesh.position.y }));
    await page.keyboard.press('Escape'); await sleep(3500);
    const b = await page.evaluate(() => ({ mode: window.__bk.mode, t: window.__bk.park.superRamp.mesh.position.y, open: window.__bk.centerOpen }));
    R.check(a.mode === 'reveal' && b.mode === 'reveal' && Math.abs(a.t - b.t) < 0.05 && !b.open, 'la revelación no avanza durante la pausa', 'input', { a, b });
    await page.keyboard.press('Escape'); await sleep(4200);
    const c = await page.evaluate(() => ({ mode: window.__bk.mode, open: window.__bk.centerOpen, seen: window.__bk.state.p.revealSeen, y: window.__bk.park.superRamp.mesh.position.y }));
    R.check(c.mode === 'explore' && c.open && c.seen && Math.abs(c.y) < 0.01, 'tras reanudar, la revelación termina: centro abierto y guardado', 'input', c);
    await page.close();
  }

  if (want('storage')) {
    const page = await openGame(browser, R, { storageBroken: true });
    R.fixture('localStorage roto', 'setItem lanza QuotaExceededError');
    await clickStart(page); await sleep(300);
    const b = await page.evaluate(() => ({ badge: document.getElementById('save-badge').textContent, hidden: document.getElementById('save-badge').hidden, status: window.__bk.state.status }));
    R.check(!b.hidden && /sesión/.test(b.badge) && b.status !== 'ok', 'almacenamiento roto: la interfaz dice «partida de esta sesión» (no afirma guardado)', 'input', b);
    await page.keyboard.press('Escape'); await sleep(200);
    const note = await page.evaluate(() => document.getElementById('save-note').textContent);
    R.check(!/guardado en este navegador/.test(note), 'la pausa no dice «guardado» con almacenamiento roto', 'input', { note });
    await page.close();
    // fallo a mitad de partida (cuota llena tras arrancar)
    const p2 = await openGame(browser, R, { save: null });
    await clickStart(p2);
    await p2.evaluate(() => { const s = window.__bk.state; s['storage'] = { setItem() { throw new DOMException('quota', 'QuotaExceededError'); }, getItem() { return null; } }; s.hintOnce('x-test-' + Date.now()); });
    R.fixture('cuota llena a mitad de partida', 'se sustituye el almacenamiento del estado por uno que lanza');
    await sleep(200);
    const b2 = await p2.evaluate(() => ({ badge: document.getElementById('save-badge').textContent, hidden: document.getElementById('save-badge').hidden, status: window.__bk.state.status }));
    R.check(!b2.hidden && b2.status === 'failed', 'fallo de guardado a mitad: aviso visible y reintento disponible', 'input', b2);
    await p2.close();
  }

  if (want('migration')) {
    for (const [name, check] of [
      ['v2-inicio', (p) => p.version === 4 && p.collected.length === 0 && p.finalProof === null],
      ['v2-puente-arriba', (p) => p.bridgeReached && p.partials.bridgeRest === 4 && p.collected.length === 2],
      ['v2-19de20', (p) => p.collected.length === 19 && !p.finalDone],
      ['v2-final-ganado', (p) => p.finalDone && p.finalProof?.kind === 'legacy_single' && p.collected.length === 20],
      ['v2-corrupto-premio-sin-actividad', (p) => p.collected.length === 2 && !p.collected.includes('no_me_guillo.activity')],
      ['corrupto-json', (p) => p.version === 4 && p.collected.length === 0],
    ]) {
      const page = await openGame(browser, R, { save: fx(name) });
      const r = await page.evaluate(() => ({ mem: window.__bk.state.p, from: window.__bk.state.migratedFrom, note: window.__bk.state.loadNote, corruptKept: !!localStorage.getItem('bellakaventuras.remake.save.corrupt') }));
      R.check(check(r.mem), `migración/validación: ${name}`, 'fixture', { from: r.from, note: r.note, collected: r.mem.collected.length, finalProof: r.mem.finalProof, partials: r.mem.partials, corruptKept: r.corruptKept });
      if (name === 'v2-final-ganado') {
        await clickStart(page); await sleep(400);
        const o = await page.evaluate(() => ({ objective: document.getElementById('objective').textContent, preview: window.__bk.state.previewUnlocked }));
        R.check(o.preview && /triple/i.test(o.objective), 'partida V2 ganada: conserva el preview y propone el triple V3', 'fixture', o);
      }
      await page.close();
    }
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
