// Writes js/config.js for deployments (Vercel runs this as the build command).
// The Mapbox token comes from the MAPBOX_TOKEN environment variable, so it never lives
// in the repo. Locally, js/config.js is written by hand from js/config.example.js.
const fs = require("fs");
const path = require("path");

const token = (process.env.MAPBOX_TOKEN || "").trim();
const style = (process.env.MAPBOX_STYLE || "mapbox://styles/yasabdillah/cmuxqs5xc017d01sa9rthedah").trim();

if (!token.startsWith("pk.")) {
  console.error("MAPBOX_TOKEN is missing or not a public (pk.) token. Add it in Vercel → Project → Settings → Environment Variables.");
  process.exit(1);
}

const out = path.join(__dirname, "..", "js", "config.js");
fs.writeFileSync(out, `// Generated at build time by scripts/write-config.js.\nwindow.MAPBOX_CONFIG = ${JSON.stringify({ accessToken: token, style }, null, 2)};\n`);
console.log(`Wrote ${path.relative(process.cwd(), out)} (style ${style})`);
