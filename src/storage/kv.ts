/**
 * Minimal async key-value abstraction over named stores.
 * IndexedDB in the browser, an in-memory Map in tests. The repository only
 * ever talks to this interface, so the backend can be swapped (e.g. for a
 * file-backed store in a desktop shell) without touching anything else.
 */
export const STORES = ['meta', 'snapshots', 'sourceTexts', 'user', 'ui'] as const;
export type StoreName = (typeof STORES)[number];

export interface KeyValueStore {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  set<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, Map<string, string>>();
  private bucket(store: StoreName) {
    let b = this.data.get(store);
    if (!b) this.data.set(store, (b = new Map()));
    return b;
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const raw = this.bucket(store).get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }
  async set<T>(store: StoreName, key: string, value: T): Promise<void> {
    // Serialise like a real backend would, so tests catch non-serialisable state.
    this.bucket(store).set(key, JSON.stringify(value));
  }
  async delete(store: StoreName, key: string): Promise<void> {
    this.bucket(store).delete(key);
  }
  async keys(store: StoreName): Promise<string[]> {
    return [...this.bucket(store).keys()];
  }
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export class IndexedDbStore implements KeyValueStore {
  private db: Promise<IDBDatabase>;

  constructor(name = 'chronicle-of-thalorien', factory: IDBFactory = indexedDB) {
    this.db = new Promise((resolve, reject) => {
      const open = factory.open(name, 1);
      open.onupgradeneeded = () => {
        for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private async tx(store: StoreName, mode: IDBTransactionMode) {
    return (await this.db).transaction(store, mode).objectStore(store);
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return req<T | undefined>((await this.tx(store, 'readonly')).get(key));
  }
  async set<T>(store: StoreName, key: string, value: T): Promise<void> {
    await req((await this.tx(store, 'readwrite')).put(value, key));
  }
  async delete(store: StoreName, key: string): Promise<void> {
    await req((await this.tx(store, 'readwrite')).delete(key));
  }
  async keys(store: StoreName): Promise<string[]> {
    return (await req((await this.tx(store, 'readonly')).getAllKeys())).map(String);
  }
  async close(): Promise<void> {
    (await this.db).close();
  }
}
