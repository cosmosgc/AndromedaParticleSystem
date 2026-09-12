const $ = (id) => document.getElementById(id);

const canvas = $("stage");
const ctx = canvas.getContext("2d");
const stats = $("stats");
const yamlOutput = $("yamlOutput");

const WORLD_SCALE = 96; // px per world unit, matches worldToCanvas

const fields = [
  "effectId", "spritePath", "spriteState", "shader", "renderLayer",
  "particleSize", "sizeVariance", "lifetime", "lifetimeVariance", "duration", "maxCount", "emissionRate",
  "speed", "speedVariance", "emitAngle", "spreadAngle", "gravity", "drag", "terminalSpeed",
  "stretchFactor", "forceX", "forceY", "noiseStrength", "noiseFrequency", "shapeType",
  "shapeRadius", "boxX", "boxY",
  "startRotation", "startRotationVariance", "rotationSpeed", "rotationSpeedVariance",
  "inheritVelocity", "spawnOffsetX", "spawnOffsetY",
  "startColor", "startAlpha", "endColor", "endAlpha",
  "subEmitterOnSpawn", "subEmitterOnDeath"
];

const checkFields = [
  "burst", "worldSpace", "ignoreQualitySettings", "alignToVelocity",
  "enableSizeCurve", "enableSpeedCurve", "enableAlphaCurve", "enableColorCurve",
  "enableEmissionCurve", "enableForceCurve", "enableVelocityCurve"
];

// Mirrors Content.Shared/_Starfall/Particles/ParticleEffectPrototype.cs defaults.
const protoDefaults = {
  effectId: "MyParticleEffect",
  spritePath: "effects/particles.rsi",
  spriteState: "spark",
  shader: "",
  renderLayer: 0,
  particleSize: 0.2,
  sizeVariance: 0,
  lifetime: 1,
  lifetimeVariance: 0.2,
  duration: 0,
  maxCount: 50,
  emissionRate: 20,
  burst: false,
  worldSpace: true,
  ignoreQualitySettings: false,
  alignToVelocity: false,
  speed: 1,
  speedVariance: 0.3,
  emitAngle: 0,
  spreadAngle: 360,
  gravity: 0,
  drag: 0,
  terminalSpeed: 0,
  stretchFactor: 0,
  forceX: 0,
  forceY: 0,
  noiseStrength: 0,
  noiseFrequency: 1,
  shapeType: "Point",
  shapeRadius: 0.5,
  boxX: 0.5,
  boxY: 0.5,
  startRotation: 0,
  startRotationVariance: 0,
  rotationSpeed: 0,
  rotationSpeedVariance: 0,
  inheritVelocity: 0,
  spawnOffsetX: 0,
  spawnOffsetY: 0,
  startColor: "#ffffff",
  startAlpha: 1,
  endColor: "#ffffff",
  endAlpha: 0,
  subEmitterOnSpawn: "",
  subEmitterOnDeath: ""
};

const curveDefaults = {
  size: [
    { time: 0, value: 1 },
    { time: 1, value: 0.2 }
  ],
  speed: [
    { time: 0, value: 1 },
    { time: 1, value: 0.1 }
  ],
  alpha: [
    { time: 0, value: 1 },
    { time: 1, value: 0 }
  ],
  color: [
    { time: 0, color: "#ffee88", alpha: 1 },
    { time: 0.6, color: "#ff8800", alpha: 0.8 },
    { time: 1, color: "#ff0000", alpha: 0 }
  ],
  emission: [
    { time: 0, value: 1 },
    { time: 1, value: 1 }
  ],
  force: [
    { time: 0, x: 0, y: 0 },
    { time: 1, x: 0, y: 0 }
  ],
  velocity: [
    { time: 0, x: 0, y: 0 },
    { time: 1, x: 0, y: 0 }
  ]
};

const burstDefaults = [];

const presets = window.particlePresets || {};

let curves = structuredClone(curveDefaults);
let timedBursts = structuredClone(burstDefaults);
let particles = [];
let accumulator = 0;
let emitterAge = 0;
let firedBurstFlags = [];
let lastTime = performance.now();
let paused = false;
let burstDone = false;
const spriteCache = new Map();
const tintCanvas = document.createElement("canvas");
const tintCtx = tintCanvas.getContext("2d");
let customSprite = null;
let customSpriteUrl = null;

function number(id) {
  return Number($(id).value) || 0;
}

// Null-safe checkbox read so a stale cached index.html (missing new toggles)
// degrades to defaults instead of throwing inside the frame loop and killing
// the whole sim.
function isChecked(id, fallback = false) {
  const el = $(id);
  return el ? el.checked : fallback;
}

function config() {
  return {
    effectId: $("effectId").value.trim() || "MyParticleEffect",
    spritePath: $("spritePath").value.trim(),
    spriteState: $("spriteState").value.trim(),
    shader: $("shader").value.trim(),
    renderLayer: Math.floor(number("renderLayer")),
    particleSize: Math.max(0.01, number("particleSize")),
    sizeVariance: number("sizeVariance"),
    lifetime: Math.max(0.05, number("lifetime")),
    lifetimeVariance: number("lifetimeVariance"),
    duration: Math.max(0, number("duration")),
    maxCount: Math.max(1, Math.floor(number("maxCount"))),
    emissionRate: Math.max(0, number("emissionRate")),
    burst: $("burst").checked,
    worldSpace: $("worldSpace").checked,
    ignoreQualitySettings: $("ignoreQualitySettings").checked,
    alignToVelocity: $("alignToVelocity") ? $("alignToVelocity").checked : false,
    speed: number("speed"),
    speedVariance: number("speedVariance"),
    emitAngle: number("emitAngle"),
    spreadAngle: number("spreadAngle"),
    gravity: number("gravity"),
    drag: number("drag"),
    terminalSpeed: number("terminalSpeed"),
    stretchFactor: number("stretchFactor"),
    forceX: number("forceX"),
    forceY: number("forceY"),
    noiseStrength: number("noiseStrength"),
    noiseFrequency: Math.max(0.01, number("noiseFrequency")),
    shapeType: $("shapeType").value,
    shapeRadius: number("shapeRadius"),
    boxX: number("boxX"),
    boxY: number("boxY"),
    startRotation: number("startRotation"),
    startRotationVariance: number("startRotationVariance"),
    rotationSpeed: number("rotationSpeed"),
    rotationSpeedVariance: number("rotationSpeedVariance"),
    inheritVelocity: $("inheritVelocity") ? number("inheritVelocity") : 0,
    spawnOffsetX: $("spawnOffsetX") ? number("spawnOffsetX") : 0,
    spawnOffsetY: $("spawnOffsetY") ? number("spawnOffsetY") : 0,
    startColor: $("startColor") ? $("startColor").value : "#ffffff",
    startAlpha: $("startAlpha") ? clamp(Number($("startAlpha").value), 0, 1) : 1,
    endColor: $("endColor") ? $("endColor").value : "#ffffff",
    endAlpha: $("endAlpha") ? clamp(Number($("endAlpha").value), 0, 1) : 0,
    subEmitterOnSpawn: $("subEmitterOnSpawn") ? $("subEmitterOnSpawn").value.trim() : "",
    subEmitterOnDeath: $("subEmitterOnDeath") ? $("subEmitterOnDeath").value.trim() : ""
  };
}

function hexToRgb(hex, alpha = 1) {
  const raw = hex.replace("#", "");
  const value = parseInt(raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: alpha
  };
}

function rgbToCss(color) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

function normalizeAssetPath(path) {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function spriteKey(path, state) {
  return `${normalizeAssetPath(path)}::${state.trim()}`;
}

function spriteCandidates(path, state) {
  const normalizedPath = normalizeAssetPath(path);
  const normalizedState = state.trim();
  if (!normalizedPath) return [];

  if (/\.(png|webp|jpe?g|gif)$/i.test(normalizedPath)) {
    return [normalizedPath];
  }

  const base = normalizedPath.replace(/\/$/, "");
  if (/\.rsi$/i.test(base)) {
    return [
      `${base}/${normalizedState}.png`,
      `${base}/${normalizedState}/0.png`,
      `${base}/${normalizedState}/${normalizedState}.png`
    ];
  }

  return [
    `${base}/${normalizedState}.png`,
    `${base}.png`,
    base
  ];
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = encodeURI(url);
  });
}

async function loadSpriteMeta(path, state) {
  const normalizedPath = normalizeAssetPath(path).replace(/\/$/, "");
  if (!/\.rsi$/i.test(normalizedPath)) return null;

  try {
    const response = await fetch(encodeURI(`${normalizedPath}/meta.json`));
    if (!response.ok) return null;
    const meta = await response.json();
    const size = meta.size;
    const stateMeta = Array.isArray(meta.states)
      ? meta.states.find((entry) => entry.name === state)
      : null;

    if (!size || !Number(size.x) || !Number(size.y)) return null;
    return {
      width: Number(size.x),
      height: Number(size.y),
      directions: Number(stateMeta?.directions) || 1
    };
  } catch {
    return null;
  }
}

async function loadSprite(path, state) {
  const meta = await loadSpriteMeta(path, state);
  const candidates = spriteCandidates(path, state);

  for (const url of candidates) {
    try {
      const image = await loadImage(url);
      return {
        image,
        frame: meta
          ? { x: 0, y: 0, width: meta.width, height: meta.height }
          : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
      };
    } catch {
      // Try the next common sprite location before falling back to procedural particles.
    }
  }

  return null;
}

function getSpritePreview(cfg) {
  if (customSprite?.status === "ready") return customSprite.sprite;
  if (customSprite?.status === "loading") return null;
  const key = spriteKey(cfg.spritePath, cfg.spriteState);
  const cached = spriteCache.get(key);
  if (cached?.status === "ready") return cached.sprite;
  if (cached?.status === "error" || cached?.status === "loading") return null;

  spriteCache.set(key, { status: "loading", sprite: null });
  loadSprite(cfg.spritePath, cfg.spriteState).then((sprite) => {
    spriteCache.set(key, sprite
      ? { status: "ready", sprite }
      : { status: "error", sprite: null });
  });
  return null;
}

function setCustomSpriteStatus(message, isError = false) {
  const status = $("customSpriteStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setCustomSprite(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setCustomSpriteStatus(`"${file.name}" is not an image.`, true);
    return;
  }
  if (customSpriteUrl) URL.revokeObjectURL(customSpriteUrl);
  customSpriteUrl = URL.createObjectURL(file);
  customSprite = { status: "loading", sprite: null };
  setCustomSpriteStatus(`Loading "${file.name}"...`);
  loadImage(customSpriteUrl).then((image) => {
    customSprite = {
      status: "ready",
      sprite: {
        image,
        frame: { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
      }
    };
    setCustomSpriteStatus(`Using "${file.name}" for preview only — YAML still uses the RSI path.`);
  }).catch(() => {
    customSprite = { status: "error", sprite: null };
    setCustomSpriteStatus(`Could not load "${file.name}".`, true);
  });
}

function clearCustomSprite() {
  if (customSpriteUrl) URL.revokeObjectURL(customSpriteUrl);
  customSpriteUrl = null;
  customSprite = null;
  const input = $("customSprite");
  if (input) input.value = "";
  setCustomSpriteStatus("No custom image — using RSI path.");
}

// Matches ParticleOverlay.cs: colorOverLifetime gradient if present, else Start->End lerp,
// then alphaOverLifetime multiplied on top.
function colorAt(cfg, t) {
  let base;
  if (isChecked("enableColorCurve") && curves.color.length) {
    base = sampleColorCurve(curves.color, t) || hexToRgb("#ffffff", 1);
  } else {
    const start = hexToRgb(cfg.startColor, cfg.startAlpha);
    const end = hexToRgb(cfg.endColor, cfg.endAlpha);
    base = {
      r: Math.round(lerp(start.r, end.r, t)),
      g: Math.round(lerp(start.g, end.g, t)),
      b: Math.round(lerp(start.b, end.b, t)),
      a: lerp(start.a, end.a, t)
    };
  }
  const alphaMul = isChecked("enableAlphaCurve", true) ? sampleCurve(curves.alpha, t) : 1;
  return {
    r: base.r,
    g: base.g,
    b: base.b,
    a: clamp(base.a * alphaMul, 0, 1)
  };
}

function sampleColorCurve(keys, t) {
  const sorted = keys
    .filter((key) => key.color)
    .map((key) => ({ ...key, time: Number(key.time), alpha: Number(key.alpha) }))
    .filter((key) => Number.isFinite(key.time) && Number.isFinite(key.alpha))
    .sort((a, b) => a.time - b.time);

  if (!sorted.length) return null;
  if (t <= sorted[0].time) return hexToRgb(sorted[0].color, sorted[0].alpha);
  if (t >= sorted[sorted.length - 1].time) {
    const last = sorted[sorted.length - 1];
    return hexToRgb(last.color, last.alpha);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const local = (t - a.time) / Math.max(0.0001, b.time - a.time);
      const start = hexToRgb(a.color, a.alpha);
      const end = hexToRgb(b.color, b.alpha);
      return {
        r: Math.round(lerp(start.r, end.r, local)),
        g: Math.round(lerp(start.g, end.g, local)),
        b: Math.round(lerp(start.b, end.b, local)),
        a: lerp(start.a, end.a, local)
      };
    }
  }

  return null;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randRange(base, variance) {
  return base + (Math.random() * 2 - 1) * variance;
}

function sampleCurve(keys, t) {
  if (!keys.length) return 1;
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const local = (t - a.time) / Math.max(0.0001, b.time - a.time);
      return lerp(a.value, b.value, local);
    }
  }
  return 1;
}

function sampleVecCurve(keys, t) {
  if (!keys.length) return { x: 0, y: 0 };
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return { x: sorted[0].x, y: sorted[0].y };
  if (t >= sorted[sorted.length - 1].time) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const local = (t - a.time) / Math.max(0.0001, b.time - a.time);
      return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
    }
  }
  return { x: 0, y: 0 };
}

// --- Value noise port of ParticleSystem.cs ValueNoise/Hash ---
// C# ints wrap on overflow; emulate with Math.imul + |0.
function hashInt(x, y) {
  let n = (x + y * 57) | 0;
  n = ((n << 13) ^ n) | 0;
  const nSq = Math.imul(n, n);
  const inner = (Math.imul(nSq, 15731) + 789221) | 0;
  const m = (Math.imul(n, inner) + 1376312589) | 0;
  return 1 - ((m & 0x7fffffff) / 1073741824);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hashInt(ix, iy);
  const b = hashInt(ix + 1, iy);
  const c = hashInt(ix, iy + 1);
  const d = hashInt(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (d - b - c + a) * fx * fy;
}

function worldToCanvas(x, y) {
  return {
    x: canvas.width / 2 + x * WORLD_SCALE,
    y: canvas.height / 2 - y * WORLD_SCALE
  };
}

function sampleSpawn(cfg) {
  if (cfg.shapeType === "CircleEdge") {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.cos(angle) * cfg.shapeRadius,
      y: Math.sin(angle) * cfg.shapeRadius
    };
  }
  if (cfg.shapeType === "CircleFill") {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * cfg.shapeRadius;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }
  if (cfg.shapeType === "Box") {
    return {
      x: (Math.random() * 2 - 1) * cfg.boxX,
      y: (Math.random() * 2 - 1) * cfg.boxY
    };
  }
  return { x: 0, y: 0 };
}

function spawnParticle(cfg) {
  if (particles.length >= cfg.maxCount) return;
  const pos = sampleSpawn(cfg);
  // C#: angle = emitAngle + rand(-spread/2, spread/2); vel = (sin a, cos a) * speed. 0 = up.
  const spreadHalf = cfg.spreadAngle * 0.5;
  const angleDeg = cfg.emitAngle + (Math.random() * 2 - 1) * spreadHalf;
  const angleRad = angleDeg * Math.PI / 180;
  const speed = Math.max(0, randRange(cfg.speed, cfg.speedVariance));
  const lifetime = Math.max(0.05, randRange(cfg.lifetime, cfg.lifetimeVariance));
  // C#: SizeMultiplier = 1 + rand(-sizeVar, sizeVar) — fractional, not absolute.
  const sizeMult = 1 + (Math.random() * 2 - 1) * cfg.sizeVariance;
  particles.push({
    x: pos.x + cfg.spawnOffsetX,
    y: pos.y + cfg.spawnOffsetY,
    vx: Math.sin(angleRad) * speed,
    vy: Math.cos(angleRad) * speed,
    age: 0,
    lifetime,
    size: Math.max(0.01, cfg.particleSize * Math.max(0.01, sizeMult)),
    spawnSpeed: speed,
    rotation: cfg.startRotation + (Math.random() * 2 - 1) * cfg.startRotationVariance,
    spin: randRange(cfg.rotationSpeed, cfg.rotationSpeedVariance),
    noiseX: (Math.random() * 2 - 1) * 100,
    noiseY: (Math.random() * 2 - 1) * 100
  });
}

function emit(cfg, count) {
  for (let i = 0; i < count; i++) {
    spawnParticle(cfg);
  }
}

function restart() {
  particles = [];
  accumulator = 0;
  emitterAge = 0;
  burstDone = false;
  firedBurstFlags = timedBursts.map(() => false);
  const cfg = config();
  if (cfg.burst) {
    emit(cfg, cfg.maxCount);
    burstDone = true;
  }
}

function update(dt) {
  const cfg = config();
  emitterAge += dt;

  if (cfg.burst && !burstDone) {
    emit(cfg, cfg.maxCount);
    burstDone = true;
  }

  // Timed bursts (ParticleBurstData): fire count particles once age passes time.
  for (let b = 0; b < timedBursts.length; b++) {
    if (firedBurstFlags[b]) continue;
    if (emitterAge < timedBursts[b].time) continue;
    emit(cfg, Math.max(0, Math.floor(timedBursts[b].count)));
    firedBurstFlags[b] = true;
  }

  const isEmitterActive = cfg.duration === 0 || emitterAge <= cfg.duration;
  if (!cfg.burst && cfg.emissionRate > 0 && isEmitterActive) {
    // EmissionOverTime: t = age/duration when duration > 0, else clamp(age) after 1s.
    let emissionMult = 1;
    if (isChecked("enableEmissionCurve") && curves.emission.length) {
      const tE = cfg.duration > 0
        ? clamp(emitterAge / cfg.duration, 0, 1)
        : clamp(emitterAge, 0, 1);
      emissionMult = sampleCurve(curves.emission, tE);
    }
    accumulator += cfg.emissionRate * emissionMult * dt;
    const count = Math.floor(accumulator);
    if (count > 0) {
      emit(cfg, count);
      accumulator -= count;
    }
  }

  const useSpeedCurve = isChecked("enableSpeedCurve", true);
  const useForceCurve = isChecked("enableForceCurve");
  const useVelCurve = isChecked("enableVelocityCurve");
  const dragMul = cfg.drag > 0 ? Math.exp(-cfg.drag * dt) : 1;

  for (const particle of particles) {
    const t = clamp(particle.age / particle.lifetime, 0, 1);

    // Order mirrors SimulateParticle: drag, force, force-curve, speed-curve,
    // terminal cap, integrate, velocity-curve nudge, gravity, noise, spin.
    if (dragMul < 1) {
      particle.vx *= dragMul;
      particle.vy *= dragMul;
    }

    if (cfg.forceX !== 0 || cfg.forceY !== 0) {
      particle.vx += cfg.forceX * dt;
      particle.vy += cfg.forceY * dt;
    }

    if (useForceCurve && curves.force.length) {
      const f = sampleVecCurve(curves.force, t);
      particle.vx += f.x * dt;
      particle.vy += f.y * dt;
    }

    if (useSpeedCurve && curves.speed.length) {
      const curveSpeed = sampleCurve(curves.speed, t) * particle.spawnSpeed;
      const len = Math.hypot(particle.vx, particle.vy);
      if (len > 1e-6) {
        const s = curveSpeed / len;
        particle.vx *= s;
        particle.vy *= s;
      }
    }

    if (cfg.terminalSpeed > 0) {
      const len = Math.hypot(particle.vx, particle.vy);
      if (len > cfg.terminalSpeed) {
        particle.vx = particle.vx / len * cfg.terminalSpeed;
        particle.vy = particle.vy / len * cfg.terminalSpeed;
      }
    }

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    if (useVelCurve && curves.velocity.length) {
      const v = sampleVecCurve(curves.velocity, t);
      particle.x += v.x * dt;
      particle.y += v.y * dt;
    }

    // C# gravity is a positional drift scaled by age ratio, not a constant force.
    if (cfg.gravity !== 0) {
      particle.y += -cfg.gravity * dt * t;
    }

    if (cfg.noiseStrength > 0) {
      const ageSec = particle.age;
      const nx = valueNoise(particle.noiseX + ageSec * cfg.noiseFrequency, particle.noiseY);
      const ny = valueNoise(particle.noiseX, particle.noiseY + ageSec * cfg.noiseFrequency);
      particle.x += nx * cfg.noiseStrength * dt;
      particle.y += ny * cfg.noiseStrength * dt;
    }

    particle.rotation += particle.spin * dt;
    particle.age += dt;
  }

  particles = particles.filter((particle) => particle.age < particle.lifetime);
  stats.textContent = `${particles.length} / ${cfg.maxCount} particles`;
}

function draw() {
  const cfg = config();
  const sprite = getSpritePreview(cfg);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalCompositeOperation = cfg.spriteState.toLowerCase().includes("smoke") ? "source-over" : "lighter";
  const useSizeCurve = isChecked("enableSizeCurve", true);
  for (const particle of particles) {
    const t = clamp(particle.age / particle.lifetime, 0, 1);
    const color = colorAt(cfg, t);
    const sizeMul = useSizeCurve ? sampleCurve(curves.size, t) : 1;
    // C# halfSize = size*0.5 * curves => px radius = halfSize * WORLD_SCALE.
    const radius = Math.max(1, particle.size * 0.5 * sizeMul * WORLD_SCALE);
    const pos = worldToCanvas(particle.x, particle.y);
    const speed = Math.hypot(particle.vx, particle.vy);
    const stretch = cfg.stretchFactor > 0 ? 1 + speed * cfg.stretchFactor : 1;
    const velAngle = Math.atan2(-particle.vy, particle.vx); // canvas-space velocity angle

    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (stretch > 1 && speed > 0.001) {
      // Matches Overlay stretch branch: elongate along velocity, ignore spin.
      ctx.rotate(velAngle - Math.PI / 2);
      ctx.scale(1, stretch);
    } else if (cfg.alignToVelocity && speed > 0.001) {
      // Matches Overlay AlignToVelocity branch: face velocity, ignore spin.
      ctx.rotate(velAngle - Math.PI / 2);
    } else {
      ctx.rotate(particle.rotation * Math.PI / 180);
    }
    if (sprite) {
      drawSpriteParticle(sprite, color, radius);
    } else {
      drawProceduralParticle(color, radius);
    }
    ctx.restore();
  }
  ctx.restore();

  drawEmitterShape(cfg);
}

function drawProceduralParticle(color, radius) {
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, rgbToCss({ ...color, a: color.a }));
  gradient.addColorStop(0.65, rgbToCss({ ...color, a: color.a * 0.45 }));
  gradient.addColorStop(1, rgbToCss({ ...color, a: 0 }));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpriteParticle(sprite, color, radius) {
  const { image, frame } = sprite;
  const frameSize = Math.max(frame.width, frame.height);
  const width = radius * 2 * (frame.width / frameSize);
  const height = radius * 2 * (frame.height / frameSize);

  tintCanvas.width = frame.width;
  tintCanvas.height = frame.height;
  tintCtx.clearRect(0, 0, frame.width, frame.height);
  tintCtx.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
  tintCtx.globalCompositeOperation = "source-in";
  tintCtx.fillStyle = rgbToCss({ r: color.r, g: color.g, b: color.b, a: 1 });
  tintCtx.fillRect(0, 0, frame.width, frame.height);
  tintCtx.globalCompositeOperation = "source-over";

  ctx.globalAlpha = color.a;
  ctx.drawImage(
    tintCanvas,
    0,
    0,
    frame.width,
    frame.height,
    -width / 2,
    -height / 2,
    width,
    height
  );
  ctx.globalAlpha = 1;
}

function drawEmitterShape(cfg) {
  const center = worldToCanvas(0, 0);
  ctx.save();
  ctx.strokeStyle = "rgba(82, 214, 160, 0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  if (cfg.shapeType === "CircleEdge" || cfg.shapeType === "CircleFill") {
    ctx.beginPath();
    ctx.arc(center.x, center.y, cfg.shapeRadius * WORLD_SCALE, 0, Math.PI * 2);
    ctx.stroke();
  } else if (cfg.shapeType === "Box") {
    ctx.strokeRect(center.x - cfg.boxX * WORLD_SCALE, center.y - cfg.boxY * WORLD_SCALE, cfg.boxX * 2 * WORLD_SCALE, cfg.boxY * 2 * WORLD_SCALE);
  } else {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function tick(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (!paused) update(dt);
  draw();
  requestAnimationFrame(tick);
}

function hexWithAlpha(hex, alpha) {
  const clean = hex.replace("#", "").toUpperCase();
  const short = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const aa = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `"#${short}${aa}"`;
}

function line(key, value, indent = 2) {
  return `${" ".repeat(indent)}${key}: ${value}`;
}

function yamlFloatCurve(name, keys, indent = 2) {
  const spaces = " ".repeat(indent);
  const itemSpaces = " ".repeat(indent + 2);
  return [
    `${spaces}${name}:`,
    ...keys.map((key) => `${itemSpaces}- time: ${round(key.time)}\n${itemSpaces}  value: ${round(key.value)}`)
  ];
}

function yamlVec2Curve(name, keys, indent = 2) {
  const spaces = " ".repeat(indent);
  const itemSpaces = " ".repeat(indent + 2);
  return [
    `${spaces}${name}:`,
    ...keys.map((key) => `${itemSpaces}- time: ${round(key.time)}\n${itemSpaces}  value: (${round(key.x)}, ${round(key.y)})`)
  ];
}

function yamlColorCurve(name, keys, indent = 2) {
  const spaces = " ".repeat(indent);
  const itemSpaces = " ".repeat(indent + 2);
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  return [
    `${spaces}${name}:`,
    ...sorted.map((key) => `${itemSpaces}- time: ${round(key.time)}\n${itemSpaces}  color: ${hexWithAlpha(key.color, key.alpha)}`)
  ];
}

function colorKeysForYaml() {
  return curves.color.length
    ? curves.color
    : curveDefaults.color;
}

function colorCurveFromLegacy(startColor, endColor) {
  const start = parseColor(startColor);
  const end = parseColor(endColor);
  if (!start && !end) return null;

  return [
    { time: 0, color: start?.color || end.color, alpha: start?.alpha ?? end.alpha },
    { time: 1, color: end?.color || start.color, alpha: end?.alpha ?? start.alpha }
  ];
}

function parseScalar(value) {
  const trimmed = value.trim().replace(/\s+#.*$/, "");
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?s$/i.test(trimmed)) return Number(trimmed.slice(0, -1));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseYamlMap(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.replace(/\t/g, "  ").split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;

    const indent = rawLine.match(/^ */)[0].length;
    let lineText = rawLine.trim();
    if (lineText.startsWith("- ")) lineText = lineText.slice(2).trim();

    const match = lineText.match(/^([^:]+):(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const rest = match[2].trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (rest === "") {
      const nextValue = isNextList(lines, lineIndex) ? [] : {};
      parent[key] = nextValue;
      stack.push({ indent, value: nextValue });
      continue;
    }

    if (Array.isArray(parent)) {
      parent.push({ [key]: parseScalar(rest) });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  mergeYamlListObjects(root);
  return root;
}

function isNextList(lines, currentIndex) {
  for (let i = currentIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    return line.trimStart().startsWith("- ");
  }
  return false;
}

function mergeYamlListObjects(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const next = value[i + 1];
      if (item && next && typeof item === "object" && typeof next === "object" && !("time" in next)) {
        Object.assign(item, next);
        value.splice(i + 1, 1);
        i--;
      }
      mergeYamlListObjects(item);
    }
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(mergeYamlListObjects);
  }
}

function parseColor(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().replace(/^["']|["']$/g, "").match(/^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return null;
  let rgb = match[1].toLowerCase();
  if (rgb.length === 3) rgb = rgb.split("").map((c) => c + c).join("");
  return {
    color: `#${rgb}`,
    alpha: match[2] ? parseInt(match[2], 16) / 255 : 1
  };
}

function parseVector(value) {
  if (typeof value === "string") {
    const match = value.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  }
  if (value && typeof value === "object" && "x" in value && "y" in value) {
    return { x: Number(value.x), y: Number(value.y) };
  }
  return null;
}

function setField(id, value) {
  const element = $(id);
  if (!element || value === undefined || value === null || Number.isNaN(value)) return;
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else {
    element.value = value;
  }
}

function resetFormToProtoDefaults() {
  for (const [key, value] of Object.entries(protoDefaults)) {
    setField(key, value);
  }
  for (const id of ["enableSizeCurve", "enableSpeedCurve", "enableAlphaCurve"]) {
    setField(id, false);
  }
  setField("enableColorCurve", false);
  setField("enableEmissionCurve", false);
  setField("enableForceCurve", false);
  setField("enableVelocityCurve", false);
}

function importCurve(yaml, key, curveName, checkboxId) {
  if (!Array.isArray(yaml[key])) {
    setField(checkboxId, false);
    return;
  }

  const imported = yaml[key]
    .map((entry) => ({ time: Number(entry.time), value: Number(entry.value) }))
    .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
    .sort((a, b) => a.time - b.time);

  if (imported.length) {
    curves[curveName] = imported;
    setField(checkboxId, true);
  } else {
    setField(checkboxId, false);
  }
}

function importVecCurve(yaml, key, curveName, checkboxId) {
  if (!Array.isArray(yaml[key])) {
    setField(checkboxId, false);
    return;
  }

  const imported = yaml[key]
    .map((entry) => {
      const vec = parseVector(entry.value);
      if (!vec) return null;
      return { time: Number(entry.time), x: vec.x, y: vec.y };
    })
    .filter((entry) => entry && Number.isFinite(entry.time) && Number.isFinite(entry.x) && Number.isFinite(entry.y))
    .sort((a, b) => a.time - b.time);

  if (imported.length) {
    curves[curveName] = imported;
    setField(checkboxId, true);
  } else {
    setField(checkboxId, false);
  }
}

function importColorCurve(yaml) {
  if (!Array.isArray(yaml.colorOverLifetime)) {
    return false;
  }

  const imported = yaml.colorOverLifetime
    .map((entry) => {
      const parsed = parseColor(entry.color);
      return parsed ? { time: Number(entry.time), color: parsed.color, alpha: parsed.alpha } : null;
    })
    .filter((entry) => entry && Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);

  if (imported.length) {
    curves.color = imported;
    return true;
  }
  return false;
}

function importBursts(yaml) {
  timedBursts = [];
  if (!Array.isArray(yaml.bursts)) return;
  timedBursts = yaml.bursts
    .map((entry) => ({ time: Number(entry.time), count: Math.floor(Number(entry.count)) }))
    .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.count) && entry.count > 0)
    .sort((a, b) => a.time - b.time);
}

function importYamlFromText(text) {
  const yaml = parseYamlMap(text);
  if (yaml.type !== "particleEffect") {
    throw new Error("No particleEffect prototype found.");
  }

  // Reset first so omitted keys fall back to prototype defaults instead of
  // leaking values from the previously loaded preset (e.g. SfFireContinuous
  // omits lifetime/speed, which must become 1s/1.0, not Grenade values).
  curves = structuredClone(curveDefaults);
  timedBursts = [];
  resetFormToProtoDefaults();

  setField("effectId", yaml.id);
  if (yaml.sprite && typeof yaml.sprite === "object") {
    setField("spritePath", yaml.sprite.sprite);
    setField("spriteState", yaml.sprite.state);
  }

  const hasColorCurve = importColorCurve(yaml);
  setField("enableColorCurve", hasColorCurve);
  if (hasColorCurve) {
    setField("enableAlphaCurve", Array.isArray(yaml.alphaOverLifetime) && yaml.alphaOverLifetime.length > 0);
  }
  const startParsed = parseColor(yaml.startColor);
  const endParsed = parseColor(yaml.endColor);
  if (startParsed) {
    setField("startColor", startParsed.color);
    setField("startAlpha", round(startParsed.alpha));
  }
  if (endParsed) {
    setField("endColor", endParsed.color);
    setField("endAlpha", round(endParsed.alpha));
  }
  if (!hasColorCurve && (startParsed || endParsed)) {
    setField("enableColorCurve", false);
  }

  [
    "particleSize", "sizeVariance", "lifetime", "lifetimeVariance", "duration", "speed", "speedVariance",
    "gravity", "drag", "spreadAngle", "emitAngle", "maxCount", "emissionRate",
    "terminalSpeed", "stretchFactor", "noiseStrength", "noiseFrequency",
    "startRotation", "startRotationVariance", "rotationSpeed", "rotationSpeedVariance",
    "inheritVelocity", "renderLayer"
  ].forEach((key) => setField(key, yaml[key]));

  setField("shader", yaml.shader || "");

  ["burst", "worldSpace", "ignoreQualitySettings", "alignToVelocity"].forEach((key) => {
    if (key in yaml) setField(key, yaml[key]);
  });

  const force = parseVector(yaml.constantForce);
  if (force) {
    setField("forceX", force.x);
    setField("forceY", force.y);
  }

  const spawnOff = parseVector(yaml.spawnOffset);
  if (spawnOff) {
    setField("spawnOffsetX", spawnOff.x);
    setField("spawnOffsetY", spawnOff.y);
  }

  if (yaml.subEmitterOnSpawn) setField("subEmitterOnSpawn", yaml.subEmitterOnSpawn);
  if (yaml.subEmitterOnDeath) setField("subEmitterOnDeath", yaml.subEmitterOnDeath);

  if (yaml.shape && typeof yaml.shape === "object") {
    setField("shapeType", yaml.shape.type || "Point");
    setField("shapeRadius", yaml.shape.radius);
    const box = parseVector(yaml.shape.boxExtents);
    if (box) {
      setField("boxX", box.x);
      setField("boxY", box.y);
    }
  } else {
    setField("shapeType", "Point");
  }

  importCurve(yaml, "sizeOverLifetime", "size", "enableSizeCurve");
  importCurve(yaml, "speedOverLifetime", "speed", "enableSpeedCurve");
  if (!hasColorCurve || (Array.isArray(yaml.alphaOverLifetime) && yaml.alphaOverLifetime.length)) {
    importCurve(yaml, "alphaOverLifetime", "alpha", "enableAlphaCurve");
  }
  importCurve(yaml, "emissionOverTime", "emission", "enableEmissionCurve");
  importVecCurve(yaml, "forceOverLifetime", "force", "enableForceCurve");
  importVecCurve(yaml, "velocityOverLifetime", "velocity", "enableVelocityCurve");
  importBursts(yaml);
  renderCurveEditors();
  renderVecCurveEditors();
  renderBurstsEditor();
  renderColorCurveEditor();
  restart();
  generateYaml();
}

function showImportStatus(message, isError = false) {
  const status = $("importStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function round(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function generateYaml() {
  const cfg = config();
  const output = [
    "- type: particleEffect",
    line("id", cfg.effectId),
    "  sprite:",
    line("sprite", cfg.spritePath, 4),
    line("state", cfg.spriteState, 4)
  ];

  if (isChecked("enableColorCurve") && curves.color.length) {
    // colorOverLifetime overrides start/end in-game; only export one path.
  } else {
    output.push(line("startColor", hexWithAlpha(cfg.startColor, cfg.startAlpha)));
    output.push(line("endColor", hexWithAlpha(cfg.endColor, cfg.endAlpha)));
  }

  output.push(...[
    line("particleSize", round(cfg.particleSize)),
    line("sizeVariance", round(cfg.sizeVariance)),
    line("lifetime", `${round(cfg.lifetime)}s`),
    line("lifetimeVariance", `${round(cfg.lifetimeVariance)}s`),
    line("duration", cfg.duration === 0 ? 0 : `${round(cfg.duration)}s`),
    line("speed", round(cfg.speed)),
    line("speedVariance", round(cfg.speedVariance)),
    line("gravity", round(cfg.gravity)),
    line("drag", round(cfg.drag)),
    line("spreadAngle", round(cfg.spreadAngle)),
    line("emitAngle", round(cfg.emitAngle)),
    line("maxCount", cfg.maxCount),
    line("emissionRate", round(cfg.emissionRate)),
    line("burst", cfg.burst),
    line("worldSpace", cfg.worldSpace)
  ]);

  if (cfg.shader) output.push(line("shader", cfg.shader));
  if (cfg.renderLayer !== 0) output.push(line("renderLayer", cfg.renderLayer));
  if (cfg.ignoreQualitySettings) output.push(line("ignoreQualitySettings", true));
  if (cfg.alignToVelocity) output.push(line("alignToVelocity", true));
  if (cfg.terminalSpeed > 0) output.push(line("terminalSpeed", round(cfg.terminalSpeed)));
  if (cfg.stretchFactor > 0) output.push(line("stretchFactor", round(cfg.stretchFactor)));
  if (cfg.forceX !== 0 || cfg.forceY !== 0) output.push(line("constantForce", `(${round(cfg.forceX)}, ${round(cfg.forceY)})`));
  if (cfg.noiseStrength > 0) {
    output.push(line("noiseStrength", round(cfg.noiseStrength)));
    output.push(line("noiseFrequency", round(cfg.noiseFrequency)));
  }
  if (cfg.inheritVelocity !== 0) output.push(line("inheritVelocity", round(cfg.inheritVelocity)));
  if (cfg.startRotation !== 0) output.push(line("startRotation", round(cfg.startRotation)));
  if (cfg.startRotationVariance !== 0) output.push(line("startRotationVariance", round(cfg.startRotationVariance)));
  if (cfg.rotationSpeed !== 0) output.push(line("rotationSpeed", round(cfg.rotationSpeed)));
  if (cfg.rotationSpeedVariance !== 0) output.push(line("rotationSpeedVariance", round(cfg.rotationSpeedVariance)));
  if (cfg.spawnOffsetX !== 0 || cfg.spawnOffsetY !== 0) output.push(line("spawnOffset", `(${round(cfg.spawnOffsetX)}, ${round(cfg.spawnOffsetY)})`));
  if (cfg.subEmitterOnSpawn) output.push(line("subEmitterOnSpawn", cfg.subEmitterOnSpawn));
  if (cfg.subEmitterOnDeath) output.push(line("subEmitterOnDeath", cfg.subEmitterOnDeath));

  if (timedBursts.length) {
    output.push("  bursts:");
    for (const b of timedBursts) {
      output.push(`    - time: ${round(b.time)}s`);
      output.push(`      count: ${Math.floor(b.count)}`);
    }
  }

  if (cfg.shapeType !== "Point") {
    output.push("  shape:");
    output.push(line("type", cfg.shapeType, 4));
    if (cfg.shapeType === "Box") {
      output.push(line("boxExtents", `(${round(cfg.boxX)}, ${round(cfg.boxY)})`, 4));
    } else {
      output.push(line("radius", round(cfg.shapeRadius), 4));
    }
  }

  if (isChecked("enableSizeCurve", true)) output.push(...yamlFloatCurve("sizeOverLifetime", curves.size));
  if (isChecked("enableSpeedCurve", true)) output.push(...yamlFloatCurve("speedOverLifetime", curves.speed));
  if (isChecked("enableAlphaCurve", true)) output.push(...yamlFloatCurve("alphaOverLifetime", curves.alpha));
  if (isChecked("enableEmissionCurve")) output.push(...yamlFloatCurve("emissionOverTime", curves.emission));
  if (isChecked("enableForceCurve")) output.push(...yamlVec2Curve("forceOverLifetime", curves.force));
  if (isChecked("enableVelocityCurve")) output.push(...yamlVec2Curve("velocityOverLifetime", curves.velocity));
  if (isChecked("enableColorCurve")) output.push(...yamlColorCurve("colorOverLifetime", curves.color));

  yamlOutput.value = output.join("\n") + "\n";
}

function floatCurveRow(curveName, index, key) {
  const row = document.createElement("div");
  row.className = "curve-row editable";
  row.innerHTML = `
    <input aria-label="Time" type="number" min="0" max="1" step="0.05" value="${round(key.time)}">
    <input aria-label="Value" type="range" min="0" max="2" step="0.01" value="${key.value}">
    <span>${round(key.value)}</span>
    <button type="button" title="Remove key">x</button>
  `;
  const [timeInput, valueInput] = row.querySelectorAll("input");
  const removeButton = row.querySelector("button");
  timeInput.addEventListener("input", () => {
    curves[curveName][index].time = clamp(Number(timeInput.value), 0, 1);
    generateYaml();
  });
  valueInput.addEventListener("input", () => {
    curves[curveName][index].value = Number(valueInput.value);
    row.querySelector("span").textContent = round(valueInput.value);
    generateYaml();
  });
  removeButton.addEventListener("click", () => {
    if (curves[curveName].length <= 1) return;
    curves[curveName].splice(index, 1);
    renderCurveEditors();
    generateYaml();
  });
  return row;
}

function renderCurveEditors() {
  document.querySelectorAll(".curve-editor[data-curve]").forEach((editor) => {
    const name = editor.dataset.curve;
    if (!curves[name] || !Array.isArray(curves[name]) || (curves[name][0] && ("x" in curves[name][0]))) return;
    editor.innerHTML = "";
    [...curves[name]]
      .map((key, index) => ({ key, index }))
      .sort((a, b) => a.key.time - b.key.time)
      .forEach(({ key, index }) => {
        editor.appendChild(floatCurveRow(name, index, key));
      });
  });
}

function renderVecCurveEditors() {
  document.querySelectorAll(".curve-editor[data-veccurve]").forEach((editor) => {
    const name = editor.dataset.veccurve;
    editor.innerHTML = "";
    [...curves[name]]
      .map((key, index) => ({ key, index }))
      .sort((a, b) => a.key.time - b.key.time)
      .forEach(({ key, index }) => {
        const row = document.createElement("div");
        row.className = "color-curve-row";
        row.innerHTML = `
          <input aria-label="Time" type="number" min="0" max="1" step="0.05" value="${round(key.time)}">
          <input aria-label="X" type="number" step="0.1" value="${round(key.x)}">
          <input aria-label="Y" type="number" step="0.1" value="${round(key.y)}">
          <button type="button" title="Remove key">x</button>
        `;
        const [timeInput, xInput, yInput] = row.querySelectorAll("input");
        const removeButton = row.querySelector("button");
        const update = () => {
          curves[name][index] = {
            time: clamp(Number(timeInput.value), 0, 1),
            x: Number(xInput.value),
            y: Number(yInput.value)
          };
          generateYaml();
        };
        timeInput.addEventListener("input", update);
        xInput.addEventListener("input", update);
        yInput.addEventListener("input", update);
        removeButton.addEventListener("click", () => {
          if (curves[name].length <= 1) return;
          curves[name].splice(index, 1);
          renderVecCurveEditors();
          generateYaml();
        });
        editor.appendChild(row);
      });
  });
}

function renderBurstsEditor() {
  const editor = $("burstsEditor");
  if (!editor) return;
  editor.innerHTML = "";
  timedBursts
    .map((burst, index) => ({ burst, index }))
    .sort((a, b) => a.burst.time - b.burst.time)
    .forEach(({ burst, index }) => {
      const row = document.createElement("div");
      row.className = "color-curve-row";
      row.innerHTML = `
        <input aria-label="Burst time (s)" type="number" min="0" step="0.1" value="${round(burst.time)}">
        <input aria-label="Burst count" type="number" min="1" step="1" value="${Math.floor(burst.count)}">
        <span style="color:var(--muted);font-size:12px">particles</span>
        <button type="button" title="Remove burst">x</button>
      `;
      const [timeInput, countInput] = row.querySelectorAll("input");
      const removeButton = row.querySelector("button");
      const update = () => {
        timedBursts[index] = {
          time: Math.max(0, Number(timeInput.value)),
          count: Math.max(1, Math.floor(Number(countInput.value)))
        };
        generateYaml();
      };
      timeInput.addEventListener("input", update);
      countInput.addEventListener("input", update);
      removeButton.addEventListener("click", () => {
        timedBursts.splice(index, 1);
        renderBurstsEditor();
        restart();
        generateYaml();
      });
      editor.appendChild(row);
    });
}

function renderColorCurveEditor() {
  const editor = $("colorCurveEditor");
  editor.innerHTML = "";
  curves.color
    .sort((a, b) => a.time - b.time)
    .forEach((key, index) => {
      const row = document.createElement("div");
      row.className = "color-curve-row";
      row.innerHTML = `
        <input aria-label="Color stop time" type="number" min="0" max="1" step="0.05" value="${round(key.time)}">
        <input aria-label="Color stop color" type="color" value="${key.color}">
        <input aria-label="Color stop alpha" type="range" min="0" max="1" step="0.01" value="${key.alpha}">
        <button type="button" title="Remove color stop">x</button>
      `;

      const [timeInput, colorInput, alphaInput] = row.querySelectorAll("input");
      const removeButton = row.querySelector("button");
      const update = () => {
        curves.color[index] = {
          time: clamp(Number(timeInput.value), 0, 1),
          color: colorInput.value,
          alpha: clamp(Number(alphaInput.value), 0, 1)
        };
        generateYaml();
      };

      timeInput.addEventListener("input", update);
      colorInput.addEventListener("input", update);
      alphaInput.addEventListener("input", update);
      removeButton.addEventListener("click", () => {
        if (curves.color.length <= 1) return;
        curves.color.splice(index, 1);
        renderColorCurveEditor();
        generateYaml();
      });
      editor.appendChild(row);
    });
}

function addColorStop() {
  curves.color.push({ time: 0.5, color: "#ffffff", alpha: 1 });
  renderColorCurveEditor();
  generateYaml();
}

function addFloatKey(curveName) {
  curves[curveName].push({ time: 0.5, value: 1 });
  renderCurveEditors();
  generateYaml();
}

function addVecKey(curveName) {
  curves[curveName].push({ time: 0.5, x: 0, y: 0 });
  renderVecCurveEditors();
  generateYaml();
}

function addBurst() {
  timedBursts.push({ time: 0.5, count: 10 });
  renderBurstsEditor();
  restart();
  generateYaml();
}

function getSupportedRecordingMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function createMediaRecorder(stream) {
  const mimeType = getSupportedRecordingMimeType();
  try {
    if (mimeType) {
      return new MediaRecorder(stream, { mimeType });
    }
    return new MediaRecorder(stream);
  } catch {
    return null;
  }
}

function startRenderExport() {
  if (!canvas.captureStream) {
    alert("Video export requires canvas capture support in this browser.");
    return;
  }

  const cfg = config();
  const maxDuration = Math.min(60, Math.max(1, Number($("recordDuration").value) || 5));
  const recordingStream = canvas.captureStream(30);
  const recorder = createMediaRecorder(recordingStream);

  if (!recorder) {
    alert("Video export is not supported in this browser.");
    return;
  }

  const recordedChunks = [];
  let recordingStopped = false;
  let exportButton = $("exportBtn");

  exportButton.disabled = true;
  exportButton.textContent = "Recording...";
  paused = false;
  restart();

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    if (recordedChunks.length) {
      const blob = new Blob(recordedChunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${cfg.effectId || "particle-render"}.webm`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    exportButton.disabled = false;
    exportButton.textContent = "Export";
    recordingStopped = true;
  };

  recorder.start();
  const recordingStart = performance.now();
  const maxEndTime = recordingStart + maxDuration * 1000;

  const checkRecording = () => {
    if (recordingStopped) return;

    const now = performance.now();
    const noParticlesLeft = cfg.burst && particles.length === 0 && burstDone;
    const shouldStop = noParticlesLeft || now >= maxEndTime;

    if (shouldStop) {
      recorder.stop();
      return;
    }
    requestAnimationFrame(checkRecording);
  };

  checkRecording();
}

function setCurveData(curveName, keys) {
  if (!Array.isArray(keys)) return;
  curves[curveName] = structuredClone(keys);
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  curves = structuredClone(curveDefaults);
  timedBursts = structuredClone(preset.bursts || []);
  resetFormToProtoDefaults();
  // Presets were authored against default size/speed/alpha falloff curves,
  // so keep those enabled unless the preset overrides them. (Real YAML
  // imports use the opposite default: no curve unless present.)
  setField("enableSizeCurve", true);
  setField("enableSpeedCurve", true);
  setField("enableAlphaCurve", true);
  setField("enableColorCurve", false);
  for (const [key, value] of Object.entries(preset)) {
    if (key === "bursts" || key.endsWith("OverLifetime")) continue;
    if (key === "colorOverLifetime") continue;
    const element = $(key);
    if (!element) continue;
    if (element.type === "checkbox") {
      element.checked = Boolean(value);
    } else {
      element.value = value;
    }
  }
  setCurveData("size", preset.sizeOverLifetime);
  setCurveData("speed", preset.speedOverLifetime);
  setCurveData("alpha", preset.alphaOverLifetime);
  setCurveData("emission", preset.emissionOverTime);
  setCurveData("force", preset.forceOverLifetime);
  setCurveData("velocity", preset.velocityOverLifetime);
  setField("enableSizeCurve", Array.isArray(preset.sizeOverLifetime));
  setField("enableSpeedCurve", Array.isArray(preset.speedOverLifetime));
  setField("enableAlphaCurve", Array.isArray(preset.alphaOverLifetime));
  setField("enableEmissionCurve", Array.isArray(preset.emissionOverTime));
  setField("enableForceCurve", Array.isArray(preset.forceOverLifetime));
  setField("enableVelocityCurve", Array.isArray(preset.velocityOverLifetime));
  if (Array.isArray(preset.colorOverLifetime)) {
    setCurveData("color", preset.colorOverLifetime);
    setField("enableColorCurve", true);
  } else {
    const legacyStart = preset.startColor ? hexWithAlpha(preset.startColor, preset.startAlpha ?? 1) : null;
    const legacyEnd = preset.endColor ? hexWithAlpha(preset.endColor, preset.endAlpha ?? 0) : null;
    const legacyColorCurve = colorCurveFromLegacy(legacyStart, legacyEnd);
    if (preset.startColor) setField("startColor", preset.startColor);
    if (preset.startAlpha !== undefined) setField("startAlpha", preset.startAlpha);
    if (preset.endColor) setField("endColor", preset.endColor);
    if (preset.endAlpha !== undefined) setField("endAlpha", preset.endAlpha);
    // Legacy presets use the Start->End lerp path (matches in-game when no
    // colorOverLifetime is set); keep the converted gradient available but off.
    if (legacyColorCurve) curves.color = legacyColorCurve;
    setField("enableColorCurve", false);
  }
  renderCurveEditors();
  renderVecCurveEditors();
  renderBurstsEditor();
  renderColorCurveEditor();
  restart();
  generateYaml();
}

function setup() {
  const presetSelect = $("preset");
  Object.keys(presets).forEach((name) => {
    const option = document.createElement("option");
    option.textContent = name;
    presetSelect.appendChild(option);
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("active");
      generateYaml();
    });
  });

  [...fields, ...checkFields].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener("input", () => {
      if (id === "maxCount" && particles.length > number("maxCount")) {
        particles = particles.slice(0, number("maxCount"));
      }
      if (id === "duration") restart();
      generateYaml();
    });
    element.addEventListener("change", generateYaml);
  });

  $("preset").addEventListener("change", () => applyPreset($("preset").value));
  $("addColorStop").addEventListener("click", addColorStop);
  document.querySelectorAll("[data-addcurve]").forEach((btn) => {
    btn.addEventListener("click", () => addFloatKey(btn.dataset.addcurve));
  });
  document.querySelectorAll("[data-addveccurve]").forEach((btn) => {
    btn.addEventListener("click", () => addVecKey(btn.dataset.addveccurve));
  });
  const addBurstBtn = $("addBurst");
  if (addBurstBtn) addBurstBtn.addEventListener("click", addBurst);
  $("pauseBtn").addEventListener("click", () => {
    paused = !paused;
    $("pauseBtn").textContent = paused ? "Resume" : "Pause";
  });
  $("resetBtn").addEventListener("click", restart);
  $("burstBtn").addEventListener("click", () => emit(config(), Math.min(config().maxCount, 24)));
  $("openYaml").addEventListener("click", () => $("yamlFile").click());
  $("yamlFile").addEventListener("change", () => {
    const file = $("yamlFile").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      yamlOutput.value = String(reader.result || "");
      try {
        importYamlFromText(yamlOutput.value);
        showImportStatus(`Imported ${file.name}.`);
      } catch (error) {
        showImportStatus(error.message || `Could not import ${file.name}.`, true);
      }
    });
    reader.readAsText(file);
    $("yamlFile").value = "";
  });
  $("importYaml").addEventListener("click", () => {
    try {
      importYamlFromText(yamlOutput.value);
      showImportStatus("Imported YAML into the editor.");
    } catch (error) {
      showImportStatus(error.message || "Could not import YAML.", true);
    }
  });
  $("copyYaml").addEventListener("click", async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(yamlOutput.value);
    } else {
      yamlOutput.select();
      document.execCommand("copy");
    }
    $("copyYaml").textContent = "Copied";
    setTimeout(() => $("copyYaml").textContent = "Copy", 900);
  });
  $("downloadYaml").addEventListener("click", () => {
    const blob = new Blob([yamlOutput.value], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${config().effectId}.yml`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  $("exportBtn").addEventListener("click", startRenderExport);
  $("customSprite").addEventListener("change", () => {
    const file = $("customSprite").files[0];
    if (file) setCustomSprite(file);
  });
  $("clearCustomSprite").addEventListener("click", clearCustomSprite);

  renderCurveEditors();
  renderVecCurveEditors();
  renderBurstsEditor();
  renderColorCurveEditor();
  applyPreset("Grenade sparks");
  requestAnimationFrame(tick);
}

setup();
