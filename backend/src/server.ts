import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { NextRequest } from "next/server";
import { tokenFromHeaders, verifySessionToken } from "@/lib/auth";
import { subscribeRealtime, type RealtimeEvent } from "@/lib/realtime";
import { requestContext } from "@/lib/request-context";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), "backend/.env"));
loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const HOST = process.env.HOST?.trim() || "localhost";

function listen() {
  const local =
    HOST === "localhost" || HOST === "127.0.0.1" || HOST === "::1";

  if (!local) {
    server.listen(PORT, HOST, () => {
      console.log(`API listening on http://${HOST}:${PORT}`);
    });
    return;
  }

  // localhost on Windows is often ::1, while 127.0.0.1 is IPv4 only.
  server.listen({ port: PORT, host: "::", ipv6Only: false }, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  load: () => Promise<Record<string, RouteHandler>>;
  params: (match: RegExpMatchArray) => Record<string, string>;
}

const routes: Route[] = [
  route("POST", /^\/api\/auth\/login$/, () => import("@/app/api/auth/login/route")),
  route("GET", /^\/api\/auth\/me$/, () => import("@/app/api/auth/me/route")),
  route("POST", /^\/api\/auth\/logout$/, () => import("@/app/api/auth/logout/route")),
  route("GET", /^\/api\/users$/, () => import("@/app/api/users/route")),
  route("POST", /^\/api\/users$/, () => import("@/app/api/users/route")),
  route("GET", /^\/api\/call$/, () => import("@/app/api/call/route")),
  route("POST", /^\/api\/send$/, () => import("@/app/api/send/route")),
  route("POST", /^\/api\/contacts$/, () => import("@/app/api/contacts/route")),
  route("POST", /^\/api\/conversations\/close$/, () => import("@/app/api/conversations/close/route")),
  route("POST", /^\/api\/conversations\/assign$/, () => import("@/app/api/conversations/assign/route")),
  route("GET", /^\/api\/twilio\/messages$/, () => import("@/app/api/twilio/messages/route")),
  route("POST", /^\/api\/twilio\/messages\/read$/, () => import("@/app/api/twilio/messages/read/route")),
  route("GET", /^\/api\/twilio\/messages\/thread$/, () => import("@/app/api/twilio/messages/thread/route")),
  route("GET", /^\/api\/twilio\/token$/, () => import("@/app/api/twilio/token/route")),
  route("GET", /^\/api\/twilio\/incoming$/, () => import("@/app/api/twilio/incoming/route")),
  route("POST", /^\/api\/twilio\/incoming$/, () => import("@/app/api/twilio/incoming/route")),
  route("GET", /^\/api\/twilio\/voice$/, () => import("@/app/api/twilio/voice/route")),
  route("POST", /^\/api\/twilio\/voice$/, () => import("@/app/api/twilio/voice/route")),
  route("GET", /^\/api\/twilio\/call-status$/, () => import("@/app/api/twilio/call-status/route")),
  route("POST", /^\/api\/twilio\/call-status$/, () => import("@/app/api/twilio/call-status/route")),
  route("GET", /^\/api\/twilio\/message-status$/, () => import("@/app/api/twilio/message-status/route")),
  route("POST", /^\/api\/twilio\/message-status$/, () => import("@/app/api/twilio/message-status/route")),
  route("GET", /^\/api\/cost\/summary$/, () => import("@/app/api/cost/summary/route")),
  route("GET", /^\/api\/cost\/usage$/, () => import("@/app/api/cost/usage/route")),
  route("GET", /^\/api\/cost\/campaigns$/, () => import("@/app/api/cost/campaigns/route")),
  route("GET", /^\/api\/campaigns$/, () => import("@/app/api/campaigns/route")),
  route("POST", /^\/api\/campaigns$/, () => import("@/app/api/campaigns/route")),
  route("GET", /^\/api\/campaigns\/([^/]+)\/recipients$/, () => import("@/app/api/campaigns/[id]/recipients/route"), (m) => ({ id: m[1] })),
  route("GET", /^\/api\/campaigns\/([^/]+)\/cost$/, () => import("@/app/api/campaigns/[id]/cost/route"), (m) => ({ id: m[1] })),
  route("POST", /^\/api\/campaigns\/([^/]+)\/cost$/, () => import("@/app/api/campaigns/[id]/cost/route"), (m) => ({ id: m[1] })),
  route("POST", /^\/api\/campaigns\/([^/]+)\/tick$/, () => import("@/app/api/campaigns/[id]/tick/route"), (m) => ({ id: m[1] })),
  route("POST", /^\/api\/campaigns\/([^/]+)\/control$/, () => import("@/app/api/campaigns/[id]/control/route"), (m) => ({ id: m[1] })),
  route("GET", /^\/api\/campaigns\/([^/]+)$/, () => import("@/app/api/campaigns/[id]/route"), (m) => ({ id: m[1] })),
  route("DELETE", /^\/api\/campaigns\/([^/]+)$/, () => import("@/app/api/campaigns/[id]/route"), (m) => ({ id: m[1] })),
];

function route(
  method: string,
  pattern: RegExp,
  load: () => Promise<Record<string, RouteHandler>>,
  params: (match: RegExpMatchArray) => Record<string, string> = () => ({})
): Route {
  return { method, pattern, load, params };
}

function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV === "production") return [];
  return ["http://localhost:3000"];
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Twilio-Signature",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function applyHeaders(res: ServerResponse, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function publicUrl(req: IncomingMessage): string {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || "http";
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}${req.url || "/"}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const sockets = new Set<WebSocket>();

function broadcast(event: RealtimeEvent) {
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  applyHeaders(res, corsHeaders(origin));

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const match = routes.find(
    (entry) => entry.method === req.method && entry.pattern.test(url.pathname)
  );
  if (!match || !req.method) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const found = url.pathname.match(match.pattern);
  const params = found ? match.params(found) : {};
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const request = new NextRequest(publicUrl(req), {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
  });
  const token = tokenFromHeaders(
    request.headers.get("authorization"),
    request.headers.get("cookie")
  );

  try {
    const mod = await match.load();
    const handler = mod[req.method];
    if (!handler) {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    const response = await requestContext.run({ token }, () =>
      handler(request, { params: Promise.resolve(params) })
    );
    const payload = Buffer.from(await response.arrayBuffer());
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);
    applyHeaders(res, corsHeaders(origin));
    res.writeHead(response.status);
    res.end(payload);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

const server = createServer((req, res) => {
  void handleHttp(req, res);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().includes(origin)) {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get("token");
  void verifySessionToken(token || "").then((session) => {
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: "ready" }));
      ws.on("close", () => sockets.delete(ws));
      ws.on("error", () => sockets.delete(ws));
    });
  });
});

subscribeRealtime(broadcast);

listen();
