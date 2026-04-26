const $ = (id) => document.getElementById(id);

const canvas = $("stage");
const ctx = canvas.getContext("2d");
const stats = $("stats");
const yamlOutput = $("yamlOutput");

const fields = [
  "effectId", "spritePath", "spriteState", "shader", "renderLayer", "startColor", "endColor", "startAlpha", "endAlpha",
  "particleSize", "sizeVariance", "lifetime", "lifetimeVariance", "maxCount", "emissionRate",
  "speed", "speedVariance", "emitAngle", "spreadAngle", "gravity", "drag", "terminalSpeed",
  "stretchFactor", "forceX", "forceY", "noiseStrength", "noiseFrequency", "shapeType",
  "shapeRadius", "boxX", "boxY", "rotationSpeed", "rotationSpeedVariance"
];

const checkFields = [
  "burst", "worldSpace", "ignoreQualitySettings",
  "enableSizeCurve", "enableSpeedCurve", "enableAlphaCurve", "enableColorCurve"
];

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
  ]
};

const presets = window.particlePresets || {};

let curves = structuredClone(curveDefaults);
let particles = [];
let accumulator = 0;
let emitterAge = 0;
let lastTime = performance.now();
let paused = false;
let burstDone = false;
const spriteCache = new Map();

function number(id) {
  return Number($(id).value) || 0;
}

function config() {
  return {
    effectId: $("effectId").value.trim() || "MyParticleEffect",
    spritePath: $("spritePath").value.trim(),
    spriteState: $("spriteState").value.trim(),
    shader: $("shader").value.trim(),
    renderLayer: Math.floor(number("renderLayer")),
    startColor: $("startColor").value,
    endColor: $("endColor").value,
    startAlpha: number("startAlpha"),
    endAlpha: number("endAlpha"),
    particleSize: Math.max(0.01, number("particleSize")),
    sizeVariance: number("sizeVariance"),
    lifetime: Math.max(0.05, number("lifetime")),
    lifetimeVariance: number("lifetimeVariance"),
    maxCount: Math.max(1, Math.floor(number("maxCount"))),
    emissionRate: Math.max(0, number("emissionRate")),
    burst: $("burst").checked,
    worldSpace: $("worldSpace").checked,
    ignoreQualitySettings: $("ignoreQualitySettings").checked,
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
    rotationSpeed: number("rotationSpeed"),
    rotationSpeedVariance: number("rotationSpeedVariance")
  };
}

function hexToRgb(hex, alpha = 1) {
  const raw = hex.replace("#", "");
  const value = parseInt(raw, 16);
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

function colorAt(cfg, t) {
  const gradient = $("enableColorCurve").checked ? sampleColorCurve(curves.color, t) : null;
  const a = gradient || hexToRgb(cfg.startColor, cfg.startAlpha);
  const b = gradient || hexToRgb(cfg.endColor, cfg.endAlpha);
  const alphaMul = $("enableAlphaCurve").checked ? sampleCurve(curves.alpha, t) : 1;
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
    a: clamp(lerp(a.a, b.a, t) * alphaMul, 0, 1)
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

function degToRad(deg) {
  return (deg - 90) * Math.PI / 180;
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

function worldToCanvas(x, y) {
  const scale = 96;
  return {
    x: canvas.width / 2 + x * scale,
    y: canvas.height / 2 - y * scale
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
  const angle = degToRad(cfg.emitAngle + (Math.random() * 2 - 1) * cfg.spreadAngle);
  const speed = Math.max(0, randRange(cfg.speed, cfg.speedVariance));
  const lifetime = Math.max(0.05, randRange(cfg.lifetime, cfg.lifetimeVariance));
  particles.push({
    x: pos.x,
    y: pos.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    lifetime,
    size: Math.max(0.01, randRange(cfg.particleSize, cfg.sizeVariance)),
    rotation: Math.random() * 360,
    spin: randRange(cfg.rotationSpeed, cfg.rotationSpeedVariance),
    seed: Math.random() * 1000
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
  if (config().burst) {
    emit(config(), config().maxCount);
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

  if (!cfg.burst && cfg.emissionRate > 0) {
    accumulator += cfg.emissionRate * dt;
    const count = Math.floor(accumulator);
    if (count > 0) {
      emit(cfg, count);
      accumulator -= count;
    }
  }

  for (const particle of particles) {
    const t = clamp(particle.age / particle.lifetime, 0, 1);
    const speedMul = $("enableSpeedCurve").checked ? sampleCurve(curves.speed, t) : 1;
    const noise = cfg.noiseStrength > 0
      ? Math.sin((emitterAge * cfg.noiseFrequency + particle.seed) * Math.PI * 2) * cfg.noiseStrength
      : 0;

    particle.vx += (cfg.forceX + noise) * dt;
    particle.vy += (cfg.forceY - cfg.gravity + noise * 0.35) * dt;

    if (cfg.drag > 0) {
      const drag = Math.exp(-cfg.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
    }

    if (cfg.terminalSpeed > 0) {
      const len = Math.hypot(particle.vx, particle.vy);
      if (len > cfg.terminalSpeed) {
        particle.vx = particle.vx / len * cfg.terminalSpeed;
        particle.vy = particle.vy / len * cfg.terminalSpeed;
      }
    }

    particle.x += particle.vx * speedMul * dt;
    particle.y += particle.vy * speedMul * dt;
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
  for (const particle of particles) {
    const t = clamp(particle.age / particle.lifetime, 0, 1);
    const color = colorAt(cfg, t);
    const sizeMul = $("enableSizeCurve").checked ? sampleCurve(curves.size, t) : 1;
    const radius = Math.max(1, particle.size * sizeMul * 96);
    const pos = worldToCanvas(particle.x, particle.y);
    const angle = Math.atan2(-particle.vy, particle.vx);
    const stretch = 1 + cfg.stretchFactor * Math.min(3, Math.hypot(particle.vx, particle.vy));

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + particle.rotation * Math.PI / 180);
    ctx.scale(stretch, 1);
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

  ctx.globalAlpha *= color.a;
  ctx.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    -width / 2,
    -height / 2,
    width,
    height
  );
}

function drawEmitterShape(cfg) {
  const center = worldToCanvas(0, 0);
  ctx.save();
  ctx.strokeStyle = "rgba(82, 214, 160, 0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  if (cfg.shapeType === "CircleEdge" || cfg.shapeType === "CircleFill") {
    ctx.beginPath();
    ctx.arc(center.x, center.y, cfg.shapeRadius * 96, 0, Math.PI * 2);
    ctx.stroke();
  } else if (cfg.shapeType === "Box") {
    ctx.strokeRect(center.x - cfg.boxX * 96, center.y - cfg.boxY * 96, cfg.boxX * 192, cfg.boxY * 192);
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
  const aa = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0");
  return `"${hex.toUpperCase()}${aa.toUpperCase()}"`;
}

function line(key, value, indent = 2) {
  return `${" ".repeat(indent)}${key}: ${value}`;
}

function yamlCurve(name, keys, indent = 2) {
  const spaces = " ".repeat(indent);
  const itemSpaces = " ".repeat(indent + 2);
  return [
    `${spaces}${name}:`,
    ...keys.map((key) => `${itemSpaces}- time: ${round(key.time)}\n${itemSpaces}  value: ${round(key.value)}`)
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
  const match = value.trim().replace(/^["']|["']$/g, "").match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return null;
  return {
    color: `#${match[1].toLowerCase()}`,
    alpha: match[2] ? parseInt(match[2], 16) / 255 : 1
  };
}

function parseVector(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
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
  }
}

function importColorCurve(yaml) {
  if (!Array.isArray(yaml.colorOverLifetime)) {
    setField("enableColorCurve", false);
    return;
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
    setField("enableColorCurve", true);
  }
}

function importYamlFromText(text) {
  const yaml = parseYamlMap(text);
  if (yaml.type !== "particleEffect") {
    throw new Error("No particleEffect prototype found.");
  }

  curves = structuredClone(curveDefaults);
  setField("shader", "");
  setField("renderLayer", 0);
  setField("effectId", yaml.id);
  if (yaml.sprite && typeof yaml.sprite === "object") {
    setField("spritePath", yaml.sprite.sprite);
    setField("spriteState", yaml.sprite.state);
  }

  const start = parseColor(yaml.startColor);
  if (start) {
    setField("startColor", start.color);
    setField("startAlpha", round(start.alpha));
  }

  const end = parseColor(yaml.endColor);
  if (end) {
    setField("endColor", end.color);
    setField("endAlpha", round(end.alpha));
  }

  if (Array.isArray(yaml.colorOverLifetime) && yaml.colorOverLifetime.length) {
    const colors = yaml.colorOverLifetime
      .map((entry) => ({ time: Number(entry.time), parsed: parseColor(entry.color) }))
      .filter((entry) => Number.isFinite(entry.time) && entry.parsed)
      .sort((a, b) => a.time - b.time);

    if (colors[0]) {
      setField("startColor", colors[0].parsed.color);
      setField("startAlpha", round(colors[0].parsed.alpha));
    }
    if (colors[colors.length - 1]) {
      setField("endColor", colors[colors.length - 1].parsed.color);
      setField("endAlpha", round(colors[colors.length - 1].parsed.alpha));
    }
  }

  [
    "particleSize", "sizeVariance", "lifetime", "lifetimeVariance", "speed", "speedVariance",
    "gravity", "drag", "spreadAngle", "emitAngle", "maxCount", "emissionRate",
    "terminalSpeed", "stretchFactor", "noiseStrength", "noiseFrequency",
    "rotationSpeed", "rotationSpeedVariance", "renderLayer"
  ].forEach((key) => setField(key, yaml[key]));

  setField("shader", yaml.shader || "");

  ["burst", "worldSpace", "ignoreQualitySettings"].forEach((key) => {
    if (key in yaml) setField(key, yaml[key]);
  });

  const force = parseVector(yaml.constantForce);
  if (force) {
    setField("forceX", force.x);
    setField("forceY", force.y);
  }

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
  importCurve(yaml, "alphaOverLifetime", "alpha", "enableAlphaCurve");
  importColorCurve(yaml);
  renderCurveEditors();
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
    line("state", cfg.spriteState, 4),
    line("startColor", hexWithAlpha(cfg.startColor, cfg.startAlpha)),
    line("endColor", hexWithAlpha(cfg.endColor, cfg.endAlpha)),
    line("particleSize", round(cfg.particleSize)),
    line("sizeVariance", round(cfg.sizeVariance)),
    line("lifetime", `${round(cfg.lifetime)}s`),
    line("lifetimeVariance", `${round(cfg.lifetimeVariance)}s`),
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
  ];

  if (cfg.shader) output.push(line("shader", cfg.shader));
  if (cfg.renderLayer !== 0) output.push(line("renderLayer", cfg.renderLayer));
  if (cfg.ignoreQualitySettings) output.push(line("ignoreQualitySettings", true));
  if (cfg.terminalSpeed > 0) output.push(line("terminalSpeed", round(cfg.terminalSpeed)));
  if (cfg.stretchFactor > 0) output.push(line("stretchFactor", round(cfg.stretchFactor)));
  if (cfg.forceX !== 0 || cfg.forceY !== 0) output.push(line("constantForce", `(${round(cfg.forceX)}, ${round(cfg.forceY)})`));
  if (cfg.noiseStrength > 0) {
    output.push(line("noiseStrength", round(cfg.noiseStrength)));
    output.push(line("noiseFrequency", round(cfg.noiseFrequency)));
  }
  if (cfg.rotationSpeed !== 0) output.push(line("rotationSpeed", round(cfg.rotationSpeed)));
  if (cfg.rotationSpeedVariance !== 0) output.push(line("rotationSpeedVariance", round(cfg.rotationSpeedVariance)));

  if (cfg.shapeType !== "Point") {
    output.push("  shape:");
    output.push(line("type", cfg.shapeType, 4));
    if (cfg.shapeType === "Box") {
      output.push(line("boxExtents", `(${round(cfg.boxX)}, ${round(cfg.boxY)})`, 4));
    } else {
      output.push(line("radius", round(cfg.shapeRadius), 4));
    }
  }

  if ($("enableSizeCurve").checked) output.push(...yamlCurve("sizeOverLifetime", curves.size));
  if ($("enableSpeedCurve").checked) output.push(...yamlCurve("speedOverLifetime", curves.speed));
  if ($("enableAlphaCurve").checked) output.push(...yamlCurve("alphaOverLifetime", curves.alpha));
  if ($("enableColorCurve").checked) output.push(...yamlColorCurve("colorOverLifetime", curves.color));

  yamlOutput.value = output.join("\n") + "\n";
}

function renderCurveEditors() {
  document.querySelectorAll(".curve-editor").forEach((editor) => {
    const name = editor.dataset.curve;
    editor.innerHTML = "";
    curves[name].forEach((key, index) => {
      const row = document.createElement("div");
      row.className = "curve-row";
      row.innerHTML = `
        <span>${round(key.time)}</span>
        <input type="range" min="0" max="2" step="0.01" value="${key.value}">
        <span>${round(key.value)}</span>
      `;
      const input = row.querySelector("input");
      input.addEventListener("input", () => {
        curves[name][index].value = Number(input.value);
        row.lastElementChild.textContent = round(input.value);
        generateYaml();
      });
      editor.appendChild(row);
    });
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

function setCurveData(curveName, keys) {
  if (!Array.isArray(keys)) return;
  curves[curveName] = structuredClone(keys);
}

function applyPreset(name) {
  const preset = presets[name];
  curves = structuredClone(curveDefaults);
  setField("shader", "");
  setField("renderLayer", 0);
  setField("enableSizeCurve", true);
  setField("enableSpeedCurve", true);
  setField("enableAlphaCurve", true);
  setField("enableColorCurve", false);
  for (const [key, value] of Object.entries(preset)) {
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
  setCurveData("color", preset.colorOverLifetime);
  if (Array.isArray(preset.colorOverLifetime)) setField("enableColorCurve", true);
  renderCurveEditors();
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
    element.addEventListener("input", () => {
      if (id === "maxCount" && particles.length > number("maxCount")) {
        particles = particles.slice(0, number("maxCount"));
      }
      generateYaml();
    });
    element.addEventListener("change", generateYaml);
  });

  $("preset").addEventListener("change", () => applyPreset($("preset").value));
  $("addColorStop").addEventListener("click", addColorStop);
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

  renderCurveEditors();
  renderColorCurveEditor();
  applyPreset("Grenade sparks");
  requestAnimationFrame(tick);
}

setup();
