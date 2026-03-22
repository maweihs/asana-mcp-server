import express from "express";
import { spawn } from "child_process";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const sessions = new Map();

// Auth-Middleware
const requireAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const expectedToken = process.env.SERVER_ACCESS_TOKEN;

  if (!expectedToken) {
    res.status(500).json({ error: "SERVER_ACCESS_TOKEN not configured" });
    return;
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "asana-mcp-server" });
});

app.get("/sse", requireAuth, (req, res) => {
  const asanaToken = process.env.ASANA_ACCESS_TOKEN;
  if (!asanaToken) {
    res.status(500).json({ error: "ASANA_ACCESS_TOKEN not configured" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sessionId = Math.random().toString(36).substring(2);

  const mcpProcess = spawn(
    "npx",
    ["-y", "@cristip73/mcp-server-asana"],
    {
      env: { ...process.env, ASANA_ACCESS_TOKEN: asanaToken },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  sessions.set(sessionId, mcpProcess);

  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

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
    mcpProcess.kill();
    sessions.delete(sessionId);
  });
});

app.post("/message", requireAuth, (req, res) => {
  const { sessionId } = req.query;
  const mcpProcess = sessions.get(sessionId);

  if (!mcpProcess) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  mcpProcess.stdin.write(JSON.stringify(req.body) + "\n");
  res.status(202).json({ accepted: true });
});

app.listen(PORT, () => {
  console.log(`Asana MCP Bridge running on port ${PORT}`);
});
