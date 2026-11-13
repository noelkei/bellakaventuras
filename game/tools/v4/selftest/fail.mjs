// Fixture del harness: fallo deliberado → exit 1.
import { Report, runTest } from '../lib.mjs';
const R = new Report('selftest', 'fail');
await runTest(R, async () => { R.check(true, 'una verde', 'unit'); R.check(false, 'fallo deliberado', 'unit'); });
