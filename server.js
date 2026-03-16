import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "@roychri/mcp-server-asana";

const app = express();
const PORT = process.env.PORT || 3000;

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "asana-mcp-server" });
});

// SSE endpoint – Claude connects here
app.get("/sse", async (req, res) => {
  const asanaToken = process.env.ASANA_ACCESS_TOKEN;
  if (!asanaToken) {
    res.status(500).json({ error: "ASANA_ACCESS_TOKEN not configured" });
    return;
  }

  const transport = new SSEServerTransport("/message", res);
  const server = createServer({ asanaAccessToken: asanaToken });

  await server.connect(transport);
});

// Message endpoint for client → server communication
app.post("/message", express.json(), async (req, res) => {
  res.status(200).json({ received: true });
});

app.listen(PORT, () => {
  console.log(`Asana MCP Server running on port ${PORT}`);
});
