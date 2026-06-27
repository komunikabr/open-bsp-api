import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const API_BASE_URL = Deno.env.get("API_BASE_URL") ?? "";
const PUBLIC_DIR = "./public";

async function serveFile(path: string): Promise<Response> {
  try {
    const content = await Deno.readFile(path);
    const ext = path.split(".").pop() ?? "";
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
    };
    return new Response(content, {
      headers: { "content-type": types[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function proxySupabase(req: Request, path: string): Promise<Response> {
  const target = `${SUPABASE_URL}${path}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  // Deno's fetch auto-decompresses responses, so tell upstream not to compress.
  // This prevents ERR_CONTENT_DECODING_FAILED when the browser receives an
  // already-decompressed body that still carries Content-Encoding: gzip.
  headers.set("accept-encoding", "identity");

  try {
    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });

    const resHeaders = new Headers(upstream.headers);
    // Remove encoding header — body is already decompressed by Deno fetch.
    resHeaders.delete("content-encoding");
    resHeaders.set("access-control-allow-origin", "*");
    resHeaders.set(
      "access-control-allow-headers",
      "authorization, apikey, content-type, x-client-info, api-key",
    );
    resHeaders.set(
      "access-control-allow-methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization, apikey, content-type, x-client-info, api-key",
        "access-control-allow-methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      },
    });
  }

  // Expõe config do Supabase para o frontend
  if (pathname === "/api/config") {
    return new Response(
      JSON.stringify({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, apiBaseUrl: API_BASE_URL }),
      { headers: { "content-type": "application/json" } },
    );
  }

  if (pathname.startsWith("/proxy/")) {
    const upstreamPath = pathname.replace("/proxy", "") + url.search;
    return await proxySupabase(req, upstreamPath);
  }

  if (pathname === "/" || pathname === "/index.html") {
    return await serveFile(join(PUBLIC_DIR, "lp.html"));
  }

  if (pathname === "/app" || pathname === "/app.html") {
    return await serveFile(join(PUBLIC_DIR, "index.html"));
  }

  if (pathname === "/admin" || pathname === "/admin.html") {
    return await serveFile(join(PUBLIC_DIR, "admin.html"));
  }

  const filePath = join(PUBLIC_DIR, pathname);
  return await serveFile(filePath);
}, { port: 5000, hostname: "0.0.0.0" });

console.log(`Portal rodando em http://0.0.0.0:5000`);
console.log(`Supabase: ${SUPABASE_URL}`);
