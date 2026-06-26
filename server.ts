import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const supabaseStatus = async () => {
  try {
    const res = await fetch("http://127.0.0.1:54321/");
    return res.status < 500 ? "running" : "error";
  } catch {
    return "not started";
  }
};

const edgeStatus = async () => {
  try {
    const res = await fetch("http://127.0.0.1:54321/functions/v1/_internal/health");
    return res.ok ? "running" : "error";
  } catch {
    return "not started";
  }
};

const dbStatus = async () => {
  try {
    const res = await fetch("http://127.0.0.1:54321/rest/v1/");
    return res.status < 500 ? "running" : "error";
  } catch {
    return "not started";
  }
};

serve(async (_req: Request) => {
  const [api, edge, db] = await Promise.all([supabaseStatus(), edgeStatus(), dbStatus()]);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>OpenBSP API — Local Dev</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 640px; width: 100%; padding: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; color: #fff; }
    .subtitle { color: #888; font-size: 0.875rem; margin-bottom: 2rem; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h2 { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 1rem; }
    .service { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #222; }
    .service:last-child { border-bottom: none; }
    .service-name { font-size: 0.875rem; color: #ccc; }
    .service-url { font-size: 0.75rem; color: #555; font-family: monospace; }
    .badge { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge.running { background: #0d2e1a; color: #4ade80; }
    .badge.error { background: #2e0d0d; color: #f87171; }
    .badge.not-started { background: #1a1a2e; color: #818cf8; }
    .links { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .link-item { background: #222; border: 1px solid #333; border-radius: 8px; padding: 0.75rem 1rem; text-decoration: none; color: inherit; transition: border-color 0.15s; }
    .link-item:hover { border-color: #555; }
    .link-item .label { font-size: 0.75rem; color: #888; }
    .link-item .url { font-size: 0.75rem; font-family: monospace; color: #60a5fa; word-break: break-all; }
    .note { font-size: 0.75rem; color: #555; margin-top: 1.5rem; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>OpenBSP API</h1>
    <p class="subtitle">Open-source WhatsApp Business Platform — Local Development</p>

    <div class="card">
      <h2>Service Status</h2>
      <div class="service">
        <div>
          <div class="service-name">API Gateway (Kong)</div>
          <div class="service-url">http://localhost:54321</div>
        </div>
        <span class="badge ${api === 'running' ? 'running' : api === 'error' ? 'error' : 'not-started'}">${api}</span>
      </div>
      <div class="service">
        <div>
          <div class="service-name">Edge Functions Runtime</div>
          <div class="service-url">http://localhost:54321/functions/v1</div>
        </div>
        <span class="badge ${edge === 'running' ? 'running' : edge === 'error' ? 'error' : 'not-started'}">${edge}</span>
      </div>
      <div class="service">
        <div>
          <div class="service-name">REST API (PostgREST)</div>
          <div class="service-url">http://localhost:54321/rest/v1</div>
        </div>
        <span class="badge ${db === 'running' ? 'running' : db === 'error' ? 'error' : 'not-started'}">${db}</span>
      </div>
    </div>

    <div class="card">
      <h2>Edge Functions</h2>
      <div class="service"><span class="service-name">whatsapp-webhook</span><span class="service-url">/functions/v1/whatsapp-webhook</span></div>
      <div class="service"><span class="service-name">whatsapp-dispatcher</span><span class="service-url">/functions/v1/whatsapp-dispatcher</span></div>
      <div class="service"><span class="service-name">whatsapp-management</span><span class="service-url">/functions/v1/whatsapp-management</span></div>
      <div class="service"><span class="service-name">agent-client</span><span class="service-url">/functions/v1/agent-client</span></div>
      <div class="service"><span class="service-name">media-preprocessor</span><span class="service-url">/functions/v1/media-preprocessor</span></div>
      <div class="service"><span class="service-name">mcp</span><span class="service-url">/functions/v1/mcp</span></div>
      <div class="service"><span class="service-name">instagram-webhook</span><span class="service-url">/functions/v1/instagram-webhook</span></div>
    </div>

    <div class="card">
      <h2>Local Endpoints</h2>
      <div class="links">
        <a class="link-item" href="http://localhost:54323" target="_blank">
          <div class="label">Studio UI</div>
          <div class="url">localhost:54323</div>
        </a>
        <a class="link-item" href="http://localhost:54324" target="_blank">
          <div class="label">Mailpit (Email)</div>
          <div class="url">localhost:54324</div>
        </a>
        <a class="link-item" href="http://localhost:54321/rest/v1/" target="_blank">
          <div class="label">REST API</div>
          <div class="url">localhost:54321/rest/v1</div>
        </a>
        <a class="link-item" href="http://localhost:54322" target="_blank">
          <div class="label">PostgreSQL</div>
          <div class="url">localhost:54322</div>
        </a>
      </div>
    </div>

    <p class="note">Page auto-refreshes every 10 seconds &bull; <a href="https://github.com/matiasbattocchia/open-bsp-api" style="color:#60a5fa">GitHub</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}, { port: 5000, hostname: "0.0.0.0" });
