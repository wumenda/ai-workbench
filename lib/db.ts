import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

fs.mkdirSync(dataDir, { recursive: true });

const globalForDb = globalThis as unknown as {
  __workbenchDb?: Database.Database;
};

function createDb(): Database.Database {
  const db = new Database(path.join(dataDir, "workbench.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      endpoints TEXT NOT NULL DEFAULT '["chat"]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新对话',
      provider_id INTEGER,
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.7,
      max_tokens INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks (doc_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrate(db);
  return db;
}

// 增量迁移：为旧库补充新列
function migrate(db: Database.Database) {
  const cols = (table: string): string[] =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (r) => r.name
    );

  if (!cols("messages").includes("attachments")) {
    db.exec("ALTER TABLE messages ADD COLUMN attachments TEXT");
  }
  if (!cols("conversations").includes("retrieval_enabled")) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN retrieval_enabled INTEGER NOT NULL DEFAULT 0"
    );
  }
}

export function getDb(): Database.Database {
  if (!globalForDb.__workbenchDb) {
    globalForDb.__workbenchDb = createDb();
  }
  return globalForDb.__workbenchDb;
}
