import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { BoundedCache } from './boundedCache.ts';

let instance = 0;
async function client(fetcher) {
  const disk = new Map();
  globalThis.__cacheTestStorage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); },
    removeItem: async (key) => { disk.delete(key); },
    getAllKeys: async () => [...disk.keys()],
    multiRemove: async (keys) => { keys.forEach((key) => disk.delete(key)); },
  };
  globalThis.fetch = fetcher;
  let source = await readFile(new URL('./api.ts', import.meta.url), 'utf8');
  source = source.replace('import AsyncStorage from "@react-native-async-storage/async-storage";', 'const AsyncStorage = globalThis.__cacheTestStorage;')
    .replace('"./boundedCache"', JSON.stringify(new URL('./boundedCache.ts', import.meta.url).href));
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return { ...(await import(`data:text/javascript;base64,${Buffer.from(js + `\n// instance ${instance++}`).toString('base64')}`)), disk };
}
const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('bounded cache evicts least recently used entries and oversized payloads', () => {
  const cache = new BoundedCache(2, 100);
  cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  cache.set('huge', 'x'.repeat(100));
  assert.equal(cache.get('huge'), undefined);
  const bytes = new BoundedCache(10, 12);
  bytes.set('a', 'ab'); bytes.set('b', 'cd');
  assert.equal(bytes.get('a'), undefined);
});

test('concurrent reads share one request; reload refreshes the shared cache', async () => {
  let calls = 0;
  const gate = deferred();
  const { api } = await client(async () => { calls++; await gate.promise; return ok({ calls }); });
  const reads = [api('/pos/catalog', 'a'), api('/pos/catalog', 'a')];
  gate.resolve();
  assert.deepEqual(await Promise.all(reads), [{ calls: 1 }, { calls: 1 }]);
  await api('/pos/catalog', 'a');
  assert.equal(calls, 1);
  await api('/pos/catalog', 'a', { cache: 'reload' });
  assert.equal(calls, 2);
  await api('/pos/catalog', 'a');
  assert.equal(calls, 2);
});

test('variant mutations invalidate the POS catalog; old reads cannot repopulate it', async () => {
  let reads = 0;
  const old = deferred();
  const { api } = await client(async (_url, options) => {
    if (options.method === 'PUT') return ok({ saved: true });
    reads++;
    if (reads === 1) return old.promise;
    return ok({ price: 20 });
  });
  const pending = api('/pos/catalog', 'a');
  await new Promise((r) => setImmediate(r));
  await api('/product-variants/1', 'a', { method: 'PUT' });
  assert.deepEqual(await api('/pos/catalog', 'a'), { price: 20 });
  old.resolve(ok({ price: 10 }));
  await pending;
  assert.deepEqual(await api('/pos/catalog', 'a'), { price: 20 });
  assert.equal(reads, 2);
});

test('logout prevents in-flight writes and separates sessions', async () => {
  const old = deferred();
  let calls = 0;
  const { api, clearApiCache, disk } = await client(async () => { calls++; return calls === 1 ? old.promise : ok({ calls }); });
  const pending = api('/pos/catalog', 'a');
  await new Promise((r) => setImmediate(r));
  await clearApiCache('a');
  old.resolve(ok({ private: true }));
  await pending;
  await new Promise((r) => setImmediate(r));
  assert.equal(disk.size, 0);
  await api('/pos/catalog', 'b');
  await api('/pos/catalog', 'a');
  assert.equal(calls, 3);
});

test('operational data is not persisted or silently served stale on failure', async () => {
  let fail = false;
  const { api, disk } = await client(async () => { if (fail) throw new Error('offline'); return ok([]); });
  await api('/orders', 'a');
  await new Promise((r) => setImmediate(r));
  assert.equal(disk.size, 0);
  fail = true;
  await assert.rejects(api('/orders', 'a', { cacheTtlMs: -1 }), /offline/);
});

test('no-store does not populate memory or disk and authorization errors do not use stale data', async () => {
  let calls = 0;
  const { api, disk } = await client(async () => { calls++; return ok([]); });
  await api('/pos/catalog', 'a', { cache: 'no-store' });
  await new Promise((r) => setImmediate(r));
  assert.equal(disk.size, 0);
  await api('/pos/catalog', 'a');
  assert.equal(calls, 2);
  globalThis.fetch = async () => new Response('{"message":"denied"}', { status: 403 });
  await assert.rejects(api('/pos/catalog', 'a', { cacheTtlMs: -1 }), (error) => error.status === 403);
});
