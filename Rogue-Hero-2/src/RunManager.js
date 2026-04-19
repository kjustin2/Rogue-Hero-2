export class RunManager {
  constructor() {
    this.floor = 1;
    this.currentNodeId = 'start';
    this.layers = [];
    this.nodeMap = {};
    this.maxLayers = 8;
    this.seed = 0;
    this.rng = null;
    // PERF-02: offscreen canvas cache for map grid background
    this._mapGridCache = null;
    this._mapGridW = 0;
    this._mapGridH = 0;
  }

  // Simple seeded RNG (mulberry32). State is stored on the instance so
  // the host can ship it to the client in ENEMY_SPAWN_LIST / ROOM_CLEARED
  // and keep both sides on the same position in the stream — otherwise
  // the host's spawnEnemies() consumes RNG that the client's deferred
  // combat path never consumes, and the next-floor generateMap() drifts.
  _createRng(seed) {
    this._rngState = seed | 0;
    return () => {
      this._rngState = (this._rngState + 0x6D2B79F5) | 0;
      let v = this._rngState;
      v = Math.imul(v ^ (v >>> 15), v | 1);
      v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }

  setSeed(seed) {
    this.seed = seed;
    this.rng = this._createRng(seed);
  }

  getRng() {
    return this.rng || Math.random;
  }

  // Expose RNG state so MP hosts can broadcast it and clients can snap to
  // the same stream position. Safe to call before setSeed (returns null).
  getRngState() {
    return (typeof this._rngState === 'number') ? (this._rngState | 0) : null;
  }
  setRngState(state) {
    if (typeof state !== 'number') return;
    this._rngState = state | 0;
  }

  generateMap() {
    if (!this.rng) this.setSeed(Date.now());
    const rng = this.rng;

    this.layers = [];
    this.nodeMap = {};

    const layerWidths = [1, 2, 3, 2, 3, 2, 1, 1];

    for (let i = 0; i < this.maxLayers; i++) {
      let currentWidth = layerWidths[i];
      let layerNodes = [];

      for (let j = 0; j < currentWidth; j++) {
        let type = 'fight';
        if (i === 0) type = 'start';
        else if (i === this.maxLayers - 1) type = 'boss';
        else if (i === this.maxLayers - 2) type = 'rest';
        else {
          let r = rng();
          if (r < 0.40)      type = 'fight';
          else if (r < 0.60) type = 'elite';
          else if (r < 0.75) type = 'event';
          else if (r < 0.96) type = 'shop';
          else               type = 'rest';
        }

        let id = `layer${i}_node${j}`;
        let node = {
          id, layer: i, index: j, type,
          next: [], resolved: false,
          xPos: currentWidth === 1 ? 0.5 : j / Math.max(1, currentWidth - 1)
        };

        layerNodes.push(node);
        this.nodeMap[id] = node;
      }
      this.layers.push(layerNodes);
    }

    // Connect layers
    for (let i = 0; i < this.maxLayers - 1; i++) {
      let currentLayer = this.layers[i];
      let nextLayer = this.layers[i + 1];

      for (let j = 0; j < currentLayer.length; j++) {
        let node = currentLayer[j];
        for (let k = 0; k < nextLayer.length; k++) {
          let nextNode = nextLayer[k];
          let xDist = Math.abs(node.xPos - nextNode.xPos);
          if (xDist <= 0.6) {
            node.next.push(nextNode.id);
          }
        }
        if (node.next.length === 0) node.next.push(nextLayer[0].id);
      }
    }

    this.layers[0][0].resolved = true;
    this.currentNodeId = this.layers[0][0].id;
    this._mapGridCache = null; // PERF-02: invalidate cache on new floor
    console.log(`[Map] Generated ${this.maxLayers}-layer map for Floor ${this.floor} (seed: ${this.seed})`);
  }

  getCurrentNode() {
    if (!this.currentNodeId) return null;
    return this.nodeMap[this.currentNodeId];
  }

  // Returns the number of node layers remaining until the boss layer
  getLayersToEnd() {
    const curr = this.nodeMap[this.currentNodeId];
    if (!curr) return 0;
    return (this.maxLayers - 1) - curr.layer;
  }

  handleMapClick(mx, my, width, height) {
    const node = this.identifyNodeAtPoint(mx, my);
    if (!node) return null;
    this.currentNodeId = node.id;
    console.log(`[Map] Advanced to node "${node.id}" type="${node.type}"`);
    return node;
  }

  // RH2 multiplayer: returns the reachable node at (mx,my) without advancing
  // currentNodeId. Used by both the vote system (which only advances after
  // both players agree) and by handleMapClick (which advances immediately).
  identifyNodeAtPoint(mx, my) {
    if (!this.clickSpheres || !this.currentNodeId) return null;
    const curr = this.nodeMap[this.currentNodeId];
    if (!curr) return null;
    const validTargets = curr.next;
    for (const sphere of this.clickSpheres) {
      if (validTargets.includes(sphere.id)) {
        const dx = mx - sphere.x;
        const dy = my - sphere.y;
        if (dx * dx + dy * dy <= sphere.r * sphere.r) {
          return this.nodeMap[sphere.id];
        }
      }
    }
    return null;
  }

  // Returns the screen-space position of a known node id (or null).
  getNodePosition(nodeId) {
    if (!this.clickSpheres) return null;
    for (const s of this.clickSpheres) {
      if (s.id === nodeId) return { x: s.x, y: s.y, r: s.r };
    }
    return null;
  }

  // Advances the current node to the given id (used when a vote completes).
  // Returns the resolved node, or null if the id is invalid.
  selectNodeById(nodeId) {
    const node = this.nodeMap[nodeId];
    if (!node) return null;
    this.currentNodeId = nodeId;
    return node;
  }

  drawMap(ctx, width, height, mx, my) {
    // Background — darker toward the edges, act-themed
    const floorThemes = [
      { bg: '#0d0d18', col: '#44aaff', name: '' },
      { bg: '#0e0a10', col: '#cc66ff', name: '— CATACOMBS' },
      { bg: '#100808', col: '#ff6644', name: '— THE CITADEL' },
      { bg: '#060512', col: '#00eedd', name: '— THE ABYSS' },
      { bg: '#100e06', col: '#ffd700', name: '— THE APEX' },
    ];
    const theme = floorThemes[Math.min(this.floor - 1, 4)];

    // PERF-02: cache map background grid to offscreen canvas
    // RH2: richer background — radial vignette, biome-tinted accent grid,
    // diagonal pinstripe sheen, faint dotted nebula speckle.
    if (!this._mapGridCache || this._mapGridW !== width || this._mapGridH !== height || this._mapGridFloor !== this.floor) {
      const off = document.createElement('canvas');
      off.width = width; off.height = height;
      const octx = off.getContext('2d');

      // Base + radial vignette
      octx.fillStyle = theme.bg;
      octx.fillRect(0, 0, width, height);
      const rg = octx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.15,
                                           width / 2, height / 2, Math.max(width, height) * 0.85);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, 'rgba(0,0,0,0.65)');
      octx.fillStyle = rg;
      octx.fillRect(0, 0, width, height);

      // Pinstripe diagonal sheen (subtle)
      octx.save();
      octx.globalAlpha = 0.04;
      octx.strokeStyle = theme.col;
      octx.lineWidth = 1;
      for (let s = -height; s < width; s += 14) {
        octx.beginPath();
        octx.moveTo(s, 0);
        octx.lineTo(s + height, height);
        octx.stroke();
      }
      octx.restore();

      // Major grid lines (thicker, biome-tinted)
      octx.strokeStyle = `${theme.col}1f`;
      octx.lineWidth = 1;
      for (let gx = 0; gx < width; gx += 120) {
        octx.beginPath(); octx.moveTo(gx, 0); octx.lineTo(gx, height); octx.stroke();
      }
      for (let gy = 0; gy < height; gy += 120) {
        octx.beginPath(); octx.moveTo(0, gy); octx.lineTo(width, gy); octx.stroke();
      }
      // Minor grid
      octx.strokeStyle = 'rgba(255,255,255,0.025)';
      for (let gx = 60; gx < width; gx += 120) {
        octx.beginPath(); octx.moveTo(gx, 0); octx.lineTo(gx, height); octx.stroke();
      }
      for (let gy = 60; gy < height; gy += 120) {
        octx.beginPath(); octx.moveTo(0, gy); octx.lineTo(width, gy); octx.stroke();
      }

      // Star/nebula speckle (deterministic per floor)
      let s1 = (this.floor * 1664525 + 1013904223) >>> 0;
      const _rand = () => { s1 = (s1 * 1664525 + 1013904223) >>> 0; return s1 / 0x100000000; };
      for (let n = 0; n < 80; n++) {
        const sx = _rand() * width, sy = _rand() * height;
        const sr = 0.4 + _rand() * 1.2;
        octx.globalAlpha = 0.10 + _rand() * 0.25;
        octx.fillStyle = _rand() > 0.7 ? theme.col : '#aabbcc';
        octx.beginPath(); octx.arc(sx, sy, sr, 0, Math.PI * 2); octx.fill();
      }
      octx.globalAlpha = 1;

      this._mapGridCache = off;
      this._mapGridW = width;
      this._mapGridH = height;
      this._mapGridFloor = this.floor;
    }
    ctx.drawImage(this._mapGridCache, 0, 0);

    // Header bar — gradient + accent stripe
    {
      const hg = ctx.createLinearGradient(0, 0, 0, 90);
      hg.addColorStop(0, 'rgba(8,8,16,0.95)');
      hg.addColorStop(1, 'rgba(8,8,16,0.55)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, width, 90);
      // Accent stripe under header
      const sg = ctx.createLinearGradient(0, 0, width, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, theme.col);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(0, 88, width, 2);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.shadowColor = theme.col;
    ctx.shadowBlur = 20;
    ctx.fillStyle = theme.col;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ACT ${this.floor}${theme.name}`, width / 2, 48);
    ctx.restore();

    // Floor pip strip — shows progress through total acts
    {
      const _tHdr = Date.now() / 1000;
      const totalActs = 5;
      const pipR = 4, pipGap = 14;
      const pipsW = totalActs * pipGap - (pipGap - pipR * 2);
      const pipsX = width / 2 - pipsW / 2 + pipR;
      for (let pi = 0; pi < totalActs; pi++) {
        const px = pipsX + pi * pipGap;
        const done = pi < this.floor - 1;
        const cur  = pi === this.floor - 1;
        ctx.fillStyle = cur ? theme.col : (done ? '#44ff88' : '#222a3a');
        ctx.beginPath();
        ctx.arc(px, 70, cur ? pipR + 1 : pipR, 0, Math.PI * 2);
        ctx.fill();
        if (cur) {
          ctx.strokeStyle = theme.col;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, 70, pipR + 4 + Math.sin(_tHdr * 3) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = '#88aabb';
    ctx.font = '12px monospace';
    ctx.fillText('Choose your path — click a glowing room', width / 2, 86);

    const START_Y = height - 90;
    // Boss node sits at END_Y; bumped down to clear the 90px header banner + caption
    const END_Y = 150;
    const gapY = (START_Y - END_Y) / (this.maxLayers - 1);

    this.clickSpheres = [];

    // PERF-01: compute once instead of per-node
    const t = Date.now() / 1000;

    // Room type config: color, icon emoji, label
    const nodeConfig = {
      start:  { col: '#888888', icon: '◉', label: '' },
      fight:  { col: '#cc3333', icon: '⚔', label: 'FIGHT' },
      elite:  { col: '#ff6644', icon: '★', label: 'ELITE' },
      rest:   { col: '#44dd88', icon: '+', label: 'REST' },
      boss:   { col: '#ffaa00', icon: '☠', label: 'BOSS' },
      event:  { col: '#dd88ff', icon: '?', label: 'EVENT' },
      shop:   { col: '#44aaff', icon: '$', label: 'SHOP' },
    };

    // First pass: connections (PERF-06: setLineDash only when needed)
    ctx.setLineDash([]);
    for (let i = 0; i < this.maxLayers; i++) {
      for (const node of this.layers[i]) {
        const cy = START_Y - (node.layer * gapY);
        const cx = (width * 0.25) + node.xPos * (width * 0.5);
        for (const nextId of node.next) {
          const nextNode = this.nodeMap[nextId];
          const ny = START_Y - (nextNode.layer * gapY);
          const nx = (width * 0.25) + nextNode.xPos * (width * 0.5);
          const isPast = node.layer < (this.nodeMap[this.currentNodeId]?.layer || 0);
          ctx.strokeStyle = isPast ? '#2a2a3a' : '#333355';
          ctx.lineWidth = isPast ? 1 : 1.5;
          if (isPast) { ctx.setLineDash([4, 6]); }
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          if (isPast) { ctx.setLineDash([]); }
        }
      }
    }

    // Current node highlight connections
    const currNode = this.nodeMap[this.currentNodeId];
    let validTargets = currNode ? currNode.next : [];
    if (currNode) {
      const cy = START_Y - (currNode.layer * gapY);
      const cx = (width * 0.25) + currNode.xPos * (width * 0.5);
      for (const nextId of validTargets) {
        const nn = this.nodeMap[nextId];
        const ny = START_Y - (nn.layer * gapY);
        const nx = (width * 0.25) + nn.xPos * (width * 0.5);
        const pulse = 0.4 + Math.sin(t * 3) * 0.3;
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
    }

    // Traveling light dot along active path connections
    for (const nextId of validTargets) {
      const nn = this.nodeMap[nextId];
      if (!currNode || !nn) continue;
      const cy0 = START_Y - (currNode.layer * gapY);
      const cx0 = (width * 0.25) + currNode.xPos * (width * 0.5);
      const ny0 = START_Y - (nn.layer * gapY);
      const nx0 = (width * 0.25) + nn.xPos * (width * 0.5);
      const dotP = (t * 0.55) % 1;
      const dotX = cx0 + (nx0 - cx0) * dotP;
      const dotY = cy0 + (ny0 - cy0) * dotP;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Second pass: nodes (PERF-03: default font set once, override only for boss)
    ctx.font = 'bold 16px monospace';
    let _tooltipNode = null, _tooltipX = 0, _tooltipY = 0;
    for (let i = 0; i < this.maxLayers; i++) {
      for (const node of this.layers[i]) {
        const cy = START_Y - (node.layer * gapY);
        const cx = (width * 0.25) + node.xPos * (width * 0.5);
        const cfg = nodeConfig[node.type] || nodeConfig.fight;

        const isCurrent = node.id === this.currentNodeId;
        const isValidNext = validTargets.includes(node.id);
        const isFuture = node.layer > (currNode?.layer || 0) && !isValidNext;
        const isPast = node.layer < (currNode?.layer || 0);
        const isBoss = node.type === 'boss';
        // Fog of war: only immediate next choices are fully revealed
        const isHidden = isFuture && node.layer > (currNode?.layer || 0) + 1;

        let rad = isBoss ? 26 : (node.type === 'elite' ? 18 : 15);
        this.clickSpheres.push({ x: cx, y: cy, r: rad + 12, id: node.id });

        // Tooltip tracking (mouse hover over valid next node)
        if (isValidNext && mx !== undefined && my !== undefined) {
          const dx = mx - cx, dy = my - cy;
          if (dx * dx + dy * dy < (rad + 20) * (rad + 20)) {
            _tooltipNode = node; _tooltipX = cx; _tooltipY = cy - rad - 12;
          }
        }

        // Glow for valid next nodes
        if (isValidNext) {
          const glowR = rad + 10 + Math.sin(t * 3) * 4;
          ctx.save();
          ctx.shadowColor = cfg.col;
          ctx.shadowBlur = 22;
          ctx.strokeStyle = cfg.col + 'aa';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Node body — hidden nodes show as dim ? circles
        ctx.beginPath();
        if (isHidden) {
          ctx.arc(cx, cy, rad * 0.8, 0, Math.PI * 2);
        } else if (node.type === 'event') {
          ctx.moveTo(cx, cy - rad);
          ctx.lineTo(cx + rad, cy);
          ctx.lineTo(cx, cy + rad);
          ctx.lineTo(cx - rad, cy);
          ctx.closePath();
        } else if (node.type === 'shop') {
          ctx.roundRect(cx - rad, cy - rad, rad * 2, rad * 2, 5);
        } else {
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        }

        if (isHidden) {
          ctx.fillStyle = '#111122';
        } else if (isCurrent) {
          ctx.fillStyle = '#ffffff';
        } else if (isValidNext) {
          ctx.fillStyle = cfg.col;
        } else if (isPast) {
          ctx.fillStyle = '#1a1a28';
        } else {
          ctx.fillStyle = '#0d0d18';
        }
        ctx.fill();

        ctx.strokeStyle = isCurrent ? '#ffaa00' : (isValidNext ? '#ffffff' : (isPast ? '#222' : (isHidden ? '#1a1a2a' : '#334')));
        ctx.lineWidth = isCurrent ? 3 : (isValidNext ? 2 : 1);
        ctx.stroke();

        // Icon / label
        if (isHidden) {
          ctx.fillStyle = '#334';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('?', cx, cy + 5);
          ctx.font = 'bold 16px monospace';
        } else {
          // Custom canvas icon instead of emoji
          ctx.fillStyle = isCurrent ? '#000' : (isValidNext ? '#fff' : (isPast ? '#333' : '#222'));
          if (isBoss) ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(cfg.icon, cx, cy + (isBoss ? 6 : 5));
          if (isBoss) ctx.font = 'bold 16px monospace';

          if (cfg.label) {
            ctx.fillStyle = isCurrent ? '#ffaa00' : (isValidNext ? cfg.col : (isPast ? '#444' : '#555566'));
            if (isBoss) ctx.font = 'bold 18px monospace';
            ctx.fillText(cfg.label, cx, cy + rad + 20);
            if (isBoss) ctx.font = 'bold 16px monospace';
          }

          // Visited checkmark for cleared past nodes
          if (isPast && node.type !== 'start') {
            ctx.fillStyle = 'rgba(100,255,150,0.5)';
            ctx.font = 'bold 11px monospace';
            ctx.fillText('✓', cx + rad - 2, cy - rad + 4);
            ctx.font = 'bold 16px monospace';
          }
        }
      }
    }

    // Node hover tooltip
    if (_tooltipNode) {
      const tipDesc = {
        fight:  'Combat room — 2-4 enemies',
        elite:  'Elite room — tougher enemies, better rewards',
        rest:   'Rest node — heal HP or burn a card',
        boss:   'BOSS — powerful guardian, unique reward',
        event:  'Event — unknown encounter or choice',
        shop:   'Shop — buy cards and relics',
      };
      const tipText = tipDesc[_tooltipNode.type] || _tooltipNode.type;
      const ttW = Math.min(300, tipText.length * 8 + 24);
      const ttX = Math.max(8, Math.min(width - ttW - 8, _tooltipX - ttW / 2));
      const ttY2 = Math.max(90, _tooltipY - 36);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.beginPath();
      ctx.roundRect(ttX, ttY2, ttW, 28, 6);
      ctx.fill();
      const cfg2 = nodeConfig[_tooltipNode.type] || nodeConfig.fight;
      ctx.strokeStyle = cfg2.col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = cfg2.col;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tipText, ttX + ttW / 2, ttY2 + 18);
      ctx.restore();
    }

    // IDEA-11: Boss proximity warning
    const layersLeft = this.getLayersToEnd();
    if (layersLeft <= 2 && layersLeft > 0) {
      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      ctx.save();
      ctx.fillStyle = `rgba(255,100,0,${pulse * 0.15})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      ctx.fillStyle = `rgba(255,${layersLeft === 1 ? 50 : 120},0,${0.7 + pulse * 0.3})`;
      ctx.font = `bold ${layersLeft === 1 ? 18 : 15}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(layersLeft === 1 ? '⚠ BOSS NEXT ⚠' : '⚠ BOSS NEAR', width / 2, height - 60);
    }

    // Footer — gradient + accent stripe matching header
    {
      const fg = ctx.createLinearGradient(0, height - 52, 0, height);
      fg.addColorStop(0, 'rgba(8,8,16,0.5)');
      fg.addColorStop(1, 'rgba(8,8,16,0.95)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, height - 52, width, 52);
      const sg = ctx.createLinearGradient(0, 0, width, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, theme.col);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, height - 52, width, 2);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#88ffbb';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◆  Click a glowing room to advance  ◆', width / 2, height - 22);
    ctx.fillStyle = '#445566';
    ctx.font = '10px monospace';
    ctx.fillText('Press I for inventory  ◆  ESC for pause menu', width / 2, height - 8);
  }
}
