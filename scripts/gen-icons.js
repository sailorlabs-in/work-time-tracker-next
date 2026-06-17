const fs = require('fs');
const path = require('path');

const iconsDir = path.join('public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

function makeSvg(size) {
  return [
    "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "' viewBox='0 0 " + size + " " + size + "'>",
    "  <rect width='" + size + "' height='" + size + "' rx='24' fill='#0d0d1a'/>",
    "  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#7c3aed'/><stop offset='100%' stop-color='#a855f7'/></linearGradient></defs>",
    "  <rect x='12' y='12' width='" + (size-24) + "' height='" + (size-24) + "' rx='16' fill='url(#g)'/>",
    "  <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='" + Math.floor(size*0.4) + "' font-family='system-ui'>T</text>",
    "</svg>"
  ].join('\n');
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), makeSvg(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), makeSvg(512));
console.log('SVG icons created in public/icons/');
