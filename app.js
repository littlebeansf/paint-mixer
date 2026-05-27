/* ====================================================
   PAINT MIXER — app.js
   Core: color mixing engine, effects rendering,
   UI logic, palette persistence.
   ==================================================== */

'use strict';

// ---- DARK MODE TOGGLE ----
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateToggleIcon(toggle, theme);

  toggle && toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateToggleIcon(toggle, theme);
    setTimeout(() => {
      renderPreview();
      renderEffectPreview();
    }, 50);
  });

  function updateToggleIcon(btn, t) {
    if (!btn) return;
    btn.innerHTML = t === 'dark'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
})();

// ---- STATE ----
const state = {
  colors: [
    { id: uid(), hex: '#e85050', pct: 50 },
    { id: uid(), hex: '#4c8ce0', pct: 50 },
  ],
  activeEffect: null,
  effectParams: {},
  savedPalette: [],
  animFrame: null,
  effectAnimFrame: null,
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ---- COLOR MATH ----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// Mix colors in linear RGB with weighted average
function mixColors(colorList) {
  if (!colorList.length) return [255, 255, 255];
  let total = colorList.reduce((s, c) => s + c.pct, 0);
  if (total === 0) total = 1;
  let r = 0, g = 0, b = 0;
  for (const c of colorList) {
    const [cr, cg, cb] = hexToRgb(c.hex);
    const w = c.pct / total;
    // Convert to linear before mixing (physically accurate)
    r += Math.pow(cr / 255, 2.2) * w;
    g += Math.pow(cg / 255, 2.2) * w;
    b += Math.pow(cb / 255, 2.2) * w;
  }
  return [
    Math.round(Math.pow(r, 1 / 2.2) * 255),
    Math.round(Math.pow(g, 1 / 2.2) * 255),
    Math.round(Math.pow(b, 1 / 2.2) * 255),
  ];
}

function getMixedColor() {
  return mixColors(state.colors);
}

// ---- EFFECTS DEFINITIONS ----
const EFFECTS = [
  {
    id: 'none',
    name: 'No Effect',
    category: 'Base',
    desc: 'Flat matte coat, no special finish.',
    params: [],
    render: (ctx, w, h, rgb) => {
      ctx.fillStyle = rgbToHex(...rgb);
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: 'kristall',
    name: 'Kristall Effekt',
    category: 'Mineral',
    desc: 'Faceted crystal growths sparkle over the base color like ice or gemstones.',
    params: [
      { id: 'density', label: 'Crystal Density', min: 1, max: 100, default: 50 },
      { id: 'shimmer', label: 'Shimmer Intensity', min: 0, max: 100, default: 70 },
    ],
    render: renderKristall,
  },
  {
    id: 'marble',
    name: 'Marble',
    category: 'Stone',
    desc: 'Elegant veined marble with deep swirls and translucent depth.',
    params: [
      { id: 'veins', label: 'Vein Count', min: 2, max: 20, default: 6 },
      { id: 'contrast', label: 'Contrast', min: 10, max: 100, default: 60 },
    ],
    render: renderMarble,
  },
  {
    id: 'metallic',
    name: 'Metallic',
    category: 'Metal',
    desc: 'High-gloss metallic with directional brushed sheen.',
    params: [
      { id: 'gloss', label: 'Gloss Level', min: 10, max: 100, default: 75 },
      { id: 'grain', label: 'Grain Direction', min: 0, max: 180, default: 45 },
    ],
    render: renderMetallic,
  },
  {
    id: 'pearl',
    name: 'Pearl / Nacre',
    category: 'Mineral',
    desc: 'Iridescent pearlescent shimmer, shifts color at different angles.',
    params: [
      { id: 'iridescence', label: 'Iridescence', min: 10, max: 100, default: 60 },
      { id: 'layers', label: 'Pearl Layers', min: 1, max: 10, default: 4 },
    ],
    render: renderPearl,
  },
  {
    id: 'crackle',
    name: 'Crackle / Craquelure',
    category: 'Aged',
    desc: 'Aged, weathered crackled surface — ceramic or vintage leather look.',
    params: [
      { id: 'crack_size', label: 'Crack Width', min: 1, max: 30, default: 10 },
      { id: 'depth', label: 'Crack Depth', min: 10, max: 100, default: 55 },
    ],
    render: renderCrackle,
  },
  {
    id: 'velvet',
    name: 'Velvet / Suede',
    category: 'Fabric',
    desc: 'Soft velvety finish with micro-fibre depth and warm shading.',
    params: [
      { id: 'softness', label: 'Pile Softness', min: 10, max: 100, default: 65 },
      { id: 'direction', label: 'Nap Direction', min: 0, max: 180, default: 90 },
    ],
    render: renderVelvet,
  },
  {
    id: 'stone',
    name: 'Stone Texture',
    category: 'Stone',
    desc: 'Granite-like granular surface with speckled mineral inclusions.',
    params: [
      { id: 'grain_size', label: 'Grain Size', min: 1, max: 20, default: 5 },
      { id: 'contrast', label: 'Speckle Contrast', min: 10, max: 100, default: 50 },
    ],
    render: renderStone,
  },
  {
    id: 'glitter',
    name: 'Glitter',
    category: 'Decorative',
    desc: 'Sparkling glitter particles embedded in the paint base.',
    params: [
      { id: 'density', label: 'Particle Density', min: 10, max: 200, default: 80 },
      { id: 'size', label: 'Particle Size', min: 1, max: 8, default: 3 },
    ],
    render: renderGlitter,
  },
  {
    id: 'hammered',
    name: 'Hammered Metal',
    category: 'Metal',
    desc: 'Dimpled hammered surface with directional reflections.',
    params: [
      { id: 'dimple_size', label: 'Dimple Size', min: 5, max: 40, default: 16 },
      { id: 'relief', label: 'Relief Depth', min: 10, max: 100, default: 60 },
    ],
    render: renderHammered,
  },
  {
    id: 'sand',
    name: 'Sand Texture',
    category: 'Stone',
    desc: 'Fine sandy grit — coastal or desert feel.',
    params: [
      { id: 'coarseness', label: 'Coarseness', min: 1, max: 20, default: 4 },
      { id: 'depth', label: 'Depth', min: 10, max: 100, default: 45 },
    ],
    render: renderSand,
  },
  {
    id: 'wood',
    name: 'Wood Grain',
    category: 'Organic',
    desc: 'Realistic flowing wood grain rings and fibre texture.',
    params: [
      { id: 'grain_freq', label: 'Ring Frequency', min: 2, max: 30, default: 10 },
      { id: 'wave', label: 'Grain Wave', min: 0, max: 100, default: 40 },
    ],
    render: renderWood,
  },
  {
    id: 'rust',
    name: 'Rust & Patina',
    category: 'Aged',
    desc: 'Organic oxidation and patina — industrial aged character.',
    params: [
      { id: 'coverage', label: 'Rust Coverage', min: 5, max: 100, default: 50 },
      { id: 'texture', label: 'Texture Roughness', min: 10, max: 100, default: 60 },
    ],
    render: renderRust,
  },
  {
    id: 'mica',
    name: 'Mica / Mineral Flake',
    category: 'Mineral',
    desc: 'Mica flakes catch the light with scattered flat reflections.',
    params: [
      { id: 'flake_density', label: 'Flake Density', min: 5, max: 150, default: 50 },
      { id: 'flake_size', label: 'Flake Size', min: 2, max: 20, default: 8 },
    ],
    render: renderMica,
  },
  {
    id: 'galaxy',
    name: 'Galaxy / Nebula',
    category: 'Decorative',
    desc: 'Deep cosmic nebula swirl — pigments dissolve into interstellar clouds.',
    params: [
      { id: 'stars', label: 'Star Count', min: 10, max: 300, default: 120 },
      { id: 'nebula', label: 'Nebula Density', min: 10, max: 100, default: 55 },
    ],
    render: renderGalaxy,
  },
  {
    id: 'watercolor',
    name: 'Watercolor Wash',
    category: 'Artistic',
    desc: 'Translucent soft wash edges and blooms like watercolor on wet paper.',
    params: [
      { id: 'wetness', label: 'Wetness / Bloom', min: 10, max: 100, default: 60 },
      { id: 'layers', label: 'Wash Layers', min: 1, max: 8, default: 3 },
    ],
    render: renderWatercolor,
  },
];

// ---- EFFECT RENDERERS ----

// Seeded pseudo-random for deterministic renders
function seededRand(seed) {
  let s = seed ^ 0x9e3779b9;
  return function () {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

function renderKristall(ctx, w, h, rgb, params, t = 0) {
  const density = (params.density || 50) / 100;
  const shimmer = (params.shimmer || 70) / 100;
  const [r, g, b] = rgb;
  const rand = seededRand(42);

  // Background
  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  // Crystal facets
  const numCrystals = Math.floor(density * 60) + 8;
  for (let i = 0; i < numCrystals; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const size = rand() * 30 + 10;
    const sides = Math.floor(rand() * 3) + 4; // 4-6 sides
    const rotation = rand() * Math.PI * 2 + t * 0.3;
    const alpha = (rand() * 0.5 + 0.3) * shimmer;
    const brightness = rand() * 100 + 130;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    // Facet base
    ctx.beginPath();
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      j === 0 ? ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size)
              : ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, `rgba(${brightness},${brightness},${brightness+20},${alpha})`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},${alpha * 0.3})`);
    grad.addColorStop(1, `rgba(${r * 0.5},${g * 0.5},${b * 0.5},${alpha * 0.5})`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner gleam
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(rotation) * size * 0.7, Math.sin(rotation) * size * 0.7);
    ctx.strokeStyle = `rgba(255,255,255,${shimmer * 0.8})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  // Animated sparkle dots
  const sparkleCount = Math.floor(shimmer * 20);
  for (let i = 0; i < sparkleCount; i++) {
    const sx = (seededRand(i * 7 + 1)() * w);
    const sy = (seededRand(i * 7 + 2)() * h);
    const phase = (t * 2 + i) % (Math.PI * 2);
    const bright = (Math.sin(phase) + 1) / 2;
    const radius = bright * 2.5 + 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${bright * shimmer})`;
    ctx.fill();
  }
}

function renderMarble(ctx, w, h, rgb, params, t = 0) {
  const veins = params.veins || 6;
  const contrast = (params.contrast || 60) / 100;
  const [r, g, b] = rgb;

  // Base
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, rgbToHex(r, g, b));
  bg.addColorStop(1, rgbToHex(
    Math.min(255, r + 30),
    Math.min(255, g + 30),
    Math.min(255, b + 30)
  ));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Marble veins using Perlin-like noise (sine sum)
  ctx.lineWidth = 0.8;
  for (let v = 0; v < veins; v++) {
    const rand = seededRand(v * 31 + 7);
    const startX = rand() * w;
    const startY = rand() * h;
    const angle = rand() * Math.PI;
    const freq = 0.01 + rand() * 0.02;
    const amp = 20 + rand() * 60;
    const phase = rand() * Math.PI * 2;
    const veinContrast = (0.3 + rand() * 0.7) * contrast;
    const dark = rand() > 0.5;
    const veinColor = dark
      ? `rgba(${Math.max(0,r-80)},${Math.max(0,g-80)},${Math.max(0,b-80)},${veinContrast})`
      : `rgba(255,255,255,${veinContrast * 0.8})`;

    ctx.beginPath();
    let px = startX, py = startY;
    ctx.moveTo(px, py);
    const len = Math.sqrt(w * w + h * h);
    for (let s = 0; s < len; s += 2) {
      const nx = px + Math.cos(angle) * 2;
      const ny = py + Math.sin(angle) * 2;
      const wiggle = Math.sin(s * freq + phase + t * 0.1) * amp * 0.05;
      px = nx + Math.cos(angle + Math.PI / 2) * wiggle;
      py = ny + Math.sin(angle + Math.PI / 2) * wiggle;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = veinColor;
    ctx.lineWidth = 0.6 + rand() * 1.5;
    ctx.stroke();

    // Sub-vein
    if (rand() > 0.4) {
      ctx.beginPath();
      px = startX + rand() * 10; py = startY + rand() * 10;
      ctx.moveTo(px, py);
      for (let s = 0; s < len * 0.5; s += 2) {
        const nx = px + Math.cos(angle + 0.3) * 2;
        const ny = py + Math.sin(angle + 0.3) * 2;
        const wiggle = Math.sin(s * freq * 1.5 + phase + t * 0.15) * amp * 0.03;
        px = nx + Math.cos(angle + Math.PI / 2) * wiggle;
        py = ny + Math.sin(angle + Math.PI / 2) * wiggle;
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = veinColor.replace(/[\d.]+\)$/, `${veinContrast * 0.4})`);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }

  // Slight gloss highlight
  const gloss = ctx.createLinearGradient(0, 0, w * 0.3, h * 0.3);
  gloss.addColorStop(0, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
}

function renderMetallic(ctx, w, h, rgb, params, t = 0) {
  const gloss = (params.gloss || 75) / 100;
  const grainAngle = ((params.grain || 45) * Math.PI) / 180;
  const [r, g, b] = rgb;

  // Brushed base gradient along grain direction
  const cos = Math.cos(grainAngle);
  const sin = Math.sin(grainAngle);
  const gx = ctx.createLinearGradient(
    w / 2 - cos * w, h / 2 - sin * h,
    w / 2 + cos * w, h / 2 + sin * h
  );
  gx.addColorStop(0, rgbToHex(Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)));
  gx.addColorStop(0.35, rgbToHex(r, g, b));
  gx.addColorStop(0.5, rgbToHex(Math.min(255, r + 90), Math.min(255, g + 90), Math.min(255, b + 90)));
  gx.addColorStop(0.65, rgbToHex(r, g, b));
  gx.addColorStop(1, rgbToHex(Math.max(0, r - 40), Math.max(0, g - 40), Math.max(0, b - 40)));
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);

  // Micro-brushed lines
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 80; i++) {
    const rand = seededRand(i);
    const offset = rand() * (Math.abs(cos) * w + Math.abs(sin) * h) * 2 - (Math.abs(cos) * w + Math.abs(sin) * h);
    const x0 = w / 2 + (-sin) * offset - cos * w;
    const y0 = h / 2 + cos * offset - sin * h;
    const x1 = w / 2 + (-sin) * offset + cos * w;
    const y1 = h / 2 + cos * offset + sin * h;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = rand() > 0.5 ? 'white' : 'black';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();

  // Gloss reflection band
  const refPhase = (Math.sin(t * 0.5) * 0.5 + 0.5) * 0.6 + 0.2;
  const refX = ctx.createLinearGradient(
    w * (refPhase - 0.15), 0, w * (refPhase + 0.15), 0
  );
  refX.addColorStop(0, 'rgba(255,255,255,0)');
  refX.addColorStop(0.5, `rgba(255,255,255,${gloss * 0.4})`);
  refX.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = refX;
  ctx.fillRect(0, 0, w, h);
}

function renderPearl(ctx, w, h, rgb, params, t = 0) {
  const iri = (params.iridescence || 60) / 100;
  const layers = params.layers || 4;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  for (let layer = 0; layer < layers; layer++) {
    const shift = (t * 0.3 + layer * (Math.PI * 2 / layers));
    const hueShift = (shift * 60) % 360;
    const s = Math.sin(shift) * 0.5 + 0.5;

    // Iridescent color layer
    const iriR = Math.min(255, r + Math.sin(hueShift * Math.PI / 180) * 80 * iri);
    const iriG = Math.min(255, g + Math.sin((hueShift + 120) * Math.PI / 180) * 80 * iri);
    const iriB = Math.min(255, b + Math.sin((hueShift + 240) * Math.PI / 180) * 80 * iri);

    const grad = ctx.createRadialGradient(
      w * (0.3 + 0.4 * Math.cos(shift)),
      h * (0.3 + 0.4 * Math.sin(shift)),
      0,
      w * 0.5, h * 0.5, w * 0.7
    );
    grad.addColorStop(0, `rgba(${iriR},${iriG},${iriB},${s * 0.3 * iri})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Soft sheen overlay
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, `rgba(255,255,255,${0.25 * iri})`);
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, `rgba(200,200,255,${0.1 * iri})`);
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

function renderCrackle(ctx, w, h, rgb, params) {
  const crackSize = params.crack_size || 10;
  const depth = (params.depth || 55) / 100;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  // Generate Voronoi-like crackle using seeded points
  const numCells = Math.floor((w * h) / (crackSize * crackSize * 15)) + 8;
  const rand = seededRand(91);
  const points = [];
  for (let i = 0; i < numCells; i++) {
    points.push({ x: rand() * w, y: rand() * h });
  }

  // Draw crack borders between cells
  ctx.strokeStyle = `rgba(${Math.max(0,r-100)},${Math.max(0,g-80)},${Math.max(0,b-80)},${depth})`;
  ctx.lineWidth = 1.5;

  for (let px = 0; px < w; px += 3) {
    for (let py = 0; py < h; py += 3) {
      let minD1 = Infinity, minD2 = Infinity;
      for (const p of points) {
        const d = Math.sqrt((px - p.x) ** 2 + (py - p.y) ** 2);
        if (d < minD1) { minD2 = minD1; minD1 = d; }
        else if (d < minD2) { minD2 = d; }
      }
      // Near boundary: darker
      const borderFactor = 1 - Math.min(1, (minD2 - minD1) / crackSize);
      if (borderFactor > 0.85) {
        ctx.fillStyle = `rgba(${Math.max(0,r-120)},${Math.max(0,g-100)},${Math.max(0,b-100)},${borderFactor * depth})`;
        ctx.fillRect(px, py, 3, 3);
      }
    }
  }

  // Interior cell highlights (slight shine)
  for (const p of points) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, crackSize * 2);
    grad.addColorStop(0, `rgba(255,255,255,0.08)`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - crackSize * 2, p.y - crackSize * 2, crackSize * 4, crackSize * 4);
  }
}

function renderVelvet(ctx, w, h, rgb, params, t = 0) {
  const softness = (params.softness || 65) / 100;
  const dir = ((params.direction || 90) * Math.PI) / 180;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  // Directional soft shadow
  const shadow = ctx.createLinearGradient(
    w / 2 - Math.cos(dir) * w, h / 2 - Math.sin(dir) * h,
    w / 2 + Math.cos(dir) * w, h / 2 + Math.sin(dir) * h
  );
  shadow.addColorStop(0, `rgba(0,0,0,${0.4 * softness})`);
  shadow.addColorStop(0.4, `rgba(0,0,0,0)`);
  shadow.addColorStop(0.7, `rgba(255,255,255,${0.15 * softness})`);
  shadow.addColorStop(1, `rgba(0,0,0,${0.2 * softness})`);
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, w, h);

  // Micro fibre noise
  const rand = seededRand(77);
  for (let i = 0; i < 2000; i++) {
    const fx = rand() * w;
    const fy = rand() * h;
    const len = rand() * 4 + 1;
    const alpha = rand() * 0.05 * softness;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(dir + rand() * 0.5 - 0.25) * len,
               fy + Math.sin(dir + rand() * 0.5 - 0.25) * len);
    ctx.strokeStyle = rand() > 0.5
      ? `rgba(255,255,255,${alpha})`
      : `rgba(0,0,0,${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function renderStone(ctx, w, h, rgb, params) {
  const grainSize = params.grain_size || 5;
  const contrast = (params.contrast || 50) / 100;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(13);
  const specs = Math.floor((w * h) / (grainSize * grainSize * 2));
  for (let i = 0; i < specs; i++) {
    const sx = rand() * w;
    const sy = rand() * h;
    const sr = rand() * grainSize + 1;
    const bright = (rand() * 2 - 1) * 80 * contrast;
    const cr = Math.min(255, Math.max(0, r + bright));
    const cg = Math.min(255, Math.max(0, g + bright * 0.9));
    const cb = Math.min(255, Math.max(0, b + bright * 0.8));
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr, sr * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.4 + rand() * 0.5})`;
    ctx.fill();
  }
}

function renderGlitter(ctx, w, h, rgb, params, t = 0) {
  const density = params.density || 80;
  const size = params.size || 3;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(55);
  for (let i = 0; i < density * 3; i++) {
    const gx = rand() * w;
    const gy = rand() * h;
    const gs = rand() * size + 0.5;
    const phase = (t * 3 + i * 1.3) % (Math.PI * 2);
    const bright = (Math.sin(phase) + 1) / 2;
    const hueRot = rand() * 360;
    const alpha = bright * 0.9 + 0.1;

    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(phase);
    // Star shape
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * gs * 2, Math.sin(a) * gs * 2);
    }
    ctx.strokeStyle = `hsla(${hueRot}, 100%, 90%, ${alpha})`;
    ctx.lineWidth = gs * 0.8;
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(gx, gy, gs * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${bright * 0.8})`;
    ctx.fill();
  }
}

function renderHammered(ctx, w, h, rgb, params) {
  const dimpleSize = params.dimple_size || 16;
  const relief = (params.relief || 60) / 100;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const cols = Math.ceil(w / dimpleSize) + 1;
  const rows = Math.ceil(h / dimpleSize) + 1;
  const rand = seededRand(29);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jx = (rand() - 0.5) * dimpleSize * 0.5;
      const jy = (rand() - 0.5) * dimpleSize * 0.5;
      const cx = col * dimpleSize + dimpleSize / 2 + jx + (row % 2 === 0 ? 0 : dimpleSize / 2);
      const cy = row * dimpleSize * 0.866 + dimpleSize / 2 + jy;
      const radius = dimpleSize * 0.45 * (0.7 + rand() * 0.3);

      // Dimple shadow
      const shadowGrad = ctx.createRadialGradient(cx, cy, 0, cx - radius * 0.3, cy - radius * 0.3, radius);
      shadowGrad.addColorStop(0, `rgba(0,0,0,${0.3 * relief})`);
      shadowGrad.addColorStop(0.6, `rgba(0,0,0,0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      // Dimple highlight
      const highGrad = ctx.createRadialGradient(
        cx - radius * 0.25, cy - radius * 0.25, 0,
        cx, cy, radius
      );
      highGrad.addColorStop(0, `rgba(255,255,255,${0.45 * relief})`);
      highGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = highGrad;
      ctx.fill();
    }
  }
}

function renderSand(ctx, w, h, rgb, params) {
  const coarseness = params.coarseness || 4;
  const depth = (params.depth || 45) / 100;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(19);
  const grains = Math.floor((w * h) / (coarseness * coarseness));
  for (let i = 0; i < grains; i++) {
    const gx = rand() * w;
    const gy = rand() * h;
    const gr = rand() * coarseness * 0.8 + 0.3;
    const bright = (rand() * 2 - 1) * 60 * depth;
    const cr = Math.min(255, Math.max(0, r + bright));
    const cg = Math.min(255, Math.max(0, g + bright));
    const cb = Math.min(255, Math.max(0, b + bright * 0.7));
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.3 + rand() * 0.5})`;
    ctx.fill();
  }
}

function renderWood(ctx, w, h, rgb, params, t = 0) {
  const freq = (params.grain_freq || 10) / 100;
  const wave = (params.wave || 40) / 100;
  const [r, g, b] = rgb;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const cx = px - w / 2;
      const cy = py - h / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const angle = Math.atan2(cy, cx);
      const ring = dist * freq + Math.sin(angle * 3 + wave * Math.sin(dist * 0.05)) * wave * 20;
      const ringVal = Math.sin(ring) * 0.5 + 0.5;
      const grain = Math.sin(py * 0.8 + Math.sin(px * 0.03) * 15 + t * 0.02) * 0.5 + 0.5;
      const combined = ringVal * 0.7 + grain * 0.3;
      const bright = (combined * 2 - 1) * 50;
      ctx.fillStyle = rgbToHex(
        Math.min(255, Math.max(0, r + bright * 1.1)),
        Math.min(255, Math.max(0, g + bright * 0.8)),
        Math.min(255, Math.max(0, b + bright * 0.4))
      );
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function renderRust(ctx, w, h, rgb, params) {
  const coverage = (params.coverage || 50) / 100;
  const texture = (params.texture || 60) / 100;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(37);
  const patches = Math.floor(coverage * 30) + 5;

  for (let i = 0; i < patches; i++) {
    const px = rand() * w;
    const py = rand() * h;
    const pSize = rand() * 50 + 20;
    const rustR = Math.min(255, 160 + rand() * 60);
    const rustG = Math.min(255, 60 + rand() * 40);
    const rustB = Math.max(0, 10 + rand() * 20);
    const alpha = rand() * 0.6 * coverage + 0.1;

    const grad = ctx.createRadialGradient(px, py, 0, px, py, pSize);
    grad.addColorStop(0, `rgba(${rustR},${rustG},${rustB},${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pSize, py - pSize, pSize * 2, pSize * 2);
  }

  // Texture bumps
  for (let i = 0; i < 2000 * texture; i++) {
    const tx = rand() * w;
    const ty = rand() * h;
    const tr = rand() * 2 + 0.5;
    const bright = rand() > 0.5 ? 60 : -40;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.min(255,r+bright)},${Math.min(255,g+bright*0.6)},${b},${0.2 + rand() * 0.3})`;
    ctx.fill();
  }
}

function renderMica(ctx, w, h, rgb, params, t = 0) {
  const density = params.flake_density || 50;
  const flakeSize = params.flake_size || 8;
  const [r, g, b] = rgb;

  ctx.fillStyle = rgbToHex(r, g, b);
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(61);
  for (let i = 0; i < density * 2; i++) {
    const fx = rand() * w;
    const fy = rand() * h;
    const fs = rand() * flakeSize + 2;
    const rot = rand() * Math.PI;
    const phase = (t * 1.5 + i * 0.7) % (Math.PI * 2);
    const bright = (Math.sin(phase) + 1) / 2;
    const alpha = bright * 0.7 + 0.1;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(rot + t * 0.1);
    ctx.scale(1, 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, fs, fs * 0.6, 0, 0, Math.PI * 2);
    const flakeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, fs);
    flakeGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    flakeGrad.addColorStop(0.5, `rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},${alpha * 0.5})`);
    flakeGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = flakeGrad;
    ctx.fill();
    ctx.restore();
  }
}

function renderGalaxy(ctx, w, h, rgb, params, t = 0) {
  const stars = params.stars || 120;
  const nebula = (params.nebula || 55) / 100;
  const [r, g, b] = rgb;

  // Deep space background
  const darkR = Math.min(30, r * 0.1);
  const darkG = Math.min(30, g * 0.1);
  const darkB = Math.min(60, b * 0.2 + 20);
  ctx.fillStyle = rgbToHex(darkR, darkG, darkB);
  ctx.fillRect(0, 0, w, h);

  // Nebula clouds
  const rand = seededRand(88);
  for (let i = 0; i < 8; i++) {
    const nx = rand() * w;
    const ny = rand() * h;
    const nr = rand() * w * 0.4 + w * 0.1;
    const phase = t * 0.2 + i * 0.8;
    const cloudR = rand() * 255;
    const cloudG = rand() * 100;
    const cloudB = rand() * 255;
    const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    grad.addColorStop(0, `rgba(${cloudR},${cloudG},${cloudB},${nebula * 0.3})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.scale(1 + Math.sin(phase) * 0.1, 1 + Math.cos(phase) * 0.1);
    ctx.translate(-nx, -ny);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Mix color splash
  const mixGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.35);
  mixGrad.addColorStop(0, `rgba(${r},${g},${b},${nebula * 0.5})`);
  mixGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mixGrad;
  ctx.fillRect(0, 0, w, h);

  // Stars
  const srand = seededRand(99);
  for (let i = 0; i < stars; i++) {
    const sx = srand() * w;
    const sy = srand() * h;
    const sr = srand() * 1.5 + 0.3;
    const phase = (t * 2 + i * 0.4) % (Math.PI * 2);
    const bright = (Math.sin(phase) + 1) / 2;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * (0.5 + bright * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${bright * 0.9 + 0.1})`;
    ctx.fill();

    // Star glow
    if (sr > 1) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4);
      glow.addColorStop(0, `rgba(255,255,255,${bright * 0.3})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    }
  }
}

function renderWatercolor(ctx, w, h, rgb, params, t = 0) {
  const wetness = (params.wetness || 60) / 100;
  const layerCount = params.layers || 3;
  const [r, g, b] = rgb;

  // White paper base
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, w, h);

  const rand = seededRand(44);
  for (let layer = 0; layer < layerCount; layer++) {
    const cx = rand() * w * 0.6 + w * 0.2;
    const cy = rand() * h * 0.6 + h * 0.2;
    const cr = rand() * Math.min(w, h) * 0.35 + Math.min(w, h) * 0.15;
    const layerR = Math.min(255, r + (rand() * 60 - 30));
    const layerG = Math.min(255, g + (rand() * 60 - 30));
    const layerB = Math.min(255, b + (rand() * 60 - 30));
    const alpha = (0.2 + rand() * 0.25) * (wetness * 0.8 + 0.2);

    // Bloom shape (irregular ellipse)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + rand() * 0.4, 0.7 + rand() * 0.6);
    const washGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
    washGrad.addColorStop(0, `rgba(${layerR},${layerG},${layerB},${alpha * 1.5})`);
    washGrad.addColorStop(0.6, `rgba(${layerR},${layerG},${layerB},${alpha})`);
    washGrad.addColorStop(0.85, `rgba(${layerR},${layerG},${layerB},${alpha * 0.5})`);
    washGrad.addColorStop(1, `rgba(${layerR},${layerG},${layerB},0)`);
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, Math.PI * 2);
    ctx.fillStyle = washGrad;
    ctx.fill();
    ctx.restore();

    // Wet edge bloom
    if (wetness > 0.4) {
      for (let e = 0; e < 5; e++) {
        const ex = cx + (rand() - 0.5) * cr * 1.5;
        const ey = cy + (rand() - 0.5) * cr * 1.5;
        const er = rand() * 20 + 5;
        const bloomGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
        bloomGrad.addColorStop(0, `rgba(${layerR},${layerG},${layerB},${alpha * 0.8})`);
        bloomGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloomGrad;
        ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
      }
    }
  }

  // Paper texture
  for (let i = 0; i < 3000; i++) {
    const px = rand() * w;
    const py = rand() * h;
    const bright = rand() * 0.04 - 0.02;
    ctx.fillStyle = `rgba(${bright > 0 ? 255 : 0},${bright > 0 ? 255 : 0},${bright > 0 ? 255 : 0},${Math.abs(bright)})`;
    ctx.fillRect(px, py, 1, 1);
  }
}

// ---- BUILD UI ----

// Navigation
document.querySelectorAll('.nav-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const target = pill.dataset.section;
    document.querySelectorAll('.section').forEach(s => {
      s.classList.toggle('active', s.id === `section-${target}`);
    });
    if (target === 'effects') buildEffectsGrid();
  });
});

document.getElementById('btn-goto-effects')?.addEventListener('click', () => {
  document.querySelector('.nav-pill[data-section="effects"]')?.click();
});

// ---- SLOT MANAGEMENT ----

function buildColorSlots() {
  const container = document.getElementById('color-slots');
  container.innerHTML = '';
  state.colors.forEach(color => {
    container.appendChild(createSlotEl(color));
  });
  normalizePercentages();
  renderPreview();
}

function createSlotEl(color) {
  const el = document.createElement('div');
  el.className = 'color-slot';
  el.dataset.id = color.id;
  el.innerHTML = `
    <div class="slot-swatch" style="background:${color.hex}">
      <input type="color" class="slot-color-input" value="${color.hex}" aria-label="Pick color">
    </div>
    <input type="range" class="slot-range" min="1" max="100" value="${color.pct}" aria-label="Mix ratio" style="--pct:${color.pct}%">
    <span class="slot-pct">${color.pct}%</span>
    <button class="slot-remove" aria-label="Remove color">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const colorInput = el.querySelector('.slot-color-input');
  const rangeInput = el.querySelector('.slot-range');
  const pctLabel = el.querySelector('.slot-pct');
  const swatch = el.querySelector('.slot-swatch');
  const removeBtn = el.querySelector('.slot-remove');

  colorInput.addEventListener('input', () => {
    color.hex = colorInput.value;
    swatch.style.background = color.hex;
    renderPreview();
    renderEffectPreview();
  });

  rangeInput.addEventListener('input', () => {
    color.pct = parseInt(rangeInput.value);
    pctLabel.textContent = `${color.pct}%`;
    rangeInput.style.setProperty('--pct', `${color.pct}%`);
    renderPreview();
    renderEffectPreview();
  });

  removeBtn.addEventListener('click', () => {
    if (state.colors.length <= 1) { showToast('Need at least one color!'); return; }
    state.colors = state.colors.filter(c => c.id !== color.id);
    el.style.opacity = '0';
    el.style.transform = 'translateX(-20px)';
    el.style.transition = '0.2s ease';
    setTimeout(() => buildColorSlots(), 200);
  });

  return el;
}

document.getElementById('btn-add-color')?.addEventListener('click', () => {
  if (state.colors.length >= 8) { showToast('Maximum 8 colors!'); return; }
  state.colors.push({ id: uid(), hex: randomHex(), pct: 50 });
  buildColorSlots();
});

document.getElementById('btn-clear')?.addEventListener('click', () => {
  state.colors = [{ id: uid(), hex: '#ffffff', pct: 100 }];
  buildColorSlots();
});

document.getElementById('btn-random')?.addEventListener('click', () => {
  const count = Math.floor(Math.random() * 4) + 2;
  state.colors = Array.from({ length: count }, () => ({
    id: uid(),
    hex: randomHex(),
    pct: Math.floor(Math.random() * 80) + 10,
  }));
  buildColorSlots();
  triggerRipple();
});

function randomHex() {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

function normalizePercentages() {
  // Display only — mixing math uses raw weights
}

// ---- PREVIEW RENDER ----

function renderPreview() {
  const canvas = document.getElementById('preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const rgb = getMixedColor();

  if (state.activeEffect && state.activeEffect.id !== 'none') {
    const t = performance.now() / 1000;
    state.activeEffect.render(ctx, w, h, rgb, state.effectParams, t);
  } else {
    // Flat color with subtle gradient
    const grad = ctx.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.5, h * 0.5, w * 0.7);
    const hex = rgbToHex(...rgb);
    const [r, g, b] = rgb;
    const lighter = rgbToHex(Math.min(255, r + 30), Math.min(255, g + 30), Math.min(255, b + 30));
    const darker = rgbToHex(Math.max(0, r - 20), Math.max(0, g - 20), Math.max(0, b - 20));
    grad.addColorStop(0, lighter);
    grad.addColorStop(0.6, hex);
    grad.addColorStop(1, darker);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  updateColorMeta(rgb);
}

function updateColorMeta(rgb) {
  const [r, g, b] = rgb;
  const hex = rgbToHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  document.getElementById('hex-value').textContent = hex.toUpperCase();
  document.getElementById('rgb-value').textContent = `${r}, ${g}, ${b}`;
  document.getElementById('hsl-value').textContent = `${h}°, ${s}%, ${l}%`;

  // Animate the canvas border color
  const canvas = document.getElementById('preview-canvas');
  if (canvas) canvas.style.boxShadow = `0 0 0 3px ${hex}40, 0 8px 32px ${hex}30`;
}

// Ripple on click
document.getElementById('preview-canvas')?.addEventListener('click', (e) => {
  triggerRipple(e);
});

function triggerRipple(e) {
  const overlay = document.getElementById('preview-ripple');
  if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  const x = e ? e.clientX - rect.left : rect.width / 2;
  const y = e ? e.clientY - rect.top : rect.height / 2;
  const rgb = getMixedColor();
  const hex = rgbToHex(...rgb);
  const circle = document.createElement('div');
  circle.className = 'ripple-circle';
  circle.style.cssText = `
    left: ${x}px;
    top: ${y}px;
    width: 80px;
    height: 80px;
    margin-left: -40px;
    margin-top: -40px;
    background: ${hex};
    opacity: 0.5;
  `;
  overlay.appendChild(circle);
  setTimeout(() => circle.remove(), 700);
}

// Copy hex
document.getElementById('btn-copy-hex')?.addEventListener('click', () => {
  const hex = document.getElementById('hex-value').textContent;
  navigator.clipboard.writeText(hex).then(() => showToast(`Copied ${hex}`));
});

// ---- ANIMATED RENDER LOOP (for animated effects) ----

let animatedEffects = new Set(['kristall', 'metallic', 'pearl', 'glitter', 'mica', 'galaxy', 'marble', 'watercolor']);

function startAnimatedLoop() {
  cancelAnimationFrame(state.animFrame);
  function loop() {
    if (state.activeEffect && animatedEffects.has(state.activeEffect.id)) {
      renderPreview();
      renderEffectPreview();
    }
    state.animFrame = requestAnimationFrame(loop);
  }
  state.animFrame = requestAnimationFrame(loop);
}

// ---- EFFECT PREVIEW ----

function renderEffectPreview() {
  const canvas = document.getElementById('effect-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const rgb = getMixedColor();
  const t = performance.now() / 1000;

  if (state.activeEffect) {
    state.activeEffect.render(ctx, w, h, rgb, state.effectParams, t);
    document.getElementById('effect-name-badge').textContent = state.activeEffect.name;
  } else {
    ctx.fillStyle = rgbToHex(...rgb);
    ctx.fillRect(0, 0, w, h);
    document.getElementById('effect-name-badge').textContent = 'No Effect';
  }
}

// ---- EFFECTS GRID ----

function buildEffectsGrid() {
  const grid = document.getElementById('effects-grid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  EFFECTS.forEach((effect, idx) => {
    const card = document.createElement('button');
    card.className = 'effect-card';
    card.style.animationDelay = `${idx * 30}ms`;
    card.dataset.effectId = effect.id;
    if (state.activeEffect?.id === effect.id) card.classList.add('selected');

    const canvas = document.createElement('canvas');
    canvas.className = 'effect-card-canvas';
    canvas.width = 160;
    canvas.height = 160;
    card.appendChild(canvas);

    const body = document.createElement('div');
    body.className = 'effect-card-body';
    body.innerHTML = `
      <div class="effect-card-name">${effect.name}</div>
      <div class="effect-card-desc">${effect.desc}</div>
      <span class="effect-card-badge">${effect.category}</span>
    `;
    card.appendChild(body);
    grid.appendChild(card);

    // Render thumbnail
    const rgb = getMixedColor();
    const ctx = canvas.getContext('2d');
    const defaultParams = {};
    effect.params.forEach(p => { defaultParams[p.id] = p.default; });
    effect.render(ctx, 160, 160, rgb, defaultParams, 0);

    card.addEventListener('click', () => {
      selectEffect(effect, card);
    });
  });
}

function selectEffect(effect, card) {
  // Deselect all
  document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('selected'));
  card?.classList.add('selected');

  state.activeEffect = effect;
  // Reset params to defaults
  state.effectParams = {};
  effect.params.forEach(p => { state.effectParams[p.id] = p.default; });

  buildEffectParams(effect);
  renderEffectPreview();
  renderPreview();

  showToast(`Effect: ${effect.name}`);

  // Switch to mixer tab
  document.querySelector('.nav-pill[data-section="mixer"]')?.click();
}

function buildEffectParams(effect) {
  const container = document.getElementById('effect-params');
  container.innerHTML = '';

  if (!effect || effect.id === 'none' || !effect.params.length) {
    container.innerHTML = '<p class="no-effect-hint">No parameters for this effect.</p>';
    return;
  }

  effect.params.forEach(param => {
    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
      <label class="param-label" for="param-${param.id}">${param.label}</label>
      <input type="range" class="param-range" id="param-${param.id}"
        min="${param.min}" max="${param.max}" value="${state.effectParams[param.id] ?? param.default}">
    `;
    container.appendChild(row);

    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      state.effectParams[param.id] = parseInt(input.value);
      renderEffectPreview();
      renderPreview();
    });
  });
}

// ---- SAVED PALETTE ----

document.getElementById('btn-save')?.addEventListener('click', () => {
  const rgb = getMixedColor();
  const hex = rgbToHex(...rgb);
  const effectName = state.activeEffect?.name || 'No Effect';

  const item = {
    id: uid(),
    hex,
    rgb,
    effect: effectName,
    colors: state.colors.map(c => ({ ...c })),
  };

  state.savedPalette.push(item);
  renderSavedPalette();
  showToast(`Saved ${hex.toUpperCase()}`);

  // Flash animation on button
  const btn = document.getElementById('btn-save');
  btn.style.background = 'var(--color-success)';
  setTimeout(() => { btn.style.background = ''; }, 1000);
});

function renderSavedPalette() {
  const empty = document.getElementById('palette-empty');
  const grid = document.getElementById('palette-grid');
  if (!empty || !grid) return;

  empty.style.display = state.savedPalette.length ? 'none' : 'flex';
  grid.innerHTML = '';

  state.savedPalette.forEach(item => {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.innerHTML = `
      <canvas class="palette-swatch" width="120" height="120" aria-label="Color ${item.hex}"></canvas>
      <div class="palette-item-body">
        <span class="palette-item-hex">${item.hex.toUpperCase()}</span>
        <button class="palette-item-delete" data-id="${item.id}" aria-label="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    `;

    // Render swatch canvas
    const swatchCanvas = el.querySelector('.palette-swatch');
    const swCtx = swatchCanvas.getContext('2d');
    const effect = EFFECTS.find(e => e.name === item.effect);
    if (effect) {
      const params = {};
      effect.params.forEach(p => { params[p.id] = p.default; });
      effect.render(swCtx, 120, 120, item.rgb, params, 0);
    } else {
      swCtx.fillStyle = item.hex;
      swCtx.fillRect(0, 0, 120, 120);
    }

    // Click to reload
    swatchCanvas.addEventListener('click', () => {
      state.colors = item.colors.map(c => ({ ...c, id: uid() }));
      buildColorSlots();
      showToast(`Loaded ${item.hex.toUpperCase()}`);
      document.querySelector('.nav-pill[data-section="mixer"]')?.click();
    });

    // Delete
    el.querySelector('.palette-item-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.savedPalette = state.savedPalette.filter(p => p.id !== item.id);
      renderSavedPalette();
    });

    grid.appendChild(el);
  });
}

// ---- TOAST ----

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---- INIT ----

buildColorSlots();
buildEffectsGrid();
renderEffectPreview();
startAnimatedLoop();

// Pre-select "No Effect"
const noneEffect = EFFECTS.find(e => e.id === 'none');
state.activeEffect = noneEffect;
buildEffectParams(noneEffect);

// Hint to open effects
setTimeout(() => {
  if (!state.activeEffect || state.activeEffect.id === 'none') {
    // Keep hint text
  }
}, 100);
