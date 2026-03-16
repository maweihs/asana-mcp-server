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
```

**`.gitignore`**
```
node_modules/
.env
```

Committe alle drei Dateien ins Repo.

---

## Schritt 3: Auf Render.com deployen

1. Gehe zu [render.com](https://render.com) und logge dich ein (oder registriere dich)
2. Klicke **„New +"** → **„Web Service"**
3. Verbinde dein GitHub-Konto und wähle dein `asana-mcp-server` Repo
4. Konfiguriere den Service:

| Feld | Wert |
|------|------|
| **Name** | `asana-mcp-server` |
| **Region** | Frankfurt (EU) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

5. Scrolle zu **„Environment Variables"** und füge hinzu:

| Key | Value |
|-----|-------|
| `ASANA_ACCESS_TOKEN` | *(dein Token aus Schritt 1)* |

6. Klicke **„Create Web Service"**

Render baut und startet den Server automatisch. Das dauert 2–3 Minuten. Am Ende siehst du eine URL wie:
```
https://asana-mcp-server-xxxx.onrender.com
```

### 3.1 – Deployment testen
Rufe im Browser auf:
```
https://asana-mcp-server-xxxx.onrender.com/
```
Du solltest `{"status":"ok","service":"asana-mcp-server"}` sehen.

---

## Schritt 4: Custom Connector in Claude einrichten

1. Gehe in Claude zu **Settings** → **„Connectors"** (oder direkt: [claude.ai/settings/connectors](https://claude.ai/settings/connectors))
2. Klicke **„Add custom connector"**
3. Trage die SSE-URL ein:
```
https://asana-mcp-server-xxxx.onrender.com/sse
