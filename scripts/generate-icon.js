const sharp = require('sharp');
const { default: pngToIco } = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const BUILD_DIR = path.join(__dirname, '..', 'build');

// SVG icon: dark rounded square with a metallic red recording circle
// and a subtle audio waveform ring
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- Background gradient matching app theme -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a1d32"/>
      <stop offset="40%" stop-color="#0e1020"/>
      <stop offset="100%" stop-color="#141628"/>
    </linearGradient>

    <!-- Record button gradient -->
    <radialGradient id="recGlow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#ff6050"/>
      <stop offset="50%" stop-color="#dd2818"/>
      <stop offset="100%" stop-color="#991008"/>
    </radialGradient>

    <!-- Highlight on the record button -->
    <radialGradient id="recHighlight" cx="38%" cy="32%" r="35%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>

    <!-- Outer glow -->
    <radialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="rgba(200,30,15,0)"/>
      <stop offset="85%" stop-color="rgba(200,30,15,0.08)"/>
      <stop offset="100%" stop-color="rgba(200,30,15,0)"/>
    </radialGradient>

    <!-- Waveform ring gradient -->
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(88,168,255,0.5)"/>
      <stop offset="25%" stop-color="rgba(88,168,255,0.15)"/>
      <stop offset="50%" stop-color="rgba(88,168,255,0.5)"/>
      <stop offset="75%" stop-color="rgba(88,168,255,0.15)"/>
      <stop offset="100%" stop-color="rgba(88,168,255,0.5)"/>
    </linearGradient>
  </defs>

  <!-- Background rounded square -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="220" ry="220" fill="url(#bg)"/>

  <!-- Subtle border -->
  <rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="218" ry="218"
        fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>

  <!-- Outer glow circle -->
  <circle cx="512" cy="512" r="380" fill="url(#outerGlow)"/>

  <!-- Audio waveform ring -->
  <circle cx="512" cy="512" r="280" fill="none" stroke="url(#ringGrad)" stroke-width="3" opacity="0.6"/>

  <!-- Small tick marks around the ring (waveform-like) -->
  ${Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2 - Math.PI / 2;
    const variation = [18, 35, 12, 42, 25, 38, 15, 45, 20, 32, 28, 40][i % 12];
    const innerR = 260 - variation * 0.3;
    const outerR = 300 + variation * 0.3;
    const x1 = 512 + Math.cos(angle) * innerR;
    const y1 = 512 + Math.sin(angle) * innerR;
    const x2 = 512 + Math.cos(angle) * outerR;
    const y2 = 512 + Math.sin(angle) * outerR;
    const opacity = 0.15 + (variation / 45) * 0.35;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(88,168,255,${opacity})" stroke-width="4" stroke-linecap="round"/>`;
  }).join('\n  ')}

  <!-- Main record circle with shadow -->
  <circle cx="512" cy="518" r="165" fill="rgba(0,0,0,0.3)" filter="blur(20px)"/>
  <circle cx="512" cy="512" r="160" fill="url(#recGlow)"/>

  <!-- Specular highlight on record button -->
  <circle cx="512" cy="512" r="160" fill="url(#recHighlight)"/>

  <!-- Inner ring on record button -->
  <circle cx="512" cy="512" r="155" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Bottom shadow on record button -->
  <ellipse cx="512" cy="640" rx="120" ry="20" fill="rgba(0,0,0,0.15)"/>
</svg>
`;

async function generate() {
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Generate PNG at 1024x1024
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  // Save 1024x1024 PNG (for Linux and electron-builder)
  const pngPath = path.join(BUILD_DIR, 'icon.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log('Created build/icon.png (1024x1024)');

  // Generate multiple sizes for ICO (NSIS requires 256x256 max)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map(size =>
      sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
    )
  );

  // Generate ICO (for Windows)
  const icoBuffer = await pngToIco(icoPngs);
  const icoPath = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Created build/icon.ico (${icoSizes.join(', ')}px)`);

  // Generate 512x512 for macOS icns (electron-builder will convert)
  const png512 = await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(BUILD_DIR, 'icon_512.png'), png512);
  console.log('Created build/icon_512.png (512x512)');

  console.log('Icon generation complete.');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
