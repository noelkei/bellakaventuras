// IT8 · A4 · guardián: ~40 guardados rotos, viejos, futuros o con valores absurdos. Por caso: sin errores de página; JUGAR se activa;
// al empezar, ANMI aparece dentro del mapa (|x|,|z| < 53, −1 < y < 30) y con suelo debajo en ≤ 2 s; el juego responde (anda).
// Además: JSON ilegible → se guarda una copia `.corrupt.<t>` y se empieza de cero; versión futura → se juega sin tocar el guardado (sigue
// igual tras jugar); control válido (20/20) → carga 20/20.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, S0, walks, drainUI, saveJson } from './lib8.mjs';
const R = new Report('it8-guardado-raro', { task: arg('task', 'IT8') });
const KEY = 'bellakaventuras.remake.save';
const C = [];
const add = (id, save, extra = {}) => C.push({ id, save, ...extra });
add('control-20', S20, { espera: (r) => r.total === 20 });
for (const [id, raw] of [['json-roto', '{"version":5,"collected":['], ['json-null', 'null'], ['json-lista', '[]'], ['json-texto', '"hola"'], ['json-numero', '42'], ['vacio', ''], ['basura-2MB', 'x'.repeat(2e6)]]) add(id, raw, { corrupto: id !== 'json-null' && id !== 'vacio' });
add('version-6', { ...S20, version: 6 }, { futura: true });
add('version-texto', { ...S20, version: '5' });
add('version-0', { ...S20, version: 0 });
add('version-3', { version: 3, collected: ['no_me_guillo.visible'], activities: { pantherTalk: true }, finalDone: false, settings: { volume: 0.5 } });
add('version-4-checkpoint', { ...S20, version: 4, checkpoint: { x: 30, y: 0, z: 10, heading: 1 }, checkpointRevision: 1 });
for (const k of Object.keys(S20)) { const s = { ...S20 }; delete s[k]; add(`sin-${k}`, s); }
add('collected-texto', { ...S20, collected: 'todas' });
add('collected-numeros', { ...S20, collected: [1, 2, 3] });
add('collected-inventadas', { ...S0, collected: ['zona_falsa.visible', 'no_me_guillo.secreta', '__proto__', 'no_me_guillo.visible'] });
add('collected-repetidas', { ...S0, collected: Array(50).fill('no_me_guillo.visible') });
add('activities-null', { ...S20, activities: null });
add('settings-null', { ...S20, settings: null });
add('settings-absurdos', { ...S20, settings: { volume: 'alto', muted: 'sí', camSens: 99, btnScale: -4, orientation: 'diagonal', leftHanded: 3, eficiente: {}, iosAppAsked: true } });
add('checkpoint-lejos', { ...S0, checkpoint: { x: 1e9, y: -1e9, z: 5, heading: 0 }, checkpointRevision: 99 });
add('checkpoint-nulos', { ...S0, checkpoint: { x: null, y: null, z: null, heading: null }, checkpointRevision: 99 });
add('checkpoint-centro-cerrado', { ...S0, checkpoint: { x: 0, y: 0, z: 0, heading: 0 }, checkpointRevision: 99 });
add('checkpoint-bajo-suelo', { ...S0, checkpoint: { x: 32, y: -20, z: 0, heading: 0 }, checkpointRevision: 99 });
add('narr-raro', { ...S0, narr: { v: 1, estado: 'loco', paso: 5, practica: 'x', vistos: 'todo', ayuda: 7 } }, { query: '?bktest=1' });
add('narr-null', { ...S0, narr: null }, { query: '?bktest=1' });
add('narr-tutorial-paso-raro', { ...S0, narr: { v: 1, estado: 'nuevo', paso: 'PLA-99', practica: false, vistos: ['PLA-01'], ayuda: null } }, { query: '?bktest=1' });
add('grafitis-1000', { ...S20, skillGraffiti: Array.from({ length: 1000 }, (_, i) => ({ i: i % 4, p: [i % 40, 0, 3], n: [0, 1, 0], u: [0, 0, 1], s: 1 })) });
add('grafitis-rotos', { ...S20, skillGraffiti: [{ i: 9, p: 'x' }, null, 7] });
add('parciales-rotos', { ...S0, partials: { graffitiMask: '%%%no-base64%%%', graffitiCheck: 999999, danceRounds: 'tres', bridgeHeard: 'si', tutorialStep: -3 } });
add('final-sin-patatas', { ...S0, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'ayer' }, revealSeen: true });
add('epoch-raro', { ...S20, saveEpoch: { a: 1 } });
add('proto', JSON.stringify({ ...S20, __proto__: { finalDone: true }, constructor: { prototype: { x: 1 } } }).replace('"__proto__"', '"__proto__"'));
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const c of C.filter((x) => !arg('solo') || arg('solo').split(',').includes(x.id))) {
      const errors = [], tag = `guardado ${c.id}`;
      let page;
      try {
        page = await open8(b, R, dev('pc720'), 'h', { save: c.save, errors, ...(c.query ? { query: c.query } : {}) });
        const disco0 = await page.evaluate((K) => { const r = localStorage.getItem(K); return r == null ? null : r.length > 200 ? r.slice(0, 200) + '…' + r.length : r; }, KEY);
        await start8(page, false); await sleep(2200); if (c.query) await drainUI(page, false, 40000);
        // la revelación (20/20 sin verla) o una frase del tutorial tienen el control unos segundos: se espera a explorar (≤ 20 s)
        for (let i = 0; i < 40 && await page.evaluate(() => window.__bk.mode !== 'explore'); i++) { await sleep(500); if (c.query) await drainUI(page, false, 800); }
        const r = await page.evaluate((K) => { const g = window.__bk, s = g.skater, f = s.footPos, RA = window.__bkRapier; const h = g.world.castRay(new RA.Ray({ x: f.x, y: f.y + 0.6, z: f.z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
          const corrupt = Object.keys(localStorage).filter((k) => k.startsWith(K + '.corrupt.')).length;
          return { total: g.state.total, pos: [+f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2)], suelo: h ? +(h.timeOfImpact - 0.6).toFixed(2) : null, readOnly: g.state.readOnly, corrupt, mode: g.mode, note: document.getElementById('load-text')?.textContent?.slice(0, 160) }; }, KEY);
        const w = await walks(page);
        const dentro = Math.abs(r.pos[0]) < 53 && Math.abs(r.pos[2]) < 53 && r.pos[1] > -1 && r.pos[1] < 30 && r.suelo !== null && Math.abs(r.suelo) < 0.4;
        const fila = { id: c.id, ...r, anda: w, errores: errors.slice(0, 3) };
        R.check(!errors.length, `${tag}: sin errores de página`, 'fixture', errors.slice(0, 3));
        R.check(dentro && w > 0.5 && r.mode === 'explore', `${tag}: arranca, ANMI dentro del mapa con suelo debajo y anda`, 'fixture', fila);
        if (c.corrupto) R.check(r.corrupt >= 1 && r.total === 0, `${tag}: se conserva una copia .corrupt y se empieza de cero`, 'fixture', fila);
        if (c.futura) { await sleep(3000); const d1 = await page.evaluate((K) => localStorage.getItem(K), KEY); R.check(r.readOnly && JSON.parse(d1).version === 6, `${tag}: partida de versión futura: se juega sin tocar el guardado`, 'fixture', { readOnly: r.readOnly, version: JSON.parse(d1).version }); }
        if (c.espera) R.check(c.espera(r), `${tag}: control válido carga como se espera`, 'fixture', r);
        filas.push(fila);
      } catch (e) { R.check(false, `${tag}: el juego arranca`, 'fixture', { err: String(e.message).slice(0, 200), errores: errors.slice(0, 3) }); filas.push({ id: c.id, err: String(e.message).slice(0, 200) }); }
      finally { await page?.close().catch(() => {}); }
    }
    saveJson('A4-guardado-raro/resultado.json', filas);
  } finally { await b.close(); }
}, { timeoutMs: 2400000 });
