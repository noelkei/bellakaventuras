// Runner V4 (V4-BASE-03): ejecuta pruebas como procesos hijo con timeout propio, conserva TODOS los intentos (stdout,
// stderr, exit, duración, copia del informe JSON) y escribe un manifiesto por ejecución. Nunca sobrescribe un intento
// con el siguiente: el resumen distingue primer intento, último intento y peor resultado.
// Uso: node game/tools/v4/run.mjs <prueba> [<prueba>…] [--retries N] [--timeout s] [--url U] [--label texto]
//   <prueba> = nombre en tools/v4 (sin .mjs) o ruta. Selección vacía o desconocida = rojo (exit 4).
// Exit del runner: 0 solo si todas las pruebas seleccionadas terminan verdes en su ÚLTIMO intento y la selección no está
// vacía. Un verde tras retry se marca «intermitente» con su denominador (no se esconde).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GAME, HERE, buildHash, EXIT } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const retries = Number(opt('retries', 0));
const timeoutS = Number(opt('timeout', 300));
const url = opt('url', null);
const label = opt('label', '');
const names = argv.filter((a) => !a.startsWith('--'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(GAME, 'captures', 'v4', 'runs', `${stamp}${label ? '_' + label.replace(/[^\w-]+/g, '_') : ''}`);
fs.mkdirSync(runDir, { recursive: true });
const manifest = { run: path.basename(runDir), date: new Date().toISOString(), build: buildHash(), node: process.version, cwd: process.cwd(), url, retries, timeoutS, label,
  selection: names, tests: [], status: 'running' };
const save = () => fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
save();

function resolveTest(n) {
  const cands = [n, path.join(HERE, n), path.join(HERE, `${n}.mjs`)];
  return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

function runOnce(file, attempt) {
  return new Promise((res) => {
    const t0 = Date.now();
    const base = `${path.basename(file, '.mjs')}.a${attempt}`;
    const out = fs.createWriteStream(path.join(runDir, `${base}.stdout.log`)), err = fs.createWriteStream(path.join(runDir, `${base}.stderr.log`));
    const args = [file, ...(url ? ['--url', url] : [])];
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, BK_RUN_DIR: runDir } });
    let tail = '';
    child.stdout.on('data', (d) => { out.write(d); tail = (tail + d).slice(-4000); process.stdout.write(d); });
    child.stderr.on('data', (d) => { err.write(d); tail = (tail + d).slice(-4000); process.stderr.write(d); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 4000); }, timeoutS * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer); out.end(); err.end();
      const exit = timedOut ? EXIT.TIMEOUT : code ?? EXIT.ERROR;
      // copia del informe JSON que la prueba declara al final ("<nombre>: ESTADO (exit N)")
      const m = tail.match(/^(\S+): [A-ZÁÉÍÓÚ]+ \(exit (\d+)\)/m);
      res({ attempt, exit, signal, timedOut, durationMs: Date.now() - t0, declaredExit: m ? Number(m[2]) : null, declaredName: m?.[1] ?? null,
        logs: { stdout: `${base}.stdout.log`, stderr: `${base}.stderr.log` },
        // incoherencia: el proceso salió 0 pero la prueba no declaró su resultado → no cuenta como verde
        undeclared: !m });
    });
  });
}

const statusOf = (exit) => ['verde', 'fallos', 'error', 'timeout', 'vacio'][exit] ?? `exit${exit}`;

if (!names.length) {
  manifest.tests.push({ name: '(vacía)', status: 'vacio', exit: EXIT.EMPTY, note: 'selección vacía' });
} else {
  for (const n of names) {
    const file = resolveTest(n);
    if (!file) { manifest.tests.push({ name: n, status: 'desconocida', exit: EXIT.EMPTY, attempts: [], note: 'prueba no encontrada' }); save(); continue; }
    const entry = { name: n, file: path.relative(process.cwd(), file), attempts: [] };
    manifest.tests.push(entry);
    for (let a = 1; a <= retries + 1; a++) {
      const r = await runOnce(file, a);
      if (r.exit === 0 && r.undeclared) { r.exit = EXIT.EMPTY; r.note = 'exit 0 sin resultado declarado por el harness'; }
      // un exit 1 sin resultado declarado no es un «fallo» de checks: el proceso murió antes (sintaxis, import, excepción)
      if (r.exit === EXIT.FAILED && r.undeclared) { r.exit = EXIT.ERROR; r.note = 'exit 1 sin resultado declarado: error del proceso, no fallos de checks'; }
      entry.attempts.push(r); save();
      if (r.exit === 0) break;
      if (a <= retries) entry.attempts[entry.attempts.length - 1].retryReason = `exit ${r.exit} (${statusOf(r.exit)})`;
    }
    const first = entry.attempts[0], last = entry.attempts[entry.attempts.length - 1];
    entry.firstExit = first.exit; entry.exit = last.exit; entry.status = statusOf(last.exit);
    entry.denominator = `${entry.attempts.filter((x) => x.exit === 0).length}/${entry.attempts.length}`;
    if (last.exit === 0 && first.exit !== 0) entry.status = 'verde-intermitente';
    save();
  }
}
const red = manifest.tests.filter((t) => t.exit !== 0);
manifest.status = red.length ? 'rojo' : 'verde';
manifest.summary = manifest.tests.map((t) => `${t.name}:${t.status}${t.denominator ? ` (${t.denominator})` : ''}`);
save();
console.log(`\nRUN ${manifest.run}: ${manifest.status.toUpperCase()} · ${manifest.summary.join(' · ')}\nmanifiesto: ${path.relative(process.cwd(), path.join(runDir, 'manifest.json'))}`);
// código agregado por gravedad: timeout > error > vacío/desconocida > fallos
const worst = [EXIT.TIMEOUT, EXIT.ERROR, EXIT.EMPTY, EXIT.FAILED].find((e) => red.some((t) => t.exit === e));
process.exitCode = red.length ? (worst ?? EXIT.ERROR) : 0;
