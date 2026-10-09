import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateServiceWorker, staticCacheManifest } from "../scripts/generate-service-worker.mjs";

test("web export precaches every generated file with a content version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pizzeria-cache-"));
  try {
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "index.html"), "<main>app</main>");
    await writeFile(join(directory, "assets", "app.js"), "app()");
    await writeFile(join(directory, "favicon.ico"), "icon");
    const first = await generateServiceWorker(directory);
    assert.deepEqual(first.manifest, ["/assets/app.js", "/favicon.ico", "/index.html"]);
    const source = await readFile(join(directory, "service-worker.js"), "utf8");
    assert.match(source, new RegExp(`pizzeria-static-${first.version}`));
    assert.match(source, /caches\.match\("\/index\.html"\)/);
    assert.match(source, /if\(!PRECACHE_SET\.has\(url\.pathname\)\)return/);
    assert.doesNotMatch(source, /service-worker\.js"\]/);
    assert.deepEqual(await staticCacheManifest(directory), first.manifest);
    await writeFile(join(directory, "assets", "app.js"), "changed()");
    const second = await generateServiceWorker(directory);
    assert.notEqual(second.version, first.version);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("web cache registration is present in the application entry point", async () => {
  const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(source, /registerWebCache\(\)/);
});
