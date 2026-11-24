# NASA EONET MCP server

A Node.js 20+ MCP server that fetches live natural-event data from the [NASA EONET v3 API](https://eonet.gsfc.nasa.gov/docs/v3). It uses stdio and the official TypeScript MCP SDK. It requires outbound HTTPS access to `eonet.gsfc.nasa.gov`.

## Run locally

```powershell
cd C:\Users\KASI\mcp_nasa
npm.cmd run build
npm.cmd start
```

For a fresh checkout, run `npm.cmd install` before building. If Windows reports `EBUSY` during a clean install, stop any running server and close the MCP client or terminal using `node_modules`, then run `npm.cmd install` to restore missing packages.

The server waits for MCP messages on stdin. Start it from an MCP client to call tools, or stop the standalone process with Ctrl+C. Use `npm.cmd run dev` to run directly from TypeScript. On macOS and Linux, use `npm` in place of `npm.cmd`.

## MCP client configuration

Add this entry to a client that uses the `mcpServers` format, such as Claude Desktop. Build first, then restart the client so it launches the server. Adjust the absolute script path if you move the project. If the client cannot find Node on its PATH, use the absolute path to `node.exe` as the command.

```json
{
  "mcpServers": {
    "nasa-eonet": {
      "command": "node",
      "args": ["C:/Users/KASI/mcp_nasa/dist/index.js"]
    }
  }
}
```

## Tools

- `get_recent_events(limit?)` returns recent events in NASA feed order, including open and closed events.
- `get_events_by_category(category, limit?)` filters that feed by a single [EONET category ID](https://eonet.gsfc.nasa.gov/api/v3/categories), such as `wildfires`, `severeStorms`, or `volcanoes`. The tool checks IDs against the live NASA category catalog. Use the exact casing shown by NASA.
- `get_event_details(eventId)` returns an event's description, sources, closure date, observation count, and latest dated geometry.

Both list tools return a count and event summaries with IDs, titles, categories, status, latest observation timestamps, and NASA links. The optional limit defaults to 5 and accepts integers from 1 to 50. Requests time out after 10 seconds. Successful calls return MCP structured content with a JSON text fallback. Upstream failures return an MCP tool error.

## Manager demo

1. Say “This server reads NASA’s live Earth Observatory Natural Event Tracker.” Call `get_recent_events` with `{"limit":3}` and point out a title, status, and latest observation date.
2. Call `get_events_by_category` with `{"category":"wildfires","limit":3}` to focus on wildfires.
3. Copy an event ID from the live results and call `get_event_details` with `{"eventId":"<copied ID>"}`. Show its source links and latest observation.

## Browser demo

Run `npm.cmd run build` and then `npm.cmd run web`. Open http://127.0.0.1:8787 in your browser. The page loads recent events automatically. Use the query menu to filter by category or look up an event ID, or select **View details** on a result. The local web process launches the stdio MCP server and calls its tools.
[![M8ven Score](https://m8ven.ai/badge/mcp/ushasri-katreddi-mcp-server-nasa-api-tkswpm?v=f562fca9596d14a76a58dac6c9288dd4)](https://m8ven.ai/mcp/ushasri-katreddi-mcp-server-nasa-api-tkswpm?s=readme)

[![M8ven Score](https://m8ven.ai/badge/mcp/ushasri-katreddi-mcp-server-nasa-api-tkswpm)](https://m8ven.ai/mcp/ushasri-katreddi-mcp-server-nasa-api-tkswpm?s=readme)