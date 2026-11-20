import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const host = "127.0.0.1";
const port = 8787;
const origin = `http://${host}:${port}`;
const page = await readFile(new URL("../web/index.html", import.meta.url));
const client = new Client({ name: "nasa-eonet-web", version: "1.0.0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./index.js", import.meta.url))],
}));

const server = createServer(async (request, response) => {
  if (request.headers.host !== `${host}:${port}`) {
    response.writeHead(403).end();
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" }).end();
    return;
  }
  const url = new URL(request.url ?? "/", origin);
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page);
    return;
  }

  const limit = url.searchParams.get("limit");
  const listArgs = limit === null ? {} : { limit: Number(limit) };
  const category = url.searchParams.get("category");
  const eventId = url.searchParams.get("eventId");
  const calls: Record<string, { name: string; arguments: Record<string, unknown> }> = {
    "/api/recent": { name: "get_recent_events", arguments: listArgs },
    "/api/category": { name: "get_events_by_category", arguments: { ...listArgs, category } },
    "/api/details": { name: "get_event_details", arguments: { eventId } },
  };
  if (!Object.hasOwn(calls, url.pathname)) {
    response.writeHead(404).end();
    return;
  }

  let status: number;
  let body: unknown;
  try {
    const result = await client.callTool(calls[url.pathname], undefined, { timeout: 25_000 });
    status = result.isError ? 400 : 200;
    const first = Array.isArray(result.content) ? result.content[0] : undefined;
    body = result.isError
      ? { error: first?.type === "text" ? first.text : "The MCP tool reported an error." }
      : result.structuredContent;
  } catch {
    status = 502;
    body = { error: "The NASA EONET MCP server could not complete the request." };
  }
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }).end(JSON.stringify(body));
});

server.on("error", async error => {
  console.error(error.message);
  await client.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    void client.close();
  });
}
server.listen(port, host, () => console.log(`NASA EONET explorer: ${origin}`));
