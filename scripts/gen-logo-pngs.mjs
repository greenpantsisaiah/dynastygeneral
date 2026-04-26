import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = "/Users/isaiahmcpeak/Claude Code Projects/DynastyGeneral/web/public";
const svg = readFileSync(join(PUBLIC, "dynasty-general-logo.svg"));

// Variants to render. The SVG ships at viewBox 200x200 with a faint
// option network behind a bold "Lean" arrow. At small favicon sizes
// the network detail collapses; we render with `density` boosted to
// keep the strokes crisp.
const variants = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-icon.png", size: 180 },
  { name: "dynasty_general_logo.png", size: 512 },
  { name: "dynasty_general_logomark.png", size: 256 },
];

for (const v of variants) {
  const out = await sharp(svg, { density: 600 })
    .resize(v.size, v.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(join(PUBLIC, v.name), out);
  console.log(`wrote ${v.name} (${v.size}x${v.size}, ${out.length} bytes)`);
}
