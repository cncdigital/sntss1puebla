CREATE TABLE IF NOT EXISTS casa_cultura_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('publicación','curso','turismo','convenio')),
  text TEXT NOT NULL,
  schedule TEXT,
  level TEXT,
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS casa_cultura_items_active_sort_idx ON casa_cultura_items(active,sort_order,created_at);
