// V4-UX-02 · Baile: un gesto = una acción con entrada REAL. Enter sobre el botón enfocado (activación nativa) cuenta una
// vez; una flecha mantenida (autorrepetición) cuenta una vez; un clic cuenta una vez. Fixture declarada: ANMI a pie en la
// zona de la pista (la campaña ya llega andando). Sustituye la evidencia de tools/v3/act05.mjs, que contra V4 informa
// «OK» con 0 comprobaciones (falso verde del harness V3).
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('UX-02', 'dance-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    R.fixture('ANMI a pie en la zona de baile', await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.danceCombo'); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.input.clear(); document.getElementById('hint').hidden = true; return z.pos.toArray(); }));
    await sleep(500);
    const st = () => page.evaluate(() => { const d = window.__bk.activities.find((a) => a.id === 'danceCombo'); return { busy: d.busy, round: d.round, idx: d.idx, locked: d.locked, focus: document.activeElement?.dataset?.k ?? document.activeElement?.id }; });
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => !document.getElementById('dance').hidden, { timeout: 6000 });
    await sleep(600);
    let s = await st();
    R.check(s.busy && s.round === 0 && s.idx === 0, 'E abre el baile en la ronda 1', 'input', s);
    // Tab hasta el botón ▲ (secuencia de la ronda 1: ▲ ▶ ▲) y Enter
    for (let i = 0; i < 6 && (await st()).focus !== 'up'; i++) { await page.keyboard.press('Tab'); await sleep(80); }
    const f = (await st()).focus;
    await page.keyboard.press('Enter'); await sleep(300);
    s = await st();
    R.check(f === 'up' && s.idx === 1 && !s.locked, 'Enter sobre el botón ▲ enfocado cuenta UNA acción (no también como tecla del juego)', 'input', { focus: f, ...s });
    // flecha mantenida con autorrepetición: ▶ una vez
    await page.keyboard.down('ArrowRight'); for (let i = 0; i < 4; i++) { await page.keyboard.down('ArrowRight'); await sleep(40); } await page.keyboard.up('ArrowRight'); await sleep(300);
    s = await st();
    R.check(s.idx === 2 && !s.locked, 'flecha ▶ mantenida (autorrepetición) cuenta UNA acción', 'input', s);
    // clic en ▲
    const b = await page.$('#dance-pad button[data-k="up"]'); await b.click(); await sleep(400);
    s = await st();
    R.check(s.round === 1 || (s.idx === 3), 'clic en ▲ completa la ronda 1 (una acción por clic)', 'input', s);
  } finally { await browser.close(); }
});
