// Bound serialized payload size as well as entry count; images can dwarf lists.
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; size: number }>();
  private bytes = 0;
  private maxEntries: number;
  private maxBytes: number;

  constructor(maxEntries: number, maxBytes: number) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.delete(key);
    const size = JSON.stringify(value).length * 2;
    if (size > this.maxBytes) return;
    this.entries.set(key, { value, size });
    this.bytes += size;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.size;
    this.entries.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}
