import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { editorProjects, InsertUser, sharedEditorSounds, sharedEditorTemplates, sharedEditorVideos, sharedResourceReports, sharedResourceReviews, sharedSoundFavorites, sharedTemplateFavorites, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listEditorProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: editorProjects.id,
      title: editorProjects.title,
      durationMs: editorProjects.durationMs,
      updatedAt: editorProjects.updatedAt,
      thumbnailKey: editorProjects.thumbnailKey,
    })
    .from(editorProjects)
    .where(eq(editorProjects.userId, userId))
    .orderBy(desc(editorProjects.updatedAt));
}

export async function getEditorProject(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  const result = await db
    .select({
      id: editorProjects.id,
      title: editorProjects.title,
      durationMs: editorProjects.durationMs,
      projectData: editorProjects.projectData,
      updatedAt: editorProjects.updatedAt,
      thumbnailKey: editorProjects.thumbnailKey,
    })
    .from(editorProjects)
    .where(and(eq(editorProjects.id, id), eq(editorProjects.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function saveEditorProject(input: {
  id?: number;
  userId: number;
  title: string;
  projectData: unknown;
  durationMs: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");

  if (input.id) {
    const result = await db
      .update(editorProjects)
      .set({ title: input.title, projectData: input.projectData, durationMs: input.durationMs })
      .where(and(eq(editorProjects.id, input.id), eq(editorProjects.userId, input.userId)));
    return { id: input.id, updated: (result as unknown as { rowsAffected?: number }).rowsAffected !== 0 };
  }

  const result = await db.insert(editorProjects).values({
    userId: input.userId,
    title: input.title,
    projectData: input.projectData,
    durationMs: input.durationMs,
  });
  return { id: Number((result as unknown as { insertId?: number }).insertId ?? 0), updated: true };
}

export async function listPublishedEditorTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: sharedEditorTemplates.id,
      title: sharedEditorTemplates.title,
      description: sharedEditorTemplates.description,
      category: sharedEditorTemplates.category,
      aspectRatio: sharedEditorTemplates.aspectRatio,
      creatorName: users.name,
      createdAt: sharedEditorTemplates.createdAt,
      updatedAt: sharedEditorTemplates.updatedAt,
    })
    .from(sharedEditorTemplates)
    .leftJoin(users, eq(sharedEditorTemplates.creatorId, users.id))
    .where(eq(sharedEditorTemplates.status, "published"))
    .orderBy(desc(sharedEditorTemplates.updatedAt));
}

export async function getPublishedEditorTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Template library is temporarily unavailable.");
  const result = await db
    .select({
      id: sharedEditorTemplates.id,
      title: sharedEditorTemplates.title,
      description: sharedEditorTemplates.description,
      category: sharedEditorTemplates.category,
      aspectRatio: sharedEditorTemplates.aspectRatio,
      projectData: sharedEditorTemplates.projectData,
      creatorName: users.name,
      updatedAt: sharedEditorTemplates.updatedAt,
    })
    .from(sharedEditorTemplates)
    .leftJoin(users, eq(sharedEditorTemplates.creatorId, users.id))
    .where(and(eq(sharedEditorTemplates.id, id), eq(sharedEditorTemplates.status, "published")))
    .limit(1);
  return result[0] ?? null;
}

export async function publishEditorTemplate(input: {
  creatorId: number;
  title: string;
  description: string;
  category: string;
  aspectRatio: string;
  projectData: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Template library is temporarily unavailable.");
  const result = await db.insert(sharedEditorTemplates).values({ ...input, rightsAttested: 1, status: "published" });
  return { id: Number((result as unknown as { insertId?: number }).insertId ?? 0) };
}

export async function listPublishedEditorVideos() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: sharedEditorVideos.id,
      title: sharedEditorVideos.title,
      description: sharedEditorVideos.description,
      category: sharedEditorVideos.category,
      storageKey: sharedEditorVideos.storageKey,
      originalName: sharedEditorVideos.originalName,
      mimeType: sharedEditorVideos.mimeType,
      byteSize: sharedEditorVideos.byteSize,
      durationMs: sharedEditorVideos.durationMs,
      width: sharedEditorVideos.width,
      height: sharedEditorVideos.height,
      creatorName: users.name,
      createdAt: sharedEditorVideos.createdAt,
      updatedAt: sharedEditorVideos.updatedAt,
    })
    .from(sharedEditorVideos)
    .leftJoin(users, eq(sharedEditorVideos.creatorId, users.id))
    .where(eq(sharedEditorVideos.status, "published"))
    .orderBy(desc(sharedEditorVideos.updatedAt));
}

export async function publishEditorVideo(input: {
  creatorId: number;
  title: string;
  description: string;
  category: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  width: number;
  height: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Shared-video library is temporarily unavailable.");
  const result = await db.insert(sharedEditorVideos).values({ ...input, rightsAttested: 1, status: "published" });
  return { id: Number((result as unknown as { insertId?: number }).insertId ?? 0) };
}

export async function listPublishedEditorSounds() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: sharedEditorSounds.id,
      title: sharedEditorSounds.title,
      description: sharedEditorSounds.description,
      category: sharedEditorSounds.category,
      moods: sharedEditorSounds.moods,
      licenseType: sharedEditorSounds.licenseType,
      creditLine: sharedEditorSounds.creditLine,
      sourceUrl: sharedEditorSounds.sourceUrl,
      storageKey: sharedEditorSounds.storageKey,
      originalName: sharedEditorSounds.originalName,
      mimeType: sharedEditorSounds.mimeType,
      byteSize: sharedEditorSounds.byteSize,
      durationMs: sharedEditorSounds.durationMs,
      creatorName: users.name,
      createdAt: sharedEditorSounds.createdAt,
      updatedAt: sharedEditorSounds.updatedAt,
    })
    .from(sharedEditorSounds)
    .leftJoin(users, eq(sharedEditorSounds.creatorId, users.id))
    .where(eq(sharedEditorSounds.status, "published"))
    .orderBy(desc(sharedEditorSounds.updatedAt));
}

export async function publishEditorSound(input: {
  creatorId: number;
  title: string;
  description: string;
  category: string;
  moods: string;
  licenseType: string;
  creditLine: string;
  sourceUrl: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Sound library is temporarily unavailable.");
  const result = await db.insert(sharedEditorSounds).values({ ...input, rightsAttested: 1, status: "published" });
  return { id: Number((result as unknown as { insertId?: number }).insertId ?? 0) };
}

export async function listFavoriteTemplateIds(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ templateId: sharedTemplateFavorites.templateId }).from(sharedTemplateFavorites).where(eq(sharedTemplateFavorites.userId, userId));
}

export async function toggleFavoriteEditorTemplate(userId: number, templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Template library is temporarily unavailable.");
  const template = await db.select({ id: sharedEditorTemplates.id }).from(sharedEditorTemplates).where(and(eq(sharedEditorTemplates.id, templateId), eq(sharedEditorTemplates.status, "published"))).limit(1);
  if (!template[0]) throw new Error("This shared template is unavailable.");
  const existing = await db.select({ id: sharedTemplateFavorites.id }).from(sharedTemplateFavorites).where(and(eq(sharedTemplateFavorites.userId, userId), eq(sharedTemplateFavorites.templateId, templateId))).limit(1);
  if (existing[0]) {
    await db.delete(sharedTemplateFavorites).where(eq(sharedTemplateFavorites.id, existing[0].id));
    return { templateId, favorited: false };
  }
  await db.insert(sharedTemplateFavorites).values({ userId, templateId });
  return { templateId, favorited: true };
}

export async function listFavoriteSoundIds(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ soundId: sharedSoundFavorites.soundId }).from(sharedSoundFavorites).where(eq(sharedSoundFavorites.userId, userId));
}

export async function toggleFavoriteEditorSound(userId: number, soundId: number) {
  const db = await getDb();
  if (!db) throw new Error("Sound library is temporarily unavailable.");
  const sound = await db.select({ id: sharedEditorSounds.id }).from(sharedEditorSounds).where(and(eq(sharedEditorSounds.id, soundId), eq(sharedEditorSounds.status, "published"))).limit(1);
  if (!sound[0]) throw new Error("This shared sound is unavailable.");
  const existing = await db.select({ id: sharedSoundFavorites.id }).from(sharedSoundFavorites).where(and(eq(sharedSoundFavorites.userId, userId), eq(sharedSoundFavorites.soundId, soundId))).limit(1);
  if (existing[0]) {
    await db.delete(sharedSoundFavorites).where(eq(sharedSoundFavorites.id, existing[0].id));
    return { soundId, favorited: false };
  }
  await db.insert(sharedSoundFavorites).values({ userId, soundId });
  return { soundId, favorited: true };
}

export type SharedResourceType = "template" | "video" | "sound";
export type SharedReportReason = "rights" | "copyright" | "harassment" | "spam" | "other";
export type SharedReportResolution = "resolved" | "dismissed";

async function getPublishedResourceCreator(resourceType: SharedResourceType, resourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community feedback is temporarily unavailable.");
  const table = resourceType === "template" ? sharedEditorTemplates : resourceType === "video" ? sharedEditorVideos : sharedEditorSounds;
  const result = await db
    .select({ creatorId: table.creatorId })
    .from(table)
    .where(and(eq(table.id, resourceId), eq(table.status, "published")))
    .limit(1);
  return result[0]?.creatorId ?? null;
}

export async function createSharedResourceReport(input: {
  reporterId: number;
  resourceType: SharedResourceType;
  resourceId: number;
  reason: SharedReportReason;
  details: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Reporting is temporarily unavailable.");
  const creatorId = await getPublishedResourceCreator(input.resourceType, input.resourceId);
  if (!creatorId) throw new Error("This shared resource is unavailable.");
  if (creatorId === input.reporterId) throw new Error("Creators cannot report their own resource.");
  const activeKey = `open:${input.reporterId}:${input.resourceType}:${input.resourceId}`;
  const existing = await db.select({ id: sharedResourceReports.id })
    .from(sharedResourceReports)
    .where(eq(sharedResourceReports.activeKey, activeKey))
    .limit(1);
  if (existing[0]) throw new Error("You already have an open report for this resource.");
  const result = await db.insert(sharedResourceReports).values({ ...input, activeKey, status: "open" });
  return { id: Number((result as unknown as { insertId?: number }).insertId ?? 0), status: "open" as const };
}

export async function listMySharedResourceReports(reporterId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: sharedResourceReports.id,
    resourceType: sharedResourceReports.resourceType,
    resourceId: sharedResourceReports.resourceId,
    reason: sharedResourceReports.reason,
    details: sharedResourceReports.details,
    status: sharedResourceReports.status,
    moderatorNote: sharedResourceReports.moderatorNote,
    createdAt: sharedResourceReports.createdAt,
    updatedAt: sharedResourceReports.updatedAt,
  }).from(sharedResourceReports).where(eq(sharedResourceReports.reporterId, reporterId)).orderBy(desc(sharedResourceReports.updatedAt));
}

export async function listOpenSharedResourceReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: sharedResourceReports.id,
    reporterId: sharedResourceReports.reporterId,
    reporterName: users.name,
    resourceType: sharedResourceReports.resourceType,
    resourceId: sharedResourceReports.resourceId,
    reason: sharedResourceReports.reason,
    details: sharedResourceReports.details,
    status: sharedResourceReports.status,
    createdAt: sharedResourceReports.createdAt,
  }).from(sharedResourceReports).leftJoin(users, eq(sharedResourceReports.reporterId, users.id))
    .where(eq(sharedResourceReports.status, "open")).orderBy(desc(sharedResourceReports.createdAt)).limit(100);
}

export async function resolveSharedResourceReport(input: {
  id: number;
  moderatorId: number;
  status: SharedReportResolution;
  moderatorNote: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Moderation is temporarily unavailable.");
  const result = await db.update(sharedResourceReports).set({
    status: input.status,
    moderatorId: input.moderatorId,
    moderatorNote: input.moderatorNote || null,
    activeKey: null,
  }).where(and(eq(sharedResourceReports.id, input.id), eq(sharedResourceReports.status, "open")));
  return { id: input.id, resolved: (result as unknown as { rowsAffected?: number }).rowsAffected !== 0 };
}

export async function getResourceRatingSummary(resourceType: SharedResourceType, resourceId: number) {
  const db = await getDb();
  if (!db) return { average: null as number | null, count: 0 };
  const rows = await db
    .select({ stars: sharedResourceReviews.stars })
    .from(sharedResourceReviews)
    .where(and(eq(sharedResourceReviews.resourceType, resourceType), eq(sharedResourceReviews.resourceId, resourceId)));
  if (!rows.length) return { average: null as number | null, count: 0 };
  const total = rows.reduce((sum, row) => sum + row.stars, 0);
  return { average: Math.round((total / rows.length) * 10) / 10, count: rows.length };
}

export async function listResourceReviews(resourceType: SharedResourceType, resourceId: number, viewerId?: number) {
  const db = await getDb();
  if (!db) return { summary: { average: null as number | null, count: 0 }, reviews: [] };
  const [summary, reviews] = await Promise.all([
    getResourceRatingSummary(resourceType, resourceId),
    db
      .select({
        id: sharedResourceReviews.id,
        userId: sharedResourceReviews.userId,
        stars: sharedResourceReviews.stars,
        body: sharedResourceReviews.body,
        createdAt: sharedResourceReviews.createdAt,
        updatedAt: sharedResourceReviews.updatedAt,
        reviewerName: users.name,
      })
      .from(sharedResourceReviews)
      .leftJoin(users, eq(sharedResourceReviews.userId, users.id))
      .where(and(eq(sharedResourceReviews.resourceType, resourceType), eq(sharedResourceReviews.resourceId, resourceId)))
      .orderBy(desc(sharedResourceReviews.updatedAt))
      .limit(50),
  ]);
  return {
    summary,
    reviews: reviews.map(review => ({ ...review, canManage: viewerId === review.userId })),
  };
}

export async function saveResourceReview(input: { userId: number; resourceType: SharedResourceType; resourceId: number; stars: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Community feedback is temporarily unavailable.");
  const creatorId = await getPublishedResourceCreator(input.resourceType, input.resourceId);
  if (!creatorId) throw new Error("This shared resource is unavailable for review.");
  if (creatorId === input.userId) throw new Error("Creators cannot rate their own shared resource.");
  await db.insert(sharedResourceReviews).values({
    userId: input.userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    stars: input.stars,
    body: input.body,
  }).onDuplicateKeyUpdate({ set: { stars: input.stars, body: input.body, updatedAt: new Date() } });
  return getResourceRatingSummary(input.resourceType, input.resourceId);
}

export async function deleteResourceReview(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Community feedback is temporarily unavailable.");
  const existing = await db.select({ id: sharedResourceReviews.id }).from(sharedResourceReviews).where(and(eq(sharedResourceReviews.id, id), eq(sharedResourceReviews.userId, userId))).limit(1);
  if (!existing[0]) throw new Error("Only your own review can be removed.");
  await db.delete(sharedResourceReviews).where(eq(sharedResourceReviews.id, id));
  return { id };
}
