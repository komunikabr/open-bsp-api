import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth/index";
import webhooksRouter from "./routes/webhooks";
import organizationsRouter from "./routes/organizations";
import apiKeysRouter from "./routes/apiKeys";
import accountsRouter from "./routes/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
app.use(express.json());

await setupAuth(app);

registerAuthRoutes(app);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/api-keys", apiKeysRouter);
app.use("/api/accounts", accountsRouter);

app.use(express.static(publicDir));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = parseInt(process.env.PORT || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MsgHub Portal running on http://0.0.0.0:${PORT}`);
});
