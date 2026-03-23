import express from "express";
import { spawn } from "child_process";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const sessions = new Map();

// Auth middleware
const requireAuth = (req, res, next) => {
  // /message endpoint is secured via sessionId
  if (req.path === "/message") {
    const sessionId = req.query.sessionId;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }
    next();
    return;
  }

  // /sse endpoint requires token in the URL
  const token = req.query.token;
  const expectedToken = process.env.SERVER_ACCESS_TOKEN;

  if (!expectedToken) {
    res.status(500).json({ error: "SERVER_ACCESS_TOKEN not configured" });
    return;
  }

  if (!token || token !== expectedToken) {
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

  const sessionId = crypto.randomBytes(32).toString("hex");

  const mcpProcess = spawn(
    "npx",
    ["-y", "@cristip73/mcp-server-asana"],
    {
      env: { ...process.env, ASANA_ACCESS_TOKEN: asanaToken },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  mcpProcess.on("error", (error) => {
    console.error("Failed to start MCP process:", error);
    sessions.delete(sessionId);
    res.end();
  });

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

  let closed = false;

  mcpProcess.on("close", (code) => {
    console.log(`MCP process closed: ${code}`);
    if (!closed) {
      closed = true;
      sessions.delete(sessionId);
      res.end();
    }
  });

  req.on("close", () => {
    if (!closed) {
      closed = true;
      sessions.delete(sessionId);
      mcpProcess.kill();
    }
  });
});

app.post("/message", requireAuth, (req, res) => {
  const { sessionId } = req.query;
  const mcpProcess = sessions.get(sessionId);

  if (!mcpProcess) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  try {
    mcpProcess.stdin.write(JSON.stringify(req.body) + "\n");
    res.status(202).json({ accepted: true });
  } catch (error) {
    console.error("Failed to write to MCP process:", error);
    sessions.delete(sessionId);
    res.status(500).json({ error: "Failed to forward message to session" });
  }
});

app.listen(PORT, () => {
  console.log(`Asana MCP Bridge running on port ${PORT}`);
});
