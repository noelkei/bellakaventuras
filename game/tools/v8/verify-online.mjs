// V6 · verificación de la publicación en workers.dev: integridad por SHA-256 de todos los archivos del inventario y
// arranque real (escritorio y móvil emulado): JUGAR, sin errores de página, FG cargado (atrezzo, cinco chicas, escalera).
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const URL0 = 'https://bellakaventuras-pruebas.bellakaventuras-hosting-pruebas.workers.dev/';
const HOST = '/Users/TU_USUARIO/Desktop/Bellakaventuras/alojamiento de juego/implementacion';
const OUT = path.join(HOST, 'reports', process.argv[2] ?? 'v6-deployment-2026-10-13');   // carpeta del informe (argumento opcional)
const inv = JSON.parse(fs.readFileSync(path.join(HOST, 'reports/build-inventory.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const res = { date: new Date().toISOString(), url: URL0, integrity: { ok: 0, bad: [] }, boot: {} };
for (const e of inv.entries) {
  try { const r = await fetch(URL0 + e.path.slice(1) + '?v=' + Date.now(), { cache: 'no-store' }); const b = Buffer.from(await r.arrayBuffer());
    const h = crypto.createHash('sha256').update(b).digest('hex'); if (r.status === 200 && h === e.sha256) res.integrity.ok++; else res.integrity.bad.push({ p: e.path, st: r.status, bytes: b.length }); }
  catch (err) { res.integrity.bad.push({ p: e.path, err: String(err) }); }
}
console.log('integridad', res.integrity.ok, '/', inv.entries.length, res.integrity.bad.slice(0, 5));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
for (const [vp, view] of [['escritorio', { width: 1280, height: 800 }], ['movil', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const page = await b.newPage(); await page.setViewport(view); const errs = [], failed = [];
  page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  page.on('requestfailed', (r) => failed.push(r.url())); page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(URL0 + '?bktest=1', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
  const boot = (await (await fetch(URL0)).text()).match(/bootstrap-[\w-]+\.js|index-[\w-]+\.js/g);
  await page.click('#btn-start'); await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(29.6, 0, 22.0), 0, 'walk'); g.loadNpc('bella'); });
  await new Promise((r) => setTimeout(r, 5000));
  const st = await page.evaluate(() => { const g = window.__bk; return { started: g.started, fgProps: g.park.fgProps, girls: (g.npcs.get('bella') ?? []).length, ladderClips: ['SK_LadderClimb', 'SK_LadderDown'].every((n) => g.visual.actions.has(n)), girlDances: (g.npcs.get('bella')?.[0]?.actions.has('Dance_Step_Hip_Hop_Dance')) ?? false, manifestErrs: g.park.manifest.validate(), nmgKit: g.park.nmgKit, nmgGraffiti: g.park.nmgGraffiti, fgLettering: !!g.park.root.getObjectByName('FG_LETTERING')?.material?.map?.image, steelEnv: !!g.steelEnv }; });
  await page.screenshot({ path: path.join(OUT, `fg_${vp}.png`) });
  res.boot[vp] = { ...st, errors: errs, failed, served: boot };
  console.log(vp, JSON.stringify(res.boot[vp]).slice(0, 400));
  await page.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, 'verificacion-online.json'), JSON.stringify(res, null, 1));
