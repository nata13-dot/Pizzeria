import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
// POS still has unlabeled controls; remove them from this list when their priority is done.
const pending = ["features/pos/"];

async function sources(dir = "") {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory() ? sources(`${dir}${entry.name}/`) : entry.name.endsWith(".tsx") ? [`${dir}${entry.name}`] : []));
  return files.flat();
}

function pressableTags(source) {
  const tags = [];
  for (const match of source.matchAll(/<Pressable\b/g)) {
    let depth = 0, index = match.index + match[0].length;
    for (; index < source.length; index++) {
      if (source[index] === "{") depth++;
      else if (source[index] === "}") depth--;
      else if (source[index] === ">" && depth === 0) break;
    }
    tags.push({ line: source.slice(0, match.index).split("\n").length, tag: source.slice(match.index, index) });
  }
  return tags;
}

test("interactive state uses aria-* props, which react-native-web renders", async () => {
  for (const file of await sources()) {
    assert.doesNotMatch(await readFile(new URL(file, root), "utf8"), /accessibilityState=/, `${file} usa accessibilityState; react-native-web lo ignora`);
  }
});

test("every pressable control announces its role", async () => {
  const missing = [];
  for (const file of await sources()) {
    if (pending.some((prefix) => file.startsWith(prefix))) continue;
    for (const { line, tag } of pressableTags(await readFile(new URL(file, root), "utf8"))) {
      if (!/accessibilityRole=|role=/.test(tag)) missing.push(`${file}:${line}`);
    }
  }
  assert.deepEqual(missing, []);
});
