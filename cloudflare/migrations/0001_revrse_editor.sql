-- Cloudflare D1 metadata schema. Shared video and sound bytes live only in R2.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  access_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS editor_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  project_json TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS editor_projects_user_updated_idx ON editor_projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  project_json TEXT NOT NULL,
  rights_attested INTEGER NOT NULL CHECK(rights_attested = 1),
  status TEXT NOT NULL CHECK(status IN ('published', 'hidden', 'removed')) DEFAULT 'published',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_templates_status_updated_idx ON shared_templates(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  rights_attested INTEGER NOT NULL CHECK(rights_attested = 1),
  status TEXT NOT NULL CHECK(status IN ('published', 'hidden', 'removed')) DEFAULT 'published',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_videos_status_updated_idx ON shared_videos(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_sounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  moods TEXT NOT NULL DEFAULT '',
  license_type TEXT NOT NULL CHECK(license_type IN ('creator-owned', 'public-domain', 'royalty-free', 'permission')),
  credit_line TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  rights_attested INTEGER NOT NULL CHECK(rights_attested = 1),
  status TEXT NOT NULL CHECK(status IN ('published', 'hidden', 'removed')) DEFAULT 'published',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_sounds_status_updated_idx ON shared_sounds(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS template_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES shared_templates(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, template_id)
);

CREATE TABLE IF NOT EXISTS sound_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sound_id INTEGER NOT NULL REFERENCES shared_sounds(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, sound_id)
);

CREATE TABLE IF NOT EXISTS resource_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('template', 'video', 'sound')),
  resource_id INTEGER NOT NULL,
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS resource_reviews_resource_updated_idx ON resource_reviews(resource_type, resource_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS resource_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('template', 'video', 'sound')),
  resource_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('rights', 'copyright', 'harassment', 'spam', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('open', 'resolved', 'dismissed')) DEFAULT 'open',
  open_key TEXT UNIQUE,
  moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  moderator_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS resource_reports_status_created_idx ON resource_reports(status, created_at DESC);
