// V4-BASE-02 · Autotest del harness: cada caso pasa por el runner real como proceso hijo y su código de salida debe
// coincidir con el contrato. Positiva no vacía = 0; fallo = 1; excepción = 2; timeout interno o del runner = 3;
// selección vacía, prueba desconocida, prueba sin checks o proceso que no declara resultado = 4.
// Mutación de control: con BK_MUTATE_HARNESS=1 se ejecuta una copia del lib que ignora fallos; el autotest debe
// detectarlo (rojo). Así se acredita que estas aserciones son sensibles.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, HERE, EXIT } from './lib.mjs';

const R = new Report('harness', 'harness-selftest');
const RUN = path.join(HERE, 'run.mjs');
const st = (n) => path.join(HERE, 'selftest', `${n}.mjs`);
function runner(args, timeout = 60) {
  const r = spawnSync(process.execPath, [RUN, ...args, '--timeout', String(timeout), '--label', 'selftest'], { encoding: 'utf8' });
  const m = r.stdout.match(/manifiesto: (.+manifest\.json)/);
  const man = m ? JSON.parse(fs.readFileSync(path.resolve(m[1]), 'utf8')) : null;
  return { code: r.status, man, out: r.stdout.slice(-600) };
}

await runTest(R, async () => {
  const cases = [
    { args: [st('pass')], want: EXIT.OK, label: 'positiva no vacía → 0' },
    { args: [st('fail')], want: EXIT.FAILED, label: 'fallo deliberado → 1' },
    { args: [st('throw')], want: EXIT.ERROR, label: 'excepción → 2 aunque haya checks verdes' },
    { args: [st('timeout')], want: EXIT.TIMEOUT, label: 'timeout interno → 3' },
    { args: [st('hang')], want: EXIT.TIMEOUT, label: 'proceso colgado → runner lo mata con timeout 3', timeout: 3 },
    { args: [st('empty')], want: EXIT.EMPTY, label: 'selección vacía (nonEmpty) → 4' },
    { args: [st('nochecks')], want: EXIT.EMPTY, label: 'prueba sin comprobaciones → 4' },
    { args: [st('silent')], want: EXIT.EMPTY, label: 'exit 0 sin resultado declarado → 4 (no cuenta como verde)' },
    { args: [st('syntax')], want: EXIT.ERROR, label: 'error de sintaxis (exit 1 sin declarar) → 2, no «fallos»' },
    { args: ['no-existe-esta-prueba'], want: EXIT.EMPTY, label: 'prueba desconocida → 4' },
    { args: [], want: EXIT.EMPTY, label: 'selección vacía del runner → 4' },
    { args: [st('pass'), st('fail')], want: EXIT.FAILED, label: 'conjunto con un fallo → rojo aunque otra pase' },
  ];
  for (const c of cases) {
    const r = runner(c.args, c.timeout ?? 60);
    R.check(r.code === c.want, c.label, 'unit', { code: r.code, want: c.want, status: r.man?.status, summary: r.man?.summary });
  }
  // reintentos: el manifiesto conserva cada intento y el denominador; el primer intento rojo no se borra
  const rr = runner([st('fail'), '--retries', '2']);
  const t = rr.man?.tests?.[0];
  R.check(rr.code === EXIT.FAILED && t?.attempts?.length === 3 && t.denominator === '0/3' && t.attempts.every((a) => a.logs && a.exit === 1),
    'retries conservan los tres intentos con logs y denominador 0/3', 'unit', { attempts: t?.attempts?.map((a) => a.exit), denominator: t?.denominator });
  // el manifiesto registra build, node, comando y logs por intento
  R.check(!!rr.man?.build && !!rr.man?.node && fs.existsSync(path.join(path.dirname(path.resolve(rr.out.match(/manifiesto: (.+)/)?.[1] ?? '.')), t.attempts[0].logs.stdout)),
    'manifiesto con build/node y logs por intento existentes', 'unit', { build: rr.man?.build });

  // mutación de control: lib que ignora fallos (finish siempre 0). El caso «fail» debe dejar de detectarse → el autotest
  // lo comprueba explícitamente para demostrar que la aserción del código de salida es sensible.
  const libSrc = fs.readFileSync(path.join(HERE, 'lib.mjs'), 'utf8');
  const mutated = libSrc.replace('if (this.failed) exit = EXIT.FAILED;', '/* MUTACIÓN: fallos ignorados */')
    .replace("export const GAME = path.resolve(HERE, '..', '..');", `export const GAME = ${JSON.stringify(path.resolve(HERE, '..', '..'))};`);
  if (mutated === libSrc) throw new Error('la mutación no se aplicó: el texto del lib cambió');
  const mdir = fs.mkdtempSync(path.join(HERE, '.mut-'));
  try {
    fs.writeFileSync(path.join(mdir, 'lib.mjs'), mutated);
    fs.mkdirSync(path.join(mdir, 'selftest'));
    fs.writeFileSync(path.join(mdir, 'selftest', 'fail.mjs'), fs.readFileSync(st('fail'), 'utf8'));
    const r = spawnSync(process.execPath, [path.join(mdir, 'selftest', 'fail.mjs')], { encoding: 'utf8' });
    R.note('salida de la mutación: ' + (r.stdout + r.stderr).slice(-300));
    R.check(r.status === 0 && /VERDE \(exit 0\)/.test(r.stdout), 'mutación (lib que ignora fallos) SÍ produciría falso verde: la aserción de exit es sensible', 'unit', { mutatedExit: r.status });
  } finally { fs.rmSync(mdir, { recursive: true, force: true }); }
});
