/**
 * HTTP server behind Home Assistant ingress. Ingress strips its own path prefix
 * before proxying, so routes are plain paths — but the UI must still use
 * relative URLs (./api/...) so links resolve under the ingress prefix.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOpenDotaQuotaSnapshot } from "../../../js/rate-limit.js";
import { ACCOUNT_FILES, accountDir } from "./exports.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_FILE = path.join(here, "ui", "index.html");

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

export function createServer({ options, controller, log }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (req.method === "GET" && (route === "/" || route === "/index.html")) {
        const html = await fs.readFile(UI_FILE, "utf8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      if (req.method === "GET" && route === "/api/status") {
        sendJson(res, 200, {
          accounts: options.accounts,
          days: options.days,
          cron: options.cron,
          cronValid: controller.cronValid(),
          exportDir: options.exportDir,
          hasApiKey: Boolean(options.openDotaApiKey),
          parseConcurrency: options.parseConcurrency,
          quota: getOpenDotaQuotaSnapshot(),
          nextRunAt: controller.nextRunAt()?.toISOString() ?? null,
          run: controller.status(),
          lastRun: await controller.lastRun(),
          exports: await controller.exportStatus(),
        });
        return;
      }

      if (req.method === "GET" && route.startsWith("/api/summary/")) {
        const slug = decodeURIComponent(route.slice("/api/summary/".length));
        const account = options.accounts.find((a) => a.slug === slug);
        if (!account) {
          sendJson(res, 404, { error: "Unknown account" });
          return;
        }
        try {
          const file = path.join(accountDir(options, account), "summary.json");
          const text = await fs.readFile(file, "utf8");
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(text);
        } catch {
          sendJson(res, 404, { error: "No run yet for this account" });
        }
        return;
      }

      if (req.method === "GET" && route.startsWith("/api/download/")) {
        const parts = route.slice("/api/download/".length).split("/");
        const slug = decodeURIComponent(parts[0] ?? "");
        const name = decodeURIComponent(parts[1] ?? "");
        const account = options.accounts.find((a) => a.slug === slug);

        if (!account || !ACCOUNT_FILES.includes(name)) {
          sendJson(res, 404, { error: "Unknown export" });
          return;
        }

        try {
          const body = await fs.readFile(path.join(accountDir(options, account), name));
          res.writeHead(200, {
            "Content-Type": name.endsWith(".json")
              ? "application/json; charset=utf-8"
              : "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}-${name}"`,
            "Content-Length": body.length,
          });
          res.end(body);
        } catch {
          sendJson(res, 404, { error: "Not generated yet" });
        }
        return;
      }

      if (req.method === "GET" && route === "/api/logs") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // A reconnecting client resends its last id, so it only gets what it missed.
        const resumeFrom = req.headers["last-event-id"];
        const backlog = resumeFrom ? log.historySince(resumeFrom) : log.history();
        for (const line of backlog) {
          res.write(`id: ${line.seq}\ndata: ${JSON.stringify(line)}\n\n`);
        }

        const unsubscribe = log.subscribe((line) => {
          res.write(`id: ${line.seq}\ndata: ${JSON.stringify(line)}\n\n`);
        });

        const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
        keepAlive.unref?.();

        req.on("close", () => {
          clearInterval(keepAlive);
          unsubscribe();
        });
        return;
      }

      if (req.method === "POST" && route === "/api/run") {
        const body = await readBody(req);
        const started = controller.start(Array.isArray(body.accounts) ? body.accounts : null);
        sendJson(res, started.ok ? 202 : 409, started);
        return;
      }

      if (req.method === "POST" && route === "/api/stop") {
        sendJson(res, 200, controller.stop());
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, { error: error.message ?? "Server error" });
    }
  });

  return server;
}
