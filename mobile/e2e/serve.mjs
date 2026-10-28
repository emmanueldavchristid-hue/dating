// Sert l'export web (dist-web) et relaie /api/v1 vers l'API (même origine → pas de CORS).
// Usage : node e2e/serve.mjs  (PORT=4810, API_ORIGIN=http://localhost:8000)
import { createServer, request } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist-web");
const API = new URL(process.env.API_ORIGIN ?? "http://localhost:8000");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

export function startServer(port = Number(process.env.PORT ?? 4810)) {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) {
      const p = request({ hostname: API.hostname, port: API.port, path: url, method: req.method, headers: { ...req.headers, host: API.host } }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      p.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(p);
      return;
    }
    const clean = normalize(decodeURIComponent(url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    let file = join(ROOT, clean);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then(() => console.log(`http://localhost:${process.env.PORT ?? 4810}`));
}
