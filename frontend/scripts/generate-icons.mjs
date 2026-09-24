// Genera los íconos PWA y el logo público desde docs/brand/ (marca Legacy Enterprise por defecto):
//   node scripts/generate-icons.mjs
// - public/logo.svg            marca (loader, splash, barra)
// - public/favicon.svg         favicon
// - public/icons/icon-*.png    íconos "any" (fondo índigo a sangre, sirve también recortado)
// - public/icons/maskable-512x512.png
// - public/icons/badge-72x72.png  (push en Android)
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const brand = new URL('../../docs/brand/', import.meta.url);
const pub = new URL('../public/', import.meta.url);
const icon = readFileSync(new URL('icon.svg', brand));

mkdirSync(new URL('icons/', pub), { recursive: true });
copyFileSync(new URL('logo.svg', brand), new URL('logo.svg', pub));
copyFileSync(new URL('icon.svg', brand), new URL('favicon.svg', pub));

const out = name => fileURLToPath(new URL(`icons/${name}`, pub));
for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  await sharp(icon, { density: 300 }).resize(size, size).png().toFile(out(`icon-${size}x${size}.png`));
}
await sharp(icon, { density: 300 }).resize(512, 512).png().toFile(out('maskable-512x512.png'));
// Badge de push (Android usa solo el alfa): silueta blanca sobre transparente.
await sharp(readFileSync(new URL('badge.svg', brand)), { density: 300 }).resize(72, 72).png().toFile(out('badge-72x72.png'));
console.log('íconos generados en public/icons');
