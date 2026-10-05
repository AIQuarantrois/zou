import { put, get, del } from "@vercel/blob";
import { env } from "./env";
import { ApiError } from "./http";

// Fichiers du coffre dans Vercel Blob, en accès PRIVÉ : aucune URL publique, chaque lecture passe par l'API
// (contrôle du propriétaire). Le magasin Blob doit être créé en mode « private » (voir README).

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // les fonctions Vercel refusent les corps de plus de 4,5 Mo
export const QUOTA_BYTES = 200 * 1024 * 1024; // par compte

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function hasBlob() { return Boolean(env.blobToken || env.blobStoreId); }

/** Identifiants Blob : la clé read-write si elle existe, sinon rien (le SDK utilise BLOB_STORE_ID et le jeton OIDC de Vercel). */
function auth(): { token?: string } {
  if (!hasBlob()) throw new ApiError(503, "files_not_configured", "Le stockage des fichiers n'est pas encore activé.");
  return env.blobToken ? { token: env.blobToken } : {};
}

export async function putFile(pathname: string, body: ArrayBuffer, contentType: string) {
  const r = await put(pathname, body, { access: "private", contentType, addRandomSuffix: true, ...auth() });
  return r.url;
}

export async function getFile(key: string) {
  return get(key, { access: "private", useCache: false, ...auth() });
}

/** Suppression sans échec bloquant : un fichier orphelin vaut mieux qu'une suppression de document refusée. */
export async function deleteFile(key: string | null | undefined) {
  if (!key || !hasBlob()) return;
  try { await del(key, auth()); } catch (e) { console.error("blob_delete_failed", e); }
}
