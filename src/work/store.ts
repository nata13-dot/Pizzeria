export type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
export type Scope = { api: string; user: number; branch: number };
export const MAX_AGE = 24 * 60 * 60 * 1000;
const persistent = new Set(['cart','customerId','addressId','salesChannel','pickup','recipient','phone','address','references','mapUrl','zone','scheduledAt','notes']);
const stringFields = new Set(['salesChannel','recipient','phone','address','references','mapUrl','zone','scheduledAt','notes']);
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const ids = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(id);
const text = (v: unknown) => typeof v === 'string' && v.length <= 10000;
export function validCart(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 500 && value.every(line => {
    if (!line || !text(line.key) || !text(line.name) || !text(line.notes) || !id(line.quantity)) return false;
    if (line.kind === 'product') return id(line.variantId) && ids(line.flavorIds) && ids(line.modifierIds);
    return line.kind === 'combo' && id(line.comboId) && Array.isArray(line.components) && line.components.length <= 500 && line.components.every((c: Record<string, unknown>) => c && id(c.combo_item_id) && (c.unit_index == null || id(c.unit_index)) && ids(c.flavor_ids) && ids(c.modifier_ids) && (c.notes == null || text(c.notes)));
  });
}
export function validFields(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key,v]) => persistent.has(key) && (key === 'cart' ? validCart(v) : stringFields.has(key) ? text(v) : key === 'pickup' ? typeof v === 'boolean' : v === null || id(v)));
}
export type Operation = { key: string; orderId?: number };
export class WorkStore {
  fields: Record<string, unknown> = {};
  operation: Operation | null = null;
  ready = false;
  writable = true;
  notice = '';
  revision = 0;
  scope: Scope | null = null;
  private key = '';
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private changedAt = 0;
  unsaved = false;
  private storage: Storage;
  constructor(storage: Storage) { this.storage=storage; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  emit() { this.revision++; this.listeners.forEach(fn => fn()); }
  get<T>(section: string, field: string, initial: T): T { return (Object.hasOwn(this.fields, `${section}.${field}`) ? this.fields[`${section}.${field}`] : initial) as T; }
  set<T>(section: string, field: string, next: T | ((old: T) => T), initial: T) {
    if (!this.ready || (!this.writable && section==='pos')) return;
    const old = this.get(section, field, initial);
    const value = typeof next === 'function' ? (next as (v:T)=>T)(old) : next;
    if (Object.is(old,value)) return;
    this.fields[`${section}.${field}`] = value;
    if (section === 'pos' && persistent.has(field)) { this.changedAt = Date.now(); this.unsaved = true; clearTimeout(this.timer); this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},500); }
    this.emit();
  }
  async open(scope: Scope | null) {
    if(this.ready) void this.flush().catch(()=>{});
    clearTimeout(this.timer);
    const generation = ++this.generation;
    this.fields={}; this.operation=null; this.ready=false; this.notice=''; this.scope=scope; this.unsaved=false; this.emit();
    this.key=scope ? `pizzeria-work:v1:${encodeURIComponent(scope.api)}:${scope.user}:${scope.branch}` : '';
    if (!scope) return;
    const key=this.key;
    try {
      await this.queue;
      const raw=await this.storage.getItem(key);
      if (generation!==this.generation) return;
      if(raw) {
        let data;
        try { data=JSON.parse(raw); } catch { data=null; }
        const valid=data?.version===1 && data.user===scope.user && data.branch===scope.branch && data.api===scope.api;
        if(valid && data.operation && typeof data.operation.key==='string' && /^[A-Za-z0-9._:-]{8,100}$/.test(data.operation.key) && (data.operation.orderId===undefined || id(data.operation.orderId))) this.operation=data.operation;
        if(valid && Number.isFinite(data.updatedAt) && data.updatedAt<=Date.now() && Date.now()-data.updatedAt<MAX_AGE && validFields(data.fields)) {
          this.changedAt=data.updatedAt;
          for(const [name,value] of Object.entries(data.fields)) this.fields[`pos.${name}`]=value;
          this.notice='Recuperamos tu venta pendiente. Revisa los datos antes de continuar.';
        } else {
          this.notice='La venta guardada venció o no pudo recuperarse.';
          // Never erase an unresolved operation just because its editable data expired.
          if(this.writable) {
            if(!this.operation) await this.storage.removeItem(key);
            else await this.storage.setItem(key,JSON.stringify({version:1,...scope,updatedAt:0,fields:{},operation:this.operation}));
          }
        }
      }
    } catch { this.notice='No pudimos leer la venta guardada. Reintenta antes de comenzar otra.'; return; }
    finally { if(generation===this.generation) this.emit(); }
    if(generation===this.generation) {this.ready=true;this.emit();}
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if(!this.ready || !this.key || !this.writable) return Promise.resolve();
    const fields: Record<string,unknown>={};
    for(const field of persistent) if(this.fields[`pos.${field}`]!==undefined) fields[field]=this.fields[`pos.${field}`];
    // Derived labels/prices are not authoritative and are rebuilt on entry.
    if(Array.isArray(fields.cart)) fields.cart=fields.cart.map(line=>line.kind==='product' ? {key:line.key,kind:line.kind,variantId:line.variantId,name:line.name,quantity:line.quantity,flavorIds:line.flavorIds,modifierIds:line.modifierIds,notes:line.notes} : {key:line.key,kind:line.kind,comboId:line.comboId,name:line.name,quantity:line.quantity,components:line.components,notes:line.notes});
    const operation=this.operation;
    const key=this.key, generation=this.generation, revision=this.revision;
    const meaningful=Object.entries(fields).some(([k,v])=> k==='cart' ? Array.isArray(v)&&v.length : ['recipient','phone','address','notes','scheduledAt'].includes(k)?Boolean(v):k==='customerId'&&Boolean(v));
    const serialized=JSON.stringify({version:1,...this.scope,updatedAt:this.changedAt,fields:meaningful?fields:{},operation:this.operation});
    const task=this.queue.catch(()=>{}).then(async()=>{
      if(meaningful && !validFields(fields)) throw new Error("Invalid draft fields");
      if(meaningful || operation) await this.storage.setItem(key,serialized); else await this.storage.removeItem(key);
      if(generation===this.generation && revision===this.revision) this.unsaved=false;
    });
    this.queue=task;
    return task.catch(error=>{if(generation===this.generation){this.notice='No pudimos guardar esta venta en el dispositivo. No cierres la aplicación; intenta nuevamente.';this.unsaved=true;this.emit();}throw error;});
  }
  async mark(operation: Operation | null) {
    const previous=this.operation, scope=this.scope;
    this.operation=operation;this.emit();
    try {await this.flush();} catch(error) {if(operation===null && this.scope===scope){this.operation=previous;this.emit();}throw error;}
  }
  async clearPos() {
    const scope=this.scope, previous={...this.fields}, timestamp=this.changedAt;
    clearTimeout(this.timer);
    for(const key of Object.keys(this.fields)) if(key.startsWith('pos.'))delete this.fields[key];
    this.changedAt=0;this.unsaved=true;this.emit();
    try {await this.flush();} catch(error) {
      if(this.scope===scope){for(const [key,value] of Object.entries(previous))if(key.startsWith('pos.'))this.fields[key]=value;this.changedAt=timestamp;this.emit();}
      throw error;
    }
  }
}
