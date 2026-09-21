/**
 * Scan art source for //PARAM-* line comments (see docs/PARAM-SPEC.md).
 * Pure Node — no eval. Returns { schema, errors }.
 */

const KNOWN_TYPES = new Set([
  "BUTTON",
  "STRING",
  "NUMBER",
  "ARRAY",
  "BOOLEAN",
  "FLOAT",
  "INT",
  "CHOICE",
  "DROPDOWN",
  "RGB",
  "HSV",
  "HSL",
  "HEX",
  "VEC2",
]);

/** @deprecated — scan error with migration hint (see docs/PARAM-COLOR-PLAN.md §6) */
const DEPRECATED_TYPES = new Set(["COLOR"]);

/**
 * From the first `[`, find the index after the matching `]` for a JSON array
 * (respects strings and escapes).
 */
function endIndexOfJsonArray(line, bracketStart) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = bracketStart; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const LINE_RE = /^(\s*)\/\/PARAM-([A-Z0-9]+):\s*(\[)/;

function parseParamLine(line, file, lineNumber) {
  const m = line.match(LINE_RE);
  if (!m) return null;

  const type = m[2];
  const bracketStart = m.index + m[0].length - 1;
  const end = endIndexOfJsonArray(line, bracketStart);
  if (end < 0) {
    return {
      error: {
        file,
        line: lineNumber,
        message: "Unclosed or invalid JSON array in PARAM line",
        raw: line.trim(),
      },
    };
  }

  const jsonSlice = line.slice(bracketStart, end);
  let arr;
  try {
    arr = JSON.parse(jsonSlice);
  } catch (e) {
    return {
      error: {
        file,
        line: lineNumber,
        message: "Invalid JSON in PARAM payload: " + (e.message || e),
        raw: line.trim(),
      },
    };
  }

  if (!Array.isArray(arr)) {
    return {
      error: {
        file,
        line: lineNumber,
        message: "PARAM payload must be a JSON array",
        raw: line.trim(),
      },
    };
  }

  const description = line.slice(end).trim();

  if (DEPRECATED_TYPES.has(type)) {
    const deprecatedName = typeof arr[0] === "string" ? arr[0] : undefined;
    return {
      error: {
        file,
        line: lineNumber,
        message: `PARAM-${type} is deprecated; use PARAM-RGB, PARAM-HSV, PARAM-HSL, or PARAM-HEX instead`,
        raw: line.trim(),
        deprecatedType: `PARAM-${type}`,
        deprecatedName,
      },
    };
  }

  if (!KNOWN_TYPES.has(type)) {
    return {
      error: {
        file,
        line: lineNumber,
        message: `Unknown PARAM type "${type}"`,
        raw: line.trim(),
      },
    };
  }

  const entry = {
    type: "PARAM-" + type,
    description,
    declaredIn: { file, line: lineNumber },
  };

  const err = (msg) => ({
    error: { file, line: lineNumber, message: msg, raw: line.trim() },
  });

  const name0 = arr[0];
  if (typeof name0 !== "string" || !name0.length) {
    return err("First array element must be a non-empty string (parameter name)");
  }
  entry.name = name0;

  switch (type) {
    case "BUTTON": {
      if (arr.length !== 1) return err("PARAM-BUTTON expects [\"name\"]");
      break;
    }
    case "STRING": {
      if (arr.length !== 2) return err("PARAM-STRING expects [\"name\", default]");
      const d = arr[1];
      if (d !== null && typeof d !== "string")
        return err("PARAM-STRING default must be a string or null");
      entry.default = d;
      break;
    }
    case "NUMBER": {
      if (arr.length !== 2) return err("PARAM-NUMBER expects [\"name\", defaultNumber]");
      if (typeof arr[1] !== "number" || Number.isNaN(arr[1]))
        return err("PARAM-NUMBER default must be a JSON number");
      entry.default = arr[1];
      break;
    }
    case "ARRAY": {
      if (arr.length !== 2) return err("PARAM-ARRAY expects [\"name\", default]");
      entry.default = arr[1];
      break;
    }
    case "BOOLEAN": {
      if (arr.length !== 2) return err("PARAM-BOOLEAN expects [\"name\", default]");
      const d = arr[1];
      if (typeof d === "boolean") {
        entry.default = d ? 1 : 0;
      } else if (d === 0 || d === 1) {
        entry.default = d;
      } else {
        return err("PARAM-BOOLEAN default must be true, false, 0, or 1");
      }
      break;
    }
    case "FLOAT": {
      let low;
      let high;
      let step;
      let defVal;
      if (arr.length === 4) {
        low = arr[1];
        high = arr[2];
        step = arr[3];
        defVal = low;
      } else if (arr.length === 5) {
        defVal = arr[1];
        low = arr[2];
        high = arr[3];
        step = arr[4];
      } else {
        return err(
          "PARAM-FLOAT expects [\"name\", low, high, step] or [\"name\", default, low, high, step]",
        );
      }
      if (
        typeof low !== "number" ||
        typeof high !== "number" ||
        typeof step !== "number" ||
        typeof defVal !== "number" ||
        Number.isNaN(low + high + step + defVal)
      )
        return err("PARAM-FLOAT numeric fields must be numbers");
      if (low > high) return err("PARAM-FLOAT low must be <= high");
      if (step <= 0) return err("PARAM-FLOAT step must be > 0");
      entry.low = low;
      entry.high = high;
      entry.step = step;
      entry.default = defVal;
      break;
    }
    case "INT": {
      let low;
      let high;
      let step;
      let defVal;
      if (arr.length === 4) {
        low = arr[1];
        high = arr[2];
        step = arr[3];
        defVal = low;
      } else if (arr.length === 5) {
        defVal = arr[1];
        low = arr[2];
        high = arr[3];
        step = arr[4];
      } else {
        return err(
          "PARAM-INT expects [\"name\", low, high, step] or [\"name\", default, low, high, step]",
        );
      }
      if (
        typeof low !== "number" ||
        typeof high !== "number" ||
        typeof step !== "number" ||
        typeof defVal !== "number" ||
        !Number.isInteger(low) ||
        !Number.isInteger(high) ||
        !Number.isInteger(step) ||
        !Number.isInteger(defVal)
      )
        return err("PARAM-INT numeric fields must be integers");
      if (low > high) return err("PARAM-INT low must be <= high");
      if (step < 1) return err("PARAM-INT step must be >= 1");
      entry.low = low;
      entry.high = high;
      entry.step = step;
      entry.default = defVal;
      break;
    }
    case "CHOICE":
    case "DROPDOWN": {
      if (arr.length < 3)
        return err(`PARAM-${type} expects ["name", "choice0", ...]`);
      const choices = arr.slice(1);
      for (let i = 0; i < choices.length; i++) {
        if (typeof choices[i] !== "string")
          return err(`PARAM-${type} choices must be strings`);
      }
      entry.choices = choices;
      entry.default = choices[0];
      break;
    }
    case "RGB": {
      if (arr.length !== 5)
        return err('PARAM-RGB expects ["name", R, G, B, A]');
      for (let i = 1; i <= 4; i++) {
        if (typeof arr[i] !== "number" || Number.isNaN(arr[i]))
          return err("PARAM-RGB components must be numbers");
      }
      entry.r = arr[1];
      entry.g = arr[2];
      entry.b = arr[3];
      entry.a = arr[4];
      entry.default = { r: arr[1], g: arr[2], b: arr[3], a: arr[4] };
      break;
    }
    case "HSV": {
      if (arr.length !== 5)
        return err('PARAM-HSV expects ["name", H, S, V, A]');
      for (let i = 1; i <= 4; i++) {
        if (typeof arr[i] !== "number" || Number.isNaN(arr[i]))
          return err("PARAM-HSV components must be numbers");
      }
      entry.h = arr[1];
      entry.s = arr[2];
      entry.v = arr[3];
      entry.a = arr[4];
      entry.default = { h: arr[1], s: arr[2], v: arr[3], a: arr[4] };
      break;
    }
    case "HSL": {
      if (arr.length !== 5)
        return err('PARAM-HSL expects ["name", H, S, L, A]');
      for (let i = 1; i <= 4; i++) {
        if (typeof arr[i] !== "number" || Number.isNaN(arr[i]))
          return err("PARAM-HSL components must be numbers");
      }
      entry.h = arr[1];
      entry.s = arr[2];
      entry.l = arr[3];
      entry.a = arr[4];
      entry.default = { h: arr[1], s: arr[2], l: arr[3], a: arr[4] };
      break;
    }
    case "HEX": {
      if (arr.length !== 2) return err("PARAM-HEX expects [\"name\", \"hex\"]");
      if (typeof arr[1] !== "string") return err("PARAM-HEX hex must be a string");
      entry.hex = arr[1].replace(/^#/, "");
      entry.default = "#" + entry.hex;
      break;
    }
    case "VEC2": {
      if (arr.length !== 5) {
        return err(
          'PARAM-VEC2 expects ["name", [dx, dy], [minX, minY], [maxX, maxY], step]',
        );
      }
      const def = arr[1];
      const minArr = arr[2];
      const maxArr = arr[3];
      const step = arr[4];
      if (!Array.isArray(def) || def.length !== 2)
        return err("PARAM-VEC2 default must be [x, y]");
      if (!Array.isArray(minArr) || minArr.length !== 2)
        return err("PARAM-VEC2 min must be [x, y]");
      if (!Array.isArray(maxArr) || maxArr.length !== 2)
        return err("PARAM-VEC2 max must be [x, y]");
      if (typeof step !== "number" || Number.isNaN(step) || step <= 0)
        return err("PARAM-VEC2 step must be a number > 0");
      for (let i = 0; i < 2; i++) {
        if (typeof def[i] !== "number" || Number.isNaN(def[i]))
          return err("PARAM-VEC2 default components must be numbers");
        if (typeof minArr[i] !== "number" || Number.isNaN(minArr[i]))
          return err("PARAM-VEC2 min components must be numbers");
        if (typeof maxArr[i] !== "number" || Number.isNaN(maxArr[i]))
          return err("PARAM-VEC2 max components must be numbers");
      }
      if (minArr[0] > maxArr[0] || minArr[1] > maxArr[1])
        return err("PARAM-VEC2 min must be <= max on each axis");
      if (def[0] < minArr[0] || def[0] > maxArr[0] || def[1] < minArr[1] || def[1] > maxArr[1])
        return err("PARAM-VEC2 default must be within min/max on each axis");
      entry.min = { x: minArr[0], y: minArr[1] };
      entry.max = { x: maxArr[0], y: maxArr[1] };
      entry.step = step;
      entry.default = [def[0], def[1]];
      break;
    }
    default:
      return err(`Unhandled type ${type}`);
  }

  return { entry };
}

/**
 * @param {Array<{ file: string, content: string }>} bundles
 * @returns {{ schema: object[], errors: object[] }}
 */
function scanParamSources(bundles) {
  const schema = [];
  const errors = [];
  const seenNames = new Map();

  for (const { file, content } of bundles) {
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed.startsWith("//PARAM-")) continue;
      if (trimmed.startsWith("// PARAM-")) continue;

      const parsed = parseParamLine(line, file, i + 1);
      if (!parsed) continue;
      if (parsed.error) {
        errors.push(parsed.error);
        continue;
      }

      const { entry } = parsed;
      if (seenNames.has(entry.name)) {
        const prev = seenNames.get(entry.name);
        errors.push({
          file,
          line: i + 1,
          message: `Duplicate parameter name "${entry.name}" (also declared in ${prev.file}:${prev.line})`,
          raw: line.trim(),
        });
        continue;
      }
      seenNames.set(entry.name, { file, line: i + 1 });
      schema.push(entry);
    }
  }

  return { schema, errors };
}

/**
 * Markdown catalog for integrators (docs/PARAM-SPEC.md §9).
 */
function renderParamsMarkdown(projectName, schema, errors) {
  const lines = [];
  lines.push(`# Parameters — ${projectName}`);
  lines.push("");
  lines.push(
    "This file lists **external parameters** declared with `//PARAM-*` comments in the art source. Runtime control uses **`cc_onParam`** / **`SendParams`** (optional **`OnParam(fn)`** alias; see advBuilder `docs/PARAM-SPEC.md`).",
  );
  lines.push("");

  if (errors.length) {
    lines.push("## Scan errors");
    lines.push("");
    for (const e of errors) {
      lines.push(
        `- **${e.file}:${e.line}** — ${e.message}${e.raw ? ` \`${e.raw.replace(/`/g, "'")}\`` : ""}`,
      );
    }
    lines.push("");
  }

  if (!schema.length) {
    lines.push("## Parameters");
    lines.push("");
    lines.push("*No `//PARAM-*` definitions in this piece.*");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Parameters");
  lines.push("");
  lines.push("| Name | Type | Constraints / default | Description |");
  lines.push("|------|------|-------------------------|-------------|");

  for (const p of schema) {
    const desc = (p.description || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    let constraints = "";
    switch (p.type) {
      case "PARAM-BUTTON":
        constraints = "(momentary)";
        break;
      case "PARAM-STRING":
      case "PARAM-NUMBER":
      case "PARAM-BOOLEAN":
      case "PARAM-ARRAY":
        constraints = "`default`: " + JSON.stringify(p.default);
        break;
      case "PARAM-FLOAT":
      case "PARAM-INT":
        constraints = `default \`${p.default}\`, low \`${p.low}\`, high \`${p.high}\`, step \`${p.step}\``;
        break;
      case "PARAM-CHOICE":
      case "PARAM-DROPDOWN":
        constraints = "choices: " + p.choices.map((c) => "`" + c + "`").join(", ");
        break;
      case "PARAM-RGB":
        constraints = `R \`${p.r}\`, G \`${p.g}\`, B \`${p.b}\`, A \`${p.a}\``;
        break;
      case "PARAM-HSV":
        constraints = `H \`${p.h}\`, S \`${p.s}\`, V \`${p.v}\`, A \`${p.a}\``;
        break;
      case "PARAM-HSL":
        constraints = `H \`${p.h}\`, S \`${p.s}\`, L \`${p.l}\`, A \`${p.a}\``;
        break;
      case "PARAM-HEX":
        constraints = "`#" + p.hex + "`";
        break;
      case "PARAM-VEC2":
        constraints =
          "default `" +
          JSON.stringify(p.default) +
          "`, min `" +
          JSON.stringify(p.min) +
          "`, max `" +
          JSON.stringify(p.max) +
          "`, step `" +
          p.step +
          "`";
        break;
      default:
        constraints = "—";
    }
    lines.push(
      `| \`${p.name}\` | ${p.type} | ${constraints} | ${desc || "—"} |`,
    );
  }

  lines.push("");
  lines.push(
    "*Declared file and line: see `declaredIn` in dev `state` / `dev.json`.*",
  );
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  scanParamSources,
  renderParamsMarkdown,
  endIndexOfJsonArray,
  KNOWN_TYPES,
  DEPRECATED_TYPES,
};
