import express from "express";
import { spawn } from "child_process";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Aktive Sessions speichern
const sessions = new Map();

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "asana-mcp-server" });
});

app.get("/sse", (req, res) => {
  const asanaToken = process.env.ASANA_ACCESS_TOKEN;
  if (!asanaToken) {
    res.status(500).json({ error: "ASANA_ACCESS_TOKEN not configured" });
    return;
  }

  // SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Session ID generieren
  const sessionId = Math.random().toString(36).substring(2);

  // MCP Prozess starten
  const mcpProcess = spawn(
    "npx",
    ["-y", "@roychri/mcp-server-asana"],
    {
      env: { ...process.env, ASANA_ACCESS_TOKEN: asanaToken },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  sessions.set(sessionId, mcpProcess);

  // Endpoint für diese Session mitteilen
  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

  // MCP stdout → SSE
  mcpProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      res.write(`event: message\ndata: ${line}\n\n`);
    }
  });

  mcpProcess.stderr.on("data", (data) => {
    console.error("MCP stderr:", data.toString());
  });

  mcpProcess.on("close", (code) => {
    console.log(`MCP process closed: ${code}`);
    sessions.delete(sessionId);
    res.end();
  });

  req.on("close", () => {
    console.log(`Client disconnected, killing session ${sessionId}`);
    mcpProcess.kill();
    sessions.delete(sessionId);
  });
});

app.post("/message", (req, res) => {
  const { sessionId } = req.query;
  const mcpProcess = sessions.get(sessionId);

  if (!mcpProcess) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const message = JSON.stringify(req.body);
  mcpProcess.stdin.write(message + "\n");
  res.status(202).json({ accepted: true });
});

app.listen(PORT, () => {
  console.log(`Asana MCP Bridge running on port ${PORT}`);
});
