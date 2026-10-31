// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need: `npm run icons`.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url));
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon-180.png', 180],
];
for (const [file, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(new URL(`../public/icons/${file}`, import.meta.url).pathname);
  console.log('written', file);
}
