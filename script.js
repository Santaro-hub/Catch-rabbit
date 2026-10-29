/* ========================================================================
   CATCH THE RABBIT — GAME ENGINE (Full Upgrade)
   ======================================================================== */
(() => {
'use strict';

/* ── DOM refs ───────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const arena       = $('arena');
const target      = $('target');
const cssRabbit   = $('cssRabbit');
const startButton = $('startButton');
const startBtnTxt = $('startButtonText');
const scoreEl     = $('score');
const timeEl      = $('time');
const streakEl    = $('streak');
const bestEl      = $('best');
const coinsEl     = $('coins');
const levelEl     = $('level');
const comboEl     = $('comboDisplay');
const gameStatus  = $('gameStatus');
const arenaOverlay  = $('arenaOverlay');
const catchEffects  = $('catchEffects');
const overlayTitle  = $('overlayTitle');
const overlayMsg    = $('overlayMessage');
const footprintsLayer = $('footprintsLayer');
const comboAnnounce   = $('comboAnnounce');
const feverOverlay    = $('feverOverlay');
const levelProgress   = $('levelProgress');
const levelProgressLbl= $('levelProgressLabel');
const particleCanvas  = $('particleCanvas');
const cursorTrail     = $('cursorTrail');
const muteBtn         = $('muteBtn');
const muteIcon        = $('muteIcon');
const summaryModal    = $('summaryModal');
const summaryCloseBtn = $('summaryCloseBtn');
const achieveContainer = $('achievementContainer');

/* ── Shop DOM refs ───────────────────────────────────────────────────── */
const bgCanvas        = $('bgEffectCanvas');
const shopBtn         = $('shopBtn');
const shopBtnCoins    = $('shopBtnCoins');
const shopModal       = $('shopModal');
const shopBackdrop    = $('shopBackdrop');
const shopCloseBtn    = $('shopCloseBtn');
const shopDoneBtn     = $('shopDoneBtn');
const shopModalCoins  = $('shopModalCoins');
const skinsGrid       = $('skinsGrid');
const perksGrid       = $('perksGrid');
const themesGrid      = $('themesGrid');
const summaryShopBtn  = $('summaryShopBtn');
const sumShopCoins    = $('sumShopCoins');

/* ── Constants ──────────────────────────────────────────────────────── */
const BASE_ROUND_LENGTH = 30;
const CATCHES_PER_LEVEL = 5;
const COMBO_WINDOW = 1500;       // ms to keep combo alive
const COMBO_MAX = 5;
const FEVER_THRESHOLD = 10;      // streak to trigger fever
const FEVER_DURATION = 5000;     // ms
const POWERUP_MIN_INTERVAL = 8000;
const POWERUP_MAX_INTERVAL = 12000;
const POWERUP_LIFETIME = 4000;
const ARENA_THEMES = ['', 'theme-meadow', 'theme-sunset', 'theme-night', 'theme-space'];

/* ── Game state ─────────────────────────────────────────────────────── */
let score = 0, streak = 0, best = 0, coins = 0, level = 1;
let active = false, endsAt = 0, nextTargetAt = 0, timerId = null;
let misses = 0, totalCatches = 0;
let combo = 1, lastCatchTime = 0, bestCombo = 1, longestStreak = 0;
let roundCoins = 0, wasBest = false;
let feverActive = false, feverTimer = null;
let shieldActive = false, speedBonusActive = false, magnetActive = false;
let timeFrozen = false, freezeTimer = null;
let powerupTimer = null, activePowerup = null;
let muted = false;

/* ── Shop & Inventory State ─────────────────────────────────────────── */
let inventory = {
  owned: ['skin-classic', 'theme-cosmic'],
  equippedSkin: 'skin-classic',
  equippedTheme: 'theme-cosmic'
};

try {
  const rawInv = localStorage.getItem('rabbit-chase-inventory');
  if (rawInv) {
    const parsed = JSON.parse(rawInv);
    if (parsed && Array.isArray(parsed.owned)) {
      inventory = Object.assign(inventory, parsed);
    }
  }
} catch(e) { /* ignore */ }

const saveInventory = () => {
  try {
    localStorage.setItem('rabbit-chase-inventory', JSON.stringify(inventory));
  } catch(e) { /* ignore */ }
};

const getRoundLength = () => BASE_ROUND_LENGTH + (inventory.owned.includes('perk-time') ? 5 : 0);

/* ── Persistence ────────────────────────────────────────────────────── */
try {
  best  = Number(localStorage.getItem('rabbit-chase-best'))  || 0;
  coins = Number(localStorage.getItem('rabbit-chase-coins')) || 0;
} catch(e) { /* ignore */ }

const updateCoinsDisplay = () => {
  coinsEl.textContent = String(coins);
  if (shopBtnCoins) shopBtnCoins.textContent = `${coins} 🪙`;
  if (shopModalCoins) shopModalCoins.textContent = String(coins);
  if (sumShopCoins) sumShopCoins.textContent = String(coins);
};

bestEl.textContent = String(best);
updateCoinsDisplay();
timeEl.textContent = String(getRoundLength());

const save = (key, val) => {
  try { localStorage.setItem(key, String(val)); } catch(e) { /* ignore */ }
};

/* ════════════════════════════════════════════════════════════════════════
   AUDIO — Web Audio API procedural sounds
   ════════════════════════════════════════════════════════════════════════ */
let audioCtx = null;
const initAudio = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
};

const playTone = (freq, dur, type = 'sine', vol = 0.15, ramp = true) => {
  if (muted || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  if (ramp) gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
};

const sfx = {
  catch() {
    // Satisfying pop
    playTone(880, 0.08, 'sine', 0.18);
    setTimeout(() => playTone(1320, 0.06, 'sine', 0.12), 40);
    setTimeout(() => playTone(1760, 0.05, 'triangle', 0.08), 80);
  },
  miss() {
    // Soft womp
    if (muted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  },
  combo(n) {
    // Ascending chime
    const base = 600 + n * 150;
    playTone(base, 0.12, 'triangle', 0.13);
    setTimeout(() => playTone(base * 1.25, 0.1, 'triangle', 0.1), 60);
    setTimeout(() => playTone(base * 1.5, 0.15, 'triangle', 0.08), 120);
  },
  levelUp() {
    // Triumphant fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'square', 0.08), i * 80));
  },
  powerup() {
    // Sparkle
    playTone(1200, 0.06, 'sine', 0.1);
    setTimeout(() => playTone(1600, 0.06, 'sine', 0.1), 50);
    setTimeout(() => playTone(2000, 0.08, 'triangle', 0.08), 100);
    setTimeout(() => playTone(2400, 0.1, 'triangle', 0.06), 150);
  },
  heartbeat() {
    playTone(60, 0.15, 'sine', 0.2, false);
    setTimeout(() => playTone(55, 0.12, 'sine', 0.15, false), 180);
  },
  fever() {
    const notes = [784, 988, 1175, 1319, 1568];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sawtooth', 0.06), i * 60));
  },
  purchase() {
    playTone(523, 0.08, 'triangle', 0.15);
    setTimeout(() => playTone(659, 0.08, 'triangle', 0.15), 60);
    setTimeout(() => playTone(784, 0.08, 'triangle', 0.15), 120);
    setTimeout(() => playTone(1046, 0.18, 'sine', 0.18), 180);
  },
  equip() {
    playTone(700, 0.05, 'sine', 0.12);
    setTimeout(() => playTone(1050, 0.08, 'triangle', 0.14), 40);
  },
  error() {
    playTone(220, 0.1, 'sawtooth', 0.1);
    setTimeout(() => playTone(180, 0.14, 'sawtooth', 0.1), 90);
  },
  openShop() {
    playTone(440, 0.06, 'sine', 0.1);
    setTimeout(() => playTone(660, 0.08, 'triangle', 0.1), 50);
  }
};

// Mute toggle
muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteIcon.textContent = muted ? '🔇' : '🔊';
});

/* ════════════════════════════════════════════════════════════════════════
   WEBSITE BACKGROUND EFFECT ENGINE (Interactive Canvas FX)
   ════════════════════════════════════════════════════════════════════════ */
class BackgroundEffectManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.theme = 'theme-cosmic';
    this.particles = [];
    this.shootingStars = [];
    this.lastShootingStar = Date.now();
    this.gridOffset = 0;
    this.rafId = null;
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.targetMouseX = -1000;
    this.targetMouseY = -1000;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    if (!this.canvas || !this.ctx) return;

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', e => {
      this.targetMouseX = e.clientX;
      this.targetMouseY = e.clientY;
    });
    window.addEventListener('pointerleave', () => {
      this.targetMouseX = -1000;
      this.targetMouseY = -1000;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      } else {
        this.start();
      }
    });

    this.resize();
    this.start();
  }

  setTheme(newTheme) {
    this.theme = newTheme;
    this.initParticles();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.initParticles();
  }

  initParticles() {
    this.particles = [];
    const count = this.width < 640 ? 32 : 64;

    if (this.theme === 'theme-cosmic') {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: 1 + Math.random() * 2,
          baseAlpha: 0.3 + Math.random() * 0.6,
          twinkleSpeed: 0.01 + Math.random() * 0.03,
          twinklePhase: Math.random() * Math.PI * 2,
          color: Math.random() > 0.3 ? '#e0f2fe' : (Math.random() > 0.5 ? '#fde047' : '#c084fc')
        });
      }
    } else if (this.theme === 'theme-cyber') {
      const cyberCount = this.width < 640 ? 25 : 45;
      for (let i = 0; i < cyberCount; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vy: -(0.7 + Math.random() * 1.5),
          vx: (Math.random() - 0.5) * 0.3,
          size: 1.5 + Math.random() * 2.5,
          alpha: 0.3 + Math.random() * 0.7,
          color: Math.random() > 0.5 ? '#00f3ff' : '#ff007f'
        });
      }
    } else if (this.theme === 'theme-fireflies') {
      const ffCount = this.width < 640 ? 22 : 42;
      for (let i = 0; i < ffCount; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          baseX: Math.random() * this.width,
          baseY: Math.random() * this.height,
          angle: Math.random() * Math.PI * 2,
          speed: 0.01 + Math.random() * 0.02,
          radiusX: 30 + Math.random() * 60,
          radiusY: 20 + Math.random() * 40,
          size: 2.2 + Math.random() * 2.5,
          color: Math.random() > 0.6 ? '#facc15' : '#4ade80',
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.03 + Math.random() * 0.04
        });
      }
    } else if (this.theme === 'theme-solar') {
      const solarCount = this.width < 640 ? 28 : 55;
      for (let i = 0; i < solarCount; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vy: -(0.5 + Math.random() * 1.4),
          vx: (Math.random() - 0.5) * 0.6,
          swayPhase: Math.random() * Math.PI * 2,
          size: 1.8 + Math.random() * 3,
          alpha: 0.3 + Math.random() * 0.6,
          color: Math.random() > 0.4 ? '#f59e0b' : (Math.random() > 0.5 ? '#f97316' : '#fbbf24')
        });
      }
    }
  }

  start() {
    if (!this.rafId && this.ctx) {
      this.rafId = requestAnimationFrame(this.animate);
    }
  }

  animate() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Smooth cursor movement
    if (this.targetMouseX >= 0) {
      this.mouseX += (this.targetMouseX - this.mouseX) * 0.15;
      this.mouseY += (this.targetMouseY - this.mouseY) * 0.15;
    } else {
      this.mouseX = -1000;
      this.mouseY = -1000;
    }

    if (this.theme === 'theme-cosmic') {
      this.drawCosmic();
    } else if (this.theme === 'theme-cyber') {
      this.drawCyber();
    } else if (this.theme === 'theme-fireflies') {
      this.drawFireflies();
    } else if (this.theme === 'theme-solar') {
      this.drawSolar();
    }

    this.rafId = requestAnimationFrame(this.animate);
  }

  drawCosmic() {
    const c = this.ctx;
    const now = Date.now();

    // Occasional shooting star
    if (now - this.lastShootingStar > 4000 + Math.random() * 5000) {
      this.lastShootingStar = now;
      this.shootingStars.push({
        x: Math.random() * (this.width * 0.7),
        y: Math.random() * (this.height * 0.35),
        vx: 8 + Math.random() * 6,
        vy: 4 + Math.random() * 3,
        length: 70 + Math.random() * 70,
        life: 1,
        decay: 0.024
      });
    }

    // Draw and update shooting stars
    this.shootingStars = this.shootingStars.filter(ss => {
      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life -= ss.decay;
      if (ss.life <= 0) return false;

      const grad = c.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * (ss.length / 10), ss.y - ss.vy * (ss.length / 10));
      grad.addColorStop(0, `rgba(255, 255, 255, ${ss.life * 0.9})`);
      grad.addColorStop(0.3, `rgba(165, 215, 255, ${ss.life * 0.6})`);
      grad.addColorStop(1, 'rgba(165, 215, 255, 0)');

      c.strokeStyle = grad;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ss.x, ss.y);
      c.lineTo(ss.x - ss.vx * (ss.length / 10), ss.y - ss.vy * (ss.length / 10));
      c.stroke();
      return true;
    });

    // Draw constellation lines between nearby stars
    const pLen = this.particles.length;
    for (let i = 0; i < pLen; i++) {
      const p1 = this.particles[i];
      for (let j = i + 1; j < pLen; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 90) {
          const alpha = (1 - dist / 90) * 0.22;
          c.strokeStyle = `rgba(147, 197, 253, ${alpha})`;
          c.lineWidth = 0.8;
          c.beginPath();
          c.moveTo(p1.x, p1.y);
          c.lineTo(p2.x, p2.y);
          c.stroke();
        }
      }
    }

    // Draw and update stars
    for (const p of this.particles) {
      if (this.mouseX >= 0) {
        const dx = p.x - this.mouseX;
        const dy = p.y - this.mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist < 110 && dist > 0) {
          const force = (110 - dist) / 110;
          p.x += (dx / dist) * force * 1.5;
          p.y += (dy / dist) * force * 1.5;
        }
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      p.twinklePhase += p.twinkleSpeed;
      const alpha = p.baseAlpha + Math.sin(p.twinklePhase) * 0.25;

      c.save();
      c.globalAlpha = Math.max(0.1, Math.min(1, alpha));
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  drawCyber() {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;
    const horizonY = h * 0.48;

    // Glowing horizon line
    c.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    c.lineWidth = 1.5;
    c.shadowColor = '#00f3ff';
    c.shadowBlur = 10;
    c.beginPath();
    c.moveTo(0, horizonY);
    c.lineTo(w, horizonY);
    c.stroke();
    c.shadowBlur = 0;

    // Perspective lines
    const vpX = w * 0.5;
    const vpY = horizonY;
    const fanLines = 14;
    c.strokeStyle = 'rgba(0, 243, 255, 0.16)';
    c.lineWidth = 1;
    for (let i = 0; i <= fanLines; i++) {
      const bottomX = (w / fanLines) * i;
      c.beginPath();
      c.moveTo(vpX, vpY);
      c.lineTo(bottomX, h);
      c.stroke();
    }

    // Scrolling horizontal lines
    this.gridOffset = (this.gridOffset + 0.4) % 24;
    for (let y = horizonY + this.gridOffset; y < h; y += 22) {
      const progress = (y - horizonY) / (h - horizonY);
      const alpha = progress * 0.25;
      c.strokeStyle = `rgba(255, 0, 127, ${alpha})`;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    // Cyber floating data bits
    for (const p of this.particles) {
      p.y += p.vy;
      p.x += p.vx;
      if (p.y < 0) {
        p.y = h;
        p.x = Math.random() * w;
      }
      c.save();
      c.globalAlpha = p.alpha;
      c.fillStyle = p.color;
      c.shadowColor = p.color;
      c.shadowBlur = 6;
      c.fillRect(p.x, p.y, p.size, p.size * 2);
      c.restore();
    }
  }

  drawFireflies() {
    const c = this.ctx;
    for (const p of this.particles) {
      p.angle += p.speed;
      p.pulsePhase += p.pulseSpeed;
      const curX = p.baseX + Math.cos(p.angle) * p.radiusX;
      const curY = p.baseY + Math.sin(p.angle * 1.5) * p.radiusY;

      // Mouse gentle flee
      let finalX = curX;
      let finalY = curY;
      if (this.mouseX >= 0) {
        const dx = curX - this.mouseX;
        const dy = curY - this.mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist < 120 && dist > 0) {
          const push = (120 - dist) * 0.4;
          finalX += (dx / dist) * push;
          finalY += (dy / dist) * push;
        }
      }

      const pulse = (Math.sin(p.pulsePhase) + 1) * 0.5;
      const alpha = 0.2 + pulse * 0.7;
      const glowR = p.size * (3 + pulse * 3);

      const grad = c.createRadialGradient(finalX, finalY, 0, finalX, finalY, glowR);
      grad.addColorStop(0, p.color);
      grad.addColorStop(0.3, p.color === '#facc15' ? 'rgba(250, 204, 21, 0.4)' : 'rgba(74, 222, 128, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = grad;
      c.beginPath();
      c.arc(finalX, finalY, glowR, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  drawSolar() {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;

    // Radiant Sun flare in top right
    const sunX = w * 0.88;
    const sunY = h * 0.12;
    const sunGrad = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(w, h) * 0.45);
    sunGrad.addColorStop(0, 'rgba(251, 146, 60, 0.3)');
    sunGrad.addColorStop(0.4, 'rgba(234, 88, 12, 0.12)');
    sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = sunGrad;
    c.beginPath();
    c.arc(sunX, sunY, Math.min(w, h) * 0.45, 0, Math.PI * 2);
    c.fill();

    // Rising embers
    for (const p of this.particles) {
      p.swayPhase += 0.03;
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.swayPhase) * 0.5;

      if (p.y < -10) {
        p.y = h + 10;
        p.x = Math.random() * w;
      }

      c.save();
      c.globalAlpha = p.alpha;
      c.fillStyle = p.color;
      c.shadowColor = p.color;
      c.shadowBlur = 8;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
}

const bgEffect = new BackgroundEffectManager(bgCanvas);

const applySkin = (skinId) => {
  const allSkins = ['skin-classic', 'skin-golden', 'skin-cyber', 'skin-ninja', 'skin-cosmic', 'skin-robo'];
  allSkins.forEach(s => cssRabbit.classList.remove(s));
  if (skinId) cssRabbit.classList.add(skinId);
};

const applyTheme = (themeId) => {
  document.body.classList.remove('theme-bg-cyber', 'theme-bg-fireflies', 'theme-bg-solar');
  if (themeId === 'theme-cyber') document.body.classList.add('theme-bg-cyber');
  if (themeId === 'theme-fireflies') document.body.classList.add('theme-bg-fireflies');
  if (themeId === 'theme-solar') document.body.classList.add('theme-bg-solar');
  if (bgEffect) bgEffect.setTheme(themeId);
};

// Apply loaded inventory customizations
applySkin(inventory.equippedSkin);
applyTheme(inventory.equippedTheme);

/* ════════════════════════════════════════════════════════════════════════
   PARTICLE SYSTEM (Canvas-based, requestAnimationFrame)
   ════════════════════════════════════════════════════════════════════════ */
const ctx = particleCanvas.getContext('2d');
let particles = [];
let particleRAF = null;

const resizeCanvas = () => {
  particleCanvas.width  = window.innerWidth;
  particleCanvas.height = window.innerHeight;
};
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = opts.vx ?? (Math.random() - 0.5) * 6;
    this.vy = opts.vy ?? (Math.random() - 0.5) * 6 - 2;
    this.life = opts.life ?? 1;
    this.decay = opts.decay ?? 0.015 + Math.random() * 0.01;
    this.size = opts.size ?? 3 + Math.random() * 3;
    this.color = opts.color ?? `hsl(${40 + Math.random()*30}, 100%, ${60+Math.random()*30}%)`;
    this.shape = opts.shape ?? 'circle'; // 'circle', 'star', 'coin'
    this.gravity = opts.gravity ?? 0.08;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.15;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.life -= this.decay;
    this.rotation += this.rotSpeed;
    return this.life > 0;
  }
  draw(c) {
    c.save();
    c.globalAlpha = Math.max(0, this.life);
    c.translate(this.x, this.y);
    c.rotate(this.rotation);
    c.fillStyle = this.color;
    if (this.shape === 'star') {
      this.drawStar(c, this.size);
    } else if (this.shape === 'coin') {
      c.beginPath();
      c.ellipse(0, 0, this.size, this.size * 0.65, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.arc(0, 0, this.size, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  drawStar(c, r) {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      c[method](Math.cos(angle) * r, Math.sin(angle) * r);
    }
    c.closePath();
    c.fill();
  }
}

const spawnParticles = (screenX, screenY, count, opts = {}) => {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(screenX, screenY, {
      vx: (Math.random() - 0.5) * (opts.spread ?? 8),
      vy: (Math.random() - 0.5) * (opts.spread ?? 8) - (opts.upward ?? 2),
      color: opts.colors ? opts.colors[Math.floor(Math.random() * opts.colors.length)]
             : opts.color,
      shape: opts.shapes ? opts.shapes[Math.floor(Math.random() * opts.shapes.length)]
             : opts.shape,
      size: opts.size ?? undefined,
      life: opts.life ?? undefined,
      decay: opts.decay ?? undefined,
      gravity: opts.gravity ?? undefined,
    }));
  }
};

const updateParticles = () => {
  ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  particles = particles.filter(p => {
    const alive = p.update();
    if (alive) p.draw(ctx);
    return alive;
  });
  if (particles.length > 0) {
    particleRAF = requestAnimationFrame(updateParticles);
  } else {
    particleRAF = null;
  }
};

const ensureParticleLoop = () => {
  if (!particleRAF) particleRAF = requestAnimationFrame(updateParticles);
};

/* Helper: convert arena-local coords to screen coords */
const arenaToScreen = (ax, ay) => {
  const r = arena.getBoundingClientRect();
  return [r.left + ax, r.top + ay];
};

/* ── Particle presets ───────────────────────────────────────────────── */
const burstCatch = (ax, ay) => {
  const [sx, sy] = arenaToScreen(ax, ay);
  spawnParticles(sx, sy, 18, {
    colors: ['#ffd700','#ffaa00','#ffe066','#fff','#ff8800'],
    shapes: ['star','coin','circle'],
    spread: 10,
    upward: 3,
  });
  ensureParticleLoop();
};

const burstMiss = (ax, ay) => {
  const [sx, sy] = arenaToScreen(ax, ay);
  spawnParticles(sx, sy, 8, {
    colors: ['#ff6666','#ff4444','#cc3333'],
    spread: 5,
    size: 2,
    life: 0.6,
    decay: 0.025,
    gravity: 0.02,
  });
  ensureParticleLoop();
};

const burstLevelUp = () => {
  const [sx, sy] = arenaToScreen(arena.clientWidth / 2, arena.clientHeight / 2);
  spawnParticles(sx, sy, 50, {
    colors: ['#ffd700','#ffcc00','#ffee66','#fff5b0'],
    shapes: ['star','coin'],
    spread: 18,
    upward: 5,
    life: 1.2,
    decay: 0.008,
  });
  ensureParticleLoop();
};

const burstRainbow = (ax, ay) => {
  const [sx, sy] = arenaToScreen(ax, ay);
  spawnParticles(sx, sy, 30, {
    colors: ['#ff0000','#ff8800','#ffff00','#00ff00','#0088ff','#8800ff','#ff00ff'],
    shapes: ['star','circle'],
    spread: 14,
    upward: 4,
  });
  ensureParticleLoop();
};

const burstPowerup = (ax, ay) => {
  const [sx, sy] = arenaToScreen(ax, ay);
  // Swirl effect – particles in circular directions
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const speed = 3 + Math.random() * 2;
    particles.push(new Particle(sx, sy, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: `hsl(${i * 22}, 90%, 70%)`,
      shape: 'star',
      size: 3,
      gravity: 0.01,
      decay: 0.018,
    }));
  }
  ensureParticleLoop();
};

const goldenShower = () => {
  const w = particleCanvas.width;
  for (let i = 0; i < 60; i++) {
    particles.push(new Particle(Math.random() * w, -10, {
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 4,
      color: `hsl(${40 + Math.random()*20}, 100%, ${55+Math.random()*30}%)`,
      shape: Math.random() > 0.5 ? 'star' : 'coin',
      size: 2 + Math.random() * 4,
      gravity: 0.04,
      decay: 0.005,
      life: 1.5,
    }));
  }
  ensureParticleLoop();
};

/* ── Cursor trail ───────────────────────────────────────────────────── */
document.addEventListener('mousemove', e => {
  cursorTrail.style.left = e.clientX + 'px';
  cursorTrail.style.top  = e.clientY + 'px';
});

/* ════════════════════════════════════════════════════════════════════════
   ACHIEVEMENTS
   ════════════════════════════════════════════════════════════════════════ */
const shownAchievements = new Set();
const showAchievement = (text) => {
  if (shownAchievements.has(text)) return;
  shownAchievements.add(text);
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.textContent = `🏆 ${text}`;
  achieveContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
};

/* ════════════════════════════════════════════════════════════════════════
   POWER-UPS
   ════════════════════════════════════════════════════════════════════════ */
const POWERUPS = [
  { icon: '⏱️', name: 'Time Freeze', key: 'freeze' },
  { icon: '🧲', name: 'Magnet',      key: 'magnet' },
  { icon: '⚡', name: 'Speed Bonus', key: 'speed'  },
  { icon: '🛡️', name: 'Shield',      key: 'shield' },
];

const spawnPowerup = () => {
  if (!active || activePowerup) return;
  const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  const pad = 40;
  const x = pad + Math.random() * (arena.clientWidth  - pad * 2);
  const y = pad + Math.random() * (arena.clientHeight - pad * 2);

  const el = document.createElement('div');
  el.className = 'power-up';
  el.textContent = pu.icon;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.dataset.key = pu.key;
  arena.appendChild(el);
  activePowerup = el;

  // Remove after lifetime
  const removeTimer = setTimeout(() => {
    if (activePowerup === el) {
      el.remove();
      activePowerup = null;
    }
  }, POWERUP_LIFETIME);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!active || activePowerup !== el) return;
    clearTimeout(removeTimer);
    el.classList.add('collected');
    sfx.powerup();
    burstPowerup(x, y);
    activePowerup = null;
    gameStatus.textContent = `${pu.icon} ${pu.name} collected!`;
    setTimeout(() => el.remove(), 400);
    applyPowerup(pu.key);
  }, { once: true });
};

const applyPowerup = (key) => {
  switch (key) {
    case 'freeze':
      timeFrozen = true;
      clearTimeout(freezeTimer);
      freezeTimer = setTimeout(() => { timeFrozen = false; }, 3000);
      break;
    case 'magnet':
      magnetActive = true;
      target.classList.add('magnet-active');
      // will be consumed on next catch
      break;
    case 'speed':
      speedBonusActive = true;
      // will be consumed on next catch
      break;
    case 'shield':
      shieldActive = true;
      showAchievement('Shield Active!');
      break;
  }
};

const schedulePowerup = () => {
  if (!active) return;
  let minI = POWERUP_MIN_INTERVAL;
  let maxI = POWERUP_MAX_INTERVAL;
  if (inventory.owned.includes('perk-lucky')) {
    minI *= 0.55;
    maxI *= 0.55;
  }
  const delay = minI + Math.random() * (maxI - minI);
  powerupTimer = setTimeout(() => {
    spawnPowerup();
    schedulePowerup();
  }, delay);
};

/* ════════════════════════════════════════════════════════════════════════
   COMBO SYSTEM
   ════════════════════════════════════════════════════════════════════════ */
const updateCombo = () => {
  const now = Date.now();
  if (now - lastCatchTime < COMBO_WINDOW) {
    combo = Math.min(combo + 1, COMBO_MAX);
  } else {
    combo = 1;
  }
  lastCatchTime = now;
  if (combo > bestCombo) bestCombo = combo;

  comboEl.innerHTML = `${combo}<span class="combo-x">×</span>`;
  if (combo >= 2) {
    animateEl(comboEl);
    sfx.combo(combo);
    // Show combo announce
    comboAnnounce.textContent = `🔥 COMBO ×${combo}!`;
    comboAnnounce.className = 'combo-announce show' + (combo >= 4 ? ' rainbow' : '');
    setTimeout(() => comboAnnounce.className = 'combo-announce', 900);
  }
};

/* ════════════════════════════════════════════════════════════════════════
   FEVER MODE
   ════════════════════════════════════════════════════════════════════════ */
const startFever = () => {
  if (feverActive) return;
  feverActive = true;
  sfx.fever();
  arena.classList.add('fever-active');
  feverOverlay.classList.add('active');
  showAchievement('🔥 FEVER MODE!');

  clearTimeout(feverTimer);
  feverTimer = setTimeout(endFever, FEVER_DURATION);
};

const endFever = () => {
  feverActive = false;
  arena.classList.remove('fever-active');
  feverOverlay.classList.remove('active');
};

/* ════════════════════════════════════════════════════════════════════════
   UI HELPERS
   ════════════════════════════════════════════════════════════════════════ */
const animateEl = (el) => {
  el.classList.remove('pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');
  setTimeout(() => el.classList.remove('pop-anim'), 200);
};

const setOverlay = (title, message, visible) => {
  overlayTitle.textContent = title;
  overlayMsg.textContent = message;
  arenaOverlay.classList.toggle('is-visible', visible);
};

const updateScoreboard = () => {
  scoreEl.textContent = String(score);
  streakEl.innerHTML = `${streak}<span class="streak-x">×</span>`;
};

const updateLevelProgress = () => {
  const inLevel = score % CATCHES_PER_LEVEL;
  const pct = (inLevel / CATCHES_PER_LEVEL) * 100;
  levelProgress.style.width = pct + '%';
  levelProgressLbl.textContent = `${inLevel} / ${CATCHES_PER_LEVEL} to Level ${level + 1}`;
};

const setArenaTheme = () => {
  const themeIndex = Math.min(level, ARENA_THEMES.length - 1);
  ARENA_THEMES.forEach(t => { if (t) arena.classList.remove(t); });
  if (ARENA_THEMES[themeIndex]) arena.classList.add(ARENA_THEMES[themeIndex]);
  arena.classList.toggle('fast-level', level >= 4);
};

/* ── Footprints ─────────────────────────────────────────────────────── */
const addFootprint = (x, y) => {
  const fp1 = document.createElement('div');
  fp1.className = 'footprint';
  fp1.style.left = (x - 8) + 'px';
  fp1.style.top  = (y + 10) + 'px';
  const fp2 = document.createElement('div');
  fp2.className = 'footprint';
  fp2.style.left = (x + 4) + 'px';
  fp2.style.top  = (y + 12) + 'px';
  footprintsLayer.append(fp1, fp2);
  setTimeout(() => { fp1.remove(); fp2.remove(); }, 2000);
};

/* ── Miss ripple ────────────────────────────────────────────────────── */
const createMissRipple = (x, y) => {
  const r = document.createElement('div');
  r.className = 'miss-ripple';
  r.style.left = x + 'px';
  r.style.top  = y + 'px';
  catchEffects.appendChild(r);
  setTimeout(() => r.remove(), 600);
};

/* ── Screen shake ───────────────────────────────────────────────────── */
const shakeArena = () => {
  arena.classList.remove('shake');
  void arena.offsetWidth;
  arena.classList.add('shake');
  setTimeout(() => arena.classList.remove('shake'), 350);
};

/* ── Floating reward text ───────────────────────────────────────────── */
const floatReward = (x, y, text) => {
  const el = document.createElement('span');
  el.className = 'coin-float';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = (y - 10) + 'px';
  catchEffects.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
};

/* ── Catch effects ──────────────────────────────────────────────────── */
const createCatchEffect = (reward) => {
  const x = parseFloat(target.style.left);
  const y = parseFloat(target.style.top);

  // Ring burst
  const burst = document.createElement('span');
  burst.className = 'catch-burst';
  burst.style.left = x + 'px';
  burst.style.top  = y + 'px';
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
  catchEffects.appendChild(burst);

  // Coin sparks
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('span');
    spark.className = 'coin-spark';
    spark.style.setProperty('--spark-angle', `${i * 45}deg`);
    burst.appendChild(spark);
  }

  // Star particles (DOM)
  const starEmojis = ['⭐','✨','💫','🌟'];
  for (let i = 0; i < 6; i++) {
    const star = document.createElement('span');
    star.className = 'star-particle';
    star.textContent = starEmojis[i % starEmojis.length];
    star.style.left = x + 'px';
    star.style.top  = y + 'px';
    const angle = Math.random() * Math.PI * 2;
    const dist  = 30 + Math.random() * 50;
    star.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
    star.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
    catchEffects.appendChild(star);
    setTimeout(() => star.remove(), 700);
  }

  // Floating reward text
  floatReward(x, y, `+${reward} 🪙`);

  // Canvas particles
  burstCatch(x, y);
};

/* ════════════════════════════════════════════════════════════════════════
   DIFFICULTY & PLACEMENT
   ════════════════════════════════════════════════════════════════════════ */
const setDifficulty = () => {
  level = Math.floor(score / CATCHES_PER_LEVEL) + 1;
  levelEl.textContent = String(level);
  const targetSize = Math.max(48, 78 - (level - 1) * 5);
  arena.style.setProperty('--target-size', `${targetSize}px`);
  updateLevelProgress();
  setArenaTheme();
};

const playLevelUpEffect = () => {
  arena.classList.remove('level-up');
  void arena.offsetWidth;
  arena.classList.add('level-up');
  sfx.levelUp();
  burstLevelUp();
  goldenShower();
};

const placeTarget = () => {
  target.hidden = false;
  target.classList.remove('poof');
  const pad = target.offsetWidth / 2 + 10;
  const aw = arena.clientWidth  - pad * 2;
  const ah = arena.clientHeight - pad * 2;
  const x = pad + Math.random() * Math.max(0, aw);
  const y = pad + Math.random() * Math.max(0, ah);

  // Footprint at old position
  const oldX = parseFloat(target.style.left);
  const oldY = parseFloat(target.style.top);
  if (oldX && oldY) addFootprint(oldX, oldY);

  target.style.left = x + 'px';
  target.style.top  = y + 'px';

  // Hop animation
  cssRabbit.classList.remove('hopping');
  void cssRabbit.offsetWidth;
  cssRabbit.classList.add('hopping');

  const hopDelay = feverActive
    ? Math.max(250, 600 - (level - 1) * 80)
    : Math.max(360, 1050 - (level - 1) * 100);
  nextTargetAt = Date.now() + hopDelay + Math.random() * 180;
};

/* ════════════════════════════════════════════════════════════════════════
   TIMER & HEARTBEAT
   ════════════════════════════════════════════════════════════════════════ */
let lastHeartbeat = 0;

const updateTimer = () => {
  if (!active) return;

  const now = Date.now();
  if (!timeFrozen) {
    // normal timer
  } else {
    // extend end time
    endsAt += 100; // roughly compensate for the interval
  }

  const remainMs = endsAt - now;
  const remainS  = Math.max(0, Math.ceil(remainMs / 1000));
  timeEl.textContent = String(remainS);
  timeEl.classList.toggle('time-warning', remainS <= 5);
  arena.classList.toggle('time-critical', remainS <= 5 && remainS > 0);

  // Heartbeat sound in last 5 seconds
  if (remainS <= 5 && remainS > 0 && now - lastHeartbeat > 900) {
    sfx.heartbeat();
    lastHeartbeat = now;
  }

  if (remainMs <= 0) {
    endRound();
    return;
  }

  // Auto-hop if time expired for current target
  if (now >= nextTargetAt) {
    if (shieldActive) {
      shieldActive = false;
      gameStatus.textContent = '🛡️ Shield absorbed the miss!';
    } else {
      misses++;
      streak = 0;
      combo = 1;
      comboEl.innerHTML = `1<span class="combo-x">×</span>`;
      updateScoreboard();
      gameStatus.textContent = 'The rabbit ran away! Catch it at its next spot.';
    }
    placeTarget();
  }
};

/* ════════════════════════════════════════════════════════════════════════
   ROUND LIFECYCLE
   ════════════════════════════════════════════════════════════════════════ */
const startRound = () => {
  initAudio();
  clearInterval(timerId);
  clearTimeout(powerupTimer);
  clearTimeout(feverTimer);
  clearTimeout(freezeTimer);
  if (activePowerup) { activePowerup.remove(); activePowerup = null; }

  score = 0; streak = 0; misses = 0; totalCatches = 0;
  level = 1; combo = 1; bestCombo = 1; longestStreak = 0;
  lastCatchTime = 0; roundCoins = 0; wasBest = false;
  feverActive = false; shieldActive = false;
  speedBonusActive = false; magnetActive = false;
  timeFrozen = false; lastHeartbeat = 0;
  shownAchievements.clear();
  endFever();
  target.classList.remove('magnet-active', 'poof');

  active = true;
  const roundDuration = getRoundLength();
  endsAt = Date.now() + roundDuration * 1000;

  timeEl.classList.remove('time-warning');
  arena.classList.remove('time-critical');
  updateScoreboard();
  setDifficulty();
  comboEl.innerHTML = `1<span class="combo-x">×</span>`;
  timeEl.textContent = String(roundDuration);
  startButton.disabled = true;
  startBtnTxt.textContent = 'ROUND IN PROGRESS';
  gameStatus.textContent = 'The rabbit is running! Catch it before it hops away.';
  arena.classList.add('is-playing');
  setOverlay('', '', false);
  summaryModal.hidden = true;
  if (shopModal) shopModal.hidden = true;

  // Apply round-start perks
  if (inventory.owned.includes('perk-magnet-start')) {
    applyPowerup('magnet');
  }
  if (inventory.owned.includes('perk-shield-start')) {
    applyPowerup('shield');
  }

  placeTarget();
  timerId = setInterval(updateTimer, 100);
  schedulePowerup();
};

const endRound = () => {
  active = false;
  clearInterval(timerId);
  clearTimeout(powerupTimer);
  clearTimeout(feverTimer);
  clearTimeout(freezeTimer);
  timerId = null;
  endFever();
  target.hidden = true;
  if (activePowerup) { activePowerup.remove(); activePowerup = null; }

  arena.classList.remove('is-playing', 'time-critical');
  timeEl.textContent = '0';
  timeEl.classList.add('time-warning');
  startButton.disabled = false;
  startBtnTxt.textContent = 'PLAY AGAIN';
  gameStatus.textContent = `Time! You caught ${score} ${score === 1 ? 'rabbit' : 'rabbits'}.`;
  setOverlay('Round complete', `${score} caught — tap Continue`, true);

  // Show summary
  showSummary();
};

/* ════════════════════════════════════════════════════════════════════════
   END-OF-ROUND SUMMARY
   ════════════════════════════════════════════════════════════════════════ */
const showSummary = () => {
  const total = totalCatches + misses;
  const accuracy = total > 0 ? Math.round((totalCatches / total) * 100) : 0;

  // Performance rating
  let rating = 'D';
  if (score >= 25 && accuracy >= 80) rating = 'S';
  else if (score >= 18 && accuracy >= 65) rating = 'A';
  else if (score >= 12 && accuracy >= 50) rating = 'B';
  else if (score >= 6)  rating = 'C';

  const ratingEl = $('summaryRating');
  ratingEl.textContent = rating;
  ratingEl.className = 'summary-rating rate-' + rating;

  $('sumCatches').textContent  = String(totalCatches);
  $('sumMisses').textContent   = String(misses);
  $('sumAccuracy').textContent = accuracy + '%';
  $('sumCombo').textContent    = bestCombo + '×';
  $('sumStreak').textContent   = String(longestStreak);
  $('sumCoins').textContent    = String(roundCoins);

  const newBestEl = $('summaryNewBest');
  newBestEl.hidden = !wasBest;

  if (sumShopCoins) sumShopCoins.textContent = String(coins);

  summaryModal.hidden = false;
};

summaryCloseBtn.addEventListener('click', () => {
  summaryModal.hidden = true;
});
if (summaryShopBtn) {
  summaryShopBtn.addEventListener('click', () => {
    summaryModal.hidden = true;
    openShop();
  });
}

/* ════════════════════════════════════════════════════════════════════════
   CATCH HANDLER
   ════════════════════════════════════════════════════════════════════════ */
target.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!active) return;

  score++;
  totalCatches++;
  streak++;
  if (streak > longestStreak) longestStreak = streak;

  // Combo
  updateCombo();

  // Fever check
  if (streak >= FEVER_THRESHOLD && !feverActive) startFever();

  // Calculate reward
  let multiplier = combo;
  if (feverActive) multiplier = Math.max(multiplier, 5);
  if (speedBonusActive) { multiplier *= 3; speedBonusActive = false; }
  if (inventory.owned.includes('perk-double-coins')) { multiplier *= 2; }
  const reward = Math.max(1, multiplier);
  coins += reward;
  roundCoins += reward;

  // Magnet consumed
  if (magnetActive) {
    magnetActive = false;
    target.classList.remove('magnet-active');
  }

  // Poof animation
  target.classList.add('poof');

  // UI updates
  updateCoinsDisplay();
  animateEl(coinsEl);
  animateEl(scoreEl);
  save('rabbit-chase-coins', coins);

  if (score > best) {
    best = score;
    wasBest = true;
    bestEl.textContent = String(best);
    save('rabbit-chase-best', best);
  }

  updateScoreboard();
  const prevLevel = level;
  setDifficulty();
  createCatchEffect(reward);
  sfx.catch();

  // Achievements
  if (totalCatches === 1)  showAchievement('First Catch!');
  if (streak === 5)        showAchievement('5 Streak!');
  if (streak === 10)       showAchievement('10 Streak!');
  if (streak === 20)       showAchievement('Speed Demon!');
  if (combo === COMBO_MAX) showAchievement('MAX COMBO!');

  // Streak milestone rainbow burst
  if (streak > 0 && streak % 5 === 0) {
    const tx = parseFloat(target.style.left);
    const ty = parseFloat(target.style.top);
    burstRainbow(tx, ty);
  }

  if (level > prevLevel) {
    gameStatus.textContent = `Level ${level}! Faster rabbit! +${reward} coins`;
    playLevelUpEffect();
    showAchievement(`Level ${level}!`);
  } else if (combo >= 2) {
    gameStatus.textContent = `COMBO ×${combo}! +${reward} coins!`;
  } else {
    gameStatus.textContent = `Caught it! +${reward} coin${reward === 1 ? '' : 's'}`;
  }

  // Brief delay for poof, then place
  setTimeout(() => {
    if (active) placeTarget();
  }, 150);
});

/* ── Miss handler ───────────────────────────────────────────────────── */
arena.addEventListener('click', (e) => {
  if (!active || e.target.closest('.target') || e.target.closest('.power-up')) return;

  const rect = arena.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (shieldActive) {
    shieldActive = false;
    gameStatus.textContent = '🛡️ Shield absorbed the miss!';
    createMissRipple(mx, my); // still show visual
    return;
  }

  misses++;
  streak = 0;
  combo = 1;
  comboEl.innerHTML = `1<span class="combo-x">×</span>`;
  updateScoreboard();
  gameStatus.textContent = 'Miss! Tap the rabbit, not the empty space.';
  sfx.miss();
  createMissRipple(mx, my);
  burstMiss(mx, my);
  shakeArena();
});

/* ── Level-up animation cleanup ─────────────────────────────────────── */
arena.addEventListener('animationend', (e) => {
  if (e.target === arena && e.animationName === 'level-up-flash') {
    arena.classList.remove('level-up');
  }
});

/* ════════════════════════════════════════════════════════════════════════
   SHOP & ECONOMY SYSTEM
   ════════════════════════════════════════════════════════════════════════ */
const SHOP_ITEMS = [
  // Bunny Skins
  {
    id: 'skin-classic',
    category: 'skins',
    name: 'Classic Rabbit',
    cost: 0,
    rarity: 'default',
    desc: 'The swift and iconic white bunny with rosy ears.',
    buff: 'Standard Look',
    icon: '🐇'
  },
  {
    id: 'skin-golden',
    category: 'skins',
    name: 'Golden Hare',
    cost: 50,
    rarity: 'rare',
    desc: 'Crafted from pure gold. Gleams with luxury and prestige.',
    buff: 'Gold Shimmer FX',
    icon: '✨'
  },
  {
    id: 'skin-cyber',
    category: 'skins',
    name: 'Cyber Bunny',
    cost: 90,
    rarity: 'epic',
    desc: 'Equipped with a neon cyber visor & high-speed circuits.',
    buff: 'Neon Visor & Trail',
    icon: '⚡'
  },
  {
    id: 'skin-ninja',
    category: 'skins',
    name: 'Shadow Ninja',
    cost: 130,
    rarity: 'epic',
    desc: 'Veiled in midnight shadows with a crimson gaze.',
    buff: 'Smoke Paws & Mask',
    icon: '🥷'
  },
  {
    id: 'skin-cosmic',
    category: 'skins',
    name: 'Cosmic Starlight',
    cost: 180,
    rarity: 'legendary',
    desc: 'Infused with stardust and swirling deep nebula energy.',
    buff: 'Cosmic Aura Glow',
    icon: '🌌'
  },
  {
    id: 'skin-robo',
    category: 'skins',
    name: 'Robo-Bun 3000',
    cost: 250,
    rarity: 'legendary',
    desc: 'High-grade titanium android with LED antenna sensors.',
    buff: 'Laser Optic Sensors',
    icon: '🤖'
  },

  // Upgrades & Perks
  {
    id: 'perk-time',
    category: 'perks',
    name: 'Chronos Watch (+5s)',
    cost: 70,
    rarity: 'rare',
    desc: 'Permanently increases round duration from 30s to 35 seconds!',
    buff: '+5s Round Time',
    icon: '⏳'
  },
  {
    id: 'perk-double-coins',
    category: 'perks',
    name: 'Double Coin Bag',
    cost: 120,
    rarity: 'legendary',
    desc: 'Permanently doubles all coin rewards earned on every catch (2×)!',
    buff: 'Permanent 2× Coins',
    icon: '💰'
  },
  {
    id: 'perk-magnet-start',
    category: 'perks',
    name: 'Magnetic Charm',
    cost: 60,
    rarity: 'rare',
    desc: 'Start every single round with the Magnet power-up already active!',
    buff: 'Magnet on Start',
    icon: '🧲'
  },
  {
    id: 'perk-shield-start',
    category: 'perks',
    name: 'Guardian Barrier',
    cost: 60,
    rarity: 'rare',
    desc: 'Start every round with a Miss Shield to protect your combo streak!',
    buff: 'Shield on Start',
    icon: '🛡️'
  },
  {
    id: 'perk-lucky',
    category: 'perks',
    name: 'Lucky Clover',
    cost: 85,
    rarity: 'epic',
    desc: 'Power-ups (Freeze, Speed, Shield, Magnet) spawn 50% more often!',
    buff: '+50% Power-up Spawns',
    icon: '🍀'
  },

  // Background Themes
  {
    id: 'theme-cosmic',
    category: 'themes',
    name: 'Cosmic Constellations',
    cost: 0,
    rarity: 'default',
    desc: 'Deep space stars, glowing constellation lines & shooting meteors.',
    buff: 'Interactive Star Field',
    previewClass: 'cosmic-preview'
  },
  {
    id: 'theme-cyber',
    category: 'themes',
    name: 'Cyber Neon Grid',
    cost: 45,
    rarity: 'rare',
    desc: 'Synthwave 3D perspective grid with rising neon cyber sparks.',
    buff: 'Synthwave 3D Grid',
    previewClass: 'cyber-preview'
  },
  {
    id: 'theme-fireflies',
    category: 'themes',
    name: 'Enchanted Twilight',
    cost: 65,
    rarity: 'epic',
    desc: 'Magical glowing fireflies drifting organically through a forest.',
    buff: 'Living Firefly Swarm',
    previewClass: 'fireflies-preview'
  },
  {
    id: 'theme-solar',
    category: 'themes',
    name: 'Solar Ember Sunset',
    cost: 90,
    rarity: 'legendary',
    desc: 'Warm sunset solar flare with floating embers and soft bokeh lights.',
    buff: 'Radiant Flare & Embers',
    previewClass: 'solar-preview'
  }
];

const renderItemPreview = (item) => {
  if (item.category === 'skins') {
    return `
      <div class="item-preview">
        <div class="preview-rabbit-wrap">
          <div class="css-rabbit ${item.id}">
            <div class="rabbit-ear rabbit-ear-l"></div>
            <div class="rabbit-ear rabbit-ear-r"></div>
            <div class="rabbit-head">
              <div class="rabbit-eye rabbit-eye-l"></div>
              <div class="rabbit-eye rabbit-eye-r"></div>
              <div class="rabbit-nose"></div>
              <div class="rabbit-mouth"></div>
            </div>
            <div class="rabbit-body"></div>
            <div class="rabbit-tail"></div>
            <div class="rabbit-foot rabbit-foot-l"></div>
            <div class="rabbit-foot rabbit-foot-r"></div>
          </div>
        </div>
      </div>
    `;
  }
  if (item.category === 'themes') {
    return `
      <div class="item-preview">
        <div class="theme-preview-box ${item.previewClass}"></div>
      </div>
    `;
  }
  return `
    <div class="item-preview">
      <span class="item-preview-icon" aria-hidden="true">${item.icon}</span>
    </div>
  `;
};

const renderShopCard = (item) => {
  const isOwned = item.cost === 0 || inventory.owned.includes(item.id);
  const isEquippedSkin = item.category === 'skins' && inventory.equippedSkin === item.id;
  const isEquippedTheme = item.category === 'themes' && inventory.equippedTheme === item.id;
  const isActivePerk = item.category === 'perks' && isOwned;
  const canAfford = coins >= item.cost;

  let cardClasses = 'shop-item-card';
  if (isEquippedSkin || isEquippedTheme) cardClasses += ' is-equipped';
  if (isActivePerk) cardClasses += ' is-active-perk';

  let actionHtml = '';
  if (isOwned) {
    if (item.category === 'skins') {
      actionHtml = isEquippedSkin
        ? `<button class="item-btn btn-equipped" type="button" disabled>EQUIPPED ✓</button>`
        : `<button class="item-btn btn-equip" data-action="equip" data-id="${item.id}" type="button">EQUIP</button>`;
    } else if (item.category === 'themes') {
      actionHtml = isEquippedTheme
        ? `<button class="item-btn btn-equipped" type="button" disabled>ACTIVE FX ✓</button>`
        : `<button class="item-btn btn-equip" data-action="equip-theme" data-id="${item.id}" type="button">ACTIVATE</button>`;
    } else if (item.category === 'perks') {
      actionHtml = `<button class="item-btn btn-active-perk" type="button" disabled>ACTIVE PERK ✓</button>`;
    }
  } else {
    actionHtml = `
      <div class="item-price"><span>${item.cost}</span> 🪙</div>
      <button class="item-btn btn-buy" data-action="buy" data-id="${item.id}" type="button" ${canAfford ? '' : 'disabled'}>
        ${canAfford ? 'BUY' : 'NEED COINS'}
      </button>
    `;
  }

  return `
    <div class="${cardClasses}">
      <span class="item-badge badge-${item.rarity}">${item.rarity}</span>
      ${renderItemPreview(item)}
      <div class="item-details">
        <h3 class="item-name">${item.name}</h3>
        <p class="item-desc">${item.desc}</p>
        <span class="item-buff">${item.buff}</span>
      </div>
      <div class="item-actions">
        ${actionHtml}
      </div>
    </div>
  `;
};

const renderShop = () => {
  if (skinsGrid) {
    const skins = SHOP_ITEMS.filter(it => it.category === 'skins');
    skinsGrid.innerHTML = skins.map(renderShopCard).join('');
  }
  if (perksGrid) {
    const perks = SHOP_ITEMS.filter(it => it.category === 'perks');
    perksGrid.innerHTML = perks.map(renderShopCard).join('');
  }
  if (themesGrid) {
    const themes = SHOP_ITEMS.filter(it => it.category === 'themes');
    themesGrid.innerHTML = themes.map(renderShopCard).join('');
  }
  updateCoinsDisplay();
};

const buyItem = (itemId, buttonEl) => {
  initAudio();
  const item = SHOP_ITEMS.find(it => it.id === itemId);
  if (!item) return;

  if (coins < item.cost) {
    sfx.error();
    gameStatus.textContent = `Need ${item.cost - coins} more coins to buy ${item.name}!`;
    if (buttonEl) {
      buttonEl.classList.add('shake');
      setTimeout(() => buttonEl.classList.remove('shake'), 400);
    }
    return;
  }

  // Deduct coins
  coins -= item.cost;
  save('rabbit-chase-coins', coins);
  updateCoinsDisplay();

  // Add to owned inventory
  if (!inventory.owned.includes(item.id)) {
    inventory.owned.push(item.id);
  }

  // Auto-equip cosmetics / themes
  if (item.category === 'skins') {
    inventory.equippedSkin = item.id;
    applySkin(item.id);
  } else if (item.category === 'themes') {
    inventory.equippedTheme = item.id;
    applyTheme(item.id);
  }

  // If chronos watch (+5s) perk, update the time display on screen
  if (item.id === 'perk-time') {
    timeEl.textContent = String(getRoundLength());
  }

  saveInventory();
  sfx.purchase();

  // Celebration particles over the clicked button
  if (buttonEl) {
    const rect = buttonEl.getBoundingClientRect();
    spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 28, {
      colors: ['#ffd700', '#ffcc00', '#ffffff', '#64e6ac'],
      shapes: ['coin', 'star'],
      spread: 12,
      upward: 3,
    });
    ensureParticleLoop();
  }

  showAchievement(`Unlocked ${item.name}!`);
  renderShop();
};

const equipItem = (itemId) => {
  initAudio();
  const item = SHOP_ITEMS.find(it => it.id === itemId);
  if (!item) return;

  if (item.category === 'skins') {
    inventory.equippedSkin = item.id;
    applySkin(item.id);
    sfx.equip();
    showAchievement(`Equipped ${item.name}!`);
  } else if (item.category === 'themes') {
    inventory.equippedTheme = item.id;
    applyTheme(item.id);
    sfx.equip();
    showAchievement(`Theme: ${item.name}`);
  }

  saveInventory();
  renderShop();
};

const handleShopGridClick = (e) => {
  const btn = e.target.closest('.item-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;

  if (action === 'buy') {
    buyItem(id, btn);
  } else if (action === 'equip' || action === 'equip-theme') {
    equipItem(id);
  }
};

if (skinsGrid) skinsGrid.addEventListener('click', handleShopGridClick);
if (perksGrid) perksGrid.addEventListener('click', handleShopGridClick);
if (themesGrid) themesGrid.addEventListener('click', handleShopGridClick);

/* Tab switcher */
const shopTabs = document.querySelectorAll('.shop-tab');
shopTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    shopTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    const targetTab = tab.dataset.tab;
    const panelSkins = $('tabPanel-skins');
    const panelPerks = $('tabPanel-perks');
    const panelThemes = $('tabPanel-themes');
    if (panelSkins) panelSkins.hidden = targetTab !== 'skins';
    if (panelPerks) panelPerks.hidden = targetTab !== 'perks';
    if (panelThemes) panelThemes.hidden = targetTab !== 'themes';
  });
});

/* Modal controls */
const openShop = () => {
  initAudio();
  updateCoinsDisplay();
  renderShop();
  if (shopModal) shopModal.hidden = false;
  sfx.openShop();
};

const closeShop = () => {
  if (shopModal) shopModal.hidden = true;
};

if (shopBtn) shopBtn.addEventListener('click', openShop);
if (shopCloseBtn) shopCloseBtn.addEventListener('click', closeShop);
if (shopDoneBtn) shopDoneBtn.addEventListener('click', closeShop);
if (shopBackdrop) shopBackdrop.addEventListener('click', closeShop);

// Initial shop render
renderShop();

/* ── Start button ───────────────────────────────────────────────────── */
startButton.addEventListener('click', startRound);

})();
