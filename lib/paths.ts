import path from "node:path";

export const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const mediaDir = path.join(dataDir, "media");
