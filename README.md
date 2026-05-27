# PaintMixer — Professional Color Mixing Studio

A professional web application for painters and paint industry specialists. Mix colors, apply surface effects, and preview results on real 3D models in real time.

**Live demo:** https://littlebeansf.github.io/paint-mixer/

---

## Features

### Color Mixer
- Mix up to 8 pigments simultaneously with adjustable ratios
- Real-time color blending with live preview
- HEX / RGB / HSL readout + clipboard copy
- Complementary color suggestion
- Random mix generator
- Save mixes to the Saved Palette

### 26 Surface Effects
Organized across 8 categories:

| Category    | Effects |
|-------------|---------|
| Base        | No Effect |
| Mineral     | Kristall Effekt, Pearl/Nacre, Mica/Mineral Flake, Opal/Fire Opal |
| Metal       | Metallic, Hammered Metal, Chrome/Mirror, Brushed Gold |
| Stone       | Marble, Granite/Stone, Sand/Stucco, Concrete/Cement |
| Aged        | Crackle/Craquelure, Rust & Patina, Oxidised Copper |
| Fabric      | Velvet/Suede, Fabric Weave |
| Organic     | Wood Grain, Leather/Pebble |
| Decorative  | Glitter, Galaxy/Nebula, Neon Glow, Holographic, Chameleon/Flip |
| Artistic    | Watercolor Wash, Impasto/Palette Knife |

All effects render at full HiDPI/Retina resolution. Each effect card is interactive: drag sliders, rotate the swatch, toggle options in real time.

### 3D Preview
Apply your paint and effect to a choice of 3D models and rotate/zoom interactively:

| Model     | Source |
|-----------|--------|
| **Car**   | Ferrari 458 Spider — three.js examples (MIT) |
| **Motorbike** | Sport Motorcycle — procedural (built-in) |
| **Helmet**    | Damaged Helmet — [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (CC0) |
| **Sphere**    | Procedural sphere (built-in) |

Controls per model:
- Drag to rotate · Scroll to zoom
- Light Angle, Light Height sliders
- Roughness, Metalness, Clearcoat sliders
- Environment: Studio / Outdoor / Showroom / Night
- Auto Spin toggle
- Snapshot (save PNG)

### Saved Palette
- Save any mix with its active effect
- **"Test in 3D"** button on every saved card — instantly loads the colour onto the 3D preview
- Click a swatch to reload it into the mixer

---

## Technology

- Vanilla JavaScript + HTML5 Canvas
- Three.js r160 (local, no CDN dependency)
- GLTFLoader r147 + DRACOLoader r147 (UMD builds, compatible with r160 THREE global)
- Draco decoder (local `./draco/`) for Draco-compressed GLB models
- Pure CSS animations — no external animation library

---

## 3D Model Credits

| Model | License | Source |
|-------|---------|--------|
| Ferrari 458 Spider (`models/ferrari.glb`) | MIT | [three.js examples](https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf) |
| Damaged Helmet (`models/helmet.glb`) | CC0 | [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DamagedHelmet) |
| Sport Motorcycle | Procedural | Built-in Three.js geometry |
| Sphere | Procedural | Built-in Three.js geometry |

---

## Local Development

```bash
# Serve with any static server on port 3001
python3 -m http.server 3001
# or
npx serve . -l 3001
```

Then open http://localhost:3001

---

## Changelog

### v3 (current)
- Real GLB models: Ferrari 458 Spider (MIT), Damaged Helmet (CC0/Khronos)
- Draco decompression support (local decoder, no CDN)
- Per-model auto-fit scaling with per-model target sizes
- Model switch race-condition fix (load token system)
- High-quality procedural Sport Motorcycle (detailed geometry: torus wheels, spokes, rim, fairing, tank, exhaust, handlebars)
- **"Test in 3D"** button on saved palette cards — navigates to 3D Preview with the saved color applied
- Improved camera framing for all models
- Loading overlay cleanup on rapid model switching

### v2
- HiDPI/Retina fix — all effects render at full device pixel ratio
- 26 surface effects across 8 categories
- Three.js 3D preview (car, motorbike, helmet, sphere)
- Full interactive effect cards with parameter controls
- Auto Spin, Snapshot, environment presets

### v1
- Color mixer (up to 8 pigments)
- Live preview canvas
- Save to palette
- GitHub Pages deployment
