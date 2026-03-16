import express from "express";
import { spawn } from "child_process";
import { createServer } from "http";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "asana-mcp-server" });
});

app.get("/sse", (req, res) => {
  const asanaToken = process.env.ASANA_ACCESS_TOKEN;
  if (!asanaToken) {
    res.status(500).json({ error: "ASANA_ACCESS_TOKEN not configured" });
    return;
  }

  // SSE Headers setzen
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // MCP-Prozess starten
  const mcpProcess = spawn(
    "npx",
    ["-y", "@roychri/mcp-server-asana"],
    {
      env: { ...process.env, ASANA_ACCESS_TOKEN: asanaToken },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  // stdout des MCP-Prozesses → SSE an Claude senden
  mcpProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      res.write(`data: ${line}\n\n`);
    }
  });

  mcpProcess.stderr.on("data", (data) => {
    console.error("MCP stderr:", data.toString());
  });

  mcpProcess.on("close", (code) => {
    console.log(`MCP process exited with code ${code}`);
    res.end();
  });

  // Nachrichten von Claude → stdin des MCP-Prozesses
  req.on("data", (data) => {
    mcpProcess.stdin.write(data);
  });

  req.on("close", () => {
    mcpProcess.kill();
  });
});

// POST /message – Claude sendet hier JSON-RPC Nachrichten
app.post("/message", express.json(), (req, res) => {
  // Wird bei SSE-Transport nicht benötigt, aber Claude erwartet den Endpunkt
  res.status(200).json({ received: true });
});

app.listen(PORT, () => {
  console.log(`Asana MCP Bridge running on port ${PORT}`);
});
