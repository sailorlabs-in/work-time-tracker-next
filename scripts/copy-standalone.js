/**
 * copy-standalone.js
 *
 * Copies public/ and sw.js into .next/standalone/public/ after build.
 * Required because `output: "standalone"` does not auto-copy public/ files.
 */
const fs = require("fs");
const path = require("path");

const srcPublic = path.join(__dirname, "..", "public");
const destPublic = path.join(__dirname, "..", ".next", "standalone", "public");
const destStatic = path.join(__dirname, "..", ".next", "standalone", ".next", "static");
const srcStatic = path.join(__dirname, "..", ".next", "static");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy public/ → .next/standalone/public/
copyDir(srcPublic, destPublic);
console.log("[postbuild] Copied public/ → .next/standalone/public/");

// Copy .next/static/ → .next/standalone/.next/static/
copyDir(srcStatic, destStatic);
console.log("[postbuild] Copied .next/static/ → .next/standalone/.next/static/");
