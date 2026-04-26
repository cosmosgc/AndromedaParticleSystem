
# Particle System

The particle system is a CPU-based visual effects framework inspired by Unity's particle systems. Effects are defined entirely in YAML as `ParticleEffectPrototype` prototypes and simulated on the client.

## Table of Contents

1. [Overview](#overview)
2. [Performance & Limits](#performance--limits)
3. [Defining an Effect](#defining-an-effect)
   - [Visuals](#visuals)
   - [Size](#size)
   - [Lifetime](#lifetime)
   - [Movement](#movement)
   - [Rotation](#rotation)
   - [Emission](#emission)
   - [Emission Shape](#emission-shape)
   - [Direction & Spread](#direction--spread)
   - [Sub-emitters](#sub-emitters)
4. [Curves](#curves)
5. [Adding Particles to Entities](#adding-particles-to-entities)
   - [Continuous Emitter (`ParticleEmitter`)]
   - [Event-driven Components](#event-driven-components)
6. [Calling the API from Code](#calling-the-api-from-code)
   - [`CreateParticle`](#createparticle)
   - [`RemoveParticle`/`StopEffect`](#removeparticle--stopeffect)
   - [`UpdateRuntime`](#updateruntime)
   - [`UpdateIntensity`](#updateintensity)
   - [`SpawnEffectAimAt`](#spawneffectaimat)
   - [`KillAll`](#killall)
7. [Runtime Overrides `ParticleRuntimeOverrides`]
8. [Quality Settings & `IgnoreQualitySettings`]
9. [Emergency Kill: `particlepanic`]
10. [Example: Full Effect Prototype]

---

## Overview

- All simulation happens on the **client** CPU, on the main game thread.
- Effects are data-driven: define a `ParticleEffectPrototype`, attach a component or call the API.
- Particles are pooled inside each emitter, no per-frame GC allocation.
- A global hard cap of **8,000** live particles is enforced regardless of settings.

## Performance & Limits

| Limit | Value | Notes |
|---|---|---|
| Global hard cap | 8,000 | Absolute ceiling. |
| Quality: Off | 0 | All cosmetic particles disabled. |
| Quality: Low | 2,250 | 25% emission/count multiplier. |
| Quality: Medium | 5,500 | 50% emission/count multiplier. |
| Quality: High | 8,000 | 100% emission/count multiplier. |
| `IgnoreQualitySettings` max particles (below High) | 64 per emitter | See [Quality Settings](#quality-settings--ignorequalitysettings). |
| `IgnoreQualitySettings` max simultaneous emitters (Quality: Off) | 8 | |

**Rule of thumb:** set `maxCount` to the highest number of particles **visible** *at the same time*, ***not*** the total spawned over the effect's life. Ten emitters at 500 `maxCount` each = 5,000 slots allocated whether they are all visible or not.

You can estimate what your `maxCount` should roughly be by doing the following formula `maxCount = emissionRate * lifetime`

---

## Defining an Effect

```yaml
- type: particleEffect
  id: MyEffect
  # ... fields below
```

### Visuals

| Field | Type | Default | Description |
|---|---|---|---|
| `sprite` | `SpriteSpecifier` | *(required)* | RSI state or texture path drawn for each particle. |
| `startColor` | `Color` | `White` | Color at birth. Ignored if `colorOverLifetime` is set. |
| `endColor` | `Color` | `Transparent` | Color at death. Ignored if `colorOverLifetime` is set. |
| `colorOverLifetime` | `ColorCurveKey[]` | `[]` | Multi-stop gradient. Overrides the `startColor`/`endColor` lerp. |
| `alphaOverLifetime` | `ParticleCurveKey[]` | `[]` | Alpha multiplier curve (0–1). Multiplied on top of the color's alpha. |
| `shader` | `string?` | `null` | Optional shader override. |
| `renderLayer` | `int` | `0` | Draw order. Higher = rendered on top. |
| `ignoreQualitySettings` | `bool` | `false` | See [Quality Settings](#quality-settings--ignorequalitysettings). |

### Size

| Field | Type | Default | Description |
|---|---|---|---|
| `particleSize` | `float` | `0.2` | Base size in world units. |
| `sizeVariance` | `float` | `0` | Per-particle random ±size at spawn. |
| `sizeOverLifetime` | `ParticleCurveKey[]` | `[]` | Size multiplier curve over lifetime. |
| `stretchFactor` | `float` | `0` | Stretches particles along velocity. 0 = round, higher = streaky. |

### Lifetime

| Field | Type | Default | Description |
|---|---|---|---|
| `lifetime` | `TimeSpan` | `1s` | How long each particle lives. |
| `lifetimeVariance` | `TimeSpan` | `0.2s` | Per-particle lifetime randomization. |

### Movement

Directions are **screen-space**: X = right, Y = up.

| Field | Type | Default | Description |
|---|---|---|---|
| `speed` | `float` | `1.0` | Initial speed in world units/sec. |
| `speedVariance` | `float` | `0.3` | Per-particle speed randomization. |
| `speedOverLifetime` | `ParticleCurveKey[]` | `[]` | Speed multiplier curve over lifetime. |
| `constantForce` | `Vector2` | `(0,0)` | Constant acceleration every frame. |
| `forceOverLifetime` | `Vector2CurveKey[]` | `[]` | Time-varying force, sampled by normalized age, applied each frame. |
| `velocityOverLifetime` | `Vector2CurveKey[]` | `[]` | Positional nudge over lifetime (added directly to position, not velocity). |
| `gravity` | `float` | `0` | Downward drift in world units/sec. Negative = float upward. |
| `drag` | `float` | `0` | Exponential drag. `0` = no drag. |
| `terminalSpeed` | `float` | `0` | Speed cap. `0` = no cap. |
| `noiseStrength` | `float` | `0` | Turbulence strength. `0` = off. |
| `noiseFrequency` | `float` | `1.0` | Turbulence animation speed. Higher = choppier. |
| `inheritVelocity` | `float` | `0` | Fraction of emitter velocity inherited at spawn (0–1). |

### Rotation

| Field | Type | Default | Description |
|---|---|---|---|
| `startRotation` | `Angle` | `0°` | Initial rotation at spawn. |
| `startRotationVariance` | `Angle` | `0°` | Per-particle rotation randomization. `180°` = fully random. |
| `rotationSpeed` | `Angle` | `0°` | Spin speed in degrees/sec. |
| `rotationSpeedVariance` | `Angle` | `0°` | Per-particle spin speed randomization. |

### Emission

| Field | Type | Default | Description |
|---|---|---|---|
| `emissionRate` | `float` | `20` | Particles per second (continuous only). |
| `emissionOverTime` | `ParticleCurveKey[]` | `[]` | Emission rate multiplier curve over the emitter's duration. |
| `maxCount` | `int` | `50` | Max live particles at once. Keep this close to the maximum number simultaneously visible. |
| `burst` | `bool` | `false` | If `true`, emits all `maxCount` at once instantly then stops. |
| `bursts` | `ParticleBurstData[]` | `[]` | Timed bursts. Each entry fires `count` particles at a specific `time` offset. Can be combined with continuous emission. |
| `duration` | `TimeSpan` | `0` | Emitter run time. `0` = infinite (never stops). |

> **Burst example:**
> ```yaml
> bursts:
>   - time: 0.5s
>     count: 20
> ```

### Emission Shape

Controls where particles spawn relative to the emitter origin.

| Field | Type | Default | Description |
|---|---|---|---|
| `shape.type` | `EmissionShapeType` | `Point` | `Point`, `CircleEdge`, `CircleFill`, `Box` |
| `shape.radius` | `float` | `0.5` | Radius for circle shapes. |
| `shape.boxExtents` | `Vector2` | `(0.5, 0.5)` | Half-extents for `Box`. X = half-width, Y = half-height. |

> **Shape example:**
> ```yaml
> shape:
>  type: CircleFill
>  radius: 1.0
> ```

### Direction & Spread

| Field | Type | Default | Description |
|---|---|---|---|
| `spreadAngle` | `Angle` | `360°` | Cone half-angle for emission direction randomization. `360°` = omnidirectional. |
| `emitAngle` | `Angle` | `0°` | Base emission direction. `0°` = screen-up. |

### Sub-emitters

Sub-emitters are separate `ParticleEffectPrototype` effects that automatically spawn at a particle's world position when it is born or dies.

| Field | Type | Description |
|---|---|---|
| `subEmitterOnSpawn` | `ProtoId<ParticleEffectPrototype>?` | Effect spawned at each particle's position when it is born. |
| `subEmitterOnDeath` | `ProtoId<ParticleEffectPrototype>?` | Effect spawned at each particle's position when it dies. |

**Warning:** Sub-emitters chain freely, but be careful of exponential particle explosions. A 50-particle emitter with a 50-particle `subEmitterOnDeath` produces up to 2,500 particles.

### Space

| Field | Type | Default | Description |
|---|---|---|---|
| `worldSpace` | `bool` | `true` | `true` = particles simulate in world space, trailing behind moving emitters. `false` = particles move relative to emitter origin. |

---

## Curves

Float, color, and Vector2 fields that take `*OverLifetime` lists are sampled using a normalized `t` value of `0` (birth) to `1` (death). Keys are linearly interpolated between.

```yaml
colorOverLifetime:
  - time: 0.0
    color: "#FF4400FF" # Orange, fully opaque at birth
  - time: 0.8
    color: "#FF440088" # Fading
  - time: 1.0
    color: "#FF440000" # Fully transparent at death

sizeOverLifetime:
  - time: 0.0
    value: 0.2
  - time: 0.5
    value: 1.0
  - time: 1.0
    value: 0.0
```

## Adding Particles to Entities

### Continuous Emitter: `ParticleEmitter`

Emits continuously from `ComponentInit` until the entity is deleted.

```yaml
- type: entity
  id: entityID
  components:
    - type: ParticleEmitter
      effect: WelderFlame
```

### Event-driven Components

Each component listens for one specific event and triggers the given effect. Add as many as you need to a single entity.

| Component `type:` | Fires when: |
|---|---|
| `ParticleOnUse` | Entity is used in-hand |
| `ParticleOnUseInWorld` | Entity is used on a target in the world |
| `ParticleOnMeleeAttack` | This entity attacks with melee |
| `ParticleOnMeleeAttackOther` | A melee hit lands on another entity (spawns on the **victim**) |
| `ParticleOnMeleeHit` | **This** entity is hit by melee |
| `ParticleOnThrown` | Entity is thrown, auto-stops on landing, infinite-duration `(duration: 0)` allowed |
| `ParticleOnLanded` | Entity lands after being thrown |
| `ParticleOnPrimed` | Entity is primed/armed (grenades, etc.) |
| `ParticleOnGunShot` | Gun fires (muzzle flash, etc.) |
| `ParticleOnGunShotProjectile` | Attaches an emitter to **each spawned projectile**; infinite-duration allowed (destroyed with the projectile) |
| `ParticleOnProjectileHit` | Projectile hits something (spawns on **projectile**) |
| `ParticleOnProjectileHitOther` | Projectile hits something (spawns on the **victim**) |

**Important:** Effects with `duration: 0` (infinite) **cannot** be used with event components **except** `ParticleOnThrown` (auto-stopped on land) and `ParticleOnGunShotProjectile` (destroyed with the projectile). An error is logged at runtime if you violate this.

All event components share two fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `effect` | `ProtoId<ParticleEffectPrototype>` | **Yes** | The effect to spawn. |
| `colorOverride` | `Color?` | No | Optional color tint applied on top of the effect. |

**Full example:**

```yaml
- type: entity
  id: Grenade
  components:
    # Sparks when primed
    - type: ParticleOnPrimed
      effect: GrenadeSparks
    # Trail while in flight, auto-stops on land
    - type: ParticleOnThrown
      effect: GrenadeTrail

- type: entity
  id: AssaultRifle
  components:
    # Muzzle flash on fire
    - type: ParticleOnGunShot
      effect: MuzzleFlash
    # Bullet trail attached to each projectile
    - type: ParticleOnGunShotProjectile
      effect: BulletTrail
    # Impact effect on the thing you hit
    - type: ParticleOnProjectileHitOther
      effect: BulletImpact
```

## Calling the API from Code

`ParticleSystem` exposes a clean API in `ParticleSystem.API.cs`. Inject `ParticleSystem` and call the following methods. All methods are **client-only**.

### `CreateParticle`

```csharp
// Spawn at an entity's position (follows the entity by default)
ActiveEmitter? emitter = _particles.CreateParticle(
    "MyEffect",          // ProtoId<ParticleEffectPrototype>
    entity,              // EntityUid
    Color.Red,           // optional color tint
    attach: true);       // follow the entity each tick

// Spawn at a fixed world position
ActiveEmitter? emitter = _particles.CreateParticle(
    "MyEffect",
    new MapCoordinates(pos, mapId));
```

Returns an `ActiveEmitter?` handle. Hold onto this if you need to stop the emitter manually.

### `RemoveParticle`/`StopEffect`

Stops the emitter from emitting new particles. Existing particles live out their lifetimes.

```csharp
_particles.RemoveParticle(emitter);          // by ActiveEmitter reference (nullable-safe)
_particles.RemoveParticle(emitter.Handle);   // by uint handle
```

### `UpdateRuntime`

Applies `ParticleRuntimeOverrides` to a live emitter. Only non-null fields are written.

```csharp
_particles.UpdateRuntime(emitter, new ParticleRuntimeOverrides
{
    EmissionRate = 80f,
    StartColor   = Color.Red,
});
```

### `UpdateIntensity`

Scales emission rate and counts by a multiplier. Useful for gradually fading an effect in/out.

```csharp
_particles.UpdateIntensity(emitter, 0.5f);   // half intensity
_particles.UpdateIntensity(emitter.Handle, 0f); // effectively paused
```

### `SpawnEffectAimAt`

Creates an emitter whose direction tracks a target entity or position each tick.

```csharp
// Track an entity
_particles.SpawnEffectAimAt("Beam", coords, targetEntityUid, attachedEntity: gun);

// Track a world position
_particles.SpawnEffectAimAt("Beam", coords, targetWorldPos, attachedEntity: gun);
```

### `KillAll`

Nuclear option. Immediately destroys every active emitter and all live particles.

```csharp
int cleared = _particles.KillAll();
```

---

## Runtime Overrides (`ParticleRuntimeOverrides`)

Any field from the prototype can be overridden per-emitter at runtime without touching the prototype. All fields are nullable (`null`) means "use the prototype value".

```csharp
var overrides = new ParticleRuntimeOverrides
{
    StartColor       = Color.Blue,
    EmissionRate     = 50f,
    Lifetime         = TimeSpan.FromSeconds(2),
    SpreadAngle      = Angle.FromDegrees(45),
};

_particles.UpdateRuntime(emitter, overrides);
```

**Available override fields** (mirrors `ParticleEffectPrototype`):

| Field | Type |
|---|---|
| `StartColor`, `EndColor`, `ColorOverride` | `Color?` |
| `Shader` | `string?` |
| `RenderLayer` | `int?` |
| `ParticleSize`, `SizeVariance`, `StretchFactor` | `float?` |
| `Lifetime`, `LifetimeVariance` | `TimeSpan?` |
| `Speed`, `SpeedVariance` | `float?` |
| `ConstantForce` | `Vector2?` |
| `Gravity`, `Drag`, `TerminalSpeed` | `float?` |
| `NoiseStrength`, `NoiseFrequency` | `float?` |
| `InheritVelocity` | `float?` |
| `StartRotation`, `StartRotationVariance` | `Angle?` |
| `RotationSpeed`, `RotationSpeedVariance` | `Angle?` |
| `EmissionRate` | `float?` |
| `MaxCount` | `int?` |
| `Duration` | `TimeSpan?` |
| `SpreadAngle`, `EmitAngle` | `Angle?` |

**Note on `MaxCount`:** Raising this at runtime causes new particle slots to be allocated beyond the original pool. Lowering it is safe but the extra slots stay allocated until the emitter is destroyed.

## Quality Settings & `IgnoreQualitySettings`

The in-game **Particle Quality** setting (Off / Low / Medium / High) scales emission rate and particle counts globally.

| Quality | Budget | Multiplier |
|---|---|---|
| Off | 0 | 0% |
| Low | 2,250 | 25% |
| Medium | 5,500 | 50% |
| High | 8,000 | 100% |

### `ignoreQualitySettings: true`

This flag bypasses quality scaling so the effect always runs at full rate. It exists **only** for gameplay-critical particles where the effect being absent would be confusing or harmful to gameplay.

**Hard constraints when `ignoreQualitySettings: true`:**
- Max **64 particles per emitter** at any quality below High.
- Max **8 simultaneous `IgnoreQualitySettings` emitters** when quality is Off.
- The global 8,000 particle hard cap is **always** respected.

**DO NOT use this for purely cosmetic effects.** Fire, sparks, smoke, blood, all cosmetic. Leave `ignoreQualitySettings` at its default `false`. **If you cannot articulate a clear gameplay reason for needing it, the answer is no.**

## Emergency Kill: `particlepanic`

The Toolshed command `particlepanic` immediately destroys every active emitter and all live particles. Use it if something goes catastrophically wrong.

```
particlepanic
```

---

## Example: Full Effect Prototype

```yaml
- type: particleEffect
  id: GrenadeSparks
  sprite:
    sprite: Effects/particles.rsi
    state: spark
  startColor: "#FFEE88FF"
  endColor: "#FF440000"
  colorOverLifetime:
    - time: 0.0
      color: "#FFEE88FF"
    - time: 0.6
      color: "#FF8800CC"
    - time: 1.0
      color: "#FF000000"
  alphaOverLifetime:
    - time: 0.0
      value: 1.0
    - time: 1.0
      value: 0.0
  particleSize: 0.08
  sizeVariance: 0.03
  sizeOverLifetime:
    - time: 0.0
      value: 1.0
    - time: 1.0
      value: 0.2
  lifetime: 0.6s
  lifetimeVariance: 0.2s
  speed: 3.5
  speedVariance: 1.5
  speedOverLifetime:
    - time: 0.0
      value: 1.0
    - time: 1.0
      value: 0.1
  drag: 2.5
  gravity: 4.0
  spreadAngle: 360
  maxCount: 30
  burst: true
  worldSpace: true
  subEmitterOnDeath: SparksSmoke
```