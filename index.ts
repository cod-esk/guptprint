import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { print } from "pdf-to-printer";
import type { AgentConfig, AgentQueueResponse, RemotePrintJob } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.resolve(here, "..");
const configPath = path.join(agentRoot, "config.json");
let isPrinting = false;

function stamp() {
  return new Date().toISOString();
}
function log(message: string) {
  console.log(`[${stamp()}] [GuptPrint Agent] ${message}`);
}
function warn(message: string) {
  console.error(`[${stamp()}] [GuptPrint Agent] ${message}`);
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadConfig(): Promise<AgentConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new Error("config.json missing or invalid. Copy config.example.json to config.json and set the CUPS printer name.");
  }
  const value = raw as Partial<AgentConfig>;
  if (!value.cloudBaseUrl?.startsWith("https://") && !value.cloudBaseUrl?.startsWith("http://localhost")) throw new Error("cloudBaseUrl must be HTTPS (or localhost for development).");
  if (!value.shopId || !value.agentId || !value.printer) throw new Error("shopId, agentId and printer are required in config.json.");
  return {
    cloudBaseUrl: value.cloudBaseUrl.replace(/\/$/, ""),
    shopId: value.shopId,
    agentId: value.agentId,
    printer: value.printer,
    pollIntervalMs: Math.max(1500, Number(value.pollIntervalMs) || 2500),
    agentKey: value.agentKey,
    dataDir: path.resolve(agentRoot, value.dataDir || "./data"),
  };
}

function agentHeaders(config: AgentConfig) {
  return {
    "Accept": "application/json",
    ...(config.agentKey ? { "X-GuptPrint-Agent-Key": config.agentKey } : {}),
  };
}

async function fetchQueue(config: AgentConfig): Promise<RemotePrintJob[]> {
  const url = new URL("/api/agent/jobs", config.cloudBaseUrl);
  url.searchParams.set("shopId", config.shopId);
  url.searchParams.set("agentId", config.agentId);
  const response = await fetch(url, { headers: agentHeaders(config), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Queue request failed: HTTP ${response.status}`);
  const payload = await response.json() as AgentQueueResponse;
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

async function tellCloud(config: AgentConfig, jobId: string, status: "PRINTED" | "FAILED", error?: string) {
  const url = new URL(`/api/agent/jobs/${encodeURIComponent(jobId)}`, config.cloudBaseUrl);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...agentHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify({ shopId: config.shopId, agentId: config.agentId, status, error }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Status update failed: HTTP ${response.status}`);
}

function safeLocalName(jobId: string) {
  // Job IDs are expected as GP-1234; sanitize even if a cloud response is malformed.
  return `${jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
}

async function downloadPdf(config: AgentConfig, job: RemotePrintJob): Promise<string> {
  const source = new URL(job.downloadUrl);
  const cloudOrigin = new URL(config.cloudBaseUrl).origin;
  const localDevelopmentUrl = source.protocol === "http:" && (source.hostname === "localhost" || source.hostname === "127.0.0.1");
  if (source.protocol !== "https:" && !localDevelopmentUrl) throw new Error("Refusing a non-HTTPS file URL.");
  if (source.origin !== cloudOrigin) throw new Error("Refusing a PDF URL outside the configured GuptPrint cloud origin.");

  const response = await fetch(source, { headers: agentHeaders(config), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Secure PDF download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 5 || bytes.subarray(0, 4).toString() !== "%PDF") throw new Error("Downloaded file is not a PDF.");

  await mkdir(config.dataDir, { recursive: true });
  const localPath = path.join(config.dataDir, safeLocalName(job.id));
  await writeFile(localPath, bytes, { mode: 0o600 });
  return localPath;
}

async function printOne(config: AgentConfig, job: RemotePrintJob) {
  let localPath: string | undefined;
  try {
    log(`${job.id}: secure file download started`);
    localPath = await downloadPdf(config, job);
    log(`${job.id}: sending ${job.pages} page PDF to ${config.printer}`);
    await print(localPath, {
      printer: config.printer,
      copies: job.copies,
      monochrome: !job.color,
      side: job.duplex ? "two-sided-long-edge" : "one-sided",
    });
    await tellCloud(config, job.id, "PRINTED");
    log(`${job.id}: accepted by CUPS, source file wiped`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown print error";
    warn(`${job.id}: ${message}`);
    try {
      await tellCloud(config, job.id, "FAILED", message.slice(0, 180));
    } catch (ackError) {
      warn(`${job.id}: could not report failure — ${ackError instanceof Error ? ackError.message : "unknown error"}`);
    }
  } finally {
    if (localPath) await rm(localPath, { force: true });
  }
}

async function tick(config: AgentConfig) {
  if (isPrinting) return;
  isPrinting = true;
  try {
    const jobs = await fetchQueue(config);
    // One job per tick: predictable CUPS order and no accidental parallel duplicates.
    if (jobs[0]) await printOne(config, jobs[0]);
  } catch (error) {
    warn(error instanceof Error ? error.message : "Queue poll failed");
  } finally {
    isPrinting = false;
  }
}

async function main() {
  const config = await loadConfig();
  await mkdir(config.dataDir, { recursive: true });
  log(`Ready · shop=${config.shopId} · agent=${config.agentId} · printer=${config.printer}`);
  log(`Polling ${config.cloudBaseUrl} every ${config.pollIntervalMs}ms. Ctrl+C to stop.`);
  while (true) {
    await tick(config);
    await sleep(config.pollIntervalMs);
  }
}

void main().catch((error) => {
  warn(error instanceof Error ? error.message : "Agent could not start");
  process.exit(1);
});
