// ── Effects ───────────────────────────────────────────────────────────────────
// All transient visuals. 'effects' is a global array declared in main.js.

const Effects = {
  spawnNumber(x, y, amount) {
    const big = Tempo.value >= 70
    effects.push({
      type: 'number', x, y, age: 0, lifetime: big ? 0.85 : 0.7,
      vy: -80, vx: (Math.random() - 0.5) * 40,
      text: String(amount),
      color: Tempo.stateColor(),
      size: big ? (Tempo.value >= 90 ? 26 : 20) : 14,
    })
  },

  spawnBurst(x, y, color) {
    const count = 8 + Math.floor(Math.random() * 5)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.7
      const dist  = 30 + Math.random() * 55
      effects.push({
        type: 'shard', x, y, age: 0, lifetime: 0.28,
        tx: x + Math.cos(angle) * dist,
        ty: y + Math.sin(angle) * dist,
        size: 4 + Math.random() * 7,
        color,
      })
    }
  },

  spawnTrail(x, y) {
    effects.push({ type: 'trail', x, y, age: 0, lifetime: 0.15, color: Tempo.stateColor() })
  },

  spawnCrashBurst(x, y, radius) {
    effects.push({ type: 'crashburst', x, y, age: 0, lifetime: 0.4, radius })
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      const dist  = radius * (0.4 + Math.random() * 0.6)
      effects.push({
        type: 'shard', x, y, age: 0, lifetime: 0.4,
        tx: x + Math.cos(angle) * dist,
        ty: y + Math.sin(angle) * dist,
        size: 4 + Math.random() * 7,
        color: Tempo.stateColor(),
      })
    }
  },

  spawnComboFinish(x, y) {
    effects.push({ type: 'combofinish', x, y, age: 0, lifetime: 0.22 })
  },

  spawnPerfectDodge(x, y) {
    effects.push({ type: 'perfectdodge', x, y, age: 0, lifetime: 0.32 })
  },

  spawnTempoSuck(x, y) {
    effects.push({ type: 'temposuck', x, y, age: 0, lifetime: 0.42 })
  },

  // Full-screen flash on kill (very brief, color-coded)
  spawnKillFlash(color) {
    effects.push({ type: 'killflash', age: 0, lifetime: 0.12, color: color || '#ffffff' })
  },

  // Green sweep when room is cleared
  spawnRoomClear() {
    effects.push({ type: 'roomclear', age: 0, lifetime: 0.7 })
  },

  // State-change label pop at center of screen
  spawnStateLabel(label, color) {
    effects.push({ type: 'statelabel', age: 0, lifetime: 0.55, text: label, color })
  },

  onZoneTransition(oldZone, newZone) {
    this.spawnStateLabel(newZone, Tempo.stateColor())
    this.spawnBeatPulse(Tempo.stateColor())
    if (typeof Audio !== 'undefined' && Audio.zoneTransition) Audio.zoneTransition()
  },

  spawnBeatPulse(color) {
    effects.push({ type: 'beatpulse', age: 0, lifetime: 0.45, color })
  },

  update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]
      e.age += dt
      if (e.type === 'number') {
        e.vy += 90 * dt
        e.x  += e.vx * dt
        e.y  += e.vy * dt
      }
      if (e.age >= e.lifetime) effects.splice(i, 1)
    }
  },

  draw(ctx) {
    ctx.save()
    for (const e of effects) {
      const t = e.age / e.lifetime
      switch (e.type) {

        case 'number': {
          ctx.globalAlpha = Math.max(0, 1 - t)
          ctx.fillStyle   = e.color
          ctx.font        = `bold ${e.size}px monospace`
          ctx.textAlign   = 'center'
          // Dark outline for readability
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'
          ctx.lineWidth   = 3
          ctx.strokeText(e.text, e.x, e.y)
          ctx.fillText(e.text, e.x, e.y)
          break
        }

        case 'shard': {
          const cx = e.x + (e.tx - e.x) * t
          const cy = e.y + (e.ty - e.y) * t
          ctx.globalAlpha = Math.max(0, 1 - t)
          ctx.fillStyle   = e.color
          ctx.fillRect(cx - e.size / 2, cy - e.size / 2, e.size, e.size)
          break
        }

        case 'trail': {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.5)
          ctx.fillStyle   = e.color
          ctx.fillRect(e.x - 14, e.y - 14, 28, 28)
          break
        }

        case 'crashburst': {
          const r     = e.radius * Math.sqrt(t)
          const alpha = Math.max(0, (1 - t) * 0.9)
          ctx.globalAlpha = alpha
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, r), 0, Math.PI * 2)
          ctx.strokeStyle = '#ff4400'
          ctx.lineWidth   = 5 * (1 - t) + 1
          ctx.stroke()
          if (t < 0.25) {
            ctx.globalAlpha = Math.max(0, (0.25 - t) * 4 * 0.25)
            ctx.fillStyle   = '#ff8800'
            ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, r), 0, Math.PI * 2)
            ctx.fill()
          }
          break
        }

        case 'combofinish': {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.85)
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, 54 * t), 0, Math.PI * 2)
          ctx.strokeStyle = '#ffdd00'
          ctx.lineWidth   = 4
          ctx.stroke()
          break
        }

        case 'perfectdodge': {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.75)
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, 84 * t), 0, Math.PI * 2)
          ctx.strokeStyle = '#aaddff'
          ctx.lineWidth   = 3
          ctx.stroke()
          break
        }

        case 'temposuck': {
          ctx.globalAlpha = Math.max(0, t * 0.75)
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0, 64 * (1 - t)), 0, Math.PI * 2)
          ctx.strokeStyle = '#cc44aa'
          ctx.lineWidth   = 3
          ctx.stroke()
          break
        }

        case 'killflash': {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.18)
          ctx.fillStyle   = e.color
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
          break
        }

        case 'roomclear': {
          // Green wave sweeps from left to right
          const wave = CANVAS_W * t
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.3)
          const grad = ctx.createLinearGradient(wave - 120, 0, wave, 0)
          grad.addColorStop(0, 'rgba(51,221,102,0)')
          grad.addColorStop(1, 'rgba(51,221,102,1)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, Math.min(wave, CANVAS_W), CANVAS_H)
          break
        }

        case 'statelabel': {
          // Pop + fade — peaks at t=0.35
          const scaleT = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65
          const alpha  = scaleT
          const size   = Math.round(24 + scaleT * 14)
          ctx.globalAlpha = Math.max(0, alpha)
          ctx.fillStyle   = e.color
          ctx.font        = `bold ${size}px monospace`
          ctx.textAlign   = 'center'
          ctx.fillText(e.text, CANVAS_W / 2, 110)
          break
        }

        case 'beatpulse': {
          ctx.globalAlpha = Math.max(0, (1 - t) * 0.25)
          ctx.strokeStyle = e.color
          ctx.lineWidth   = 20 * (1 - t)
          ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H)
          break
        }
      }
    }
    ctx.globalAlpha = 1
    ctx.restore()
  },
}
