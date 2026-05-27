# PaintMixer — Professional Color Mixing Studio

A modern, interactive paint mixing tool for professionals and enthusiasts.

## Features

### Color Mixer
- Mix up to 8 pigments with adjustable ratios
- Live blended color preview with HiDPI/retina rendering
- Zoom controls (fit / zoom in / zoom out / scroll-to-zoom)
- Download preview as PNG
- Complementary color generator
- HEX, RGB, HSL readout with one-click copy
- Save mixes to palette

### Special Effects (26)
- **Mineral:** Kristall Effekt, Pearl/Nacre, Mica/Mineral Flake, Opal/Fire Opal
- **Metal:** Metallic, Hammered Metal, Chrome/Mirror, Brushed Gold
- **Stone:** Marble, Granite/Stone, Sand/Stucco, Concrete/Cement
- **Aged:** Crackle/Craquelure, Rust & Patina, Oxidised Copper
- **Fabric:** Velvet/Suede, Fabric Weave
- **Organic:** Wood Grain, Leather/Pebble
- **Decorative:** Glitter, Galaxy/Nebula, Neon Glow, Holographic, Chameleon/Flip
- **Artistic:** Watercolor Wash, Impasto/Palette Knife

All effects render at full HiDPI resolution via `devicePixelRatio` scaling. Animated effects run in a live RAF loop.

### 3D Preview
- Apply your paint texture to 3D models: Car, Motorbike, Helmet, Sphere
- Drag to rotate, scroll to zoom
- Environment presets: Studio, Outdoor, Showroom, Night
- Adjustable light angle, light height, roughness, metalness, clearcoat
- Auto-spin and snapshot export
- Powered by Three.js r160

### Saved Palette
- Save and revisit your favourite mixes

## Tech Stack
- Vanilla JS / CSS / HTML — no build step
- Three.js r160 (local, with CDN fallback)
- Canvas 2D API for all effect rendering
- WebGL via Three.js for 3D preview

## Live Demo
[https://littlebeansf.github.io/paint-mixer/](https://littlebeansf.github.io/paint-mixer/)
