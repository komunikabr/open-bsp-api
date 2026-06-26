import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set.");
  process.exit(1);
}

const app = express();

// Expose Supabase config to frontend (anon key is public by design)
app.get("/api/config", (_req, res) => {
  res.json({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
});

// Proxy /proxy/* → Supabase
app.use(
  "/proxy",
  createProxyMiddleware({
    target: SUPABASE_URL,
    changeOrigin: true,
    pathRewrite: { "^/proxy": "" },
    on: {
      proxyRes: (proxyRes) => {
        proxyRes.headers["access-control-allow-origin"] = "*";
        proxyRes.headers["access-control-allow-headers"] =
          "authorization, apikey, content-type, x-client-info, api-key";
        proxyRes.headers["access-control-allow-methods"] =
          "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      },
    },
  })
);

// Handle CORS preflight for proxy
app.options("/proxy/*", (_req, res) => {
  res.set({
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, api-key",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  res.sendStatus(204);
});

// Inject Supabase config into index.html
const publicDir = path.join(__dirname, "..", "public");
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Serve static files
app.use(express.static(publicDir));

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = parseInt(process.env.PORT || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Portal rodando em http://0.0.0.0:${PORT}`);
  console.log(`Proxying Supabase: ${SUPABASE_URL}`);
});
