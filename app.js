/* ====================================================
   PAINT MIXER v2 — app.js
   - HiDPI canvas (devicePixelRatio scaling everywhere)
   - 26 effects with rich params + lighting controls
   - Three.js 3D vehicle preview (car, motorbike, helmet, sphere)
   - Category filter, zoom, download, complementary mix
   ==================================================== */
'use strict';

// ---- HIDPI CANVAS HELPER ----
function setupHiDPICanvas(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

function resizeHiDPICanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  return ctx;
}

// ---- DARK MODE ----
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateIcon(toggle, theme);
  toggle && toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateIcon(toggle, theme);
    setTimeout(() => { renderPreview(); renderEffectPreview(); }, 60);
  });
  function updateIcon(btn, t) {
    if (!btn) return;
    btn.innerHTML = t === 'dark'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
})();

// ---- STATE ----
const state = {
  colors: [{ id: uid(), hex: '#e85050', pct: 50 }, { id: uid(), hex: '#4c8ce0', pct: 50 }],
  activeEffect: null,
  effectParams: {},
  lighting: { angle: 45, intensity: 75, ambient: 40 },
  savedPalette: [],
  zoom: 1,
  animFrame: null,
};
function uid() { return Math.random().toString(36).slice(2, 9); }

// ---- COLOR MATH ----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
}
function rgbToHsl(r, g, b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h, s, l=(max+min)/2;
  if (max===min) { h=s=0; } else {
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function mixColors(list) {
  if (!list.length) return [255,255,255];
  let total=list.reduce((s,c)=>s+c.pct,0)||1;
  let r=0,g=0,b=0;
  for (const c of list) {
    const [cr,cg,cb]=hexToRgb(c.hex), w=c.pct/total;
    r+=Math.pow(cr/255,2.2)*w; g+=Math.pow(cg/255,2.2)*w; b+=Math.pow(cb/255,2.2)*w;
  }
  return [Math.round(Math.pow(r,1/2.2)*255), Math.round(Math.pow(g,1/2.2)*255), Math.round(Math.pow(b,1/2.2)*255)];
}
function getMix() { return mixColors(state.colors); }
function complementHex(hex) {
  const [r,g,b]=hexToRgb(hex);
  return rgbToHex(255-r,255-g,255-b);
}

// ---- SEEDED RANDOM ----
function seededRand(seed) {
  let s=seed^0x9e3779b9;
  return function(){
    s=Math.imul(s^(s>>>16),0x45d9f3b);
    s=Math.imul(s^(s>>>16),0x45d9f3b);
    s=s^(s>>>16);
    return(s>>>0)/0xffffffff;
  };
}

// ==============================================================
// EFFECTS — 26 total
// Each render(ctx, W, H, rgb, params, t, lighting) where
//   W/H are the CSS dimensions (ctx is already DPI-scaled)
// ==============================================================

const EFFECTS = [
  // ---- BASE ----
  {
    id:'none', name:'No Effect', category:'Base', desc:'Flat matte coat.',
    params:[],
    render(ctx,W,H,rgb){ctx.fillStyle=rgbToHex(...rgb);ctx.fillRect(0,0,W,H);},
  },

  // ---- MINERAL ----
  {
    id:'kristall', name:'Kristall Effekt', category:'Mineral',
    desc:'Faceted crystal growths sparkle like ice or gemstones.',
    params:[
      {id:'density',label:'Crystal Density',min:1,max:100,default:50},
      {id:'shimmer',label:'Shimmer Intensity',min:0,max:100,default:70},
      {id:'size',label:'Crystal Size',min:5,max:60,default:20},
      {id:'color_tint',label:'Tint Color',type:'color',default:'#ffffff'},
    ],
    render: renderKristall,
  },
  {
    id:'pearl', name:'Pearl / Nacre', category:'Mineral',
    desc:'Iridescent pearlescent shimmer shifts colour at different angles.',
    params:[
      {id:'iridescence',label:'Iridescence',min:10,max:100,default:60},
      {id:'layers',label:'Pearl Layers',min:1,max:12,default:4},
      {id:'sheen_speed',label:'Sheen Speed',min:1,max:100,default:40},
    ],
    render: renderPearl,
  },
  {
    id:'mica', name:'Mica / Mineral Flake', category:'Mineral',
    desc:'Flat mica flakes scatter light with directional reflections.',
    params:[
      {id:'flake_density',label:'Flake Density',min:5,max:200,default:60},
      {id:'flake_size',label:'Flake Size',min:2,max:25,default:8},
      {id:'color_tint',label:'Flake Tint',type:'color',default:'#c8d8ff'},
    ],
    render: renderMica,
  },
  {
    id:'opal', name:'Opal / Fire Opal', category:'Mineral',
    desc:'Internal fire and spectral play-of-colour like precious opal.',
    params:[
      {id:'fire_intensity',label:'Fire Intensity',min:10,max:100,default:70},
      {id:'patch_scale',label:'Patch Scale',min:5,max:60,default:20},
      {id:'translucency',label:'Translucency',min:0,max:100,default:50},
    ],
    render: renderOpal,
  },

  // ---- METAL ----
  {
    id:'metallic', name:'Metallic', category:'Metal',
    desc:'High-gloss metallic with directional brushed sheen.',
    params:[
      {id:'gloss',label:'Gloss Level',min:10,max:100,default:75},
      {id:'grain',label:'Brush Direction',min:0,max:180,default:45},
      {id:'reflectivity',label:'Reflectivity',min:0,max:100,default:60},
    ],
    render: renderMetallic,
  },
  {
    id:'hammered', name:'Hammered Metal', category:'Metal',
    desc:'Dimpled hammered surface with directional reflections.',
    params:[
      {id:'dimple_size',label:'Dimple Size',min:4,max:50,default:16},
      {id:'relief',label:'Relief Depth',min:10,max:100,default:60},
      {id:'gloss',label:'Gloss',min:0,max:100,default:70},
    ],
    render: renderHammered,
  },
  {
    id:'chrome', name:'Chrome / Mirror', category:'Metal',
    desc:'Perfect mirror-like chrome finish with environment reflections.',
    params:[
      {id:'sharpness',label:'Reflection Sharpness',min:10,max:100,default:85},
      {id:'tint',label:'Colour Tint Strength',min:0,max:100,default:30},
      {id:'scratch',label:'Scratch Depth',min:0,max:100,default:10},
    ],
    render: renderChrome,
  },
  {
    id:'brushed_gold', name:'Brushed Gold', category:'Metal',
    desc:'Warm radial-brushed gold with anisotropic highlights.',
    params:[
      {id:'gold_tone',label:'Gold Warmth',min:0,max:100,default:60},
      {id:'brush_density',label:'Brush Density',min:10,max:100,default:50},
      {id:'shine',label:'Highlight Shine',min:0,max:100,default:75},
    ],
    render: renderBrushedGold,
  },

  // ---- STONE ----
  {
    id:'marble', name:'Marble', category:'Stone',
    desc:'Elegant veined marble with deep translucent swirls.',
    params:[
      {id:'veins',label:'Vein Count',min:2,max:24,default:6},
      {id:'contrast',label:'Vein Contrast',min:10,max:100,default:60},
      {id:'vein_color',label:'Vein Colour',type:'color',default:'#ffffff'},
      {id:'scale',label:'Pattern Scale',min:20,max:200,default:100},
    ],
    render: renderMarble,
  },
  {
    id:'stone', name:'Granite / Stone', category:'Stone',
    desc:'Granite-like granular surface with mineral speckles.',
    params:[
      {id:'grain_size',label:'Grain Size',min:1,max:20,default:5},
      {id:'contrast',label:'Speckle Contrast',min:10,max:100,default:50},
      {id:'color2',label:'Second Mineral',type:'color',default:'#888888'},
    ],
    render: renderStone,
  },
  {
    id:'sand', name:'Sand / Stucco', category:'Stone',
    desc:'Fine sandy grit — coastal or textured plaster feel.',
    params:[
      {id:'coarseness',label:'Coarseness',min:1,max:20,default:4},
      {id:'depth',label:'Depth',min:10,max:100,default:45},
      {id:'direction',label:'Grain Direction',min:0,max:180,default:0},
    ],
    render: renderSand,
  },
  {
    id:'concrete', name:'Concrete / Cement', category:'Stone',
    desc:'Raw exposed concrete with subtle form-liner texture.',
    params:[
      {id:'roughness',label:'Surface Roughness',min:5,max:100,default:45},
      {id:'stain',label:'Stain/Patina',min:0,max:100,default:25},
      {id:'aggregate',label:'Aggregate Show',min:0,max:100,default:30},
    ],
    render: renderConcrete,
  },

  // ---- AGED ----
  {
    id:'crackle', name:'Crackle / Craquelure', category:'Aged',
    desc:'Ceramic craquelure — aged and weathered surface cracks.',
    params:[
      {id:'crack_size',label:'Crack Width',min:1,max:40,default:12},
      {id:'depth',label:'Crack Depth',min:10,max:100,default:55},
      {id:'crack_color',label:'Crack Colour',type:'color',default:'#1a0a00'},
    ],
    render: renderCrackle,
  },
  {
    id:'rust', name:'Rust & Patina', category:'Aged',
    desc:'Organic oxidation — industrial aged character.',
    params:[
      {id:'coverage',label:'Rust Coverage',min:5,max:100,default:50},
      {id:'texture',label:'Texture Roughness',min:10,max:100,default:60},
      {id:'patina_color',label:'Patina Colour',type:'color',default:'#c84010'},
    ],
    render: renderRust,
  },
  {
    id:'oxidized', name:'Oxidised Copper', category:'Aged',
    desc:'Green-blue verdigris patina — aged copper or bronze.',
    params:[
      {id:'patina',label:'Patina Coverage',min:5,max:100,default:55},
      {id:'roughness',label:'Surface Roughness',min:10,max:100,default:60},
      {id:'depth',label:'Layer Depth',min:0,max:100,default:50},
    ],
    render: renderOxidized,
  },

  // ---- FABRIC ----
  {
    id:'velvet', name:'Velvet / Suede', category:'Fabric',
    desc:'Soft velvety finish with micro-fibre depth and shading.',
    params:[
      {id:'softness',label:'Pile Softness',min:10,max:100,default:65},
      {id:'direction',label:'Nap Direction',min:0,max:180,default:90},
      {id:'sheen',label:'Schiller Sheen',min:0,max:100,default:40},
    ],
    render: renderVelvet,
  },
  {
    id:'fabric_weave', name:'Fabric Weave', category:'Fabric',
    desc:'Visible woven textile structure — linen, canvas, or silk.',
    params:[
      {id:'weave_size',label:'Weave Scale',min:2,max:20,default:6},
      {id:'contrast',label:'Thread Contrast',min:10,max:100,default:50},
      {id:'weave_type',label:'Weave Pattern',type:'select',options:['Plain','Twill','Satin'],default:'Plain'},
    ],
    render: renderFabricWeave,
  },

  // ---- ORGANIC ----
  {
    id:'wood', name:'Wood Grain', category:'Organic',
    desc:'Flowing wood grain rings and fibre texture.',
    params:[
      {id:'grain_freq',label:'Ring Frequency',min:2,max:30,default:10},
      {id:'wave',label:'Grain Wave',min:0,max:100,default:40},
      {id:'knots',label:'Knot Count',min:0,max:5,default:1},
    ],
    render: renderWood,
  },
  {
    id:'leather', name:'Leather / Pebble', category:'Organic',
    desc:'Pebbled leather grain — luxury automotive or upholstery finish.',
    params:[
      {id:'pebble_size',label:'Pebble Size',min:3,max:25,default:8},
      {id:'depth',label:'Emboss Depth',min:10,max:100,default:55},
      {id:'gloss',label:'Finish Gloss',min:0,max:100,default:40},
    ],
    render: renderLeather,
  },

  // ---- DECORATIVE ----
  {
    id:'glitter', name:'Glitter', category:'Decorative',
    desc:'Sparkling glitter particles embedded in the paint base.',
    params:[
      {id:'density',label:'Particle Density',min:10,max:250,default:90},
      {id:'size',label:'Particle Size',min:1,max:10,default:3},
      {id:'color_tint',label:'Glitter Tint',type:'color',default:'#ffffff'},
      {id:'rainbow',label:'Rainbow Mode',min:0,max:100,default:50},
    ],
    render: renderGlitter,
  },
  {
    id:'galaxy', name:'Galaxy / Nebula', category:'Decorative',
    desc:'Deep cosmic nebula swirl — pigments dissolve into interstellar clouds.',
    params:[
      {id:'stars',label:'Star Count',min:10,max:400,default:150},
      {id:'nebula',label:'Nebula Density',min:10,max:100,default:55},
      {id:'rotation',label:'Spiral Rotation',min:0,max:100,default:40},
    ],
    render: renderGalaxy,
  },
  {
    id:'neon_glow', name:'Neon Glow', category:'Decorative',
    desc:'Electric neon paint with intense edge glow and bloom.',
    params:[
      {id:'glow_size',label:'Glow Radius',min:2,max:60,default:20},
      {id:'intensity',label:'Glow Intensity',min:10,max:100,default:75},
      {id:'pulse',label:'Pulse Speed',min:0,max:100,default:50},
    ],
    render: renderNeonGlow,
  },
  {
    id:'holographic', name:'Holographic', category:'Decorative',
    desc:'Holographic foil with full spectrum colour shifts and prismatic patterns.',
    params:[
      {id:'intensity',label:'Hologram Intensity',min:10,max:100,default:70},
      {id:'scale',label:'Pattern Scale',min:5,max:80,default:25},
      {id:'speed',label:'Shift Speed',min:0,max:100,default:40},
    ],
    render: renderHolographic,
  },
  {
    id:'chameleon', name:'Chameleon / Flip', category:'Decorative',
    desc:'Angle-dependent colour flip coating — dual-tone or multi-tone shift.',
    params:[
      {id:'color2',label:'Flip Colour',type:'color',default:'#00d4aa'},
      {id:'sharpness',label:'Flip Sharpness',min:1,max:100,default:50},
      {id:'angle_bias',label:'View Angle',min:0,max:180,default:60},
    ],
    render: renderChameleon,
  },

  // ---- ARTISTIC ----
  {
    id:'watercolor', name:'Watercolor Wash', category:'Artistic',
    desc:'Translucent soft wash edges and blooms on paper.',
    params:[
      {id:'wetness',label:'Wetness / Bloom',min:10,max:100,default:60},
      {id:'layers',label:'Wash Layers',min:1,max:8,default:3},
      {id:'granulation',label:'Granulation',min:0,max:100,default:40},
    ],
    render: renderWatercolor,
  },
  {
    id:'impasto', name:'Impasto / Palette Knife', category:'Artistic',
    desc:'Thick textured oil paint applied with a palette knife.',
    params:[
      {id:'thickness',label:'Paint Thickness',min:5,max:100,default:60},
      {id:'stroke_size',label:'Stroke Scale',min:10,max:100,default:45},
      {id:'direction',label:'Stroke Angle',min:0,max:180,default:30},
    ],
    render: renderImpasto,
  },
];

// ==============================================================
// EFFECT RENDERERS
// ctx is a 2D context already scaled to device pixel ratio.
// W, H are the CSS (logical) pixel dimensions.
// ==============================================================

function renderKristall(ctx, W, H, rgb, params, t=0) {
  const density=(params.density||50)/100, shimmer=(params.shimmer||70)/100;
  const crystalSize=params.size||20;
  const tintRgb=hexToRgb(params.color_tint||'#ffffff');
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(42);
  const num=Math.floor(density*70)+6;
  for (let i=0;i<num;i++) {
    const cx=rand()*W, cy=rand()*H;
    const sz=rand()*crystalSize+crystalSize*0.3;
    const sides=Math.floor(rand()*3)+4;
    const rot=rand()*Math.PI*2+t*0.25;
    const alpha=(rand()*0.5+0.3)*shimmer;
    const bright=rand()*80+130;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot);
    ctx.beginPath();
    for (let j=0;j<sides;j++) {
      const a=(j/sides)*Math.PI*2;
      j===0?ctx.moveTo(Math.cos(a)*sz,Math.sin(a)*sz):ctx.lineTo(Math.cos(a)*sz,Math.sin(a)*sz);
    }
    ctx.closePath();
    const gr=ctx.createRadialGradient(0,0,0,0,0,sz);
    const tr=Math.min(255,(bright+tintRgb[0])/2), tg=Math.min(255,(bright+tintRgb[1])/2), tb_=Math.min(255,(bright+tintRgb[2]+20)/2);
    gr.addColorStop(0,`rgba(${tr},${tg},${tb_},${alpha})`);
    gr.addColorStop(0.6,`rgba(${r},${g},${b},${alpha*0.25})`);
    gr.addColorStop(1,`rgba(${r*0.5},${g*0.5},${b*0.5},${alpha*0.4})`);
    ctx.fillStyle=gr; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(rot)*sz*0.7,Math.sin(rot)*sz*0.7);
    ctx.strokeStyle=`rgba(255,255,255,${shimmer*0.85})`; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }
  const scount=Math.floor(shimmer*25);
  for (let i=0;i<scount;i++) {
    const sx=seededRand(i*7+1)()*W, sy=seededRand(i*7+2)()*H;
    const phase=(t*2.5+i)%(Math.PI*2);
    const bright=(Math.sin(phase)+1)/2;
    ctx.beginPath(); ctx.arc(sx,sy,bright*2.8+0.3,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,255,255,${bright*shimmer})`; ctx.fill();
  }
}

function renderPearl(ctx, W, H, rgb, params, t=0) {
  const iri=(params.iridescence||60)/100, layers=params.layers||4;
  const speed=(params.sheen_speed||40)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  for (let layer=0;layer<layers;layer++) {
    const shift=t*speed*0.6+layer*(Math.PI*2/layers);
    const hueShift=(shift*60)%360, s=Math.sin(shift)*0.5+0.5;
    const iriR=Math.min(255,r+Math.sin(hueShift*Math.PI/180)*100*iri);
    const iriG=Math.min(255,g+Math.sin((hueShift+120)*Math.PI/180)*100*iri);
    const iriB=Math.min(255,b+Math.sin((hueShift+240)*Math.PI/180)*100*iri);
    const grad=ctx.createRadialGradient(W*(0.3+0.4*Math.cos(shift)),H*(0.3+0.4*Math.sin(shift)),0,W*0.5,H*0.5,W*0.75);
    grad.addColorStop(0,`rgba(${iriR},${iriG},${iriB},${s*0.35*iri})`);
    grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  }
  const sh=ctx.createLinearGradient(0,0,W,H);
  sh.addColorStop(0,`rgba(255,255,255,${0.28*iri})`); sh.addColorStop(0.5,'rgba(255,255,255,0)'); sh.addColorStop(1,`rgba(200,200,255,${0.12*iri})`);
  ctx.fillStyle=sh; ctx.fillRect(0,0,W,H);
}

function renderMica(ctx, W, H, rgb, params, t=0) {
  const density=params.flake_density||60, fs=params.flake_size||8;
  const tintRgb=hexToRgb(params.color_tint||'#c8d8ff');
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(61);
  for (let i=0;i<density*2;i++) {
    const fx=rand()*W, fy=rand()*H, fsz=rand()*fs+2;
    const rot=rand()*Math.PI, phase=(t*1.5+i*0.7)%(Math.PI*2);
    const bright=(Math.sin(phase)+1)/2, alpha=bright*0.72+0.1;
    ctx.save(); ctx.translate(fx,fy); ctx.rotate(rot+t*0.08); ctx.scale(1,0.28);
    ctx.beginPath(); ctx.ellipse(0,0,fsz,fsz*0.6,0,0,Math.PI*2);
    const fg=ctx.createRadialGradient(0,0,0,0,0,fsz);
    fg.addColorStop(0,`rgba(${tintRgb[0]},${tintRgb[1]},${tintRgb[2]},${alpha})`);
    fg.addColorStop(0.5,`rgba(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)},${alpha*0.5})`);
    fg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=fg; ctx.fill(); ctx.restore();
  }
}

function renderOpal(ctx, W, H, rgb, params, t=0) {
  const fi=(params.fire_intensity||70)/100, ps=params.patch_scale||20;
  const trans=(params.translucency||50)/100;
  const [r,g,b]=rgb;
  const baseR=Math.max(0,r*0.6+40*trans), baseG=Math.max(0,g*0.6+40*trans), baseB=Math.max(0,b*0.6+60*trans);
  ctx.fillStyle=rgbToHex(baseR,baseG,baseB); ctx.fillRect(0,0,W,H);
  const rand=seededRand(77);
  const patches=Math.floor(W*H/(ps*ps*4))+10;
  const hues=[0,30,60,120,180,240,300];
  for (let i=0;i<patches;i++) {
    const px=rand()*W, py=rand()*H, pr=rand()*ps+ps*0.3;
    const hue=hues[Math.floor(rand()*hues.length)], phase=t*0.4+rand()*Math.PI*2;
    const alpha=(Math.sin(phase)+1)/2*fi*0.65;
    const hr=Math.sin(hue*Math.PI/180)*127+128;
    const hg=Math.sin((hue+120)*Math.PI/180)*127+128;
    const hbl=Math.sin((hue+240)*Math.PI/180)*127+128;
    const gr=ctx.createRadialGradient(px,py,0,px,py,pr);
    gr.addColorStop(0,`rgba(${hr},${hg},${hbl},${alpha})`); gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr; ctx.fillRect(px-pr,py-pr,pr*2,pr*2);
  }
  ctx.globalAlpha=0.15*trans; ctx.fillStyle='white'; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1;
}

function renderMetallic(ctx, W, H, rgb, params, t=0) {
  const gloss=(params.gloss||75)/100, grainAngle=((params.grain||45)*Math.PI)/180;
  const refl=(params.reflectivity||60)/100;
  const [r,g,b]=rgb;
  const cos=Math.cos(grainAngle), sin=Math.sin(grainAngle);
  const gx=ctx.createLinearGradient(W/2-cos*W,H/2-sin*H,W/2+cos*W,H/2+sin*H);
  gx.addColorStop(0,rgbToHex(Math.min(255,r+60),Math.min(255,g+60),Math.min(255,b+60)));
  gx.addColorStop(0.35,rgbToHex(r,g,b));
  gx.addColorStop(0.5,rgbToHex(Math.min(255,r+90),Math.min(255,g+90),Math.min(255,b+90)));
  gx.addColorStop(0.65,rgbToHex(r,g,b));
  gx.addColorStop(1,rgbToHex(Math.max(0,r-40),Math.max(0,g-40),Math.max(0,b-40)));
  ctx.fillStyle=gx; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.globalAlpha=0.055;
  for (let i=0;i<90;i++) {
    const rand=seededRand(i);
    const offset=rand()*(Math.abs(cos)*W+Math.abs(sin)*H)*2-(Math.abs(cos)*W+Math.abs(sin)*H);
    const x0=W/2+(-sin)*offset-cos*W,y0=H/2+cos*offset-sin*H;
    const x1=W/2+(-sin)*offset+cos*W,y1=H/2+cos*offset+sin*H;
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1);
    ctx.strokeStyle=rand()>0.5?'white':'black'; ctx.lineWidth=0.5; ctx.stroke();
  }
  ctx.restore();
  const rp=(Math.sin(t*0.5)*0.5+0.5)*0.6+0.2;
  const rg=ctx.createLinearGradient(W*(rp-0.18),0,W*(rp+0.18),0);
  rg.addColorStop(0,'rgba(255,255,255,0)');
  rg.addColorStop(0.5,`rgba(255,255,255,${gloss*refl*0.4})`);
  rg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
}

function renderHammered(ctx, W, H, rgb, params) {
  const ds=params.dimple_size||16, relief=(params.relief||60)/100, gloss=(params.gloss||70)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const cols=Math.ceil(W/ds)+1, rows=Math.ceil(H/ds)+1;
  const rand=seededRand(29);
  for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
    const jx=(rand()-0.5)*ds*0.5, jy=(rand()-0.5)*ds*0.5;
    const cx=col*ds+ds/2+jx+(row%2===0?0:ds/2), cy=row*ds*0.866+ds/2+jy;
    const radius=ds*0.45*(0.7+rand()*0.3);
    const sg=ctx.createRadialGradient(cx,cy,0,cx-radius*0.3,cy-radius*0.3,radius);
    sg.addColorStop(0,`rgba(0,0,0,${0.35*relief})`); sg.addColorStop(0.6,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fillStyle=sg; ctx.fill();
    const hg=ctx.createRadialGradient(cx-radius*0.28,cy-radius*0.28,0,cx,cy,radius);
    hg.addColorStop(0,`rgba(255,255,255,${0.5*relief*gloss})`); hg.addColorStop(0.5,'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill();
  }
}

function renderChrome(ctx, W, H, rgb, params, t=0) {
  const sharp=(params.sharpness||85)/100, tint=(params.tint||30)/100;
  const scratch=(params.scratch||10)/100;
  const [r,g,b]=rgb;
  // Environment reflection bands
  const envGrad=ctx.createLinearGradient(0,0,0,H);
  envGrad.addColorStop(0,'rgb(220,225,235)'); envGrad.addColorStop(0.25,'rgb(180,185,195)');
  envGrad.addColorStop(0.45,'rgb(240,242,248)'); envGrad.addColorStop(0.6,'rgb(80,85,90)');
  envGrad.addColorStop(0.75,'rgb(200,205,215)'); envGrad.addColorStop(1,'rgb(120,125,130)');
  ctx.fillStyle=envGrad; ctx.fillRect(0,0,W,H);
  // Colour tint
  ctx.fillStyle=`rgba(${r},${g},${b},${tint})`; ctx.fillRect(0,0,W,H);
  // Specular highlight
  const specPhase=t*0.3;
  const specX=W*(0.2+Math.sin(specPhase)*0.1), specW=W*(0.15+sharp*0.2);
  const sg=ctx.createLinearGradient(specX,0,specX+specW,0);
  sg.addColorStop(0,'rgba(255,255,255,0)'); sg.addColorStop(0.3,`rgba(255,255,255,${0.7*sharp})`); sg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
  // Scratches
  if (scratch>0) {
    const rand=seededRand(55);
    for (let i=0;i<Math.floor(scratch*30);i++) {
      const sx=rand()*W, sy=rand()*H, sl=rand()*W*0.3+10;
      const sa=rand()*0.3+Math.PI*0.45;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+Math.cos(sa)*sl,sy+Math.sin(sa)*sl);
      ctx.strokeStyle=`rgba(255,255,255,${rand()*0.4+0.1})`; ctx.lineWidth=rand()*1.2+0.3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+0.8,sy+0.8); ctx.lineTo(sx+Math.cos(sa)*sl+0.8,sy+Math.sin(sa)*sl+0.8);
      ctx.strokeStyle=`rgba(0,0,0,${rand()*0.2+0.05})`; ctx.lineWidth=0.5; ctx.stroke();
    }
  }
}

function renderBrushedGold(ctx, W, H, rgb, params, t=0) {
  const warmth=(params.gold_tone||60)/100, brushD=(params.brush_density||50)/100;
  const shine=(params.shine||75)/100;
  const [r,g,b]=rgb;
  const goldR=Math.min(255,r*0.4+180+warmth*30), goldG=Math.min(255,g*0.3+130+warmth*20), goldB=Math.max(0,b*0.1+20);
  ctx.fillStyle=rgbToHex(goldR,goldG,goldB); ctx.fillRect(0,0,W,H);
  // Radial brush strokes
  const rand=seededRand(33);
  ctx.save(); ctx.globalAlpha=0.06;
  for (let i=0;i<Math.floor(brushD*120);i++) {
    const cx=W*0.5+rand()*W*0.2-W*0.1, cy=H*0.5+rand()*H*0.2-H*0.1;
    const angle=rand()*Math.PI*2, len=rand()*Math.max(W,H)*0.7+20;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(angle)*len,cy+Math.sin(angle)*len);
    ctx.strokeStyle=rand()>0.5?'rgba(255,220,50,1)':'rgba(100,60,0,1)'; ctx.lineWidth=0.7; ctx.stroke();
  }
  ctx.restore();
  // Highlight
  const hs=t*0.35;
  const hg=ctx.createLinearGradient(W*(0.15+Math.sin(hs)*0.1),0,W*(0.35+Math.sin(hs)*0.1),H);
  hg.addColorStop(0,'rgba(255,255,200,0)'); hg.addColorStop(0.4,`rgba(255,255,200,${shine*0.55})`); hg.addColorStop(1,'rgba(255,255,200,0)');
  ctx.fillStyle=hg; ctx.fillRect(0,0,W,H);
}

function renderMarble(ctx, W, H, rgb, params, t=0) {
  const veins=params.veins||6, contrast=(params.contrast||60)/100;
  const veinRgb=hexToRgb(params.vein_color||'#ffffff'), scale=(params.scale||100)/100;
  const [r,g,b]=rgb;
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,rgbToHex(r,g,b)); bg.addColorStop(1,rgbToHex(Math.min(255,r+30),Math.min(255,g+30),Math.min(255,b+30)));
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  for (let v=0;v<veins;v++) {
    const rand=seededRand(v*31+7);
    const angle=rand()*Math.PI, freq=(0.01+rand()*0.02)/scale, amp=20+rand()*60;
    const phase=rand()*Math.PI*2, vContrast=(0.3+rand()*0.7)*contrast;
    const dark=rand()>0.5;
    const vc=dark
      ?`rgba(${Math.round(veinRgb[0]*0.3)},${Math.round(veinRgb[1]*0.3)},${Math.round(veinRgb[2]*0.3)},${vContrast})`
      :`rgba(${veinRgb[0]},${veinRgb[1]},${veinRgb[2]},${vContrast})`;
    ctx.beginPath();
    let px=rand()*W, py=rand()*H; ctx.moveTo(px,py);
    const len=Math.sqrt(W*W+H*H);
    for (let s=0;s<len;s+=2) {
      const w2=Math.sin(s*freq+phase+t*0.08)*amp*0.05;
      px+=Math.cos(angle)*2+Math.cos(angle+Math.PI/2)*w2;
      py+=Math.sin(angle)*2+Math.sin(angle+Math.PI/2)*w2;
      ctx.lineTo(px,py);
    }
    ctx.strokeStyle=vc; ctx.lineWidth=0.7+rand()*1.8; ctx.stroke();
  }
  const gl=ctx.createLinearGradient(0,0,W*0.3,H*0.3);
  gl.addColorStop(0,'rgba(255,255,255,0.1)'); gl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gl; ctx.fillRect(0,0,W,H);
}

function renderStone(ctx, W, H, rgb, params) {
  const gs=params.grain_size||5, contrast=(params.contrast||50)/100;
  const c2=hexToRgb(params.color2||'#888888');
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(13), specs=Math.floor(W*H/(gs*gs*2));
  for (let i=0;i<specs;i++) {
    const sx=rand()*W, sy=rand()*H, sr=rand()*gs+0.5;
    const blend=rand(), br=(rand()*2-1)*80*contrast;
    const useC2=rand()>0.7;
    const cr=Math.min(255,Math.max(0,(useC2?c2[0]:r)+br));
    const cg=Math.min(255,Math.max(0,(useC2?c2[1]:g)+br*0.9));
    const cb_=Math.min(255,Math.max(0,(useC2?c2[2]:b)+br*0.8));
    ctx.beginPath(); ctx.ellipse(sx,sy,sr,sr*(0.5+rand()*0.5),rand()*Math.PI,0,Math.PI*2);
    ctx.fillStyle=`rgba(${cr},${cg},${cb_},${0.4+blend*0.5})`; ctx.fill();
  }
}

function renderSand(ctx, W, H, rgb, params) {
  const coarse=params.coarseness||4, depth=(params.depth||45)/100, dir=(params.direction||0)*Math.PI/180;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(19), grains=Math.floor(W*H/(coarse*coarse));
  for (let i=0;i<grains;i++) {
    const gx=rand()*W, gy=rand()*H, gr=rand()*coarse*0.8+0.3;
    const bright=(rand()*2-1)*60*depth;
    const cr=Math.min(255,Math.max(0,r+bright)), cg=Math.min(255,Math.max(0,g+bright)), cb_=Math.min(255,Math.max(0,b+bright*0.7));
    ctx.beginPath();
    ctx.ellipse(gx,gy,gr,gr*(0.4+rand()*0.6),dir+rand()*0.5-0.25,0,Math.PI*2);
    ctx.fillStyle=`rgba(${cr},${cg},${cb_},${0.3+rand()*0.5})`; ctx.fill();
  }
}

function renderConcrete(ctx, W, H, rgb, params) {
  const rough=(params.roughness||45)/100, stain=(params.stain||25)/100, agg=(params.aggregate||30)/100;
  const [r,g,b]=rgb;
  // Desaturate toward grey
  const grey=(r*0.3+g*0.59+b*0.11);
  const cr=Math.round(r*0.3+grey*0.7), cg=Math.round(g*0.3+grey*0.7), cb_=Math.round(b*0.3+grey*0.7);
  ctx.fillStyle=rgbToHex(cr,cg,cb_); ctx.fillRect(0,0,W,H);
  const rand=seededRand(101);
  // Form-liner lines
  for (let i=0;i<Math.floor(W/(15+rand()*10));i++) {
    const lx=rand()*W;
    ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,H);
    ctx.strokeStyle=`rgba(0,0,0,${0.04+rand()*0.04})`; ctx.lineWidth=0.5; ctx.stroke();
  }
  // Aggregate
  const aggCount=Math.floor(agg*200);
  for (let i=0;i<aggCount;i++) {
    const ax=rand()*W, ay=rand()*H, ar=rand()*4+1;
    const bc=(rand()*2-1)*40*rough;
    ctx.beginPath(); ctx.arc(ax,ay,ar,0,Math.PI*2);
    ctx.fillStyle=`rgba(${Math.min(255,cr+bc)},${Math.min(255,cg+bc)},${Math.min(255,cb_+bc)},0.5)`; ctx.fill();
  }
  // Stain
  for (let i=0;i<Math.floor(stain*20);i++) {
    const sx=rand()*W, sy=rand()*H, sr=rand()*30+10;
    ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2);
    ctx.fillStyle=`rgba(${Math.max(0,cr-60)},${Math.max(0,cg-60)},${Math.max(0,cb_-50)},${rand()*0.2*stain})`; ctx.fill();
  }
  // Surface micro-roughness
  for (let i=0;i<3000*rough;i++) {
    const px=rand()*W, py=rand()*H, bc=(rand()-0.5)*30*rough;
    ctx.fillStyle=`rgba(${bc>0?255:0},${bc>0?255:0},${bc>0?255:0},${Math.abs(bc)/30*0.08})`; ctx.fillRect(px,py,1,1);
  }
}

function renderCrackle(ctx, W, H, rgb, params) {
  const cs=params.crack_size||12, depth=(params.depth||55)/100;
  const cRgb=hexToRgb(params.crack_color||'#1a0a00');
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(91), num=Math.floor(W*H/(cs*cs*14))+8;
  const pts=[];
  for (let i=0;i<num;i++) pts.push({x:rand()*W,y:rand()*H});
  for (let px=0;px<W;px+=2) for (let py=0;py<H;py+=2) {
    let d1=Infinity,d2=Infinity;
    for (const p of pts) { const d=(px-p.x)**2+(py-p.y)**2; if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d; }
    const bf=1-Math.min(1,(Math.sqrt(d2)-Math.sqrt(d1))/(cs));
    if (bf>0.8) {
      ctx.fillStyle=`rgba(${cRgb[0]},${cRgb[1]},${cRgb[2]},${bf*depth})`; ctx.fillRect(px,py,2,2);
    }
  }
  for (const p of pts) {
    const gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,cs*2);
    gr.addColorStop(0,'rgba(255,255,255,0.06)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gr; ctx.fillRect(p.x-cs*2,p.y-cs*2,cs*4,cs*4);
  }
}

function renderRust(ctx, W, H, rgb, params) {
  const cov=(params.coverage||50)/100, tex=(params.texture||60)/100;
  const pRgb=hexToRgb(params.patina_color||'#c84010');
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(37), patches=Math.floor(cov*35)+5;
  for (let i=0;i<patches;i++) {
    const px=rand()*W, py=rand()*H, ps=rand()*55+18;
    const alpha=rand()*0.65*cov+0.08;
    const gr=ctx.createRadialGradient(px,py,0,px,py,ps);
    gr.addColorStop(0,`rgba(${pRgb[0]},${pRgb[1]},${pRgb[2]},${alpha})`); gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr; ctx.fillRect(px-ps,py-ps,ps*2,ps*2);
  }
  for (let i=0;i<2500*tex;i++) {
    const tx=rand()*W, ty=rand()*H, tr=rand()*2.2+0.4;
    const bright=rand()>0.5?55:-35;
    ctx.beginPath(); ctx.arc(tx,ty,tr,0,Math.PI*2);
    ctx.fillStyle=`rgba(${Math.min(255,r+bright)},${Math.min(255,g+bright*0.6)},${b},${0.18+rand()*0.28})`; ctx.fill();
  }
}

function renderOxidized(ctx, W, H, rgb, params) {
  const patina=(params.patina||55)/100, rough=(params.roughness||60)/100;
  const dpth=(params.depth||50)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(53);
  for (let i=0;i<Math.floor(patina*40);i++) {
    const px=rand()*W, py=rand()*H, ps=rand()*40+10;
    const gr=rand()*80+120, bl=rand()*60+80;
    const alpha=rand()*0.6*patina+0.05;
    const grd=ctx.createRadialGradient(px,py,0,px,py,ps);
    grd.addColorStop(0,`rgba(10,${gr},${bl},${alpha})`); grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(px-ps,py-ps,ps*2,ps*2);
  }
  // Drip streaks
  for (let i=0;i<Math.floor(dpth*15);i++) {
    const dx=rand()*W, dy=rand()*H, dl=rand()*60+20;
    ctx.beginPath(); ctx.moveTo(dx,dy); ctx.lineTo(dx+rand()*4-2,dy+dl);
    ctx.strokeStyle=`rgba(10,${Math.floor(rand()*80+100)},70,${rand()*0.4*dpth})`; ctx.lineWidth=rand()*3+0.5; ctx.stroke();
  }
  // Micro texture
  for (let i=0;i<2000*rough;i++) {
    const px=rand()*W, py=rand()*H;
    ctx.fillStyle=`rgba(0,${Math.floor(rand()*60+80)},50,${rand()*0.08*rough})`; ctx.fillRect(px,py,1,1);
  }
}

function renderVelvet(ctx, W, H, rgb, params, t=0) {
  const soft=(params.softness||65)/100, dir=((params.direction||90)*Math.PI)/180;
  const sheen=(params.sheen||40)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const sh=ctx.createLinearGradient(W/2-Math.cos(dir)*W,H/2-Math.sin(dir)*H,W/2+Math.cos(dir)*W,H/2+Math.sin(dir)*H);
  sh.addColorStop(0,`rgba(0,0,0,${0.42*soft})`); sh.addColorStop(0.38,`rgba(0,0,0,0)`);
  sh.addColorStop(0.68,`rgba(255,255,255,${0.18*soft*sheen})`); sh.addColorStop(1,`rgba(0,0,0,${0.22*soft})`);
  ctx.fillStyle=sh; ctx.fillRect(0,0,W,H);
  const rand=seededRand(77);
  for (let i=0;i<2500;i++) {
    const fx=rand()*W, fy=rand()*H, fl=rand()*4.5+0.8;
    const alpha=rand()*0.05*soft;
    ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx+Math.cos(dir+rand()*0.5-0.25)*fl,fy+Math.sin(dir+rand()*0.5-0.25)*fl);
    ctx.strokeStyle=rand()>0.5?`rgba(255,255,255,${alpha})`:`rgba(0,0,0,${alpha})`;
    ctx.lineWidth=0.4; ctx.stroke();
  }
}

function renderFabricWeave(ctx, W, H, rgb, params) {
  const ws=params.weave_size||6, contrast=(params.contrast||50)/100;
  const wtype=params.weave_type||'Plain';
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const dark=`rgba(0,0,0,${0.35*contrast})`, light=`rgba(255,255,255,${0.35*contrast})`;
  const half=ws/2;
  for (let y=0;y<H;y+=half) for (let x=0;x<W;x+=half) {
    const col=Math.floor(x/half)%2, row=Math.floor(y/half)%2;
    let shade=false;
    if (wtype==='Plain') shade=(col+row)%2===0;
    else if (wtype==='Twill') shade=(col+row)%3===0;
    else shade=(col*3+row)%5===0;
    ctx.fillStyle=shade?dark:light; ctx.fillRect(x,y,half,half);
  }
  // Thread highlights
  for (let y=0;y<H;y+=ws) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y);
    ctx.strokeStyle=`rgba(255,255,255,${0.1*contrast})`; ctx.lineWidth=0.5; ctx.stroke();
  }
  for (let x=0;x<W;x+=ws) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H);
    ctx.strokeStyle=`rgba(0,0,0,${0.08*contrast})`; ctx.lineWidth=0.5; ctx.stroke();
  }
}

function renderWood(ctx, W, H, rgb, params, t=0) {
  const freq=(params.grain_freq||10)/100, wave=(params.wave||40)/100, knots=params.knots||1;
  const [r,g,b]=rgb;
  for (let py=0;py<H;py++) for (let px=0;px<W;px++) {
    const cx=px-W/2, cy=py-H/2;
    let dist=Math.sqrt(cx*cx+cy*cy);
    // Knots
    for (let k=0;k<knots;k++) {
      const rand=seededRand(k*17+5);
      const kx=(rand()-0.5)*W*0.5, ky=(rand()-0.5)*H*0.5;
      dist+=50*Math.exp(-((cx-kx)**2+(cy-ky)**2)/(W*W*0.03));
    }
    const angle=Math.atan2(cy,cx);
    const ring=dist*freq+Math.sin(angle*3+wave*Math.sin(dist*0.05))*wave*20;
    const rv=Math.sin(ring)*0.5+0.5;
    const bright=(rv*2-1)*52;
    ctx.fillStyle=rgbToHex(Math.min(255,Math.max(0,r+bright*1.1)),Math.min(255,Math.max(0,g+bright*0.8)),Math.min(255,Math.max(0,b+bright*0.4)));
    ctx.fillRect(px,py,1,1);
  }
}

function renderLeather(ctx, W, H, rgb, params) {
  const ps=params.pebble_size||8, depth=(params.depth||55)/100, gloss=(params.gloss||40)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(63);
  const cols=Math.ceil(W/ps)+2, rows=Math.ceil(H/ps)+2;
  for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
    const jx=(rand()-0.5)*ps*0.6, jy=(rand()-0.5)*ps*0.6;
    const cx=col*ps+jx+(row%2?ps/2:0), cy=row*ps*0.9+jy;
    const pr=ps*0.38*(0.65+rand()*0.35);
    // Pebble shadow (bottom-right)
    const sg=ctx.createRadialGradient(cx+pr*0.2,cy+pr*0.2,0,cx,cy,pr*1.2);
    sg.addColorStop(0,'rgba(0,0,0,0)'); sg.addColorStop(1,`rgba(0,0,0,${0.45*depth})`);
    ctx.beginPath(); ctx.ellipse(cx,cy,pr,pr*(0.75+rand()*0.25),rand()*0.5,0,Math.PI*2);
    ctx.fillStyle=sg; ctx.fill();
    // Pebble highlight (top-left)
    const hg=ctx.createRadialGradient(cx-pr*0.25,cy-pr*0.25,0,cx,cy,pr);
    hg.addColorStop(0,`rgba(255,255,255,${0.4*depth*gloss})`); hg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.ellipse(cx,cy,pr,pr*(0.75+rand()*0.25),rand()*0.5,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill();
  }
}

function renderGlitter(ctx, W, H, rgb, params, t=0) {
  const density=params.density||90, sz=params.size||3;
  const tRgb=hexToRgb(params.color_tint||'#ffffff');
  const rainbow=(params.rainbow||50)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(55);
  for (let i=0;i<density*3;i++) {
    const gx=rand()*W, gy=rand()*H, gs=rand()*sz+0.5;
    const phase=(t*3+i*1.3)%(Math.PI*2), bright=(Math.sin(phase)+1)/2;
    const hue=rainbow>0.5?(rand()*360):(rand()*30+(t*60)%360);
    const alpha=bright*0.9+0.1;
    ctx.save(); ctx.translate(gx,gy); ctx.rotate(phase);
    ctx.beginPath();
    for (let j=0;j<4;j++) { const a=(j/4)*Math.PI*2; ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*gs*2.5,Math.sin(a)*gs*2.5); }
    ctx.strokeStyle=rainbow>0.5?`hsla(${hue},100%,90%,${alpha})`:`rgba(${tRgb[0]},${tRgb[1]},${tRgb[2]},${alpha})`;
    ctx.lineWidth=gs*0.7; ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(gx,gy,gs*0.55,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,255,255,${bright*0.85})`; ctx.fill();
  }
}

function renderGalaxy(ctx, W, H, rgb, params, t=0) {
  const stars=params.stars||150, nebula=(params.nebula||55)/100, rot=(params.rotation||40)/100;
  const [r,g,b]=rgb;
  const dk=Math.min;
  ctx.fillStyle=rgbToHex(dk(30,r*0.1),dk(30,g*0.1),dk(60,b*0.2+20)); ctx.fillRect(0,0,W,H);
  const rand=seededRand(88);
  for (let i=0;i<8;i++) {
    const nx=rand()*W, ny=rand()*H, nr=rand()*W*0.42+W*0.08;
    const phase=t*(0.1+rot*0.2)+i*0.8;
    const cr=rand()*255, cg=rand()*100, cb_=rand()*255;
    const gr=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);
    gr.addColorStop(0,`rgba(${cr},${cg},${cb_},${nebula*0.3})`); gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr;
    ctx.save(); ctx.translate(nx,ny); ctx.scale(1+Math.sin(phase)*0.1,1+Math.cos(phase)*0.1); ctx.translate(-nx,-ny);
    ctx.fillRect(0,0,W,H); ctx.restore();
  }
  const mg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.35);
  mg.addColorStop(0,`rgba(${r},${g},${b},${nebula*0.55})`); mg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=mg; ctx.fillRect(0,0,W,H);
  const srand=seededRand(99);
  for (let i=0;i<stars;i++) {
    const sx=srand()*W, sy=srand()*H, sr=srand()*1.6+0.25;
    const phase=(t*2+i*0.38)%(Math.PI*2), bright=(Math.sin(phase)+1)/2;
    ctx.beginPath(); ctx.arc(sx,sy,sr*(0.5+bright*0.5),0,Math.PI*2);
    ctx.fillStyle=`rgba(255,255,255,${bright*0.9+0.1})`; ctx.fill();
    if (sr>1) {
      const gw=ctx.createRadialGradient(sx,sy,0,sx,sy,sr*5);
      gw.addColorStop(0,`rgba(255,255,255,${bright*0.35})`); gw.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gw; ctx.fillRect(sx-sr*5,sy-sr*5,sr*10,sr*10);
    }
  }
}

function renderNeonGlow(ctx, W, H, rgb, params, t=0) {
  const gsize=(params.glow_size||20), inten=(params.intensity||75)/100, pulse=(params.pulse||50)/100;
  const [r,g,b]=rgb;
  // Dark base
  ctx.fillStyle=rgbToHex(Math.round(r*0.08),Math.round(g*0.08),Math.round(b*0.08)); ctx.fillRect(0,0,W,H);
  // Pulsating glow layers
  const pulseFactor=1+(Math.sin(t*pulse*2)*0.35);
  for (let layer=5;layer>0;layer--) {
    const alpha=(inten*(layer/5)*0.35)*pulseFactor;
    const spread=gsize*(6-layer)*pulseFactor;
    const gr=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.min(W,H)*0.5+spread);
    gr.addColorStop(0,`rgba(${r},${g},${b},${alpha})`); gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
  }
  // Core colour
  const core=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.min(W,H)*0.3);
  core.addColorStop(0,`rgba(255,255,255,${inten*0.9})`);
  core.addColorStop(0.3,`rgba(${r},${g},${b},${inten*0.8})`);
  core.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=core; ctx.fillRect(0,0,W,H);
  // Edge neon line
  ctx.save(); ctx.globalAlpha=inten*pulseFactor*0.7;
  ctx.shadowColor=rgbToHex(r,g,b); ctx.shadowBlur=gsize*1.5;
  ctx.strokeStyle=`rgb(${Math.min(255,r+80)},${Math.min(255,g+80)},${Math.min(255,b+80)})`;
  ctx.lineWidth=2; ctx.strokeRect(gsize,gsize,W-gsize*2,H-gsize*2);
  ctx.restore();
}

function renderHolographic(ctx, W, H, rgb, params, t=0) {
  const inten=(params.intensity||70)/100, scale=params.scale||25, spd=(params.speed||40)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  // Holographic rainbow stripes
  for (let x=0;x<W;x++) {
    const hue=((x/W)*360+t*spd*50)%360;
    ctx.fillStyle=`hsla(${hue},100%,65%,${inten*0.55})`;
    ctx.fillRect(x,0,1,H);
  }
  // Interference pattern
  for (let px=0;px<W;px+=2) for (let py=0;py<H;py+=2) {
    const waveX=Math.sin(px/scale+t*spd), waveY=Math.cos(py/scale+t*spd*0.7);
    const combined=(waveX*waveY+1)/2;
    if (combined>0.7) {
      const hue=((px+py)/scale*60+t*spd*30)%360;
      ctx.fillStyle=`hsla(${hue},100%,80%,${(combined-0.7)*inten*3})`;
      ctx.fillRect(px,py,2,2);
    }
  }
  // Foil highlight
  const hl=ctx.createLinearGradient(0,0,W,H);
  hl.addColorStop(0,`rgba(255,255,255,${inten*0.25})`); hl.addColorStop(0.5,'rgba(255,255,255,0)'); hl.addColorStop(1,`rgba(255,255,255,${inten*0.15})`);
  ctx.fillStyle=hl; ctx.fillRect(0,0,W,H);
}

function renderChameleon(ctx, W, H, rgb, params, t=0) {
  const c2Rgb=hexToRgb(params.color2||'#00d4aa');
  const sharp=(params.sharpness||50)/100, angle=(params.angle_bias||60)/100;
  const [r,g,b]=rgb;
  // Animate the flip band
  const band=(Math.sin(t*0.8)*0.5+0.5)*angle+(1-angle)*0.3;
  const grad=ctx.createLinearGradient(0,0,W,H);
  const s=Math.max(0,band-sharp*0.3), e=Math.min(1,band+sharp*0.3);
  grad.addColorStop(0,rgbToHex(r,g,b)); grad.addColorStop(s,rgbToHex(r,g,b));
  grad.addColorStop((s+e)/2,rgbToHex(Math.min(255,(r+c2Rgb[0])/2+30),Math.min(255,(g+c2Rgb[1])/2+30),Math.min(255,(b+c2Rgb[2])/2+30)));
  grad.addColorStop(e,rgbToHex(c2Rgb[0],c2Rgb[1],c2Rgb[2])); grad.addColorStop(1,rgbToHex(c2Rgb[0],c2Rgb[1],c2Rgb[2]));
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  // Iridescent overlay
  const ov=ctx.createLinearGradient(W,0,0,H);
  ov.addColorStop(0,`rgba(255,255,255,0.15)`); ov.addColorStop(0.5,`rgba(255,255,255,0)`); ov.addColorStop(1,`rgba(0,0,0,0.1)`);
  ctx.fillStyle=ov; ctx.fillRect(0,0,W,H);
}

function renderWatercolor(ctx, W, H, rgb, params, t=0) {
  const wet=(params.wetness||60)/100, layers=params.layers||3, gran=(params.granulation||40)/100;
  const [r,g,b]=rgb;
  ctx.fillStyle='#fafafa'; ctx.fillRect(0,0,W,H);
  const rand=seededRand(44);
  for (let layer=0;layer<layers;layer++) {
    const cx=rand()*W*0.6+W*0.2, cy=rand()*H*0.6+H*0.2, cr=rand()*Math.min(W,H)*0.38+Math.min(W,H)*0.14;
    const lr=Math.min(255,r+(rand()*70-35)), lg=Math.min(255,g+(rand()*70-35)), lb=Math.min(255,b+(rand()*70-35));
    const alpha=(0.18+rand()*0.28)*(wet*0.8+0.2);
    ctx.save(); ctx.translate(cx,cy); ctx.scale(1+rand()*0.5,0.65+rand()*0.7);
    const wg=ctx.createRadialGradient(0,0,0,0,0,cr);
    wg.addColorStop(0,`rgba(${lr},${lg},${lb},${alpha*1.6})`); wg.addColorStop(0.55,`rgba(${lr},${lg},${lb},${alpha})`);
    wg.addColorStop(0.85,`rgba(${lr},${lg},${lb},${alpha*0.5})`); wg.addColorStop(1,`rgba(${lr},${lg},${lb},0)`);
    ctx.beginPath(); ctx.arc(0,0,cr,0,Math.PI*2); ctx.fillStyle=wg; ctx.fill(); ctx.restore();
    if (wet>0.35) {
      for (let e=0;e<6;e++) {
        const ex=cx+(rand()-0.5)*cr*1.6, ey=cy+(rand()-0.5)*cr*1.6, er=rand()*22+4;
        const bg=ctx.createRadialGradient(ex,ey,0,ex,ey,er);
        bg.addColorStop(0,`rgba(${lr},${lg},${lb},${alpha*0.85})`); bg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=bg; ctx.fillRect(ex-er,ey-er,er*2,er*2);
      }
    }
  }
  // Granulation texture
  for (let i=0;i<4000*gran;i++) {
    const px=rand()*W, py=rand()*H, bc=rand()*0.06-0.03;
    ctx.fillStyle=`rgba(${bc>0?255:0},${bc>0?255:0},${bc>0?255:0},${Math.abs(bc)})`;
    ctx.fillRect(px,py,1,1);
  }
}

function renderImpasto(ctx, W, H, rgb, params, t=0) {
  const thick=(params.thickness||60)/100, ss=(params.stroke_size||45)/100, dir=((params.direction||30)*Math.PI)/180;
  const [r,g,b]=rgb;
  ctx.fillStyle=rgbToHex(r,g,b); ctx.fillRect(0,0,W,H);
  const rand=seededRand(66);
  const strokes=Math.floor(ss*200)+30;
  for (let i=0;i<strokes;i++) {
    const sx=rand()*W*1.2-W*0.1, sy=rand()*H*1.2-H*0.1;
    const len=rand()*W*0.25+20, width=rand()*15*thick+3;
    const strokeDir=dir+(rand()-0.5)*0.8;
    const bright=(rand()*2-1)*60*thick;
    const cr=Math.min(255,Math.max(0,r+bright)), cg=Math.min(255,Math.max(0,g+bright*0.9)), cb_=Math.min(255,Math.max(0,b+bright*0.8));
    const ex=sx+Math.cos(strokeDir)*len, ey=sy+Math.sin(strokeDir)*len;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey);
    ctx.strokeStyle=rgbToHex(cr,cg,cb_); ctx.lineWidth=width; ctx.lineCap='round'; ctx.stroke();
    // Palette knife edge highlight
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey);
    ctx.strokeStyle=`rgba(255,255,255,${thick*0.3})`; ctx.lineWidth=width*0.3; ctx.stroke();
    // Shadow edge
    ctx.beginPath();
    ctx.moveTo(sx+Math.cos(strokeDir+Math.PI/2)*width*0.5, sy+Math.sin(strokeDir+Math.PI/2)*width*0.5);
    ctx.lineTo(ex+Math.cos(strokeDir+Math.PI/2)*width*0.5, ey+Math.sin(strokeDir+Math.PI/2)*width*0.5);
    ctx.strokeStyle=`rgba(0,0,0,${thick*0.25})`; ctx.lineWidth=2; ctx.stroke();
  }
}

// ---- ANIMATED EFFECTS ----
const ANIMATED_EFFECTS = new Set(['kristall','pearl','mica','opal','metallic','glitter','galaxy','neon_glow','holographic','chameleon','watercolor','brushed_gold','chrome']);

// ---- NAV ----
document.querySelectorAll('.nav-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.nav-pill').forEach(p=>p.classList.remove('active'));
    pill.classList.add('active');
    const tgt=pill.dataset.section;
    document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===`section-${tgt}`));
    if (tgt==='effects') buildEffectsGrid();
    if (tgt==='preview3d') { setTimeout(()=>{ initThreeJS(); update3DFromState(); },100); }
  });
});
document.getElementById('btn-goto-effects')?.addEventListener('click', ()=>document.querySelector('.nav-pill[data-section="effects"]')?.click());

// ---- PREVIEW CANVAS (HiDPI) ----
function getPreviewCanvas() { return document.getElementById('preview-canvas'); }

function initPreviewCanvas() {
  const canvas = getPreviewCanvas();
  const wrap = document.getElementById('preview-wrap');
  if (!wrap || !canvas) return;
  const rect = wrap.getBoundingClientRect();
  const size = rect.width || 300;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  // Let it fill the wrap (aspect-ratio:1 in CSS)
}

function getPreviewCtx() {
  const canvas = getPreviewCanvas();
  if (!canvas) return null;
  return resizeHiDPICanvas(canvas);
}

function getPreviewSize() {
  const canvas = getPreviewCanvas();
  if (!canvas) return [300,300];
  const r = canvas.getBoundingClientRect();
  return [r.width||300, r.height||300];
}

// ---- EFFECT PREVIEW CANVAS (HiDPI) ----
function getEffectCtx() {
  const canvas = document.getElementById('effect-preview-canvas');
  if (!canvas) return null;
  return resizeHiDPICanvas(canvas);
}
function getEffectSize() {
  const c = document.getElementById('effect-preview-canvas');
  if (!c) return [200,200];
  const r = c.getBoundingClientRect();
  return [r.width||200, r.height||200];
}

// ---- COLOR SLOTS ----
function buildColorSlots() {
  const container = document.getElementById('color-slots');
  container.innerHTML = '';
  state.colors.forEach(c => container.appendChild(createSlotEl(c)));
  renderPreview(); renderEffectPreview();
}

function createSlotEl(color) {
  const el = document.createElement('div');
  el.className = 'color-slot'; el.dataset.id = color.id;
  el.innerHTML = `
    <div class="slot-swatch" style="background:${color.hex}">
      <input type="color" class="slot-color-input" value="${color.hex}" aria-label="Pick color">
    </div>
    <input type="range" class="slot-range" min="1" max="100" value="${color.pct}" style="--pct:${color.pct}%">
    <span class="slot-pct">${color.pct}%</span>
    <button class="slot-remove">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  const ci=el.querySelector('.slot-color-input'), ri=el.querySelector('.slot-range');
  const pl=el.querySelector('.slot-pct'), sw=el.querySelector('.slot-swatch');
  ci.addEventListener('input',()=>{ color.hex=ci.value; sw.style.background=color.hex; renderPreview(); renderEffectPreview(); update3DFromState(); });
  ri.addEventListener('input',()=>{ color.pct=parseInt(ri.value); pl.textContent=`${color.pct}%`; ri.style.setProperty('--pct',`${color.pct}%`); renderPreview(); renderEffectPreview(); update3DFromState(); });
  el.querySelector('.slot-remove').addEventListener('click',()=>{
    if(state.colors.length<=1){showToast('Need at least one colour!');return;}
    state.colors=state.colors.filter(c=>c.id!==color.id);
    el.style.transition='.18s'; el.style.opacity='0'; el.style.transform='translateX(-12px)';
    setTimeout(()=>buildColorSlots(),180);
  });
  return el;
}

document.getElementById('btn-add-color')?.addEventListener('click',()=>{
  if(state.colors.length>=8){showToast('Maximum 8 colours!');return;}
  state.colors.push({id:uid(),hex:randomHex(),pct:50}); buildColorSlots();
});
document.getElementById('btn-clear')?.addEventListener('click',()=>{ state.colors=[{id:uid(),hex:'#ffffff',pct:100}]; buildColorSlots(); });
document.getElementById('btn-random')?.addEventListener('click',()=>{
  const n=Math.floor(Math.random()*4)+2;
  state.colors=Array.from({length:n},()=>({id:uid(),hex:randomHex(),pct:Math.floor(Math.random()*80)+10}));
  buildColorSlots(); triggerRipple(); update3DFromState();
});
document.getElementById('btn-complement')?.addEventListener('click',()=>{
  if(!state.colors.length) return;
  const base=state.colors[0].hex, comp=complementHex(base);
  state.colors=[{id:uid(),hex:base,pct:50},{id:uid(),hex:comp,pct:50}];
  buildColorSlots(); showToast('Complementary pair generated');
});

function randomHex(){return '#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');}

// ---- RENDER PREVIEW ----
function renderPreview() {
  const ctx = getPreviewCtx();
  if (!ctx) return;
  const [W,H] = getPreviewSize();
  const rgb = getMix();
  const t = performance.now()/1000;
  if (state.activeEffect && state.activeEffect.id!=='none') {
    state.activeEffect.render(ctx,W,H,rgb,state.effectParams,t,state.lighting);
  } else {
    const gr=ctx.createRadialGradient(W*0.3,H*0.25,0,W*0.5,H*0.5,W*0.72);
    const hex=rgbToHex(...rgb);
    const [r,g,b]=rgb;
    gr.addColorStop(0,rgbToHex(Math.min(255,r+28),Math.min(255,g+28),Math.min(255,b+28)));
    gr.addColorStop(0.6,hex); gr.addColorStop(1,rgbToHex(Math.max(0,r-18),Math.max(0,g-18),Math.max(0,b-18)));
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
  }
  updateColorMeta(rgb);
}

function renderEffectPreview() {
  const ctx = getEffectCtx();
  if (!ctx) return;
  const [W,H] = getEffectSize();
  const rgb = getMix();
  const t = performance.now()/1000;
  if (state.activeEffect) {
    state.activeEffect.render(ctx,W,H,rgb,state.effectParams,t,state.lighting);
    document.getElementById('effect-name-badge').textContent=state.activeEffect.name;
  } else {
    ctx.fillStyle=rgbToHex(...rgb); ctx.fillRect(0,0,W,H);
    document.getElementById('effect-name-badge').textContent='No Effect';
  }
}

function updateColorMeta(rgb) {
  const [r,g,b]=rgb, hex=rgbToHex(r,g,b);
  const [h,s,l]=rgbToHsl(r,g,b);
  document.getElementById('hex-value').textContent=hex.toUpperCase();
  document.getElementById('rgb-value').textContent=`${r}, ${g}, ${b}`;
  document.getElementById('hsl-value').textContent=`${h}°, ${s}%, ${l}%`;
  const cv=getPreviewCanvas();
  if(cv) cv.style.boxShadow=`0 0 0 3px ${hex}40, 0 8px 28px ${hex}25`;
}

// Ripple
getPreviewCanvas()?.addEventListener('click',e=>triggerRipple(e));
function triggerRipple(e) {
  const overlay=document.getElementById('preview-ripple');
  if(!overlay) return;
  const rect=overlay.getBoundingClientRect();
  const x=e?e.clientX-rect.left:rect.width/2, y=e?e.clientY-rect.top:rect.height/2;
  const hex=rgbToHex(...getMix());
  const c=document.createElement('div');
  c.className='ripple-circle';
  c.style.cssText=`left:${x}px;top:${y}px;width:80px;height:80px;margin-left:-40px;margin-top:-40px;background:${hex};opacity:.5;`;
  overlay.appendChild(c); setTimeout(()=>c.remove(),700);
}

// Copy hex
document.getElementById('btn-copy-hex')?.addEventListener('click',()=>{
  const hex=document.getElementById('hex-value').textContent;
  navigator.clipboard.writeText(hex).then(()=>showToast(`Copied ${hex}`));
});

// ---- ZOOM ----
let zoomLevel = 1;
document.getElementById('tool-zoom-in')?.addEventListener('click',()=>{ zoomLevel=Math.min(4,zoomLevel+0.25); applyZoom(); });
document.getElementById('tool-zoom-out')?.addEventListener('click',()=>{ zoomLevel=Math.max(0.5,zoomLevel-0.25); applyZoom(); });
document.getElementById('tool-zoom-fit')?.addEventListener('click',()=>{ zoomLevel=1; applyZoom(); });
function applyZoom() {
  const c=getPreviewCanvas(); if(!c) return;
  c.style.transform=`scale(${zoomLevel})`;
  const zi=document.getElementById('zoom-indicator');
  if(zi){zi.textContent=Math.round(zoomLevel*100)+'%'; zi.classList.add('visible'); setTimeout(()=>zi.classList.remove('visible'),1200);}
}
// Scroll zoom
document.getElementById('preview-wrap')?.addEventListener('wheel',e=>{
  e.preventDefault();
  zoomLevel=Math.max(0.5,Math.min(4,zoomLevel-(e.deltaY>0?.15:-.15)));
  applyZoom();
},{passive:false});

// Download
document.getElementById('tool-download')?.addEventListener('click',()=>{
  const c=getPreviewCanvas(); if(!c) return;
  const link=document.createElement('a');
  link.download=`paint-mix-${Date.now()}.png`; link.href=c.toDataURL('image/png'); link.click();
  showToast('Downloaded!');
});

// ---- ANIMATION LOOP ----
function startLoop() {
  cancelAnimationFrame(state.animFrame);
  function loop() {
    if(state.activeEffect && ANIMATED_EFFECTS.has(state.activeEffect.id)) {
      renderPreview(); renderEffectPreview();
    }
    state.animFrame=requestAnimationFrame(loop);
  }
  state.animFrame=requestAnimationFrame(loop);
}

// ---- LIGHTING CONTROLS ----
['light-angle','light-intensity','ambient-light'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',e=>{
    const key={['light-angle']:'angle',['light-intensity']:'intensity',['ambient-light']:'ambient'}[id];
    state.lighting[key]=parseInt(e.target.value);
    renderPreview(); renderEffectPreview(); update3DFromState();
  });
});

// ---- EFFECTS GRID ----
let effectsBuilt=false;
function buildEffectsGrid() {
  if(effectsBuilt) return;
  effectsBuilt=true;
  const grid=document.getElementById('effects-grid');
  EFFECTS.forEach((effect,idx)=>{
    const card=document.createElement('button');
    card.className='effect-card'; card.dataset.effectId=effect.id; card.dataset.cat=effect.category;
    card.style.animationDelay=`${idx*25}ms`;
    if(state.activeEffect?.id===effect.id) card.classList.add('selected');
    // Build card body first, then append canvas AFTER (avoids innerHTML+ destroying canvas ref)
    card.insertAdjacentHTML('beforeend',`<div class="effect-card-body"><div class="effect-card-name">${effect.name}</div><div class="effect-card-desc">${effect.desc}</div><span class="effect-card-badge">${effect.category}</span></div>`);
    const canvas=document.createElement('canvas');
    canvas.className='effect-card-canvas';
    card.insertBefore(canvas,card.firstChild); // prepend canvas before body text
    grid.appendChild(card);
    // Render thumbnail: wait for layout with double RAF + stagger, then paint at HiDPI
    function renderCardThumb() {
      const rect=canvas.getBoundingClientRect();
      const w=rect.width>4?rect.width:191;
      const dpr=window.devicePixelRatio||1;
      canvas.width=Math.round(w*dpr); canvas.height=Math.round(w*0.6*dpr);
      canvas.style.width='100%'; canvas.style.height='auto';
      const tctx=canvas.getContext('2d'); tctx.scale(dpr,dpr);
      const defParams={}; effect.params.forEach(p=>{ defParams[p.id]=p.default; });
      try { effect.render(tctx,w,w*0.6,getMix(),defParams,0); } catch(e){}
    }
    // Stagger rendering to avoid layout jank: double RAF ensures card is in DOM and measured
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>renderCardThumb(), idx*8)));
    card.addEventListener('click',()=>selectEffect(effect,card));
  });

  // Filter
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const cat=btn.dataset.cat;
      document.querySelectorAll('.effect-card').forEach(c=>{
        c.classList.toggle('hidden',cat!=='All'&&c.dataset.cat!==cat);
      });
    });
  });
}

function selectEffect(effect, card) {
  document.querySelectorAll('.effect-card').forEach(c=>c.classList.remove('selected'));
  card?.classList.add('selected');
  state.activeEffect=effect;
  state.effectParams={};
  effect.params.forEach(p=>{ state.effectParams[p.id]=p.default; });
  buildEffectParams(effect);
  // Show/hide lighting
  const lc=document.getElementById('light-controls');
  if(lc) lc.style.display=effect.id!=='none'?'flex':'none';
  renderEffectPreview(); renderPreview(); update3DFromState();
  showToast(`Effect: ${effect.name}`);
  document.querySelector('.nav-pill[data-section="mixer"]')?.click();
}

function buildEffectParams(effect) {
  const container=document.getElementById('effect-params');
  container.innerHTML='';
  if(!effect||!effect.params.length){ container.innerHTML='<p class="no-effect-hint">No parameters for this effect.</p>'; return; }
  effect.params.forEach(param=>{
    const row=document.createElement('div'); row.className='param-row';
    if(param.type==='color') {
      const val=state.effectParams[param.id]||param.default;
      row.innerHTML=`<label class="param-label">${param.label}</label><div class="param-color-row"><div class="param-color-swatch" style="background:${val}"><input type="color" class="param-color-input" value="${val}"></div></div>`;
      container.appendChild(row);
      row.querySelector('.param-color-input').addEventListener('input',e=>{
        state.effectParams[param.id]=e.target.value;
        row.querySelector('.param-color-swatch').style.background=e.target.value;
        renderEffectPreview(); renderPreview(); update3DFromState();
      });
    } else if(param.type==='select') {
      const val=state.effectParams[param.id]||param.default;
      row.innerHTML=`<label class="param-label">${param.label}</label><select class="param-select">${param.options.map(o=>`<option${o===val?' selected':''}>${o}</option>`).join('')}</select>`;
      container.appendChild(row);
      row.querySelector('select').addEventListener('change',e=>{
        state.effectParams[param.id]=e.target.value;
        renderEffectPreview(); renderPreview();
      });
    } else {
      const val=state.effectParams[param.id]??param.default;
      row.innerHTML=`<label class="param-label">${param.label}</label><input type="range" class="param-range" min="${param.min}" max="${param.max}" value="${val}">`;
      container.appendChild(row);
      row.querySelector('input').addEventListener('input',e=>{
        state.effectParams[param.id]=parseInt(e.target.value);
        renderEffectPreview(); renderPreview(); update3DFromState();
      });
    }
  });
}

// ---- SAVE / PALETTE ----
document.getElementById('btn-save')?.addEventListener('click',()=>{
  const rgb=getMix(), hex=rgbToHex(...rgb);
  state.savedPalette.push({
    id:uid(), hex, rgb,
    effect:state.activeEffect?.name||'No Effect',
    effectId:state.activeEffect?.id||'none',
    effectParams:state.effectParams?{...state.effectParams}:{},
    colors:state.colors.map(c=>({...c}))
  });
  renderSavedPalette(); showToast(`Saved ${hex.toUpperCase()}`);
  const btn=document.getElementById('btn-save');
  btn.style.background='var(--color-success)'; setTimeout(()=>btn.style.background='',900);
});
function renderSavedPalette() {
  const empty=document.getElementById('palette-empty'), grid=document.getElementById('palette-grid');
  if(!empty||!grid) return;
  empty.style.display=state.savedPalette.length?'none':'flex';
  grid.innerHTML='';
  state.savedPalette.forEach(item=>{
    const el=document.createElement('div'); el.className='palette-item';
    // Swatch canvas
    const swCanvas=document.createElement('canvas'); swCanvas.className='palette-swatch'; swCanvas.width=120; swCanvas.height=120;
    // Info row
    const infoDiv=document.createElement('div'); infoDiv.className='palette-item-body';
    const hasEffect=item.effectId&&item.effectId!=='none';
    const effectLabel=hasEffect?`<span class="palette-item-effect" title="${item.effect}">${item.effect}</span>`:'';
    infoDiv.innerHTML=`<span class="palette-item-hex">${item.hex.toUpperCase()}</span><button class="palette-item-delete" title="Remove"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>`;
    // Test in 3D action row
    const actionsDiv=document.createElement('div'); actionsDiv.className='palette-item-actions';
    actionsDiv.innerHTML=`<button class="btn-test3d"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>Test in 3D</button>`;
    el.appendChild(swCanvas);
    el.appendChild(infoDiv);
    el.appendChild(actionsDiv);
    // Render swatch
    const swCtx=swCanvas.getContext('2d');
    const effect=EFFECTS.find(e=>e.id===item.effectId);
    if(effect&&item.effectId!=='none'){
      const p=item.effectParams||{};
      effect.params.forEach(pp=>{ if(!(pp.id in p)) p[pp.id]=pp.default; });
      try { effect.render(swCtx,120,120,item.rgb,p,0); } catch(e2){ swCtx.fillStyle=item.hex; swCtx.fillRect(0,0,120,120); }
    } else { swCtx.fillStyle=item.hex; swCtx.fillRect(0,0,120,120); }
    // Click swatch: load into Mixer
    swCanvas.addEventListener('click',()=>{ state.colors=item.colors.map(c=>({...c,id:uid()})); buildColorSlots(); showToast(`Loaded ${item.hex.toUpperCase()}`); document.querySelector('.nav-pill[data-section="mixer"]')?.click(); });
    // Click Test in 3D
    actionsDiv.querySelector('.btn-test3d').addEventListener('click',e=>{ e.stopPropagation(); testPaletteIn3D(item); });
    // Delete
    infoDiv.querySelector('.palette-item-delete').addEventListener('click',e=>{ e.stopPropagation(); state.savedPalette=state.savedPalette.filter(p=>p.id!==item.id); renderSavedPalette(); });
    grid.appendChild(el);
  });
}

// ---- THREE.JS 3D PREVIEW ----
// Model sources (all free/open):
//   Car:      ferrari.glb — three.js examples (MIT)
//   Motorbike: motorbike.glb — CarbonFrameBike (CC-BY-SA, R. Schweier / prefrontal cortex)
//   Helmet:   helmet.glb — DamagedHelmet (CC0, Khronos glTF Sample Assets)
//   Sphere:   procedural THREE.SphereGeometry

let threeInitialized=false, threeRenderer=null, threeScene=null, threeCamera=null;
let threeMesh=null, threeEnvLight=null, threePointLight=null;
let threeMat=null;
let isDragging=false, lastX=0, lastY=0, rotX=0.25, rotY=0.5, distance=4.2;
let autoSpin=false;
let currentModel='car', currentEnv='studio';

// Per-model camera config: [rotX, rotY, distance, camY, lookAtY]
const MODEL_CAM = {
  car:       [0.18, 0.5,  4.2, 0.6, 0.15],
  motorbike: [0.18, 0.8,  4.8, 0.7, 0.45],
  helmet:    [0.18, 0.5,  4.0, 0.5, 0.15],
  sphere:    [0.15, 0.5,  4.5, 0.9, 0.9],
};

// GLB model paths (relative to app root) + credit
// Per-model target sizes for auto-fit (when scale===1).
// Increase for larger models that appear too small in the viewport.
const MODEL_TARGET_SIZE = {
  car:      3.2,
  motorbike: 2.8,
  helmet:   1.5,
  sphere:   2.2,
};

const MODEL_SOURCES = {
  // rawScale = pre-scale correction BEFORE auto-fit (e.g. motorbike is in mm units, needs 0.012 first)
  // All models then auto-fit to MODEL_TARGET_SIZE after rawScale is applied.
  car:       { path:'./models/ferrari.glb',    credit:'Ferrari (three.js examples, MIT)',          rawScale:1,     offsetY:0.05 },
  motorbike: { path:'./models/motorbike.glb',  credit:'Carbon Frame Bike (CC-BY-SA, R. Schweier)', rawScale:0.012, offsetY:0 },
  helmet:    { path:'./models/helmet.glb',     credit:'Damaged Helmet (CC0, Khronos)',             rawScale:1,     offsetY:0.05 },
  sphere:    { path:null,                       credit:'',                                          rawScale:1,     offsetY:0 },
};

// Cache loaded GLB scenes
const gltfCache = {};

// Shared GLTFLoader instance with Draco support
let _gltfLoader = null;
function getGLTFLoader() {
  if(_gltfLoader) return _gltfLoader;
  _gltfLoader = new THREE.GLTFLoader();
  if(typeof THREE.DRACOLoader !== 'undefined') {
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('./draco/');
    _gltfLoader.setDRACOLoader(draco);
  }
  return _gltfLoader;
}

function showModelLoading(msg) {
  const el = document.getElementById('model-loading');
  const lbl = document.getElementById('model-loading-label');
  if(el) { el.hidden = false; if(lbl) lbl.textContent = msg||'Loading model…'; }
}
function hideModelLoading() {
  const el = document.getElementById('model-loading');
  if(el) el.hidden = true;
}
function setModelCredit(text) {
  let el = document.getElementById('model-credit');
  if(!el) {
    el = document.createElement('div');
    el.id = 'model-credit';
    el.className = 'model-credit';
    document.getElementById('preview3d-wrap')?.appendChild(el);
  }
  el.textContent = text;
}

function initThreeJS() {
  if(threeInitialized) return;
  if(typeof THREE==='undefined') { console.warn('Three.js not loaded'); return; }
  threeInitialized=true;
  const canvas=document.getElementById('three-canvas');
  const wrap=document.getElementById('preview3d-wrap');
  if(!canvas||!wrap) return;
  const W=wrap.clientWidth||800, H=wrap.clientHeight||450;

  threeRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
  threeRenderer.setPixelRatio(window.devicePixelRatio||1);
  threeRenderer.setSize(W,H);
  threeRenderer.shadowMap.enabled=true;
  threeRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  threeRenderer.toneMapping=THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure=1.2;

  threeScene=new THREE.Scene();
  const [rx,ry,dist,camY]=MODEL_CAM.car;
  rotX=rx; rotY=ry; distance=dist;
  threeCamera=new THREE.PerspectiveCamera(45,W/H,0.01,100);
  threeCamera.position.set(0,camY,distance);

  // Lights
  const ambient=new THREE.AmbientLight(0xffffff,0.6); threeScene.add(ambient); threeEnvLight=ambient;
  threePointLight=new THREE.DirectionalLight(0xffffff,2.2);
  threePointLight.position.set(3,5,3); threePointLight.castShadow=true;
  threePointLight.shadow.mapSize.width=1024; threePointLight.shadow.mapSize.height=1024;
  threeScene.add(threePointLight);
  const fill=new THREE.DirectionalLight(0xffffff,0.5); fill.position.set(-4,3,-3); threeScene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,0.7); rim.position.set(0,4,-5); threeScene.add(rim);

  // Reflective floor
  const floorGeo=new THREE.PlaneGeometry(30,30);
  const floorMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:0.85,metalness:0.15});
  const floor=new THREE.Mesh(floorGeo,floorMat); floor.rotation.x=-Math.PI/2; floor.position.y=-0.01; floor.receiveShadow=true;
  threeScene.add(floor);

  buildModel('car');
  setEnvironment('studio');
  startThreeLoop();

  // Mouse/touch controls
  canvas.addEventListener('mousedown',e=>{isDragging=true;lastX=e.clientX;lastY=e.clientY;});
  window.addEventListener('mousemove',e=>{ if(!isDragging) return; rotY+=(e.clientX-lastX)*0.008; rotX+=(e.clientY-lastY)*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX)); lastX=e.clientX; lastY=e.clientY; });
  window.addEventListener('mouseup',()=>isDragging=false);
  canvas.addEventListener('wheel',e=>{ distance=Math.max(0.8,Math.min(12,distance+e.deltaY*0.005)); e.preventDefault(); },{passive:false});
  canvas.addEventListener('touchstart',e=>{ isDragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; },{passive:true});
  canvas.addEventListener('touchmove',e=>{ if(!isDragging) return; rotY+=(e.touches[0].clientX-lastX)*0.01; rotX+=(e.touches[0].clientY-lastY)*0.01; rotX=Math.max(-1.2,Math.min(1.2,rotX)); lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; },{passive:true});
  canvas.addEventListener('touchend',()=>isDragging=false);

  canvas.addEventListener('mousedown',()=>{ document.getElementById('canvas3d-hint')?.classList.add('hidden'); },{once:true});

  new ResizeObserver(()=>{ if(!threeRenderer||!threeCamera) return; const w=wrap.clientWidth,h=wrap.clientHeight; threeRenderer.setSize(w,h); threeCamera.aspect=w/h; threeCamera.updateProjectionMatrix(); }).observe(wrap);
}

// Build the paint texture canvas (512×512) from current mix + effect
function buildPaintTexture() {
  const rgb=getMix(), hex=rgbToHex(...rgb);
  const tc=document.createElement('canvas'); tc.width=512; tc.height=512;
  const ctx=tc.getContext('2d');
  if(state.activeEffect&&state.activeEffect.id!=='none') {
    state.activeEffect.render(ctx,512,512,rgb,state.effectParams,performance.now()/1000,state.lighting);
  } else { ctx.fillStyle=hex; ctx.fillRect(0,0,512,512); }
  return tc;
}

// Apply threeMat to all mesh children of loaded group (override their original materials)
function applyPaintToGroup(group, mat, keepOriginal) {
  group.traverse(child=>{
    if(!child.isMesh) return;
    if(keepOriginal) {
      // Blend: keep original albedo but override with our painted colour via envMap + emissive trick
      // For real GLB models: just apply map overlay on top
      if(!child.__origMat) child.__origMat=child.material;
      child.material=mat;
    } else {
      child.material=mat;
    }
  });
}

// Restore original materials on group (unpaint)
function restoreGroupMaterials(group) {
  group.traverse(child=>{
    if(child.isMesh && child.__origMat) { child.material=child.__origMat; delete child.__origMat; }
  });
}

let _gltfLoadToken = 0; // incremented each time buildModel is called — stale callbacks check against this

function buildModel(type) {
  // Remove previous model and cancel any pending load
  if(threeMesh) { threeScene.remove(threeMesh); threeMesh=null; }
  threeMat=null;
  hideModelLoading(); // always clear any lingering overlay immediately
  const token = ++_gltfLoadToken; // snapshot for this load; stale callbacks will be ignored

  // Reset camera to model-specific defaults
  const camCfg=MODEL_CAM[type]||MODEL_CAM.car;
  rotX=camCfg[0]; rotY=camCfg[1]; distance=camCfg[2];

  currentModel=type;

  const rough=(document.getElementById('3d-roughness')?.value??30)/100;
  const metal=(document.getElementById('3d-metalness')?.value??20)/100;
  const cc=(document.getElementById('3d-clearcoat')?.value??80)/100;

  const texture=new THREE.CanvasTexture(buildPaintTexture());
  texture.wrapS=THREE.RepeatWrapping; texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(type==='sphere'?1:2,type==='sphere'?1:2);

  threeMat=new THREE.MeshPhysicalMaterial({
    map:texture, roughness:rough, metalness:metal,
    clearcoat:cc, clearcoatRoughness:0.08,
    envMapIntensity:1.0,
  });

  if(type==='sphere') {
    const geo=new THREE.SphereGeometry(1,64,64);
    threeMesh=new THREE.Mesh(geo,threeMat);
    threeMesh.castShadow=true; threeMesh.receiveShadow=true;
    threeMesh.position.y=0.9;
    threeScene.add(threeMesh);
    setModelCredit('');
    return;
  }

  const src=MODEL_SOURCES[type];
  if(!src||!src.path) return;

  // Load GLB (with cache)
  if(gltfCache[type]) {
    _applyLoadedGLB(type, gltfCache[type], threeMat);
    return;
  }

  showModelLoading(`Loading ${type} model…`);

  const loader=getGLTFLoader();
  const matSnapshot=threeMat; // capture current mat — may change if user switches model fast
  loader.load(
    src.path,
    (gltf)=>{
      if(token!==_gltfLoadToken) { hideModelLoading(); return; } // stale — hide overlay, stop
      gltfCache[type]=gltf.scene;
      hideModelLoading();
      _applyLoadedGLB(type, gltf.scene, matSnapshot);
    },
    (xhr)=>{
      if(token!==_gltfLoadToken) { hideModelLoading(); return; }
      if(xhr.lengthComputable) {
        const pct=Math.round(xhr.loaded/xhr.total*100);
        document.getElementById('model-loading-label').textContent=`Loading ${type}… ${pct}%`;
      }
    },
    (err)=>{
      if(token!==_gltfLoadToken) { hideModelLoading(); return; }
      console.warn('GLB load failed, using procedural fallback:', err);
      hideModelLoading();
      _buildProceduralModel(type, matSnapshot);
    }
  );
}

function _applyLoadedGLB(type, sceneTemplate, mat) {
  // Clone the scene so we can re-use the cached version
  const group=sceneTemplate.clone(true);
  const src=MODEL_SOURCES[type];

  // Step 1: Apply rawScale correction first (e.g. motorbike is in mm, needs 0.012)
  const rawScale=src.rawScale||1;
  if(rawScale!==1) group.scale.setScalar(rawScale);

  // Step 2: Auto-fit to target viewport size after raw correction
  group.updateMatrixWorld(true);
  const boxFit=new THREE.Box3().setFromObject(group);
  const sizeFit=boxFit.getSize(new THREE.Vector3());
  const maxDimFit=Math.max(sizeFit.x,sizeFit.y,sizeFit.z);
  if(maxDimFit>0) {
    const targetSize=MODEL_TARGET_SIZE[type]||2.2;
    group.scale.setScalar((rawScale*targetSize)/maxDimFit);
  }

  // Re-measure after scale and center+lift
  group.updateMatrixWorld(true);
  const box2=new THREE.Box3().setFromObject(group);
  const center=box2.getCenter(new THREE.Vector3());
  const min=box2.min;
  group.position.set(-center.x, -min.y + (src.offsetY||0), -center.z);

  // Apply our paint material to ALL mesh children
  applyPaintToGroup(group, mat, false);

  threeMesh=group;
  threeScene.add(threeMesh);
  setModelCredit(src.credit);
}

// Procedural fallback credits
const PROCEDURAL_CREDITS = {
  car:       'Sport Car (procedural)',
  motorbike: 'Sport Motorcycle (procedural)',
  helmet:    'Racing Helmet (procedural)',
};

// Procedural fallback (kept for robustness)
function _buildProceduralModel(type, mat) {
  let group;
  if(type==='car') group=_buildProceduralCar(mat);
  else if(type==='motorbike') group=_buildProceduralMotorbike(mat);
  else if(type==='helmet') group=_buildProceduralHelmet(mat);
  else { group=new THREE.Group(); }

  // Auto-fit procedural model too
  group.updateMatrixWorld(true);
  const boxP=new THREE.Box3().setFromObject(group);
  const sizeP=boxP.getSize(new THREE.Vector3());
  const maxDimP=Math.max(sizeP.x,sizeP.y,sizeP.z);
  if(maxDimP>0) {
    const ts=MODEL_TARGET_SIZE[type]||2.2;
    group.scale.setScalar(ts/maxDimP);
    group.updateMatrixWorld(true);
    const box2P=new THREE.Box3().setFromObject(group);
    const ctrP=box2P.getCenter(new THREE.Vector3());
    const minP=box2P.min;
    group.position.set(-ctrP.x,-minP.y,-ctrP.z);
  }

  threeMesh=group;
  threeScene.add(threeMesh);
  setModelCredit(PROCEDURAL_CREDITS[type]||'(procedural)');
}

function _buildProceduralCar(mat) {
  const g=new THREE.Group();
  const mk=(geo,m)=>{ const mesh=new THREE.Mesh(geo,m||mat); mesh.castShadow=true; return mesh; };
  const body=mk(new THREE.BoxGeometry(2.4,0.5,1.1)); body.position.y=0.45; g.add(body);
  const cabin=mk(new THREE.BoxGeometry(1.3,0.45,0.95)); cabin.position.set(0.05,0.87,0); g.add(cabin);
  const wGeo=new THREE.CylinderGeometry(0.28,0.28,0.18,32);
  const wMat=new THREE.MeshStandardMaterial({color:0x111111,roughness:0.9});
  [[-0.85,0.28,0.6],[0.85,0.28,0.6],[-0.85,0.28,-0.6],[0.85,0.28,-0.6]].forEach(([x,y,z])=>{
    const w=new THREE.Mesh(wGeo,wMat); w.rotation.z=Math.PI/2; w.position.set(x,y,z); w.castShadow=true; g.add(w);
  });
  return g;
}

function _buildProceduralMotorbike(mat) {
  // High-detail sport motorcycle procedural model
  const g = new THREE.Group();
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.3 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 1.0 });
  const blackMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.1 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95, metalness: 0.0 });

  const mk = (geo, m) => {
    const mesh = new THREE.Mesh(geo, m || mat);
    mesh.castShadow = true;
    return mesh;
  };

  // ── WHEELS ──────────────────────────────────────────────────────────────
  const wheelR = 0.40;
  const wheelT = 0.12;
  const spokeR = 0.02;
  const wGeo = new THREE.TorusGeometry(wheelR, wheelT, 20, 64);

  const makeWheel = (x) => {
    const wGroup = new THREE.Group();
    // Tire
    const tire = new THREE.Mesh(wGeo, rubberMat);
    tire.castShadow = true;
    wGroup.add(tire);
    // Rim disk
    const rimGeo = new THREE.CylinderGeometry(wheelR * 0.7, wheelR * 0.7, 0.03, 24);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    wGroup.add(rim);
    // Hub
    const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16);
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    hub.rotation.x = Math.PI / 2;
    wGroup.add(hub);
    // Spokes (5)
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const spokeGeo = new THREE.CylinderGeometry(spokeR, spokeR, wheelR * 0.9, 8);
      const spoke = new THREE.Mesh(spokeGeo, chromeMat);
      spoke.position.set(Math.cos(ang) * wheelR * 0.38, 0, Math.sin(ang) * wheelR * 0.38);
      spoke.rotation.z = Math.PI / 2 - ang;
      spoke.rotation.x = Math.PI / 2;
      spoke.castShadow = true;
      wGroup.add(spoke);
    }
    wGroup.position.set(x, wheelR, 0);
    return wGroup;
  };

  g.add(makeWheel(0.85));   // rear wheel
  g.add(makeWheel(-0.85));  // front wheel

  // ── FRAME (tubular) ─────────────────────────────────────────────────────
  const makeFrame = (w, h, d, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    const mesh = mk(new THREE.BoxGeometry(w, h, d), chromeMat);
    mesh.position.set(px, py, pz);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };
  // Main horizontal beam
  g.add(makeFrame(1.8, 0.07, 0.07, 0, 0.82, 0));
  // Down-tube (angled)
  const dt = mk(new THREE.BoxGeometry(0.06, 0.65, 0.06), chromeMat);
  dt.position.set(-0.1, 0.52, 0); dt.rotation.z = 0.5; g.add(dt);
  // Seat stay (rear)
  const ss = mk(new THREE.BoxGeometry(0.06, 0.42, 0.06), chromeMat);
  ss.position.set(0.55, 0.62, 0); ss.rotation.z = -0.3; g.add(ss);

  // ── ENGINE BLOCK ────────────────────────────────────────────────────────
  const eng = mk(new THREE.BoxGeometry(0.38, 0.34, 0.30), blackMat);
  eng.position.set(0.05, 0.50, 0); g.add(eng);
  // Cylinder head (vertical)
  const cyl = mk(new THREE.CylinderGeometry(0.09, 0.10, 0.30, 12), blackMat);
  cyl.position.set(0.0, 0.73, 0); g.add(cyl);
  // Exhaust pipe
  const exhGeo = new THREE.CylinderGeometry(0.035, 0.028, 1.1, 12);
  const exh = new THREE.Mesh(exhGeo, chromeMat);
  exh.position.set(0.42, 0.34, -0.12);
  exh.rotation.z = Math.PI / 2;
  exh.castShadow = true;
  g.add(exh);
  // Exhaust muffler
  const muf = mk(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 12), chromeMat);
  muf.position.set(0.98, 0.34, -0.12); muf.rotation.z = Math.PI / 2; g.add(muf);

  // ── FUEL TANK ───────────────────────────────────────────────────────────
  // Sport-bike teardrop tank shape using merged boxes
  const tankGrp = new THREE.Group();
  const tMain = mk(new THREE.BoxGeometry(0.58, 0.22, 0.28), mat);
  tMain.position.set(0, 0, 0); tankGrp.add(tMain);
  const tNose = mk(new THREE.BoxGeometry(0.25, 0.18, 0.22), mat);
  tNose.position.set(-0.28, -0.01, 0); tankGrp.add(tNose);
  tankGrp.position.set(0.02, 0.98, 0);
  g.add(tankGrp);

  // ── FAIRING (front bodywork) ─────────────────────────────────────────────
  // Upper fairing
  const fairUpper = mk(new THREE.BoxGeometry(0.18, 0.30, 0.36), mat);
  fairUpper.position.set(-0.82, 0.85, 0); g.add(fairUpper);
  // Lower fairing
  const fairLower = mk(new THREE.BoxGeometry(0.15, 0.22, 0.30), mat);
  fairLower.position.set(-0.68, 0.56, 0); g.add(fairLower);
  // Windscreen (dark)
  const screen = mk(new THREE.BoxGeometry(0.05, 0.18, 0.28), darkMat);
  screen.position.set(-0.88, 1.0, 0); g.add(screen);
  // Headlight
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffeedd, roughness: 0.05, metalness: 0.0, emissive: 0xffffcc, emissiveIntensity: 0.3 });
  const hl = mk(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), headlightMat);
  hl.rotation.z = Math.PI / 2; hl.position.set(-0.92, 0.82, 0); g.add(hl);

  // ── SEAT & TAIL ──────────────────────────────────────────────────────────
  // Seat
  const seat = mk(new THREE.BoxGeometry(0.55, 0.06, 0.24), blackMat);
  seat.position.set(0.35, 1.0, 0); g.add(seat);
  // Tail fairing
  const tail = mk(new THREE.BoxGeometry(0.38, 0.18, 0.20), mat);
  tail.position.set(0.78, 0.88, 0); g.add(tail);
  // Tail light
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.1, emissive: 0xff1100, emissiveIntensity: 0.4 });
  const tl = mk(new THREE.BoxGeometry(0.04, 0.06, 0.14), taillightMat);
  tl.position.set(0.97, 0.92, 0); g.add(tl);

  // ── HANDLEBARS ───────────────────────────────────────────────────────────
  const hbar = mk(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), chromeMat);
  hbar.rotation.z = Math.PI / 2; hbar.position.set(-0.78, 1.08, 0); g.add(hbar);
  // Fork legs
  [[-0.08, 0], [0.08, 0]].forEach(([oz]) => {
    const fk = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.48, 10), chromeMat);
    fk.position.set(-0.82, 0.65, oz); g.add(fk);
  });

  // ── SWING ARM (rear suspension) ──────────────────────────────────────────
  const swArm = mk(new THREE.BoxGeometry(0.72, 0.07, 0.06), chromeMat);
  swArm.position.set(0.6, 0.62, 0); swArm.rotation.z = 0.05; g.add(swArm);

  return g;
}

function _buildProceduralHelmet(mat) {
  const g=new THREE.Group();
  const dome=new THREE.Mesh(new THREE.SphereGeometry(0.75,64,64,0,Math.PI*2,0,Math.PI*0.75),mat);
  dome.castShadow=true; g.add(dome);
  const chin=new THREE.Mesh(new THREE.TorusGeometry(0.6,0.14,16,32,Math.PI),mat);
  chin.rotation.x=Math.PI/2; chin.position.y=-0.3; chin.castShadow=true; g.add(chin);
  g.position.y=0.7;
  return g;
}

function setEnvironment(env) {
  currentEnv=env;
  if(!threeScene) return;
  const envs={
    studio:   {bg:0x1a1a1a,ambient:0.6,light:2.2,exposure:1.2},
    outdoor:  {bg:0x87ceeb,ambient:1.0,light:1.8,exposure:1.1},
    showroom: {bg:0x0d0d0d,ambient:0.35,light:2.8,exposure:1.3},
    night:    {bg:0x020408,ambient:0.18,light:1.4,exposure:1.8},
  };
  const cfg=envs[env]||envs.studio;
  threeScene.background=new THREE.Color(cfg.bg);
  if(threeEnvLight) threeEnvLight.intensity=cfg.ambient;
  if(threePointLight) threePointLight.intensity=cfg.light;
  if(threeRenderer) threeRenderer.toneMappingExposure=cfg.exposure;
}

function startThreeLoop() {
  function loop() {
    requestAnimationFrame(loop);
    if(!threeRenderer||!threeScene||!threeCamera) return;
    const angle3d=((document.getElementById('3d-light-angle')?.value||45)*Math.PI)/180;
    const height3d=(document.getElementById('3d-light-height')?.value||70)/100*6;
    if(threePointLight) threePointLight.position.set(Math.cos(angle3d)*5,height3d,Math.sin(angle3d)*5);
    if(autoSpin) rotY+=0.008;
    if(threeMesh) { threeMesh.rotation.x=rotX; threeMesh.rotation.y=rotY; }
    const camY=MODEL_CAM[currentModel]?.[3]??0.6;
    const lookY=MODEL_CAM[currentModel]?.[4]??0.3;
    threeCamera.position.set(0,camY,distance);
    threeCamera.lookAt(0,lookY,0);
    threeRenderer.render(threeScene,threeCamera);
  }
  requestAnimationFrame(loop);
}

function update3DFromState() {
  if(!threeInitialized||!threeMat) return;
  const texture=new THREE.CanvasTexture(buildPaintTexture());
  texture.wrapS=THREE.RepeatWrapping; texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(currentModel==='sphere'?1:2,currentModel==='sphere'?1:2);
  const rough=(document.getElementById('3d-roughness')?.value||30)/100;
  const metal=(document.getElementById('3d-metalness')?.value||20)/100;
  const cc=(document.getElementById('3d-clearcoat')?.value||80)/100;
  threeMat.map=texture; threeMat.roughness=rough; threeMat.metalness=metal; threeMat.clearcoat=cc; threeMat.needsUpdate=true;
  // Re-apply material to all meshes in group (handles GLB models)
  if(threeMesh) applyPaintToGroup(threeMesh, threeMat, false);
}

// Load a saved palette item into 3D preview
function testPaletteIn3D(item) {
  // Apply saved colours to state
  state.colors=item.colors.map(c=>({...c,id:uid()}));
  buildColorSlots();
  // Apply saved effect if any
  if(item.effectId) {
    const eff=EFFECTS.find(e=>e.id===item.effectId);
    if(eff) {
      state.activeEffect=eff;
      state.effectParams=item.effectParams?{...item.effectParams}:{};
      eff.params.forEach(p=>{ if(!(p.id in state.effectParams)) state.effectParams[p.id]=p.default; });
      buildEffectParams(eff);
      // Mark effect card as selected
      document.querySelectorAll('.effect-card').forEach(c=>c.classList.remove('selected'));
      document.querySelector(`.effect-card[data-effect-id="${eff.id}"]`)?.classList.add('selected');
    }
  }
  // Navigate to 3D tab
  const pills=document.querySelectorAll('.nav-pill');
  pills.forEach(p=>{ if(p.textContent.trim()==='3D Preview') p.click(); });
  // Wait for tab switch, then refresh 3D
  setTimeout(()=>{
    if(!threeInitialized) { initThreeJS(); setTimeout(()=>update3DFromState(),400); }
    else update3DFromState();
    showToast(`Testing ${item.hex.toUpperCase()} in 3D`);
  },100);
}

// 3D UI controls
document.querySelectorAll('.model-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.model-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(threeInitialized) buildModel(btn.dataset.model);
    else { initThreeJS(); setTimeout(()=>buildModel(btn.dataset.model),200); }
  });
});
document.querySelectorAll('.env-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.env-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setEnvironment(btn.dataset.env);
  });
});
['3d-light-angle','3d-light-height','3d-roughness','3d-metalness','3d-clearcoat'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',()=>update3DFromState());
});
document.getElementById('btn-3d-reset')?.addEventListener('click',()=>{
  const c=MODEL_CAM[currentModel]||MODEL_CAM.car; rotX=c[0]; rotY=c[1]; distance=c[2];
});
document.getElementById('btn-3d-spin')?.addEventListener('click',()=>{ autoSpin=!autoSpin; document.getElementById('btn-3d-spin').textContent=autoSpin?'Stop Spin':'Auto Spin'; });
document.getElementById('btn-3d-screenshot')?.addEventListener('click',()=>{
  if(!threeRenderer) return;
  threeRenderer.render(threeScene,threeCamera);
  const link=document.createElement('a'); link.download=`3d-preview-${Date.now()}.png`; link.href=threeRenderer.domElement.toDataURL('image/png'); link.click();
  showToast('Snapshot saved!');
});

// ---- TOAST ----
let toastTimer=null;
function showToast(msg) {
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}

// ---- INIT ----
buildColorSlots();
const noneEffect=EFFECTS[0];
state.activeEffect=noneEffect;
state.effectParams={};
renderPreview();
renderEffectPreview();
startLoop();

// Re-render on resize for HiDPI correctness
window.addEventListener('resize',()=>{ renderPreview(); renderEffectPreview(); });
