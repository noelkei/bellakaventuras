// R11 · F1 · SIS-05, PADX-02, ACC-01, NMG-13: la charla nunca deja atrapado (teclado, mando, Tab, pausa).
import { Report, runTest } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_NUEVA, SAVE_20, ui, atZone, padOn, padBtn } from './lib-r11.mjs';
const R = new Report('r11-f1-dialogo');
await runTest(R, async () => {
  const caso = async (nombre, fn) => { const b = await launch(); try { const page = await openGame(b, R, { save: SAVE_NUEVA }); await clickStart(page); await sleep(1000); await atZone(page, 'act.pantherTalk'); await fn(page); } finally { await b.close(); } };
  for (let k = 1; k <= 2; k++) {
    await caso('pausa', async (page) => { await page.keyboard.press('KeyE'); await sleep(1500); const a = await ui(page);
      await page.keyboard.press('Escape'); await sleep(400); await page.keyboard.press('Escape'); await sleep(400); const b = await ui(page);
      await page.keyboard.press('Enter'); await sleep(500); const c = await ui(page);
      R.check(a.dialog && !c.dialog, `#${k} SIS-05: charla → Esc, Esc → Enter cierra «Vale» (foco tras la pausa: ${b.focus})`, 'input', { a, b, c }); });
    await caso('E', async (page) => { await page.keyboard.press('KeyE'); await sleep(1500); const a = await ui(page);
      await page.keyboard.press('KeyE'); await sleep(500); const c = await ui(page);
      R.check(a.dialog && !c.dialog, `#${k} NMG-13: E abre y E cierra la charla`, 'input', { a, c }); });
    await caso('tab', async (page) => { await page.keyboard.press('KeyE'); await sleep(1500); const a = await ui(page);
      await page.keyboard.press('Tab'); await sleep(300); await page.keyboard.press('Tab'); await sleep(300); const b = await ui(page);
      await page.keyboard.press('Enter'); await sleep(500); const c = await ui(page);
      R.check(a.dialog && b.focus === 'dialog-ok' && !c.dialog, `#${k} ACC-01: Tab se queda en «Vale» y Enter cierra (foco ${b.focus})`, 'input', { a, b, c }); });
    await caso('mando', async (page) => { await padOn(page); await sleep(300); await padBtn(page, 3); await sleep(1500); const a = await ui(page);
      await padBtn(page, 1); await sleep(400); const b = await ui(page);
      if (b.pause) { await padBtn(page, 1); await sleep(400); }
      await padBtn(page, 0); await sleep(500); const c = await ui(page);
      R.check(a.dialog && !b.pause && !c.dialog, `#${k} PADX-02: con mando, B no abre la pausa en la charla y la charla se cierra (B: pausa=${b.pause}, dialogo=${b.dialog})`, 'input', { a, b, c }); });
    // MIX-03 (añadida en R11 tras afinar la protección): Enter y A del mando a la vez cierran UNA frase (no se salta la siguiente); un clic
    // programático sin tecla reciente sí cierra al momento (antes la ventana fija de 250 ms reales lo descartaba)
    { const b = await launch(); try { const SAVE_RANA = { ...SAVE_20, activities: { ...SAVE_20.activities, graffiti: false }, collected: SAVE_20.collected.filter((c) => c !== 'yinyang.activity') };
      const page = await openGame(b, R, { save: SAVE_RANA }); await clickStart(page); await sleep(1000); await atZone(page, 'act.graffiti');   // presentación de la rana: varias frases
      await page.waitForFunction(() => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return a.rana && a.rana.actions?.has?.('Dance'); }, { timeout: 30000 }).catch(() => {}); await sleep(800);
      await padOn(page); await sleep(300);
      await page.evaluate(() => { window.__frases = []; const t = document.getElementById('dialog-text'); new MutationObserver(() => window.__frases.push(t.textContent)).observe(t, { childList: true, characterData: true, subtree: true }); });
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 15000 }).catch(() => {}); await sleep(600);
      const a = await ui(page); const n0 = await page.evaluate(() => window.__frases.length);
      if (!a.dialog) { R.invalid(`#${k} MIX-03: la charla de la rana no llegó a mostrar frase`, { a }); continue; }
      await page.keyboard.down('Enter'); await page.evaluate(() => { window.__bk.input.fakePad.buttons[0].pressed = true; }); await sleep(120);
      await page.evaluate(() => { window.__bk.input.fakePad.buttons[0].pressed = false; }); await page.keyboard.up('Enter'); await sleep(700);
      const n1 = await page.evaluate(() => window.__frases.length), b1 = await ui(page);
      R.check(a.dialog && b1.dialog && n1 - n0 === 1, `#${k} MIX-03: Enter + A del mando a la vez avanzan UNA frase (${n1 - n0})`, 'input', { a, b1 });
      await sleep(1200);
      const n2 = await page.evaluate(async () => { const t0 = window.__frases.length; document.getElementById('dialog-ok').click(); await new Promise((r) => setTimeout(r, 400)); return window.__frases.length - t0 + (document.getElementById('dialog').hidden ? 1 : 0); });
      R.check(n2 >= 1, `#${k} no empeorar: un clic programático en «Vale» cierra la frase (cambios ${n2})`, 'input', {});
    } finally { await b.close(); } }
  }
}, { timeoutMs: 900000 });
