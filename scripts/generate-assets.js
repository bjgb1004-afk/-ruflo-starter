#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create assets directory structure
const assetsDir = path.join(__dirname, '../assets/images');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log('✅ Created assets/images directory');
}

// Minimal valid PNG (1x1 white pixel) - base64 encoded
// This is the smallest valid PNG file
const minimalPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

// Create a larger icon - 1024x1024 white with text
// Using a simple approach: create gradient PNG with canvas library if available
// Fallback: use minimal PNG

// For now, use minimal PNG for all assets (they'll be replaced during EAS build)
const files = [
  'icon.png',
  'splash.png',
  'adaptive-icon.png'
];

files.forEach(filename => {
  const filePath = path.join(assetsDir, filename);
  fs.writeFileSync(filePath, minimalPNG);
  console.log(`✅ Created ${filename}`);
});

console.log('\n📝 Note: These are placeholder images.');
console.log('   For production, replace with actual assets or use EAS Build with icon settings.');
