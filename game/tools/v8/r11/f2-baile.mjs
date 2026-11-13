// R11 · F2 · baile libre que no se cancela al empezar otra actividad: COD-01/02, NMG-01, NMG-02, ANIM-06, FG-01, FG-02, TT-01.
import { Report, runTest } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_NUEVA, SAVE_20, atZone } from './lib-r11.mjs';
// V10.2 Q05 (D-05a, cambio de diseño aprobado): sin el baile ganado, Bella reta a ANMI antes de empezar: se cierra su frase con «Vale» (clic)
const pasaBella = async (page) => { for (let i = 0; i < 20; i++) { const v = await page.evaluate(() => !document.getElementById('dialog').hidden && document.getElementById('dialog-name').textContent === 'Bella');
  if (v) { await sleep(350); await page.click('#dialog-ok'); await sleep(450); return true; }
  if (await page.evaluate(() => !document.getElementById('dance').hidden)) return false; await sleep(100); } return false; };   // sin diálogo (baile ya ganado): no espera
const R = new Report('r11-f2-baile');
const st = (page) => page.evaluate(() => { const g = window.__bk, v = g.visual, fd = g.activities.find((a) => a.id === 'freeDance'), bs = g.activities.find((a) => a.id === 'benchSit');
  const back = v.root.parent?.getObjectByName('ANMI_BACK_BOARD'); const clipName = (n) => n?.current?.getClip?.().name ?? null;
  const pan = g.npcs.get('la_pantera')?.[0] ?? null, girls = g.npcs.get('bella') ?? [];
  return { mode: g.mode, dancing: fd.dancing, override: v.override, deck: !!v.deck?.visible, hand: !!v.handBoard?.visible, back: !!back?.visible, seated: !!bs?.seated,
    panStanding: pan ? !!pan.standing : null, girls: girls.map(clipName), loco: g.skater.loco, dialog: !document.getElementById('dialog').hidden }; });
const boards = (s) => [s.deck, s.hand, s.back].filter(Boolean).length;
async function caso(save, zone, heading, fn) { const b = await launch(); try { const page = await openGame(b, R, { save }); await clickStart(page); await sleep(1200); await atZone(page, zone, heading);
  await page.keyboard.press('Digit1'); await sleep(900); const d = await st(page); await fn(page, d); } finally { await b.close(); } }
await runTest(R, async () => {
  for (let k = 1; k <= 2; k++) {
    await caso(SAVE_NUEVA, 'act.pantherTalk', 0, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(1600); const s = await st(page);
      R.check(d.dancing >= 0 && s.dancing < 0 && s.dialog && s.panStanding === true, `#${k} NMG-01/COD-01: bailando y E en La Pantera → el baile termina y ella habla DE PIE`, 'input', { d, s }); });
    await caso(SAVE_NUEVA, 'act.benchSit', 0, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(1600); const a = await st(page);
      await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(900); const s = await st(page);
      const ok = a.dancing < 0 && a.seated && (!s.seated || /sit/i.test(s.override ?? '')) && boards(s) <= 1;
      R.check(d.dancing >= 0 && ok, `#${k} NMG-02/ANIM-06/COD-02: bailando y SENTARSE (banco NMG) → sentada sin baile; con W no queda «sentada» de pie ni con dos tablas`, 'input', { d, a, s }); });
    await caso(SAVE_NUEVA, 'act.benchSit.yy0', 0, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(1600); const a = await st(page);
      await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(900); const s = await st(page);
      const ok = a.dancing < 0 && a.seated && (!s.seated || /sit/i.test(s.override ?? '')) && boards(s) <= 1;
      R.check(d.dancing >= 0 && ok, `#${k} ANIM-06: bailando y SENTARSE (banco YY) → igual que en NMG`, 'input', { d, a, s }); });
    await caso(SAVE_NUEVA, 'act.ladderFoot', 2.827, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(700);
      await page.keyboard.down('KeyW'); await sleep(1000); const s = await st(page); await page.keyboard.up('KeyW');
      R.check(d.dancing >= 0 && s.dancing < 0 && s.override === 'SK_LadderClimb' && boards(s) <= 1, `#${k} FG-01/COD-02: bailando y TREPAR (FG) → trepa con su clip y una sola tabla`, 'input', { d, s }); });
    await caso(SAVE_20, 'act.ladderFoot.EV1', 0, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(700);
      await page.keyboard.down('KeyW'); await sleep(1000); const s = await st(page); await page.keyboard.up('KeyW');
      R.check(d.dancing >= 0 && s.dancing < 0 && s.override === 'SK_LadderClimb' && boards(s) <= 1, `#${k} TT-01: bailando y TREPAR (EV1) → trepa con su clip y una sola tabla`, 'input', { d, s }); });
    await caso(SAVE_NUEVA, 'act.danceCombo', 0, async (page, d) => { await page.keyboard.press('KeyE'); await sleep(300); await pasaBella(page); await sleep(2000); const s = await st(page);
      const girlsDancing = s.girls.length > 0 && s.girls.every((c) => c && !/sway/i.test(c));
      R.check(d.dancing >= 0 && s.dancing < 0 && girlsDancing && boards(s) <= 1, `#${k} FG-02: bailando y BAILAR en la pista → el reto arranca con las chicas bailando y una sola tabla`, 'input', { d, s }); });
  }
}, { timeoutMs: 1500000 });
