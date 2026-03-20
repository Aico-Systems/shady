#!/usr/bin/env bun
/**
 * Shady Deploy Webhook Listener
 *
 * Receives POST from GitHub Actions after image builds complete.
 * Validates bearer token, triggers `shady-deploy deploy`, returns acknowledgement.
 *
 * Runs as a systemd service on the host (not in Docker).
 * Caddy reverse-proxies to this on port 9090 with TLS termination.
 */

const PORT = 9090;
const HOST = "127.0.0.1";
const CONF_FILE = "/etc/shady/deploy.conf";
const DOPPLER_PROJECT = "shady";

let webhookSecret: string;
let deploying = false;
let deployProc: Bun.Subprocess | null = null;
let deployStartedAt: string | null = null;
let deployTimeout: ReturnType<typeof setTimeout> | null = null;
const DEPLOY_TIMEOUT_MS = Number(Bun.env.DEPLOY_TIMEOUT_MS ?? 30 * 60 * 1000);

// --- Config ---

function loadConf(): { env: string; dopplerToken: string } {
  const text = require("fs").readFileSync(CONF_FILE, "utf-8") as string;
  const env = text.match(/^SHADY_ENV=(.+)$/m)?.[1]?.trim();
  const token = text.match(/^DOPPLER_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!env || !token) throw new Error(`Invalid config: ${CONF_FILE}`);
  return { env, dopplerToken: token };
}

function dopplerConfig(env: string): string {
  return { prod: "prd", dev: "dev" }[env] ?? "prd";
}

async function fetchSecret(dopplerToken: string, config: string, key: string): Promise<string> {
  const proc = Bun.spawn(
    ["doppler", "secrets", "get", key, "--plain", "--project", DOPPLER_PROJECT, "--config", config, "--token", dopplerToken],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`doppler secrets get ${key} failed: ${stderr}`);
  }
  return (await new Response(proc.stdout).text()).trim();
}

// --- Deploy ---

function triggerDeploy(payload: { image_tag?: string; sha?: string }) {
  deploying = true;
  deployStartedAt = new Date().toISOString();
  const label = `image_tag=${payload.image_tag ?? "?"} sha=${payload.sha?.slice(0, 8) ?? "?"}`;
  log(`Starting deploy (${label})`);

  const proc = Bun.spawn(["/usr/local/bin/shady-deploy", "deploy"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  deployProc = proc;

  if (deployTimeout) clearTimeout(deployTimeout);
  deployTimeout = setTimeout(() => {
    if (!deploying || deployProc !== proc) return;
    log(`Deploy timed out after ${Math.floor(DEPLOY_TIMEOUT_MS / 1000)}s; terminating process (${label})`);
    try {
      proc.kill();
    } catch (err) {
      log(`Failed to terminate timed out deploy process: ${err}`);
    }
  }, DEPLOY_TIMEOUT_MS);

  proc.exited
    .then((code) => {
      if (deployTimeout) {
        clearTimeout(deployTimeout);
        deployTimeout = null;
      }
      deploying = false;
      deployProc = null;
      deployStartedAt = null;
      if (code === 0) log(`Deploy succeeded (${label})`);
      else log(`Deploy failed with exit code ${code} (${label})`);
    })
    .catch((err) => {
      if (deployTimeout) {
        clearTimeout(deployTimeout);
        deployTimeout = null;
      }
      deploying = false;
      deployProc = null;
      deployStartedAt = null;
      log(`Deploy error: ${err}`);
    });
}

// --- HTTP ---

function log(msg: string) {
  console.log(`[deploy-webhook] ${new Date().toISOString()} ${msg}`);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
        return json({
          status: "ok",
          deploying,
          startedAt: deployStartedAt,
          pid: deployProc?.pid ?? null,
        });
    }

    // Deploy trigger
    if (url.pathname === "/" && req.method === "POST") {
      // Auth
      const auth = req.headers.get("authorization");
      if (!auth || auth !== `Bearer ${webhookSecret}`) {
        log(`Rejected: invalid token from ${req.headers.get("x-forwarded-for") ?? "unknown"}`);
        return json({ error: "unauthorized" }, 401);
      }

      // Lock
      if (deploying) {
        log("Rejected: deploy already in progress");
        return json({ status: "already_deploying" }, 409);
      }

      // Parse payload
      let payload: { image_tag?: string; sha?: string } = {};
      try {
        payload = await req.json();
      } catch {
        // Body is optional
      }

      triggerDeploy(payload);

      return json({
        status: "accepted",
        sha: payload.sha ?? null,
        image_tag: payload.image_tag ?? null,
        timestamp: new Date().toISOString(),
      });
    }

    return json({ error: "not found" }, 404);
  },
});

// --- Startup ---

async function main() {
  const conf = loadConf();
  const config = dopplerConfig(conf.env);
  log(`Loading webhook secret from Doppler (${DOPPLER_PROJECT}/${config})...`);
  webhookSecret = await fetchSecret(conf.dopplerToken, config, "DEPLOY_WEBHOOK_SECRET");
  log(`Listening on ${HOST}:${PORT} (env=${conf.env})`);
}

main().catch((err) => {
  console.error(`[deploy-webhook] Fatal: ${err.message}`);
  process.exit(1);
});
