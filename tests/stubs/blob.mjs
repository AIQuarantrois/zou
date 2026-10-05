// Double de test de @vercel/blob : magasin en mémoire, mêmes signatures que put / get / del.
const store = (globalThis.__zouBlob ||= new Map());
let n = 0;

export async function put(pathname, body, opts) {
  if (opts?.access !== "private") throw new Error("accès privé attendu");
  if (!opts?.token) throw new Error("jeton manquant");
  const url = `https://stub.private.blob.vercel-storage.com/${pathname.replace(/(\.[a-z0-9]+)$/, `-${++n}$1`)}`;
  store.set(url, { data: new Uint8Array(body.slice ? body.slice(0) : body), contentType: opts.contentType });
  return { url, pathname, contentType: opts.contentType };
}

export async function get(url, opts) {
  if (opts?.access !== "private") throw new Error("accès privé attendu");
  const f = store.get(url);
  if (!f) return null;
  return { statusCode: 200, stream: new Blob([f.data]).stream(), headers: new Headers(), blob: { url, contentType: f.contentType, size: f.data.byteLength } };
}

export async function del(urls) {
  for (const u of [].concat(urls)) store.delete(u);
}
