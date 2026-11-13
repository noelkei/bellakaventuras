// Fixture del harness: selección vacía → exit 4, y prueba sin comprobaciones → exit 4.
import { Report, runTest } from '../lib.mjs';
const R = new Report('selftest', 'empty');
await runTest(R, async () => { R.nonEmpty([], 'lista de colliders de conos'); });
