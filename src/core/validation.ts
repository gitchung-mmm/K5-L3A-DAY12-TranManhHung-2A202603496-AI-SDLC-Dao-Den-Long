import type {
  InputFile,
  InputFrame,
  ScenarioConfig,
  ScenarioLantern,
  ScenarioMoteObject,
  ScenarioShade,
  Vec2,
  Vec3
} from "./types.js";

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

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
    if (!Number.isInteger(item.tick) || (item.tick as number) < 0) {
      throw new ContractValidationError(`inputs.frames[${i}].tick must be an integer >= 0`);
    }
    const tick = item.tick as number;
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
    for (const key of ["jump", "interact", "pulse", "dash"] as const) {
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
      if (!Number.isInteger(raw.player.carried) || (raw.player.carried as number) < 0) {
        throw new ContractValidationError("scenario.player.carried must be an integer >= 0");
      }
      out.player.carried = raw.player.carried as number;
    }
    if (raw.player.flames !== undefined) {
      if (!Number.isInteger(raw.player.flames) || (raw.player.flames as number) < 0) {
        throw new ContractValidationError("scenario.player.flames must be an integer >= 0");
      }
      out.player.flames = raw.player.flames as number;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== "boolean") {
      throw new ContractValidationError("scenario.random_motes must be a boolean");
    }
    out.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== "boolean") {
      throw new ContractValidationError("scenario.random_shades must be a boolean");
    }
    out.random_shades = raw.random_shades;
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
        if (item.id !== undefined && typeof item.id !== "string") {
          throw new ContractValidationError(`scenario.motes[${i}].id must be a string`);
        }
        return item.id !== undefined ? { id: item.id, pos } : { pos };
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
        if (item.id !== undefined && typeof item.id !== "string") {
          throw new ContractValidationError(`scenario.shades[${i}].id must be a string`);
        }
        if (item.state !== undefined && item.state !== "chase" && item.state !== "stunned") {
          throw new ContractValidationError(
            `scenario.shades[${i}].state must be "chase" or "stunned"`
          );
        }
        const shade: ScenarioShade = { pos };
        if (item.id !== undefined) shade.id = item.id;
        if (item.state !== undefined) shade.state = item.state;
        return shade;
      }
      throw new ContractValidationError(`scenario.shades[${i}] must be an object with pos`);
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
        if (!Number.isInteger(item.deposited) || (item.deposited as number) < 0) {
          throw new ContractValidationError(
            `scenario.lanterns[${i}].deposited must be an integer >= 0`
          );
        }
        lantern.deposited = item.deposited as number;
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== "boolean") {
          throw new ContractValidationError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        lantern.lit = item.lit;
      }
      return lantern;
    });
  }

  return out;
}
