import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Project documents are JSON editing instructions only. Original media bytes stay
 * in browser-local object URLs or S3 storage, never in database columns.
 */
export const editorProjects = mysqlTable("editorProjects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  projectData: json("projectData").notNull(),
  durationMs: int("durationMs").notNull().default(0),
  thumbnailKey: varchar("thumbnailKey", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("editor_projects_user_updated_idx").on(table.userId, table.updatedAt)]);

/** Metadata for S3-managed media used by a persisted REVRSE EDITOR project. */
export const editorAssets = mysqlTable("editorAssets", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => editorProjects.id, { onDelete: "cascade" }),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  byteSize: int("byteSize").notNull(),
  durationMs: int("durationMs").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("editor_assets_project_idx").on(table.projectId)]);

export type EditorProjectRecord = typeof editorProjects.$inferSelect;
export type InsertEditorProjectRecord = typeof editorProjects.$inferInsert;
export type EditorAssetRecord = typeof editorAssets.$inferSelect;

/**
 * Publicly reusable project structures. The creator must confirm ownership or
 * permission before publishing; media bytes are never embedded in this JSON.
 */
export const sharedEditorTemplates = mysqlTable("sharedEditorTemplates", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  aspectRatio: varchar("aspectRatio", { length: 16 }).notNull(),
  projectData: json("projectData").notNull(),
  rightsAttested: int("rightsAttested").notNull().default(0),
  status: mysqlEnum("status", ["published", "removed"]).notNull().default("published"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("shared_editor_templates_status_updated_idx").on(table.status, table.updatedAt),
  index("shared_editor_templates_creator_idx").on(table.creatorId),
]);

/** A user's saved shared templates. One row per user and template. */
export const sharedTemplateFavorites = mysqlTable("sharedTemplateFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: int("templateId").notNull().references(() => sharedEditorTemplates.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shared_template_favorites_user_template_uq").on(table.userId, table.templateId),
  index("shared_template_favorites_template_idx").on(table.templateId),
]);

/**
 * Small, licensed source-video clips that creators intentionally make reusable.
 * The binary belongs in S3; the database keeps only the storage reference and
 * factual media metadata necessary to insert it into another local edit.
 */
export const sharedEditorVideos = mysqlTable("sharedEditorVideos", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  byteSize: int("byteSize").notNull(),
  durationMs: int("durationMs").notNull().default(0),
  width: int("width").notNull().default(0),
  height: int("height").notNull().default(0),
  rightsAttested: int("rightsAttested").notNull().default(0),
  status: mysqlEnum("status", ["published", "removed"]).notNull().default("published"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("shared_editor_videos_status_updated_idx").on(table.status, table.updatedAt),
  index("shared_editor_videos_creator_idx").on(table.creatorId),
]);

/**
 * Licensed or creator-owned sounds intentionally shared for use in edits.
 * The binary remains in S3 and is never placed in a database column.
 */
export const sharedEditorSounds = mysqlTable("sharedEditorSounds", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  byteSize: int("byteSize").notNull(),
  durationMs: int("durationMs").notNull().default(0),
  rightsAttested: int("rightsAttested").notNull().default(0),
  status: mysqlEnum("status", ["published", "removed"]).notNull().default("published"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("shared_editor_sounds_status_updated_idx").on(table.status, table.updatedAt),
  index("shared_editor_sounds_creator_idx").on(table.creatorId),
]);

/** A user's saved lawful shared sounds. One row per user and sound resource. */
export const sharedSoundFavorites = mysqlTable("sharedSoundFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  soundId: int("soundId").notNull().references(() => sharedEditorSounds.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shared_sound_favorites_user_sound_uq").on(table.userId, table.soundId),
  index("shared_sound_favorites_sound_idx").on(table.soundId),
]);

/**
 * Authentic community feedback for published resources. This intentionally
 * stores no seeded or generated reviews: each signed-in user may publish one
 * updateable rating and optional written review per resource.
 */
export const sharedResourceReviews = mysqlTable("sharedResourceReviews", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceType: mysqlEnum("resourceType", ["template", "video", "sound"]).notNull(),
  resourceId: int("resourceId").notNull(),
  stars: int("stars").notNull(),
  body: varchar("body", { length: 600 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shared_resource_reviews_user_resource_uq").on(table.userId, table.resourceType, table.resourceId),
  index("shared_resource_reviews_resource_idx").on(table.resourceType, table.resourceId, table.updatedAt),
]);

export type SharedEditorTemplate = typeof sharedEditorTemplates.$inferSelect;
export type SharedEditorVideo = typeof sharedEditorVideos.$inferSelect;
export type SharedEditorSound = typeof sharedEditorSounds.$inferSelect;
export type SharedResourceReview = typeof sharedResourceReviews.$inferSelect;
