/* Document storage adapter (v1.3 · Priority 1 + cloud-provider requirement).
 *
 * One interface, swappable providers:
 *   put(path, file)        → { path, size, mime }   (stores content)
 *   getDataUrl(path)       → dataUrl | null         (for preview/download/zip)
 *   remove(path)           → void
 *
 * DemoStorage keeps base64 in localStorage with a hard budget so demo mode
 * never corrupts itself; oversize files keep metadata only. SupabaseStorage
 * targets the private `case-documents` bucket. A future S3/Azure provider
 * implements the same three methods and registers in getStorage() — nothing
 * else in the app changes. */

const DEMO_KEY = "liq_files";
const DEMO_FILE_CAP = 1.5 * 1024 * 1024;   // per file
const DEMO_TOTAL_CAP = 4 * 1024 * 1024;    // whole store

const readMap = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); } catch { return {}; } };
const writeMap = (m) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(m)); return true; } catch { return false; } };

export class DemoStorage {
  async put(path, file) {
    const size = file.size ?? 0;
    const meta = { path, size, mime: file.type || "application/octet-stream", stored: false };
    if (size > DEMO_FILE_CAP) return { ...meta, note: "File over the demo 1.5 MB cap — metadata kept, content not stored (production mode stores full files)." };
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const map = readMap();
    const total = Object.values(map).reduce((s, v) => s + (v?.length || 0), 0);
    if (total + dataUrl.length > DEMO_TOTAL_CAP) return { ...meta, note: "Demo storage budget reached — metadata kept, content not stored." };
    map[path] = dataUrl;
    if (!writeMap(map)) return { ...meta, note: "Demo storage unavailable — metadata only." };
    return { ...meta, stored: true };
  }
  async getDataUrl(path) { return readMap()[path] || null; }
  async remove(path) { const m = readMap(); delete m[path]; writeMap(m); }
}

export class SupabaseStorage {
  constructor(supabase, bucket = "case-documents") { this.sb = supabase; this.bucket = bucket; }
  async put(path, file) {
    const { error } = await this.sb.storage.from(this.bucket).upload(path, file, { upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return { path, size: file.size, mime: file.type, stored: true };
  }
  async getDataUrl(path) {
    const { data, error } = await this.sb.storage.from(this.bucket).download(path);
    if (error) return null;
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(data); });
  }
  async remove(path) { await this.sb.storage.from(this.bucket).remove([path]); }
}

let _instance = null;
export function getStorage(demo, supabase) {
  if (!_instance) _instance = demo ? new DemoStorage() : new SupabaseStorage(supabase);
  return _instance;
}
export const docPath = (caseId, filename) => `case_${caseId}/${Date.now()}_${filename.replace(/[^a-z0-9._-]+/gi, "_")}`;
