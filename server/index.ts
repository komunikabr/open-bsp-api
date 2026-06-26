import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index.js";
import accountsRouter from "./routes/accounts.js";
import apiKeysRouter from "./routes/apiKeys.js";
import organizationsRouter from "./routes/organizations.js";
import webhooksRouter from "./routes/webhooks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

await setupAuth(app);

registerAuthRoutes(app);

app.use("/api/accounts", accountsRouter);
app.use("/api/api-keys", apiKeysRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/webhooks", webhooksRouter);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = parseInt(process.env.PORT || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MsgHub portal running on http://0.0.0.0:${PORT}`);
});
