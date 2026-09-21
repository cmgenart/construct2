/**
 * Builder child hosts: spawn | utility | ipc (later).
 * Packaged default is utilityProcess; spawn remains the fallback.
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const HOST_KINDS = ["spawn", "utility", "ipc"];

/**
 * @param {{ isPackaged?: boolean, envHost?: string }} [opts]
 */
function resolveBuilderHostKind(opts = {}) {
  const raw = String(
    opts.envHost != null ? opts.envHost : process.env.ADVBUILDER_HOST || "",
  )
    .toLowerCase()
    .trim();
  if (HOST_KINDS.includes(raw)) return raw;
  return opts.isPackaged ? "utility" : "spawn";
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wrapChild(kind, child) {
  let exitCode = null;
  let signalCode = null;
  let exited = false;
  const exitFns = [];
  const errorFns = [];

  const emitExit = (code, signal) => {
    if (exited) return;
    exited = true;
    exitCode = code;
    signalCode = signal || null;
    for (const fn of exitFns.splice(0)) fn(code, signal);
  };

  if (typeof child.on === "function") {
    child.on("exit", (code, signal) => emitExit(code, signal));
    child.on("error", (err) => {
      for (const fn of errorFns) fn(err);
    });
  }

  return {
    kind,
    get pid() {
      return child.pid;
    },
    get exitCode() {
      return exitCode;
    },
    get signalCode() {
      return signalCode;
    },
    get exited() {
      return exited;
    },
    once(ev, fn) {
      if (ev === "exit") {
        if (exited) {
          fn(exitCode, signalCode);
          return;
        }
        exitFns.push(fn);
        return;
      }
      if (ev === "error") errorFns.push(fn);
    },
    kill(signal) {
      try {
        if (kind === "spawn") child.kill(signal || "SIGTERM");
        else child.kill();
      } catch (_) {
        /* ignore */
      }
    },
  };
}

function builderEnv(baseEnv, { port, userData, projectPath, projectName, xaiKeyPath }) {
  return {
    ...baseEnv,
    ADVBUILDER_NO_OPEN: "1",
    ADVBUILDER_PORT: String(port),
    ADVBUILDER_USER_DATA: userData,
    ADVBUILDER_PROJECT_PATH: projectPath,
    ADVBUILDER_PROJECT_NAME: projectName,
    ADVBUILDER_XAI_KEY_PATH: xaiKeyPath,
  };
}

function startSpawn({ advRoot, projectPath, env, execPath, isPackaged }) {
  const nodeBin = process.env.ADVBUILDER_NODE || (isPackaged ? execPath : "node");
  const spawnEnv = { ...env };
  if (isPackaged && !process.env.ADVBUILDER_NODE) {
    spawnEnv.ELECTRON_RUN_AS_NODE = "1";
  }
  const child = spawn(nodeBin, ["builder.js", "--project-path", projectPath], {
    cwd: advRoot,
    env: spawnEnv,
    stdio: "inherit",
    shell: false,
  });
  const handle = wrapChild("spawn", child);
  child.on("error", (err) => {
    console.error("[advBuilder] spawn host error:", err);
  });
  return handle;
}

function startUtility({ advRoot, projectPath, env }) {
  const { utilityProcess } = require("electron");
  if (!utilityProcess || typeof utilityProcess.fork !== "function") {
    throw new Error("utilityProcess.fork is not available");
  }
  const modulePath = path.join(advRoot, "builder.js");
  const child = utilityProcess.fork(modulePath, ["--project-path", projectPath], {
    cwd: advRoot,
    env,
    stdio: "inherit",
    serviceName: "construct2-builder",
  });
  const handle = wrapChild("utility", child);
  return handle;
}

function sameProjectPath(a, b) {
  if (!a || !b) return false;
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function fetchBuilderWhoami(host, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/whoami`, { timeout: 1200 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve({ occupied: true, status: res.statusCode });
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve({
            occupied: true,
            pid: Number(body.pid),
            projectName: body.projectName || "",
            projectPath: body.projectPath || "",
          });
        } catch (_) {
          resolve({ occupied: true, status: res.statusCode });
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function occupantError(port, occupant) {
  const label =
    occupant && occupant.projectName
      ? occupant.projectName
      : occupant && occupant.projectPath
        ? occupant.projectPath
        : "another process";
  return (
    `Port ${port} is already serving ${label}. ` +
    "Stop that builder (or the other Construct² window) and try again."
  );
}

function exitedError(handle, occupant, port) {
  if (occupant) return occupantError(port, occupant);
  return `Builder exited (code ${handle.exitCode}, signal ${handle.signalCode || "none"}) before server was ready.`;
}

async function waitForBuilderReady(handle, host, port, timeoutMs, expectedProjectPath) {
  const deadline = Date.now() + timeoutMs;
  let occupant = null;
  while (Date.now() < deadline) {
    if (handle.exited) {
      return { ok: false, error: exitedError(handle, occupant, port) };
    }
    const who = await fetchBuilderWhoami(host, port);
    if (who && who.pid && who.pid === Number(handle.pid)) {
      if (expectedProjectPath && who.projectPath && !sameProjectPath(who.projectPath, expectedProjectPath)) {
        occupant = who;
      } else {
        if (handle.exited) {
          return { ok: false, error: exitedError(handle, occupant, port) };
        }
        return { ok: true };
      }
    } else if (who) {
      occupant = who;
    }
    await delay(200);
  }
  if (occupant && Number(occupant.pid) !== Number(handle.pid)) {
    return { ok: false, error: occupantError(port, occupant) };
  }
  return {
    ok: false,
    error: `Dev server did not respond on port ${port} within ${timeoutMs}ms.`,
  };
}

function stopHandle(handle) {
  return new Promise((resolve) => {
    if (!handle) {
      resolve();
      return;
    }
    if (handle.exited) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(treeKillTimer);
      resolve();
    };
    handle.once("exit", finish);
    handle.kill("SIGTERM");
    const killTimer = setTimeout(() => {
      handle.kill("SIGKILL");
      finish();
    }, 1500);
    if (typeof killTimer.unref === "function") killTimer.unref();

    const pid = handle.pid;
    const treeKillTimer = setTimeout(() => {
      if (settled || !pid) return;
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        }
      } catch (_) {}
    }, 2500);
    if (typeof treeKillTimer.unref === "function") treeKillTimer.unref();
  });
}

/**
 * Start builder.js via the requested host. Packaged utility falls back to spawn.
 * @returns {Promise<{ ok: true, handle: object, kind: string, fallbackFrom?: string } | { ok: false, error: string, kind?: string }>}
 */
async function startBuilderHost(opts) {
  const {
    isPackaged,
    advRoot,
    projectPath,
    port,
    host,
    timeoutMs = 25000,
    execPath,
    envFields,
  } = opts;
  const preferred = resolveBuilderHostKind({ isPackaged });
  if (preferred === "ipc") {
    return {
      ok: false,
      kind: "ipc",
      error: "IPC builder host is not implemented yet. Set ADVBUILDER_HOST=utility or spawn.",
    };
  }

  const env = builderEnv(process.env, envFields);
  const order =
    preferred === "utility" ? ["utility", "spawn"] : ["spawn"];

  let lastError = null;
  let fallbackFrom = null;
  for (const kind of order) {
    let handle;
    try {
      handle =
        kind === "utility"
          ? startUtility({ advRoot, projectPath, env })
          : startSpawn({
              advRoot,
              projectPath,
              env,
              execPath,
              isPackaged,
            });
    } catch (e) {
      lastError = String(e.message || e);
      console.error(`[advBuilder] ${kind} host failed to start:`, e);
      fallbackFrom = fallbackFrom || preferred;
      continue;
    }

    handle.once("exit", (code, signal) => {
      if (code || signal) {
        console.error(
          `[advBuilder] ${kind} host exited (code ${code}, signal ${signal || "none"})`,
        );
      }
    });

    const ready = await waitForBuilderReady(handle, host, port, timeoutMs, projectPath);
    if (ready.ok) {
      return {
        ok: true,
        handle,
        kind,
        fallbackFrom: kind !== preferred ? preferred : undefined,
      };
    }
    lastError = ready.error;
    console.error(`[advBuilder] ${kind} host not ready:`, ready.error);
    await stopHandle(handle);
    fallbackFrom = fallbackFrom || preferred;
  }

  return {
    ok: false,
    kind: preferred,
    error: lastError || "Builder host failed to start",
    fallbackFrom,
  };
}

module.exports = {
  HOST_KINDS,
  resolveBuilderHostKind,
  startBuilderHost,
  stopHandle,
  waitForBuilderReady,
  sameProjectPath,
  occupantError,
  fetchBuilderWhoami,
  builderEnv,
};
