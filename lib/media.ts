import fs from "node:fs/promises";
import path from "node:path";
import { mediaDir } from "./paths";

// 媒体文件保存于 DATA_DIR/media，通过 /api/media/<name> 访问

export interface SavedMedia {
  url: string;
  name: string;
}

export async function saveMedia(
  buf: Buffer,
  ext: string
): Promise<SavedMedia> {
  await fs.mkdir(mediaDir, { recursive: true });
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
  await fs.writeFile(path.join(mediaDir, name), buf);
  return { url: `/api/media/${name}`, name };
}

// 防目录穿越：只取 basename
export function mediaFilePath(name: string): string {
  return path.join(mediaDir, path.basename(name));
}

export async function readMediaDataUrl(url: string): Promise<string | null> {
  // /api/media/xxx.png → data:<mime>;base64,...
  const name = url.split("/").pop();
  if (!name) return null;
  try {
    const buf = await fs.readFile(mediaFilePath(name));
    const ext = path.extname(name).toLowerCase();
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
