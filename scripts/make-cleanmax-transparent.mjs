/**
 * One-off: public/cleanmax-logo.jpeg -> public/cleanmax-logo.png
 * Pixels with near-white background become transparent.
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const input = join(root, 'public/cleanmax-logo.jpeg');
const output = join(root, 'public/cleanmax-logo.png');

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
if (channels !== 4) throw new Error('expected RGBA');
const out = Buffer.from(data);
for (let i = 0; i < out.length; i += 4) {
  const r = out[i];
  const g = out[i + 1];
  const b = out[i + 2];
  // Treat near-white / light grey backdrop as transparent (JPEG artifacts)
  if (r > 240 && g > 240 && b > 240) {
    out[i + 3] = 0;
  }
}
await sharp(out, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(output);
console.log('Wrote', output);
