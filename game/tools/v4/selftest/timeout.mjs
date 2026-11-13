// Fixture del harness: el timeout interno de la prueba → exit 3 (distinto de fallo).
import { Report, runTest, sleep } from '../lib.mjs';
const R = new Report('selftest', 'timeout');
await runTest(R, async () => { R.check(true, 'antes de colgarse', 'unit'); await sleep(60000); }, { timeoutMs: 1500 });
