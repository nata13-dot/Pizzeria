import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDist = resolve(scriptDirectory, "../dist");

async function filesBelow(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, root);
    if (!entry.isFile()) return [];
    return [relative(root, path).split(sep).join("/")];
  }));
  return nested.flat();
}

export async function staticCacheManifest(directory) {
  return (await filesBelow(directory))
    .filter((path) => path !== "service-worker.js")
    .sort()
    .map((path) => `/${path}`);
}

export async function staticCacheVersion(directory, manifest) {
  const hash = createHash("sha256");
  for (const url of manifest) {
    hash.update(url);
    hash.update(await readFile(join(directory, url.slice(1))));
  }
  return hash.digest("hex").slice(0, 16);
}

export function serviceWorkerSource(manifest, version) {
  return `const CACHE_NAME=${JSON.stringify(`pizzeria-static-${version}`)};
const PRECACHE=${JSON.stringify(manifest)};
const PRECACHE_SET=new Set(PRECACHE);
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all(PRECACHE.map(async url=>{const response=await fetch(url,{cache:"reload"});if(!response.ok)throw new Error("No se pudo precargar "+url);await cache.put(url,response);}));await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("pizzeria-static-")&&key!==CACHE_NAME)await caches.delete(key);await self.clients.claim();})()));
async function refresh(request,key){const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(key,response.clone());}return response;}
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==="navigate"){event.respondWith((async()=>{const cached=await caches.match("/index.html");const network=refresh(request,"/index.html").catch(()=>null);return cached??await network??Response.error();})());return;}if(!PRECACHE_SET.has(url.pathname))return;event.respondWith((async()=>{const cached=await caches.match(url.pathname);if(cached)return cached;try{return await refresh(request,url.pathname);}catch{return Response.error();}})());});
`;
}

export async function generateServiceWorker(directory = defaultDist) {
  const manifest = await staticCacheManifest(directory);
  if (!manifest.includes("/index.html")) throw new Error("La exportación web no contiene index.html");
  const version = await staticCacheVersion(directory, manifest);
  await writeFile(join(directory, "service-worker.js"), serviceWorkerSource(manifest, version));
  return { manifest, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateServiceWorker();
  console.log(`Caché web ${result.version}: ${result.manifest.length} archivos precargados.`);
}
