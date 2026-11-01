// ===== Data layer =====
// All app code talks to `Store` (collections of JSON docs + binary media) through this interface:
//   open(profile,pin) · put(col,doc) · get(col,id) · list(col) · del(col,id) · putMedia(id,blob) · getMedia(id)
// v1 = LocalEncryptedAdapter (IndexedDB + AES-GCM). A cloud adapter (Firebase/Supabase) can implement the same
// methods and add sync() – see SyncAdapter stub at the bottom.
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=buf=>{let s="",u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const unb64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
export {b64,unb64};
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open("exercise-db",1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore("profiles",{keyPath:"id"});const s=d.createObjectStore("docs",{keyPath:"k"});s.createIndex("pc",["pid","col"])};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
const dbp=idb();
async function T(store,mode,fn){const db=await dbp;return new Promise((res,rej)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let out;const r=fn(s);if(r&&"onsuccess" in r)r.onsuccess=()=>out=r.result;t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
export async function listProfiles(){return (await T("profiles","readonly",s=>s.getAll()))||[]}
async function deriveKey(pin,salt){const base=await crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encBytes(key,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes);return {iv:b64(iv),ct:new Uint8Array(ct)}}
async function decBytes(key,o){return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.iv)},key,o.ct))}
export async function createProfile({name,role,pin}){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveKey(pin,salt);
 const p={id:"p"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,role,salt:b64(salt),check:await encBytes(key,enc.encode("ok:"+name)),created:new Date().toISOString()};
 await T("profiles","readwrite",s=>s.put(p));return p}
export async function deleteProfile(pid){await T("profiles","readwrite",s=>s.delete(pid));const db=await dbp;
 await new Promise(r=>{const t=db.transaction("docs","readwrite"),ix=t.objectStore("docs").index("pc"),c=ix.openCursor(IDBKeyRange.bound([pid,""],[pid,"\uffff"]));c.onsuccess=()=>{const cur=c.result;if(cur){cur.delete();cur.continue()}};t.oncomplete=r})}
export class LocalEncryptedAdapter{
 async open(profile,pin){const key=await deriveKey(pin,unb64(profile.salt));try{await decBytes(key,profile.check)}catch(e){throw new Error("Wrong PIN")}this.key=key;this.pid=profile.id;this.profile=profile;return this}
 close(){this.key=null;this.pid=null}
 async _put(col,id,bytes,meta){const o=await encBytes(this.key,bytes);await T("docs","readwrite",s=>s.put({k:this.pid+"|"+col+"|"+id,pid:this.pid,col,id,iv:o.iv,ct:o.ct,meta:meta||null,ts:Date.now()}))}
 async _get(col,id){const r=await T("docs","readonly",s=>s.get(this.pid+"|"+col+"|"+id));return r?decBytes(this.key,r):null}
 async put(col,doc){if(!doc.id)doc.id=col.slice(0,2)+Date.now().toString(36)+Math.random().toString(36).slice(2,6);doc.updated=new Date().toISOString();await this._put(col,doc.id,enc.encode(JSON.stringify(doc)));return doc}
 async get(col,id){const b=await this._get(col,id);return b?JSON.parse(dec.decode(b)):null}
 async list(col){const db=await dbp;const rows=await new Promise((res,rej)=>{const t=db.transaction("docs"),r=t.objectStore("docs").index("pc").getAll([this.pid,col]);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const out=[];for(const r of rows)out.push(JSON.parse(dec.decode(await decBytes(this.key,r))));return out}
 async del(col,id){await T("docs","readwrite",s=>s.delete(this.pid+"|"+col+"|"+id))}
 async putMedia(id,blob){await this._put("media",id,new Uint8Array(await blob.arrayBuffer()),{type:blob.type})}
 async getMedia(id){const r=await T("docs","readonly",s=>s.get(this.pid+"|media|"+id));if(!r)return null;return new Blob([await decBytes(this.key,r)],{type:r.meta&&r.meta.type||"video/webm"})}
 async getSetting(k,d){const s=await this.get("settings","main");return s&&k in s?s[k]:d}
 async setSetting(k,v){const s=(await this.get("settings","main"))||{id:"main"};s[k]=v;await this.put("settings",s)}
}
// Future: class SupabaseAdapter / FirebaseAdapter implementing the same methods against a remote DB,
// with local LocalEncryptedAdapter kept as offline cache and a sync queue of {op,col,id,updated}.
export class SyncAdapter{constructor(local,remote){this.local=local;this.remote=remote}async sync(){throw new Error("Cloud sync not configured in v1")}}
