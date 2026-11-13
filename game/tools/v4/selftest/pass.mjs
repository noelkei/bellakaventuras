// Fixture del harness: prueba positiva mínima con una comprobación real.
import { Report, runTest } from '../lib.mjs';
const R = new Report('selftest', 'pass');
await runTest(R, async () => { R.check(1 + 1 === 2, 'aritmética', 'unit'); });
