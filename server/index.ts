import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import organizationsRouter from "./routes/organizations";
import apiKeysRouter from "./routes/apiKeys";
import webhooksRouter from "./routes/webhooks";
import accountsRouter from "./routes/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Replit Auth
await setupAuth(app);
registerAuthRoutes(app);

// API Routes
app.use("/api/organizations", organizationsRouter);
app.use("/api/api-keys", apiKeysRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/accounts", accountsRouter);

// Serve static frontend
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = parseInt(process.env.PORT || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
