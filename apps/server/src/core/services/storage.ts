import { mkdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { ENV } from "../../env.server";

/**
 * File storage on local disk (good enough for a hackathon; swap for S3 behind the
 * same interface later). Files are served by the API at `/files/<key>`.
 */
export interface StorageService {
  put(key: string, bytes: Uint8Array | ArrayBuffer | Blob, contentType: string): Promise<{ key: string; url: string }>;
  /** Absolute path on disk, or null for a key that escapes the storage root. */
  pathFor(key: string): string | null;
}

export function createStorageService(): StorageService {
  const root = normalize(ENV.STORAGE_DIR);
  const pathFor = (key: string) => {
    const p = normalize(join(root, key));
    return p.startsWith(root) ? p : null;
  };
  return {
    pathFor,
    async put(key, bytes) {
      const path = pathFor(key);
      if (!path) throw new Error(`bad storage key: ${key}`);
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, bytes);
      return { key, url: `${ENV.BETTER_AUTH_URL.replace(/\/$/, "")}/files/${key}` };
    },
  };
}
