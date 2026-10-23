import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const directory of ['dist', 'dist-chrome', 'dist-firefox']) {
  rmSync(fileURLToPath(new URL(`../${directory}`, import.meta.url)), { recursive: true, force: true });
}
