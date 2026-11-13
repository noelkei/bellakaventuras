// Fixture del harness: termina sin comprobar nada → exit 4 (no verde).
import { Report, runTest } from '../lib.mjs';
const R = new Report('selftest', 'nochecks');
await runTest(R, async () => { R.note('no comprueba nada'); });
