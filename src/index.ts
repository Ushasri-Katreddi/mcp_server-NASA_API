import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiBase = "https://eonet.gsfc.nasa.gov/api/v3/";
const timeoutMs = 10_000;
const defaultLimit = 5;

const limitInput = z.number().int().min(1).max(50).optional()
  .describe("Number of events to return (1–50, defaults to 5).");
const categoryInput = z.string().trim().max(64).regex(/^[a-zA-Z][a-zA-Z0-9]*$/)
  .describe("One NASA EONET category ID, such as wildfires or severeStorms.");
const eventIdInput = z.string().trim().max(128).regex(/^EONET_[a-zA-Z0-9_-]+$/)
  .describe("An EONET event ID returned by either list tool.");

const observationSchema = z.object({
  date: z.iso.datetime({ offset: true }),
  type: z.string(),
  coordinates: z.array(z.unknown()),
  magnitudeValue: z.number().nullish(),
  magnitudeUnit: z.string().nullish(),
});
const categorySchema = z.object({ id: z.string(), title: z.string() });
const categoryListSchema = z.object({ categories: z.array(categorySchema) });
const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  link: z.string(),
  closed: z.string().nullable(),
  categories: z.array(categorySchema),
  sources: z.array(z.object({ id: z.string(), url: z.string() })),
  geometry: z.array(observationSchema),
});
const eventListSchema = z.object({ events: z.array(eventSchema) });
type EonetEvent = z.infer<typeof eventSchema>;

async function fetchEonet<T>(url: URL, schema: z.ZodType<T>, notFound?: string): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch {
    throw new Error(signal.aborted
      ? "NASA EONET request timed out after 10 seconds."
      : "Could not connect to NASA EONET.");
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(response.status === 404 && notFound
      ? notFound
      : `NASA EONET returned HTTP ${response.status}.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (signal.aborted) throw new Error("NASA EONET request timed out after 10 seconds.");
    throw new Error(error instanceof SyntaxError
      ? "NASA EONET returned invalid JSON."
      : "Could not read the NASA EONET response.");
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("NASA EONET returned an unexpected response format.");
  return parsed.data;
}

function latestObservation(event: EonetEvent) {
  let latest: z.infer<typeof observationSchema> | null = null;
  for (const observation of event.geometry) {
    if (!latest || Date.parse(observation.date) > Date.parse(latest.date)) {
      latest = observation;
    }
  }
  return latest;
}

function summarize(event: EonetEvent, latest: ReturnType<typeof latestObservation>) {
  return {
    id: event.id,
    title: event.title,
    categories: event.categories,
    status: event.closed === null ? "open" : "closed",
    latestObservationAt: latest?.date ?? null,
    link: event.link,
  };
}

async function listEvents(limit = defaultLimit, category?: string) {
  const url = new URL("events", apiBase);
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", String(limit));
  if (category) url.searchParams.set("category", category);

  const { events } = await fetchEonet(url, eventListSchema);
  return {
    count: events.length,
    events: events.map(event => summarize(event, latestObservation(event))),
  };
}

async function toolResult(operation: () => Promise<Record<string, unknown>>) {
  try {
    const data = await operation();
    return {
      structuredContent: data,
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}

const server = new McpServer({ name: "nasa-eonet", version: "1.0.0" });

server.registerTool("get_recent_events", {
  description: "List recent natural events from NASA EONET, including open and closed events.",
  inputSchema: z.object({ limit: limitInput }).strict(),
}, ({ limit }) => toolResult(() => listEvents(limit)));

server.registerTool("get_events_by_category", {
  description: "List recent NASA EONET events for one category ID, including open and closed events.",
  inputSchema: z.object({ category: categoryInput, limit: limitInput }).strict(),
}, ({ category, limit }) => toolResult(async () => {
  const { categories } = await fetchEonet(new URL("categories", apiBase), categoryListSchema);
  if (!categories.some(({ id }) => id === category)) {
    throw new Error(`Unknown NASA EONET category "${category}". Valid IDs: ${categories.map(({ id }) => id).join(", ")}.`);
  }
  return listEvents(limit, category);
}));

server.registerTool("get_event_details", {
  description: "Get an EONET event's description, source links, and latest observation by event ID.",
  inputSchema: z.object({ eventId: eventIdInput }).strict(),
}, ({ eventId }) => toolResult(async () => {
  const event = await fetchEonet(
    new URL(`events/${encodeURIComponent(eventId)}`, apiBase),
    eventSchema,
    `NASA EONET event ${eventId} was not found.`,
  );
  const latest = latestObservation(event);
  return {
    ...summarize(event, latest),
    description: event.description ?? null,
    closedAt: event.closed,
    sources: event.sources,
    observationCount: event.geometry.length,
    latestObservation: latest,
  };
}));

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error("Could not start the NASA EONET MCP server:", error);
  process.exitCode = 1;
}
