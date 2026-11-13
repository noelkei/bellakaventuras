// Fixture del harness: excepción → exit 2 aunque haya checks verdes.
import { Report, runTest } from '../lib.mjs';
const R = new Report('selftest', 'throw');
await runTest(R, async () => { R.check(true, 'antes de la excepción', 'unit'); throw new Error('excepción deliberada'); });
