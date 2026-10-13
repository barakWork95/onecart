/**
 * Renders the browser icons from the vector source, so they always match it:
 *   node scripts/generate-icons.mjs src/app/icon.svg src/app
 * → src/app/favicon.ico (16/32/48, transparent) and src/app/apple-icon.png
 *   (180px, white, padded: iOS rounds the corners itself). Uses Playwright's
 *   Chromium (npx playwright install chromium).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [svgPath, outDir] = process.argv.slice(2);
const svgUrl = "data:image/svg+xml;base64," + fs.readFileSync(svgPath).toString("base64");
const browser = await chromium.launch();
async function render(size, { background = null, padding = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const inner = size - 2 * padding;
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;${background ? `background:${background}` : "background:transparent"}"><img src="${svgUrl}" style="position:absolute;left:${padding}px;top:${padding}px;width:${inner}px;height:${inner}px"></body>`,
  );
  await page.waitForFunction(() => document.images[0].complete);
  const png = await page.screenshot({
    omitBackground: !background,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await page.close();
  return png;
}
// favicon.ico: PNG-compressed entries (supported by every current browser).
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await render(s));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
fs.writeFileSync(`${outDir}/favicon.ico`, Buffer.concat([header, ...entries, ...images]));
// Apple touch icon: opaque, with breathing room (iOS rounds the corners itself).
fs.writeFileSync(`${outDir}/apple-icon.png`, await render(180, { background: "#ffffff", padding: 22 }));

await browser.close();
process.stdout.write(`icons written to ${outDir}\n`);
