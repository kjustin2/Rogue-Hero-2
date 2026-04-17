// Cosmetics.js — Cosmetic loot box system definitions, roll logic, and canvas helpers

export const RARITY_COLORS = {
  common:    '#aaaaaa',
  uncommon:  '#4488dd',
  rare:      '#aa44ee',
  legendary: '#ffaa00',
  superleg:  '#ff44ff',
};

export const RARITY_LABELS = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
  superleg:  'SUPER LEGENDARY',
};

export const CATEGORY_LABELS = {
  bodyColor:   'Body Color',
  outlineColor:'Outline',
  shape:       'Shape',
  trail:       'Trail',
  flash:       'Hit Flash',
  deathBurst:  'Death Burst',
  aura:        'Aura',
  killEffect:  'Kill Effect',
  title:       'Title',
};

export const BOX_TIERS = {
  bronze:    { cost: 50,   label: 'Bronze Box',    color: '#cc8844', glowColor: '#ffaa66' },
  silver:    { cost: 150,  label: 'Silver Box',    color: '#aaaacc', glowColor: '#ddddff' },
  gold:      { cost: 400,  label: 'Gold Box',      color: '#ddaa00', glowColor: '#ffdd44' },
  prismatic: { cost: 1200, label: 'Prismatic Box', color: '#cc44ff', glowColor: '#ff88ff' },
  shadowed:  { cost: 250,  label: 'Shadowed Box',  color: '#2a1a44', glowColor: '#9955ee',
               categoryFilter: ['aura','flash','deathBurst','killEffect'] },
  elemental: { cost: 300,  label: 'Elemental Box', color: '#103020', glowColor: '#44ee88',
               categoryFilter: ['bodyColor','trail','aura'] },
  infernal:  { cost: 350,  label: 'Infernal Box',  color: '#3a0800', glowColor: '#ff5511',
               categoryFilter: ['bodyColor','trail','flash','deathBurst'] },
  shapebox:  { cost: 200,  label: 'Shape Box',     color: '#0f1830', glowColor: '#4499ff',
               categoryFilter: ['shape','outlineColor'] },
};

export const BOX_WEIGHTS = {
  bronze:    { common: 60,  uncommon: 28, rare: 10, legendary: 1.5, superleg: 0.5 },
  silver:    { common: 30,  uncommon: 40, rare: 24, legendary: 5,   superleg: 1   },
  gold:      { common: 0,   uncommon: 20, rare: 55, legendary: 23,  superleg: 2   },
  prismatic: { common: 0,   uncommon: 0,  rare: 30, legendary: 60,  superleg: 10  },
  shadowed:  { common: 0,   uncommon: 30, rare: 52, legendary: 16,  superleg: 2   },
  elemental: { common: 20,  uncommon: 40, rare: 32, legendary: 7,   superleg: 1   },
  infernal:  { common: 10,  uncommon: 35, rare: 42, legendary: 11,  superleg: 2   },
  shapebox:  { common: 40,  uncommon: 38, rare: 18, legendary: 3,   superleg: 1   },
};

// ── Cosmetic Definitions ────────────────────────────────────────────────────────

export const CosmeticDefinitions = [

  // ── BODY COLORS (28) ──
  { id:'body_ash',       name:'Ash Grey',          category:'bodyColor', rarity:'common',    value:'#999999' },
  { id:'body_sand',      name:'Sand',              category:'bodyColor', rarity:'common',    value:'#c8a87a' },
  { id:'body_ice',       name:'Ice Blue',          category:'bodyColor', rarity:'common',    value:'#88ccee' },
  { id:'body_mint',      name:'Mint',              category:'bodyColor', rarity:'common',    value:'#66ddaa' },
  { id:'body_white',     name:'Bleached',          category:'bodyColor', rarity:'common',    value:'#e8e8e8' },
  { id:'body_ember',     name:'Ember Orange',      category:'bodyColor', rarity:'common',    value:'#ee7722' },
  { id:'body_olive',     name:'Olive',             category:'bodyColor', rarity:'common',    value:'#889944' },
  { id:'body_slate',     name:'Slate',             category:'bodyColor', rarity:'common',    value:'#667788' },
  { id:'body_rose',      name:'Dusty Rose',        category:'bodyColor', rarity:'common',    value:'#cc8899' },
  { id:'body_teal',      name:'Teal',              category:'bodyColor', rarity:'common',    value:'#228888' },
  { id:'body_crimson',   name:'Crimson Shell',     category:'bodyColor', rarity:'uncommon',  value:'#cc2222' },
  { id:'body_violet',    name:'Violet Dusk',       category:'bodyColor', rarity:'uncommon',  value:'#8844cc' },
  { id:'body_midnight',  name:'Midnight',          category:'bodyColor', rarity:'uncommon',  value:'#112244' },
  { id:'body_plasma',    name:'Plasma Pink',       category:'bodyColor', rarity:'uncommon',  value:'#ee44aa' },
  { id:'body_copper',    name:'Burnished Copper',  category:'bodyColor', rarity:'uncommon',  value:'#bb6633' },
  { id:'body_seafoam',   name:'Seafoam',           category:'bodyColor', rarity:'uncommon',  value:'#33bb99' },
  { id:'body_lavender',  name:'Lavender',          category:'bodyColor', rarity:'uncommon',  value:'#aa88cc' },
  { id:'body_scarlet',   name:'Scarlet',           category:'bodyColor', rarity:'uncommon',  value:'#dd1144' },
  { id:'body_void',      name:'Void Black',        category:'bodyColor', rarity:'rare',      value:'#0a0a12' },
  { id:'body_gold',      name:'Gilded',            category:'bodyColor', rarity:'rare',      value:'#ddaa00' },
  { id:'body_toxic',     name:'Toxic Green',       category:'bodyColor', rarity:'rare',      value:'#44ff22' },
  { id:'body_obsidian',  name:'Obsidian',          category:'bodyColor', rarity:'rare',      value:'#1a1a2e' },
  { id:'body_neon_blue', name:'Neon Blue',         category:'bodyColor', rarity:'rare',      value:'#0044ff' },
  { id:'body_blood',     name:'Blood Pact',        category:'bodyColor', rarity:'rare',      value:'#880000' },
  { id:'body_aurora',    name:'Aurora',            category:'bodyColor', rarity:'legendary', value:'#44ffcc' },
  { id:'body_solargold', name:'Solar Gold',        category:'bodyColor', rarity:'legendary', value:'#ffdd44' },
  { id:'body_voidpulse', name:'Void Pulse',        category:'bodyColor', rarity:'legendary', value:'#220033' },
  {
    id:'body_prism', name:'Prismatic', category:'bodyColor', rarity:'superleg', value:null, animated:true,
    animFn:(ctx,x,y,r,t) => {
      ctx.fillStyle = `hsl(${(t*60)%360},90%,55%)`;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  },

  // ── OUTLINE COLORS (18) ──
  { id:'outline_silver',   name:'Silver Rim',     category:'outlineColor', rarity:'common',    value:'#aaaaaa' },
  { id:'outline_white',    name:'Clean White',    category:'outlineColor', rarity:'common',    value:'#ffffff' },
  { id:'outline_dark',     name:'Dark Edge',      category:'outlineColor', rarity:'common',    value:'#333333' },
  { id:'outline_tan',      name:'Warm Tan',       category:'outlineColor', rarity:'common',    value:'#aa8866' },
  { id:'outline_sky',      name:'Sky Blue',       category:'outlineColor', rarity:'common',    value:'#66aadd' },
  { id:'outline_neon',     name:'Neon Pink',      category:'outlineColor', rarity:'uncommon',  value:'#ff44aa' },
  { id:'outline_lime',     name:'Lime',           category:'outlineColor', rarity:'uncommon',  value:'#88ff22' },
  { id:'outline_orange',   name:'Ember Ring',     category:'outlineColor', rarity:'uncommon',  value:'#ff8800' },
  { id:'outline_cyan',     name:'Cyan Streak',    category:'outlineColor', rarity:'uncommon',  value:'#00ddff' },
  { id:'outline_crimson',  name:'Crimson Band',   category:'outlineColor', rarity:'uncommon',  value:'#ee2222' },
  { id:'outline_void',     name:'Shadow Rim',     category:'outlineColor', rarity:'rare',      value:'#220044' },
  { id:'outline_gold',     name:'Gold Band',      category:'outlineColor', rarity:'rare',      value:'#ffcc00' },
  { id:'outline_electric', name:'Electric',       category:'outlineColor', rarity:'rare',      value:'#4400ff' },
  { id:'outline_toxic',    name:'Toxic Ring',     category:'outlineColor', rarity:'rare',      value:'#44ff00' },
  {
    id:'outline_pulse', name:'Pulse Ring', category:'outlineColor', rarity:'legendary', value:'#aa44ff', animated:true,
    animFn:(ctx,x,y,r,t) => {
      ctx.strokeStyle='#aa44ff'; ctx.lineWidth=2+Math.sin(t*3)*1.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_fire', name:'Fire Band', category:'outlineColor', rarity:'legendary', value:'#ff6600', animated:true,
    animFn:(ctx,x,y,r,t) => {
      const f=(Math.sin(t*20)+1)*0.5;
      ctx.strokeStyle=`hsl(${20+f*20},100%,${50+f*15}%)`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_rainbow', name:'Rainbow Band', category:'outlineColor', rarity:'legendary', value:'#ff0000', animated:true,
    animFn:(ctx,x,y,r,t) => {
      ctx.strokeStyle=`hsl(${(t*120)%360},100%,60%)`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_void_rift', name:'Void Rift Band', category:'outlineColor', rarity:'superleg', value:'#3c0050', animated:true,
    animFn:(ctx,x,y,r,t) => {
      const phase=t%4; let alpha=0.15;
      if(phase>3.5) alpha=Math.min(0.9,(phase-3.5)*18);
      else if(phase>3.42) alpha=0.9;
      ctx.strokeStyle=`rgba(255,255,255,${alpha})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },

  // ── SHAPES (16) ──
  { id:'shape_circle',   name:'Default Circle', category:'shape', rarity:'common',    value:'circle'   },
  { id:'shape_square',   name:'Block',          category:'shape', rarity:'common',    value:'square'   },
  { id:'shape_wide',     name:'Wide Circle',    category:'shape', rarity:'common',    value:'wide'     },
  { id:'shape_tall',     name:'Tall Circle',    category:'shape', rarity:'common',    value:'tall'     },
  { id:'shape_teardrop', name:'Teardrop',       category:'shape', rarity:'uncommon',  value:'teardrop' },
  { id:'shape_triangle', name:'Triangle',       category:'shape', rarity:'uncommon',  value:'triangle' },
  { id:'shape_pentagon', name:'Pentagon',       category:'shape', rarity:'uncommon',  value:'pentagon' },
  { id:'shape_cross',    name:'Plus Sign',      category:'shape', rarity:'uncommon',  value:'cross'    },
  { id:'shape_diamond',  name:'Diamond',        category:'shape', rarity:'rare',      value:'diamond'  },
  { id:'shape_hexagon',  name:'Hexagon',        category:'shape', rarity:'rare',      value:'hexagon'  },
  { id:'shape_arrow',    name:'Arrow',          category:'shape', rarity:'rare',      value:'arrow'    },
  { id:'shape_crescent', name:'Crescent',       category:'shape', rarity:'rare',      value:'crescent' },
  { id:'shape_star',     name:'Star',           category:'shape', rarity:'legendary', value:'star5'    },
  { id:'shape_star6',    name:'Hex Star',       category:'shape', rarity:'legendary', value:'star6'    },
  { id:'shape_gear',     name:'Gear',           category:'shape', rarity:'legendary', value:'gear'     },
  {
    id:'shape_fractal', name:'Fractal Burst', category:'shape', rarity:'superleg', value:'fractal', animated:true,
    animFn:(ctx,x,y,r,t,fillColor) => {
      const lerp=(Math.sin(t*Math.PI)+1)*0.5;
      const pts=12;
      ctx.beginPath();
      for(let i=0;i<pts*2;i++){
        const angle=(i/(pts*2))*Math.PI*2-Math.PI/2;
        const isOuter=i%2===0;
        const baseR=isOuter?r:r*0.5;
        const jagged=isOuter?r+lerp*r*0.7:r*0.35;
        const rad=baseR+(jagged-baseR)*lerp;
        const px=x+Math.cos(angle)*rad, py=y+Math.sin(angle)*rad;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fillStyle=fillColor||'#44dd88';
      ctx.fill();
    }
  },

  // ── TRAILS (16) ──
  { id:'trail_white',     name:'Faint White',   category:'trail', rarity:'common',    value:'rgba(255,255,255,0.3)'  },
  { id:'trail_grey',      name:'Smoke',         category:'trail', rarity:'common',    value:'rgba(150,150,150,0.35)' },
  { id:'trail_ice',       name:'Ice Mist',      category:'trail', rarity:'common',    value:'rgba(136,204,238,0.4)'  },
  { id:'trail_ember',     name:'Ember',         category:'trail', rarity:'common',    value:'rgba(238,119,34,0.4)'   },
  { id:'trail_sand',      name:'Dust',          category:'trail', rarity:'common',    value:'rgba(200,168,100,0.3)'  },
  { id:'trail_rose',      name:'Rose Mist',     category:'trail', rarity:'common',    value:'rgba(238,136,153,0.35)' },
  { id:'trail_shadow',    name:'Shadow',        category:'trail', rarity:'uncommon',  value:'rgba(20,0,40,0.5)'      },
  { id:'trail_frost',     name:'Frost',         category:'trail', rarity:'uncommon',  value:'rgba(100,200,255,0.5)'  },
  { id:'trail_toxic',     name:'Toxic',         category:'trail', rarity:'uncommon',  value:'rgba(68,255,34,0.45)'   },
  { id:'trail_crimson',   name:'Blood Trail',   category:'trail', rarity:'uncommon',  value:'rgba(180,0,0,0.45)'     },
  { id:'trail_gold',      name:'Gold Rush',     category:'trail', rarity:'rare',      value:'rgba(255,200,0,0.5)'    },
  { id:'trail_void',      name:'Void Rift',     category:'trail', rarity:'rare',      value:'rgba(30,0,60,0.6)'      },
  { id:'trail_electric',  name:'Electric Arc',  category:'trail', rarity:'rare',      value:'rgba(100,140,255,0.55)' },
  { id:'trail_neon',      name:'Neon Streak',   category:'trail', rarity:'rare',      value:'rgba(255,0,180,0.55)'   },
  { id:'trail_supernova', name:'Supernova',     category:'trail', rarity:'legendary', value:'rgba(255,200,50,0.6)'   },
  {
    id:'trail_prism', name:'Prismatic Rift', category:'trail', rarity:'superleg', value:'prism', animated:true,
    getColor:(t) => `hsl(${(t*80)%360},100%,60%)`
  },

  // ── HIT FLASH (10) ──
  { id:'flash_white',  name:'Clean White',   category:'flash', rarity:'common',    value:'#ffffff' },
  { id:'flash_yellow', name:'Yellow Strike', category:'flash', rarity:'common',    value:'#ffee44' },
  { id:'flash_orange', name:'Orange Flare',  category:'flash', rarity:'common',    value:'#ff8800' },
  { id:'flash_teal',   name:'Teal Pop',      category:'flash', rarity:'common',    value:'#44ddbb' },
  { id:'flash_pink',   name:'Pink Burst',    category:'flash', rarity:'uncommon',  value:'#ff44cc' },
  { id:'flash_lime',   name:'Lime Snap',     category:'flash', rarity:'uncommon',  value:'#88ff00' },
  { id:'flash_gold',   name:'Gold Burst',    category:'flash', rarity:'uncommon',  value:'#ffcc00' },
  { id:'flash_violet', name:'Violet Pulse',  category:'flash', rarity:'rare',      value:'#aa00ff' },
  { id:'flash_void',   name:'Void Strike',   category:'flash', rarity:'rare',      value:'#000000' },
  {
    id:'flash_prism', name:'Prism Hit', category:'flash', rarity:'superleg', value:'prism', animated:true,
    getFlashColor:() => `hsl(${((window._prismHitIndex=(window._prismHitIndex||0)+1)*45)%360},100%,65%)`
  },

  // ── DEATH BURST (6) ──
  { id:'burst_orange', name:'Ember Burst',   category:'deathBurst', rarity:'common',    value:'#ee7722' },
  { id:'burst_blue',   name:'Frost Shatter', category:'deathBurst', rarity:'common',    value:'#88ccee' },
  { id:'burst_green',  name:'Toxic Pop',     category:'deathBurst', rarity:'uncommon',  value:'#44ff22' },
  { id:'burst_violet', name:'Shadow Burst',  category:'deathBurst', rarity:'rare',      value:'#5500aa' },
  { id:'burst_gold',   name:'Gold Shatter',  category:'deathBurst', rarity:'legendary', value:'#ffcc00' },
  { id:'burst_void',   name:'Void Collapse', category:'deathBurst', rarity:'superleg',  value:'#110022' },

  // ── AURA (6) ──
  { id:'aura_faint_blue',   name:'Ice Halo',      category:'aura', rarity:'common',    value:'faint_blue'   },
  { id:'aura_faint_gold',   name:'Warm Halo',     category:'aura', rarity:'common',    value:'faint_gold'   },
  { id:'aura_pulse_purple', name:'Pulse Ring',    category:'aura', rarity:'rare',      value:'pulse_purple' },
  { id:'aura_fire',         name:'Fire Halo',     category:'aura', rarity:'legendary', value:'fire'         },
  { id:'aura_void',         name:'Void Aura',     category:'aura', rarity:'legendary', value:'void'         },
  {
    id:'aura_reactive', name:'Reactive Crown', category:'aura', rarity:'superleg', value:'reactive', animated:true,
  },

  // ── NEW BODY COLORS ──
  { id:'body_sakura',    name:'Sakura Pink',  category:'bodyColor', rarity:'common',    value:'#ffb8c6' },
  { id:'body_forest',    name:'Forest',       category:'bodyColor', rarity:'common',    value:'#2d5a1b' },
  { id:'body_rust',      name:'Rust',         category:'bodyColor', rarity:'common',    value:'#8b4513' },
  { id:'body_ivory',     name:'Ivory',        category:'bodyColor', rarity:'common',    value:'#f0ead6' },
  { id:'body_magenta',   name:'Magenta',      category:'bodyColor', rarity:'uncommon',  value:'#ee00cc' },
  { id:'body_storm',     name:'Storm Grey',   category:'bodyColor', rarity:'uncommon',  value:'#4a5568' },
  { id:'body_lime2',     name:'Limelight',    category:'bodyColor', rarity:'uncommon',  value:'#aaff00' },
  { id:'body_ocean',     name:'Deep Ocean',   category:'bodyColor', rarity:'rare',      value:'#002244' },
  { id:'body_neon_yel',  name:'Neon Yellow',  category:'bodyColor', rarity:'rare',      value:'#ddff00' },
  {
    id:'body_starfield', name:'Starfield', category:'bodyColor', rarity:'legendary', value:null, animated:true,
    animFn:(ctx,x,y,r,t)=>{
      ctx.fillStyle='#010110'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      for(let i=0;i<8;i++){
        const a=(i/8)*Math.PI*2+t*0.18;
        const d=r*(0.25+0.55*((i*0.618)%1));
        const alpha=0.4+0.6*Math.sin(t*2.5+i*1.3);
        ctx.fillStyle=`rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x+Math.cos(a+(i*1.31))*d, y+Math.sin(a+(i*1.31))*d, 1.5, 0, Math.PI*2); ctx.fill();
      }
    }
  },
  {
    id:'body_lava', name:'Lava Flow', category:'bodyColor', rarity:'legendary', value:null, animated:true,
    animFn:(ctx,x,y,r,t)=>{
      const h=(t*25)%360;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`hsl(${h},100%,65%)`);
      g.addColorStop(0.55,`hsl(${(h+18)%360},90%,38%)`);
      g.addColorStop(1,'#110000');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  },
  {
    id:'body_nebula', name:'Nebula', category:'bodyColor', rarity:'superleg', value:null, animated:true,
    animFn:(ctx,x,y,r,t)=>{
      const h=(t*12)%360;
      const g=ctx.createRadialGradient(x-r*0.3,y-r*0.2,0,x,y,r);
      g.addColorStop(0,`hsl(${(h+60)%360},85%,62%)`);
      g.addColorStop(0.5,`hsl(${h},90%,30%)`);
      g.addColorStop(1,`hsl(${(h+120)%360},70%,12%)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      for(let i=0;i<5;i++){
        const sa=(i/5)*Math.PI*2+t*0.35;
        const sd=r*(0.35+0.45*((i*0.7+0.1)%1));
        const alpha=0.25+0.35*Math.sin(t*2.2+i);
        ctx.fillStyle=`rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x+Math.cos(sa)*sd, y+Math.sin(sa)*sd, 1.5, 0, Math.PI*2); ctx.fill();
      }
    }
  },

  // ── NEW OUTLINE COLORS ──
  { id:'outline_neon_grn',  name:'Neon Green',    category:'outlineColor', rarity:'rare',      value:'#00ff44' },
  { id:'outline_gold_foil', name:'Gold Foil',     category:'outlineColor', rarity:'uncommon',  value:'#ccaa33' },
  {
    id:'outline_dashed', name:'Dashed Ring', category:'outlineColor', rarity:'uncommon', value:'#8888ff', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      ctx.save(); ctx.setLineDash([5,5]); ctx.lineDashOffset=-t*18;
      ctx.strokeStyle='#8888ff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
  },
  {
    id:'outline_double', name:'Double Ring', category:'outlineColor', rarity:'rare', value:'#44aaff', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      ctx.strokeStyle='rgba(68,170,255,0.75)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='rgba(68,170,255,0.3)'; ctx.lineWidth=5;
      ctx.beginPath(); ctx.arc(x,y,r+5,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_ghost', name:'Ghost Flicker', category:'outlineColor', rarity:'legendary', value:'#ccccff', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      const flicker=Math.sin(t*47)>-0.15?1:0;
      ctx.strokeStyle=`rgba(200,200,255,${flicker*0.85})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_gradient', name:'Gradient Band', category:'outlineColor', rarity:'legendary', value:'#ff8844', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      ctx.strokeStyle=`hsl(${(t*45)%360},100%,62%)`; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_ice_spikes', name:'Ice Spikes', category:'outlineColor', rarity:'rare', value:'#88ddff', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      const lw=1.5+Math.pow(Math.abs(Math.sin(t*5.5)),2)*2.5;
      ctx.strokeStyle='#88ddff'; ctx.lineWidth=lw;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },
  {
    id:'outline_void_drain', name:'Void Drain', category:'outlineColor', rarity:'superleg', value:'#220033', animated:true,
    animFn:(ctx,x,y,r,t)=>{
      const g=ctx.createRadialGradient(x,y,r-2,x,y,r+14);
      g.addColorStop(0,'rgba(0,0,0,0)');
      g.addColorStop(0.45,'rgba(30,0,50,0.55)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r+14,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(120,0,200,0.65)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    }
  },

  // ── NEW SHAPES ──
  { id:'shape_octagon',  name:'Octagon',    category:'shape', rarity:'uncommon', value:'octagon'  },
  { id:'shape_lightning',name:'Lightning',  category:'shape', rarity:'rare',     value:'lightning'},
  { id:'shape_shield',   name:'Shield',     category:'shape', rarity:'rare',     value:'shield'   },
  { id:'shape_leaf',     name:'Leaf',       category:'shape', rarity:'uncommon', value:'leaf'     },
  { id:'shape_comet',    name:'Comet',      category:'shape', rarity:'rare',     value:'comet'    },
  {
    id:'shape_ripple', name:'Ripple', category:'shape', rarity:'legendary', value:'ripple', animated:true,
    animFn:(ctx,x,y,r,t,fillColor)=>{
      const pts=48;
      ctx.beginPath();
      for(let i=0;i<=pts;i++){
        const a=(i/pts)*Math.PI*2;
        const wave=1+0.2*Math.sin(a*5+t*5);
        const px=x+Math.cos(a)*r*wave, py=y+Math.sin(a)*r*wave;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fillStyle=fillColor||'#44dd88'; ctx.fill();
    }
  },
  {
    id:'shape_vortex', name:'Vortex', category:'shape', rarity:'superleg', value:'vortex', animated:true,
    animFn:(ctx,x,y,r,t,fillColor)=>{
      const pts=6, rot=t*2.2;
      ctx.beginPath();
      for(let i=0;i<pts*2;i++){
        const a=(i/(pts*2))*Math.PI*2+rot;
        const rr=i%2===0?r:r*0.36;
        const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fillStyle=fillColor||'#44dd88'; ctx.fill();
    }
  },

  // ── NEW TRAILS ──
  { id:'trail_cherry',   name:'Cherry Blossom', category:'trail', rarity:'uncommon',  value:'rgba(255,180,210,0.42)' },
  { id:'trail_lightning2',name:'Lightning',     category:'trail', rarity:'rare',      value:'rgba(140,180,255,0.62)' },
  { id:'trail_molten',   name:'Molten',         category:'trail', rarity:'legendary', value:'rgba(255,130,0,0.68)'   },
  { id:'trail_acid',     name:'Acid',           category:'trail', rarity:'rare',      value:'rgba(120,255,0,0.58)'   },
  {
    id:'trail_oil', name:'Oil Slick', category:'trail', rarity:'rare', value:'rgba(40,0,60,0.6)', animated:true,
    getColor:(t)=>`hsla(${(t*90+260)%360},70%,32%,0.65)`
  },
  {
    id:'trail_rainbow2', name:'Rainbow Streak', category:'trail', rarity:'legendary', value:'rgba(255,80,80,0.6)', animated:true,
    getColor:(t)=>`hsl(${(t*55)%360},100%,58%)`
  },
  {
    id:'trail_stardust', name:'Stardust', category:'trail', rarity:'superleg', value:'rgba(255,255,255,0.85)', animated:true,
    getColor:()=>'rgba(255,255,255,0.85)'
  },

  // ── NEW HIT FLASHES ──
  { id:'flash_crimson',  name:'Crimson Snap',  category:'flash', rarity:'uncommon', value:'#cc1122' },
  { id:'flash_arctic',   name:'Arctic Blue',   category:'flash', rarity:'common',   value:'#88ddff' },
  { id:'flash_emerald',  name:'Emerald',       category:'flash', rarity:'uncommon', value:'#00cc66' },
  { id:'flash_dark',     name:'Dark Matter',   category:'flash', rarity:'rare',     value:'#110022' },
  {
    id:'flash_rainbow_pop', name:'Rainbow Pop', category:'flash', rarity:'rare', value:'#ff4444', animated:true,
    getFlashColor:()=>`hsl(${((window._prismHitIndex2=(window._prismHitIndex2||0)+1)*55)%360},100%,62%)`
  },
  {
    id:'flash_lightning_strike', name:'Lightning Strike', category:'flash', rarity:'legendary', value:'#eeeeff', animated:true,
    getFlashColor:()=>'#eeeeff'
  },
  {
    id:'flash_inferno', name:'Inferno', category:'flash', rarity:'legendary', value:'#ff6600', animated:true,
    getFlashColor:()=>`hsl(${20+Math.random()*20},100%,${50+Math.random()*15}%)`
  },

  // ── NEW DEATH BURSTS ──
  { id:'burst_crystal',  name:'Crystal Shatter', category:'deathBurst', rarity:'uncommon', value:'#88ddff' },
  { id:'burst_smoke',    name:'Smoke Cloud',      category:'deathBurst', rarity:'common',   value:'#555566' },
  { id:'burst_energy',   name:'Energy Ring',      category:'deathBurst', rarity:'rare',     value:'#44aaff' },
  { id:'burst_cherry',   name:'Cherry Burst',     category:'deathBurst', rarity:'uncommon', value:'#ff88aa' },
  { id:'burst_lightning2',name:'Lightning Cage',  category:'deathBurst', rarity:'legendary',value:'#aaccff' },
  { id:'burst_fire_nova',name:'Fire Nova',         category:'deathBurst', rarity:'legendary',value:'#ff6600' },
  {
    id:'burst_confetti', name:'Confetti', category:'deathBurst', rarity:'rare', value:'#ff44aa',
    burstColors:['#ff4444','#44ff88','#ffcc00','#44aaff','#ff44cc','#88ff44']
  },
  {
    id:'burst_rainbow_nova', name:'Rainbow Nova', category:'deathBurst', rarity:'superleg', value:'#ffffff',
    burstColors:['#ff2222','#ff8800','#ffff00','#44ff44','#44aaff','#aa44ff','#ff44ff']
  },

  // ── NEW AURAS ──
  { id:'aura_ember',     name:'Ember Halo',    category:'aura', rarity:'common',    value:'ember_halo'    },
  { id:'aura_shadow_veil',name:'Shadow Veil',  category:'aura', rarity:'uncommon',  value:'shadow_veil'   },
  { id:'aura_holy',      name:'Holy Light',    category:'aura', rarity:'rare',      value:'holy_light'    },
  { id:'aura_blood_moon',name:'Blood Moon',    category:'aura', rarity:'rare',      value:'blood_moon'    },
  { id:'aura_thunder',   name:'Thunder Ring',  category:'aura', rarity:'rare',      value:'thunder_ring'  },
  { id:'aura_frost_wreath',name:'Frost Wreath',category:'aura', rarity:'uncommon',  value:'frost_wreath'  },
  { id:'aura_storm',     name:'Storm Cloud',   category:'aura', rarity:'legendary', value:'storm_cloud'   },
  { id:'aura_crystal_crown',name:'Crystal Crown',category:'aura',rarity:'legendary',value:'crystal_crown' },
  { id:'aura_supernova', name:'Supernova Ring',category:'aura', rarity:'superleg',  value:'supernova_ring'},

  // ── KILL EFFECTS ──
  { id:'kill_pop',      name:'Simple Pop',    category:'killEffect', rarity:'common',    value:'simple_pop',    duration:0.38 },
  { id:'kill_sparks',   name:'Spark Burst',   category:'killEffect', rarity:'uncommon',  value:'spark_burst',   duration:0.50 },
  { id:'kill_coins',    name:'Coin Shower',   category:'killEffect', rarity:'uncommon',  value:'coin_shower',   duration:0.70 },
  { id:'kill_freeze',   name:'Freeze Frame',  category:'killEffect', rarity:'rare',      value:'freeze_frame',  duration:0.60 },
  { id:'kill_skull',    name:'Skull Pop',     category:'killEffect', rarity:'rare',      value:'skull_pop',     duration:0.50 },
  { id:'kill_supernova',name:'Supernova',     category:'killEffect', rarity:'legendary', value:'kill_supernova',duration:0.75 },
  { id:'kill_rift',     name:'Rift Tear',     category:'killEffect', rarity:'superleg',  value:'rift_tear',     duration:0.90 },

  // ── TITLES ──
  { id:'title_relentless', name:'The Relentless', category:'title', rarity:'uncommon', value:'The Relentless', color:'#ff8844' },
  { id:'title_glass_cannon',name:'Glass Cannon',  category:'title', rarity:'uncommon', value:'Glass Cannon',  color:'#44ddff' },
  { id:'title_crash_artist',name:'Crash Artist',  category:'title', rarity:'uncommon', value:'Crash Artist',  color:'#ff4422' },
  { id:'title_ghost',       name:'The Ghost',     category:'title', rarity:'rare',     value:'The Ghost',     color:'#ccccff' },
  { id:'title_void_walker', name:'Void Walker',   category:'title', rarity:'rare',     value:'Void Walker',   color:'#9944ff' },
  { id:'title_untouchable', name:'Untouchable',   category:'title', rarity:'rare',     value:'Untouchable',   color:'#88ffee' },
  { id:'title_collector',   name:'The Collector', category:'title', rarity:'rare',     value:'The Collector', color:'#ffcc44' },
  { id:'title_tempo_master',name:'Tempo Master',  category:'title', rarity:'legendary',value:'Tempo Master',  color:'#44aaff' },
  { id:'title_berserker',   name:'Berserker',     category:'title', rarity:'legendary',value:'BERSERKER',     color:'#ff2222' },
  { id:'title_champion',    name:'Champion',      category:'title', rarity:'legendary',value:'Champion',      color:'#ffdd44' },
  {
    id:'title_perfect', name:'Perfect', category:'title', rarity:'superleg', value:'✦ Perfect ✦', color:null,
    animated:true,
    animFn:null  // color handled in render using getPrismaticColor
  },
];

// Fast lookup by id
export const CosmeticById = {};
for (const c of CosmeticDefinitions) CosmeticById[c.id] = c;

// Get a prismatic color for UI elements that need to cycle (pass performance.now()/1000)
export function getPrismaticColor(t, sat=100, lig=60) {
  return `hsl(${(t*60)%360},${sat}%,${lig}%)`;
}

// ── Roll Logic ──────────────────────────────────────────────────────────────────

const RARITY_ORDER = ['common','uncommon','rare','legendary','superleg'];

export function rollBox(tier, ownedIds = []) {
  const tierInfo = BOX_TIERS[tier] || BOX_TIERS.bronze;
  const weights = BOX_WEIGHTS[tier] || BOX_WEIGHTS.bronze;
  const total = RARITY_ORDER.reduce((s,r) => s + (weights[r]||0), 0);
  let roll = Math.random() * total;
  let rarity = 'common';
  for (const r of RARITY_ORDER) {
    roll -= (weights[r]||0);
    if (roll <= 0) { rarity = r; break; }
  }

  let pool = CosmeticDefinitions.filter(c => c.rarity === rarity);
  if (tierInfo.categoryFilter) {
    const filtered = pool.filter(c => tierInfo.categoryFilter.includes(c.category));
    if (filtered.length > 0) pool = filtered;
  }
  const unowned = pool.filter(c => !ownedIds.includes(c.id));
  if (unowned.length > 0) pool = unowned;
  if (pool.length === 0) pool = CosmeticDefinitions.filter(c => c.rarity === rarity);

  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Canvas Drawing Helpers ───────────────────────────────────────────────────────

// Draw a polygon path (does NOT call fill/stroke)
function _polygon(ctx, x, y, r, sides, startAngle=0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i/sides)*Math.PI*2;
    if (i===0) ctx.moveTo(x+Math.cos(a)*r, y+Math.sin(a)*r);
    else ctx.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r);
  }
  ctx.closePath();
}

// Draw a star path (does NOT call fill/stroke)
function _star(ctx, x, y, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points*2; i++) {
    const a = (i/(points*2))*Math.PI*2 - Math.PI/2;
    const r = i%2===0 ? outerR : innerR;
    if (i===0) ctx.moveTo(x+Math.cos(a)*r, y+Math.sin(a)*r);
    else ctx.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r);
  }
  ctx.closePath();
}

// Draw gear path (does NOT call fill/stroke)
function _gear(ctx, x, y, r, teeth) {
  const inner = r*0.65;
  ctx.beginPath();
  for (let i = 0; i < teeth*2; i++) {
    const a = (i/(teeth*2))*Math.PI*2 - Math.PI/2;
    const rr = i%2===0 ? r : inner;
    if (i===0) ctx.moveTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr);
    else ctx.lineTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr);
  }
  ctx.closePath();
}

/**
 * Build a path for the given shape. Caller is responsible for fill/stroke.
 * Exception: 'fractal' uses animFn and must be called separately.
 */
export function drawPlayerShape(ctx, x, y, r, shape) {
  switch (shape) {
    case 'square':
      ctx.beginPath();
      ctx.rect(x-r, y-r, r*2, r*2);
      break;
    case 'wide':
      ctx.beginPath();
      ctx.ellipse(x, y, r*1.4, r*0.75, 0, 0, Math.PI*2);
      break;
    case 'tall':
      ctx.beginPath();
      ctx.ellipse(x, y, r*0.75, r*1.4, 0, 0, Math.PI*2);
      break;
    case 'teardrop':
      ctx.beginPath();
      ctx.moveTo(x, y-r);
      ctx.bezierCurveTo(x+r, y-r*0.5, x+r*0.7, y+r*0.5, x, y+r);
      ctx.bezierCurveTo(x-r*0.7, y+r*0.5, x-r, y-r*0.5, x, y-r);
      ctx.closePath();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x, y-r);
      ctx.lineTo(x+r*0.87, y+r*0.5);
      ctx.lineTo(x-r*0.87, y+r*0.5);
      ctx.closePath();
      break;
    case 'pentagon':
      _polygon(ctx, x, y, r, 5, -Math.PI/2);
      break;
    case 'hexagon':
      _polygon(ctx, x, y, r, 6, 0);
      break;
    case 'cross':
      ctx.beginPath();
      ctx.rect(x-r*0.35, y-r, r*0.7, r*2);
      ctx.rect(x-r, y-r*0.35, r*2, r*0.7);
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x, y-r);
      ctx.lineTo(x+r, y);
      ctx.lineTo(x, y+r);
      ctx.lineTo(x-r, y);
      ctx.closePath();
      break;
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x-r*0.4, y-r);
      ctx.lineTo(x-r*0.15, y);
      ctx.lineTo(x-r*0.4, y+r);
      ctx.closePath();
      break;
    case 'crescent':
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI*0.75, Math.PI*0.75);
      ctx.arc(x+r*0.35, y, r*0.72, Math.PI*0.75, -Math.PI*0.75, true);
      ctx.closePath();
      break;
    case 'star5':
      _star(ctx, x, y, r, r*0.42, 5);
      break;
    case 'star6':
      _star(ctx, x, y, r, r*0.5, 6);
      break;
    case 'gear':
      _gear(ctx, x, y, r, 8);
      break;
    case 'octagon':
      _polygon(ctx, x, y, r, 8, -Math.PI/8);
      break;
    case 'lightning': {
      const lw = r * 0.28;
      ctx.beginPath();
      ctx.moveTo(x + lw, y - r);
      ctx.lineTo(x - lw * 0.5, y - r * 0.08);
      ctx.lineTo(x + lw * 0.6, y - r * 0.08);
      ctx.lineTo(x - lw, y + r);
      ctx.lineTo(x + lw * 0.4, y + r * 0.08);
      ctx.lineTo(x - lw * 0.6, y + r * 0.08);
      ctx.closePath();
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.9, y - r * 0.5);
      ctx.lineTo(x + r * 0.9, y + r * 0.15);
      ctx.bezierCurveTo(x + r * 0.9, y + r * 0.8, x, y + r, x, y + r);
      ctx.bezierCurveTo(x, y + r, x - r * 0.9, y + r * 0.8, x - r * 0.9, y + r * 0.15);
      ctx.lineTo(x - r * 0.9, y - r * 0.5);
      ctx.closePath();
      break;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.bezierCurveTo(x + r * 0.85, y - r * 0.5, x + r * 0.85, y + r * 0.5, x, y + r);
      ctx.bezierCurveTo(x - r * 0.85, y + r * 0.5, x - r * 0.85, y - r * 0.5, x, y - r);
      ctx.closePath();
      break;
    }
    case 'comet': {
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y, r * 0.65, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.4, y - r * 0.25);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.4, y + r * 0.25);
      ctx.closePath();
      break;
    }
    default: // circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      break;
  }
}

/**
 * Draw the player's aura ring (called from player.draw and cosmetic preview).
 * tempoValue is the current tempo (0-100), used only by reactive aura.
 */
export function drawPlayerAura(ctx, x, y, r, auraValue, t, tempoValue=50) {
  switch (auraValue) {
    case 'faint_blue':
      ctx.beginPath(); ctx.arc(x, y, r+7, 0, Math.PI*2);
      ctx.strokeStyle='rgba(100,160,255,0.35)'; ctx.lineWidth=5; ctx.stroke();
      break;
    case 'faint_gold':
      ctx.beginPath(); ctx.arc(x, y, r+7, 0, Math.PI*2);
      ctx.strokeStyle='rgba(255,180,50,0.35)'; ctx.lineWidth=5; ctx.stroke();
      break;
    case 'pulse_purple': {
      const pulse=(Math.sin(t*2)+1)*0.5;
      ctx.beginPath(); ctx.arc(x, y, r+6+pulse*8, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(160,50,255,${0.2+pulse*0.35})`; ctx.lineWidth=3; ctx.stroke();
      break;
    }
    case 'fire': {
      const f=Math.sin(t*15+x)*0.3+0.7;
      ctx.beginPath(); ctx.arc(x, y, r+6+f*4, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(255,${(100+f*80)|0},0,0.5)`; ctx.lineWidth=2+f; ctx.stroke();
      break;
    }
    case 'void':
      ctx.beginPath(); ctx.arc(x, y, r+16, 0, Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fill();
      break;
    case 'reactive': {
      let rgb;
      if (tempoValue < 30) rgb='80,140,255';
      else if (tempoValue < 70) rgb='50,220,120';
      else if (tempoValue < 90) rgb='255,130,30';
      else rgb='255,50,50';
      const rr=r+8+tempoValue*0.12;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(${rgb},0.55)`; ctx.lineWidth=3; ctx.stroke();
      break;
    }
    case 'ember_halo':
      ctx.beginPath(); ctx.arc(x, y, r+7, 0, Math.PI*2);
      ctx.strokeStyle='rgba(255,120,30,0.38)'; ctx.lineWidth=5; ctx.stroke();
      break;
    case 'shadow_veil':
      ctx.beginPath(); ctx.ellipse(x, y+r*0.6, r*1.1, r*0.35, 0, 0, Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fill();
      break;
    case 'holy_light': {
      const beamG=ctx.createLinearGradient(x,y-r,x,y-r-40);
      beamG.addColorStop(0,'rgba(255,240,160,0.45)');
      beamG.addColorStop(1,'rgba(255,240,160,0)');
      ctx.fillStyle=beamG;
      ctx.fillRect(x-r*0.25, y-r-40, r*0.5, 42);
      break;
    }
    case 'blood_moon': {
      ctx.strokeStyle='rgba(180,0,30,0.55)'; ctx.lineWidth=3;
      ctx.beginPath();
      ctx.arc(x, y-r*0.55, r*0.65, Math.PI, Math.PI*2);
      ctx.stroke();
      break;
    }
    case 'thunder_ring': {
      const tPulse=Math.sin(t*22);
      if(tPulse>0.6){
        ctx.strokeStyle=`rgba(160,200,255,${(tPulse-0.6)/0.4*0.8})`; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(x,y,r+5+tPulse*6,0,Math.PI*2); ctx.stroke();
      }
      break;
    }
    case 'frost_wreath': {
      const count=6;
      for(let i=0;i<count;i++){
        const a=(i/count)*Math.PI*2+t*0.6;
        const wx=x+Math.cos(a)*(r+9), wy=y+Math.sin(a)*(r+9);
        ctx.strokeStyle='rgba(180,235,255,0.7)'; ctx.lineWidth=1;
        for(let s=0;s<6;s++){
          const sa=(s/6)*Math.PI*2;
          ctx.beginPath(); ctx.moveTo(wx,wy);
          ctx.lineTo(wx+Math.cos(sa)*5,wy+Math.sin(sa)*5); ctx.stroke();
        }
      }
      break;
    }
    case 'storm_cloud': {
      const cx2=x, cy2=y-r-10;
      ctx.fillStyle='rgba(50,50,70,0.55)';
      ctx.beginPath(); ctx.ellipse(cx2,cy2,r*0.65,r*0.25,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx2-r*0.25,cy2+3,r*0.4,r*0.18,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx2+r*0.22,cy2+4,r*0.38,r*0.17,0,0,Math.PI*2); ctx.fill();
      if(Math.sin(t*7)>0.88){
        ctx.strokeStyle='rgba(200,220,255,0.7)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(cx2,cy2+r*0.18); ctx.lineTo(cx2-4,cy2+r*0.38); ctx.lineTo(cx2+2,cy2+r*0.38); ctx.lineTo(cx2-2,cy2+r*0.55); ctx.stroke();
      }
      break;
    }
    case 'crystal_crown': {
      const gemCount=4;
      for(let i=0;i<gemCount;i++){
        const a=(i/gemCount)*Math.PI*2+t*0.75;
        const gx=x+Math.cos(a)*(r+10), gy=y+Math.sin(a)*(r+10);
        const hue=(i/gemCount)*360+t*30;
        ctx.fillStyle=`hsla(${hue%360},100%,70%,0.8)`;
        ctx.beginPath(); ctx.moveTo(gx,gy-5); ctx.lineTo(gx+3.5,gy); ctx.lineTo(gx,gy+4); ctx.lineTo(gx-3.5,gy); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'supernova_ring': {
      const ringCount=3;
      for(let ri=0;ri<ringCount;ri++){
        const phase=(t*1.8+ri*0.55)%(Math.PI*2);
        const rSize=r+8+Math.sin(phase)*12;
        const hue=(ri/ringCount)*120+(tempoValue/100)*240;
        ctx.strokeStyle=`hsla(${hue%360},100%,60%,${0.2+0.25*Math.sin(phase)})`;
        ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(x,y,rSize,0,Math.PI*2); ctx.stroke();
      }
      break;
    }
    default: break;
  }
}

// ── Kill Effect Canvas Drawing ──────────────────────────────────────────────────

export function drawKillEffect(ctx, x, y, effectId, elapsed) {
  const cl = v => Math.max(0, Math.min(1, v));
  const eOut = v => 1 - Math.pow(1 - v, 3);
  switch (effectId) {
    case 'simple_pop': {
      const tp = cl(elapsed / 0.38);
      const a = 1 - tp;
      ctx.strokeStyle = `rgba(255,240,120,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, eOut(tp) * 26, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const d = eOut(tp) * 30;
        ctx.fillStyle = `rgba(255,210,70,${a})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'spark_burst': {
      const tp = cl(elapsed / 0.5);
      const a = 1 - tp;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const len = (30 + i * 7) * tp;
        ctx.strokeStyle = `rgba(120,190,255,${a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
      }
      break;
    }
    case 'coin_shower': {
      for (let i = 0; i < 5; i++) {
        const cx2 = x + (i - 2) * 13 + Math.sin(elapsed * 8 + i) * 5;
        const cy2 = y - eOut(cl(elapsed / 0.25)) * 28 + elapsed * elapsed * 70 + i * 7;
        const ca = Math.max(0, 1 - elapsed / 0.7);
        ctx.fillStyle = `rgba(255,200,0,${ca})`;
        ctx.beginPath(); ctx.arc(cx2, cy2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,240,80,${ca * 0.7})`;
        ctx.beginPath(); ctx.ellipse(cx2, cy2, 5, 2.5, elapsed * 5 + i, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'freeze_frame': {
      const tp = cl(elapsed / 0.6);
      const a = 1 - tp;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const d = eOut(cl(elapsed / 0.4)) * 36;
        ctx.save();
        ctx.translate(x + Math.cos(ang) * d, y + Math.sin(ang) * d);
        ctx.rotate(ang);
        ctx.fillStyle = `rgba(170,235,255,${a})`;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3.5, 2); ctx.lineTo(-3.5, 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'skull_pop': {
      const tp = cl(elapsed / 0.5);
      const a = 1 - tp;
      const sz = 13 + tp * 5;
      const sy = y - tp * 24;
      ctx.strokeStyle = `rgba(220,220,220,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, sy, sz, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (const [ex, ey] of [[-sz * 0.3, -sz * 0.12], [sz * 0.3, -sz * 0.12]]) {
        ctx.beginPath(); ctx.moveTo(x + ex - 3, sy + ey - 3); ctx.lineTo(x + ex + 3, sy + ey + 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + ex + 3, sy + ey - 3); ctx.lineTo(x + ex - 3, sy + ey + 3); ctx.stroke();
      }
      break;
    }
    case 'kill_supernova': {
      const tp = cl(elapsed / 0.75);
      const a = 1 - tp;
      if (elapsed < 0.14) {
        ctx.fillStyle = `rgba(255,255,200,${(0.14 - elapsed) / 0.14 * 0.55})`;
        ctx.beginPath(); ctx.arc(x, y, 65, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,190,40,${a})`; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(x, y, eOut(tp) * 72, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const d = eOut(tp) * 58;
        ctx.fillStyle = `rgba(255,140,0,${a})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'rift_tear': {
      const a = 1 - cl(elapsed / 0.9);
      const scale = elapsed < 0.22 ? elapsed / 0.22 : (elapsed < 0.62 ? 1.0 : 1 - (elapsed - 0.62) / 0.28);
      ctx.save();
      ctx.globalAlpha = a * 0.92;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 32 * scale);
      grd.addColorStop(0, '#000000');
      grd.addColorStop(0.5, 'rgba(80,0,130,0.85)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(x, y, 32 * scale, 20 * scale, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + elapsed * 3.5;
        ctx.fillStyle = `rgba(170,0,255,${a})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 32 * scale, y + Math.sin(ang) * 20 * scale, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      break;
    }
    default: break;
  }
}
