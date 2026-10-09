// Preloaded with `node --import`: writes the peak memory of the process when it exits.
import { writeFileSync } from 'node:fs';

const file = process.env.BENCH_RSS_FILE;
if (file !== undefined) {
  process.on('exit', () => {
    writeFileSync(file, String(process.resourceUsage().maxRSS));
  });
}
