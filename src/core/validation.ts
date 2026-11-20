import type {
  DrifterBehaviorState,
  InputFile,
  InputFrame,
  MoteKind,
  ScenarioCharm,
  ScenarioConfig,
  ScenarioDrifter,
  ScenarioLantern,
  ScenarioMoteObject,
  ScenarioShade,
  ShadeBehaviorState,
  Vec2,
  Vec3
} from "./types.js";

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

const VALID_SHADE_STATES = new Set<ShadeBehaviorState>([
  "spawning",
  "wander",
  "chase",
  "drain",
  "recoil",
  "stunned"
]);

const VALID_DRIFTER_STATES = new Set<DrifterBehaviorState>([
  "idle",
  "chase",
  "flee",
  "removed"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertVec3(value: unknown, label: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    !isFiniteNumber(value[2])
  ) {
    throw new ContractValidationError(`${label} must be a [x, y, z] array of 3 finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

function assertVec2Move(value: unknown, label: string): Vec2 {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1])
  ) {
    throw new ContractValidationError(`${label} must be a [x, z] array of 2 finite numbers`);
  }
  if (value[0] < -1 || value[0] > 1 || value[1] < -1 || value[1] > 1) {
    throw new ContractValidationError(`${label} components must be in [-1, 1]`);
  }
  return [value[0], value[1]];
}

function assertNonNegInt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ContractValidationError(`${label} must be an integer >= 0`);
  }
  return value as number;
}

export function validateInputFile(raw: unknown): InputFile {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError("inputs root must be a JSON object");
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractValidationError("inputs.frames must be an array");
  }

  const frames: InputFrame[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i++) {
    const item = raw.frames[i];
    if (!isPlainObject(item)) {
      throw new ContractValidationError(`inputs.frames[${i}] must be an object`);
    }
    const tick = assertNonNegInt(item.tick, `inputs.frames[${i}].tick`);
    if (tick <= prevTick) {
      throw new ContractValidationError(
        `inputs.frames[${i}].tick (${tick}) must be strictly greater than previous tick (${prevTick})`
      );
    }
    prevTick = tick;

    const frame: InputFrame = { tick };

    if (item.move !== undefined) {
      frame.move = assertVec2Move(item.move, `inputs.frames[${i}].move`);
    }
    if (item.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(item.cam_yaw_deg)) {
        throw new ContractValidationError(`inputs.frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = item.cam_yaw_deg;
    }
    for (const key of ["jump", "interact", "pulse", "dash", "pause"] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== "boolean") {
          throw new ContractValidationError(`inputs.frames[${i}].${key} must be a boolean`);
        }
        frame[key] = item[key] as boolean;
      }
    }

    frames.push(frame);
  }

  return { frames };
}

export function validateScenarioConfig(raw: unknown): ScenarioConfig {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError("scenario root must be a JSON object");
  }

  const out: ScenarioConfig = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ContractValidationError("scenario.player must be an object");
    }
    out.player = {};
    if (raw.player.pos !== undefined) {
      out.player.pos = assertVec3(raw.player.pos, "scenario.player.pos");
    }
    if (raw.player.carried !== undefined) {
      out.player.carried = assertNonNegInt(raw.player.carried, "scenario.player.carried");
    }
    if (raw.player.flames !== undefined) {
      out.player.flames = assertNonNegInt(raw.player.flames, "scenario.player.flames");
    }
    if (raw.player.invuln_ticks !== undefined) {
      out.player.invuln_ticks = assertNonNegInt(
        raw.player.invuln_ticks,
        "scenario.player.invuln_ticks"
      );
    }
    if (raw.player.dash_cd_ticks !== undefined) {
      out.player.dash_cd_ticks = assertNonNegInt(
        raw.player.dash_cd_ticks,
        "scenario.player.dash_cd_ticks"
      );
    }
    if (raw.player.pulse_cd_ticks !== undefined) {
      out.player.pulse_cd_ticks = assertNonNegInt(
        raw.player.pulse_cd_ticks,
        "scenario.player.pulse_cd_ticks"
      );
    }
    if (raw.player.charm_ticks !== undefined) {
      out.player.charm_ticks = assertNonNegInt(
        raw.player.charm_ticks,
        "scenario.player.charm_ticks"
      );
    }
    if (raw.player.successful_lights !== undefined) {
      out.player.successful_lights = assertNonNegInt(
        raw.player.successful_lights,
        "scenario.player.successful_lights"
      );
    }
  }

  for (const flag of ["random_motes", "random_shades", "random_drifters", "wind_enabled"] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== "boolean") {
        throw new ContractValidationError(`scenario.${flag} must be a boolean`);
      }
      out[flag] = raw[flag] as boolean;
    }
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ContractValidationError("scenario.time_left_s must be a number >= 0");
    }
    out.time_left_s = raw.time_left_s;
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractValidationError("scenario.motes must be an array");
    }
    out.motes = raw.motes.map((item, i): Vec3 | ScenarioMoteObject => {
      if (Array.isArray(item)) {
        return assertVec3(item, `scenario.motes[${i}]`);
      }
      if (isPlainObject(item)) {
        const pos = assertVec3(item.pos, `scenario.motes[${i}].pos`);
        const mote: ScenarioMoteObject = { pos };
        if (item.id !== undefined) {
          if (typeof item.id !== "string") {
            throw new ContractValidationError(`scenario.motes[${i}].id must be a string`);
          }
          mote.id = item.id;
        }
        if (item.kind !== undefined) {
          if (item.kind !== "random" && item.kind !== "dropped") {
            throw new ContractValidationError(`scenario.motes[${i}].kind must be random or dropped`);
          }
          mote.kind = item.kind as MoteKind;
        }
        if (item.ttl_s !== undefined && item.ttl_s !== null) {
          if (!isFiniteNumber(item.ttl_s) || item.ttl_s < 0) {
            throw new ContractValidationError(`scenario.motes[${i}].ttl_s must be >= 0 or null`);
          }
          mote.ttl_s = item.ttl_s;
        }
        return mote;
      }
      throw new ContractValidationError(`scenario.motes[${i}] must be a [x,y,z] or {pos}`);
    });
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractValidationError("scenario.shades must be an array");
    }
    out.shades = raw.shades.map((item, i): Vec3 | ScenarioShade => {
      if (Array.isArray(item)) {
        return assertVec3(item, `scenario.shades[${i}]`);
      }
      if (isPlainObject(item)) {
        const pos = assertVec3(item.pos, `scenario.shades[${i}].pos`);
        const shade: ScenarioShade = { pos };
        if (item.id !== undefined) {
          if (typeof item.id !== "string") {
            throw new ContractValidationError(`scenario.shades[${i}].id must be a string`);
          }
          shade.id = item.id;
        }
        if (item.state !== undefined) {
          if (
            typeof item.state !== "string" ||
            !VALID_SHADE_STATES.has(item.state as ShadeBehaviorState)
          ) {
            throw new ContractValidationError(
              `scenario.shades[${i}].state must be spawning|wander|chase|drain|recoil|stunned`
            );
          }
          shade.state = item.state as ShadeBehaviorState;
        }
        if (item.state_ticks_left !== undefined) {
          shade.state_ticks_left = assertNonNegInt(
            item.state_ticks_left,
            `scenario.shades[${i}].state_ticks_left`
          );
        }
        if (item.target_lantern_id !== undefined) {
          if (typeof item.target_lantern_id !== "string") {
            throw new ContractValidationError(
              `scenario.shades[${i}].target_lantern_id must be a string`
            );
          }
          shade.target_lantern_id = item.target_lantern_id;
        }
        return shade;
      }
      throw new ContractValidationError(`scenario.shades[${i}] must be an object with pos`);
    });
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractValidationError("scenario.drifters must be an array");
    }
    out.drifters = raw.drifters.map((item, i): ScenarioDrifter => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.drifters[${i}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.drifters[${i}].pos`);
      const drifter: ScenarioDrifter = { pos };
      if (item.id !== undefined) {
        if (typeof item.id !== "string") {
          throw new ContractValidationError(`scenario.drifters[${i}].id must be a string`);
        }
        drifter.id = item.id;
      }
      if (item.state !== undefined) {
        if (
          typeof item.state !== "string" ||
          !VALID_DRIFTER_STATES.has(item.state as DrifterBehaviorState)
        ) {
          throw new ContractValidationError(
            `scenario.drifters[${i}].state must be idle|chase|flee|removed`
          );
        }
        drifter.state = item.state as DrifterBehaviorState;
      }
      if (item.stolen !== undefined) {
        drifter.stolen = assertNonNegInt(item.stolen, `scenario.drifters[${i}].stolen`);
      }
      if (item.state_ticks_left !== undefined) {
        drifter.state_ticks_left = assertNonNegInt(
          item.state_ticks_left,
          `scenario.drifters[${i}].state_ticks_left`
        );
      }
      return drifter;
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractValidationError("scenario.charms must be an array");
    }
    out.charms = raw.charms.map((item, i): ScenarioCharm => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.charms[${i}] must be an object`);
      }
      const charm: ScenarioCharm = {};
      if (item.id !== undefined) {
        if (typeof item.id !== "string") {
          throw new ContractValidationError(`scenario.charms[${i}].id must be a string`);
        }
        charm.id = item.id;
      }
      if (item.pos !== undefined) {
        charm.pos = assertVec3(item.pos, `scenario.charms[${i}].pos`);
      }
      if (item.available !== undefined) {
        if (typeof item.available !== "boolean") {
          throw new ContractValidationError(`scenario.charms[${i}].available must be a boolean`);
        }
        charm.available = item.available;
      }
      if (item.respawn_ticks !== undefined) {
        charm.respawn_ticks = assertNonNegInt(
          item.respawn_ticks,
          `scenario.charms[${i}].respawn_ticks`
        );
      }
      if (item.respawn_s !== undefined) {
        if (!isFiniteNumber(item.respawn_s) || item.respawn_s < 0) {
          throw new ContractValidationError(`scenario.charms[${i}].respawn_s must be >= 0`);
        }
        charm.respawn_s = item.respawn_s;
      }
      return charm;
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractValidationError("scenario.lanterns must be an array");
    }
    out.lanterns = raw.lanterns.map((item, i): ScenarioLantern => {
      if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0) {
        throw new ContractValidationError(`scenario.lanterns[${i}].id must be a non-empty string`);
      }
      const lantern: ScenarioLantern = { id: item.id };
      if (item.pos !== undefined) {
        lantern.pos = assertVec3(item.pos, `scenario.lanterns[${i}].pos`);
      }
      if (item.deposited !== undefined) {
        lantern.deposited = assertNonNegInt(item.deposited, `scenario.lanterns[${i}].deposited`);
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== "boolean") {
          throw new ContractValidationError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        lantern.lit = item.lit;
      }
      if (item.fuel !== undefined) {
        if (!isFiniteNumber(item.fuel) || item.fuel < 0 || item.fuel > 100) {
          throw new ContractValidationError(`scenario.lanterns[${i}].fuel must be in [0, 100]`);
        }
        lantern.fuel = item.fuel;
      }
      if (item.ever_lit !== undefined) {
        if (typeof item.ever_lit !== "boolean") {
          throw new ContractValidationError(`scenario.lanterns[${i}].ever_lit must be a boolean`);
        }
        lantern.ever_lit = item.ever_lit;
      }
      return lantern;
    });
  }

  return out;
}
