import { assertRightsAttestation, isResourceType, isSafeHttpsUrl, isWorkerApiPath, reportReasons, reportResolutions, roleForEmail, type ResourceType } from "./guards";

export interface Env {
  ASSETS: Fetcher;
  REVRSE_DB?: D1Database;
  REVRSE_MEDIA?: R2Bucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
}

type Identity = { subject: string; email: string; name: string };
type DbUser = Identity & { id: number; role: "admin" | "user" };
type JsonRecord = Record<string, unknown>;
type AccessJwk = JsonWebKey & { kid?: string };

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const mediaTables: Record<Exclude<ResourceType, "template">, string> = {
  video: "shared_videos",
  sound: "shared_sounds",
};

const nowSql = "unixepoch()";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function dbFor(env: Env): D1Database {
  if (!env.REVRSE_DB) throw new ApiError(503, "Account sync and community tools are not configured for this Cloudflare deployment.");
  return env.REVRSE_DB;
}

function r2For(env: Env): R2Bucket {
  if (!env.REVRSE_MEDIA) throw new ApiError(503, "Shared creator media is unavailable until the approved R2 bucket is configured.");
  return env.REVRSE_MEDIA;
}

function base64UrlJson(value: string): JsonRecord {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(normalized)) as JsonRecord;
}

function toBase64Bytes(value: string): Uint8Array {
  let decoded: string;
  try {
    decoded = atob(value.replace(/^data:[^;]+;base64,/, ""));
  } catch {
    throw new ApiError(400, "The selected media could not be verified.");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function normalizeAccessOrigin(value: string): string {
  const origin = new URL(value.startsWith("http") ? value : `https://${value}`).origin;
  return origin.replace(/\/$/, "");
}

async function verifyAccessJwt(token: string, env: Env): Promise<Identity> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new ApiError(503, "Cloudflare Access authentication has not been configured for this deployment.");
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new ApiError(401, "Sign in through Cloudflare Access to use account features.");

  let header: JsonRecord;
  let claims: JsonRecord;
  try {
    header = base64UrlJson(encodedHeader);
    claims = base64UrlJson(encodedPayload);
  } catch {
    throw new ApiError(401, "Sign in through Cloudflare Access to use account features.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new ApiError(401, "Cloudflare Access could not verify this session.");

  const accessOrigin = normalizeAccessOrigin(env.ACCESS_TEAM_DOMAIN);
  const jwksResponse = await fetch(`${accessOrigin}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" } });
  if (!jwksResponse.ok) throw new ApiError(503, "Cloudflare Access verification is temporarily unavailable.");
  const jwks = (await jwksResponse.json()) as { keys?: AccessJwk[] };
  const matchingKey = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!matchingKey) throw new ApiError(401, "Cloudflare Access could not verify this session.");

  const key = await crypto.subtle.importKey("jwk", matchingKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encodedSignature.length / 4) * 4, "=")), char => char.charCodeAt(0));
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const currentTime = Math.floor(Date.now() / 1000);
  if (!verified || claims.iss !== `${accessOrigin}/` || !audience.includes(env.ACCESS_AUD) || typeof claims.exp !== "number" || claims.exp <= currentTime) {
    throw new ApiError(401, "Cloudflare Access could not verify this session.");
  }
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const name = typeof claims.name === "string" ? claims.name.trim().slice(0, 160) : email.split("@")[0];
  if (!email || !subject) throw new ApiError(401, "Cloudflare Access did not provide a usable account identity.");
  return { subject, email, name: name || "REVRSE creator" };
}

async function optionalIdentity(request: Request, env: Env): Promise<Identity | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  return token ? verifyAccessJwt(token, env) : null;
}

async function currentUser(request: Request, env: Env): Promise<DbUser> {
  const identity = await optionalIdentity(request, env);
  if (!identity) throw new ApiError(401, "Sign in through Cloudflare Access to use account features.");
  const db = dbFor(env);
  await db.prepare(`INSERT INTO users (access_subject, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ${nowSql}, ${nowSql})
    ON CONFLICT(access_subject) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = ${nowSql}`)
    .bind(identity.subject, identity.email, identity.name).run();
  const user = await db.prepare("SELECT id FROM users WHERE access_subject = ?").bind(identity.subject).first<{ id: number }>();
  if (!user) throw new ApiError(503, "The account service could not create this user record.");
  return { ...identity, id: user.id, role: roleForEmail(identity.email, env.ADMIN_EMAIL) };
}

function requireAdmin(user: DbUser): void {
  if (user.role !== "admin") throw new ApiError(403, "Only the designated owner can access moderation.");
}

async function body(request: Request): Promise<JsonRecord> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 26 * 1024 * 1024) throw new ApiError(413, "This request is too large.");
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as JsonRecord;
  } catch {
    throw new ApiError(400, "A valid JSON request is required.");
  }
}

function text(input: JsonRecord, field: string, min: number, max: number, required = true): string {
  const value = input[field];
  if (typeof value !== "string") {
    if (!required && value == null) return "";
    throw new ApiError(400, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if ((required && trimmed.length < min) || trimmed.length > max) throw new ApiError(400, `${field} must be between ${min} and ${max} characters.`);
  return trimmed;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) throw new ApiError(400, `${field} is invalid.`);
  return value;
}

function idFromPath(value: string | undefined, name = "id"): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, `${name} is invalid.`);
  return parsed;
}

function jsonText(value: unknown, maxBytes = 2 * 1024 * 1024): string {
  const result = JSON.stringify(value);
  if (!result || new TextEncoder().encode(result).byteLength > maxBytes) throw new ApiError(400, "The project structure is invalid or too large to sync.");
  return result;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

async function listRows<T extends JsonRecord>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}

async function publishedCreatorId(db: D1Database, resourceType: ResourceType, resourceId: number): Promise<number | null> {
  const table = resourceType === "template" ? "shared_templates" : mediaTables[resourceType];
  const resource = await db.prepare(`SELECT creator_id as creatorId FROM ${table} WHERE id = ? AND status = 'published'`).bind(resourceId).first<{ creatorId: number }>();
  return resource?.creatorId ?? null;
}

async function resourceExists(db: D1Database, resourceType: ResourceType, resourceId: number): Promise<boolean> {
  return (await publishedCreatorId(db, resourceType, resourceId)) !== null;
}

async function projectRoutes(request: Request, env: Env, url: URL, parts: string[]): Promise<Response> {
  const db = dbFor(env);
  const user = await currentUser(request, env);
  if (request.method === "GET" && parts.length === 2) {
    const rows = await listRows<JsonRecord>(db.prepare(`SELECT id, title, project_json as projectData, duration_ms as durationMs,
      created_at * 1000 as createdAt, updated_at * 1000 as updatedAt FROM editor_projects WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.id));
    return json(rows.map(row => ({ ...row, projectData: parseJson(row.projectData) })));
  }
  if (request.method === "GET" && parts.length === 3) {
    const id = idFromPath(parts[2]);
    const project = await db.prepare(`SELECT id, title, project_json as projectData, duration_ms as durationMs,
      created_at * 1000 as createdAt, updated_at * 1000 as updatedAt FROM editor_projects WHERE user_id = ? AND id = ?`).bind(user.id, id).first<JsonRecord>();
    return json(project ? { ...project, projectData: parseJson(project.projectData) } : null);
  }
  if (request.method === "POST" && parts.length === 2) {
    const input = await body(request);
    const title = text(input, "title", 1, 160);
    const durationMs = integer(input.durationMs, "durationMs", 0, 86_400_000);
    const projectData = jsonText(input.projectData);
    const providedId = input.id == null ? null : integer(input.id, "id", 1, Number.MAX_SAFE_INTEGER);
    if (providedId) {
      const updated = await db.prepare(`UPDATE editor_projects SET title = ?, project_json = ?, duration_ms = ?, updated_at = ${nowSql} WHERE id = ? AND user_id = ?`)
        .bind(title, projectData, durationMs, providedId, user.id).run();
      if (!updated.meta.changes) throw new ApiError(404, "This account project is unavailable.");
      return json({ id: providedId });
    }
    const created = await db.prepare(`INSERT INTO editor_projects (user_id, title, project_json, duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ${nowSql}, ${nowSql})`).bind(user.id, title, projectData, durationMs).run();
    return json({ id: Number(created.meta.last_row_id) });
  }
  throw new ApiError(404, "API route not found.");
}

async function templateRoutes(request: Request, env: Env, parts: string[]): Promise<Response> {
  const db = dbFor(env);
  if (request.method === "GET" && parts.length === 2) {
    const rows = await listRows<JsonRecord>(db.prepare(`SELECT t.id, t.title, t.description, t.category, t.aspect_ratio as aspectRatio,
      u.display_name as creatorName, t.created_at * 1000 as createdAt, t.updated_at * 1000 as updatedAt
      FROM shared_templates t LEFT JOIN users u ON u.id = t.creator_id WHERE t.status = 'published' ORDER BY t.updated_at DESC`));
    return json(rows);
  }
  if (request.method === "GET" && parts.length === 3) {
    const id = idFromPath(parts[2]);
    const row = await db.prepare(`SELECT t.id, t.title, t.description, t.category, t.aspect_ratio as aspectRatio, t.project_json as projectData,
      u.display_name as creatorName, t.updated_at * 1000 as updatedAt FROM shared_templates t LEFT JOIN users u ON u.id = t.creator_id
      WHERE t.id = ? AND t.status = 'published'`).bind(id).first<JsonRecord>();
    return json(row ? { ...row, projectData: parseJson(row.projectData) } : null);
  }
  if (request.method === "POST" && parts.length === 2) {
    const user = await currentUser(request, env);
    const input = await body(request);
    assertRightsAttestation(input.rightsAttested);
    const created = await db.prepare(`INSERT INTO shared_templates (creator_id, title, description, category, aspect_ratio, project_json, rights_attested, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'published', ${nowSql}, ${nowSql})`)
      .bind(user.id, text(input, "title", 3, 160), text(input, "description", 10, 500), text(input, "category", 2, 64), text(input, "aspectRatio", 3, 16), jsonText(input.projectData)).run();
    return json({ id: Number(created.meta.last_row_id) });
  }
  throw new ApiError(404, "API route not found.");
}

async function mediaRoutes(request: Request, env: Env, parts: string[]): Promise<Response> {
  const db = dbFor(env);
  const kind = parts[1];
  if (kind !== "videos" && kind !== "sounds") throw new ApiError(404, "API route not found.");
  const resourceType: Exclude<ResourceType, "template"> = kind === "videos" ? "video" : "sound";
  const table = mediaTables[resourceType];
  if (request.method === "GET" && parts.length === 2) {
    const fields = resourceType === "video"
      ? "v.id, v.title, v.description, v.category, v.original_name as originalName, v.mime_type as mimeType, v.byte_size as byteSize, v.duration_ms as durationMs, v.width, v.height, u.display_name as creatorName, v.created_at * 1000 as createdAt, v.updated_at * 1000 as updatedAt"
      : "v.id, v.title, v.description, v.category, v.moods, v.license_type as licenseType, v.credit_line as creditLine, v.source_url as sourceUrl, v.original_name as originalName, v.mime_type as mimeType, v.byte_size as byteSize, v.duration_ms as durationMs, u.display_name as creatorName, v.created_at * 1000 as createdAt, v.updated_at * 1000 as updatedAt";
    const rows = await listRows<JsonRecord>(db.prepare(`SELECT ${fields} FROM ${table} v LEFT JOIN users u ON u.id = v.creator_id WHERE v.status = 'published' ORDER BY v.updated_at DESC`));
    return json(rows.map(row => ({ ...row, url: `/api/media/${resourceType}/${row.id}` })));
  }
  if (request.method === "POST" && parts.length === 2) {
    const user = await currentUser(request, env);
    const input = await body(request);
    assertRightsAttestation(input.rightsAttested);
    const title = text(input, "title", 3, 160);
    const description = text(input, "description", 10, 500);
    const category = text(input, "category", 2, 64);
    const originalName = text(input, "originalName", 1, 255);
    const mimeType = text(input, "mimeType", 1, 64);
    const base64 = text(input, "base64", 16, resourceType === "video" ? 25_165_824 : 16_777_216);
    const expectedSize = integer(input.byteSize, "byteSize", 1, resourceType === "video" ? 18 * 1024 * 1024 : 12 * 1024 * 1024);
    const bytes = toBase64Bytes(base64);
    if (bytes.byteLength !== expectedSize) throw new ApiError(400, "The selected media size could not be verified.");
    const allowedMimes = resourceType === "video" ? ["video/mp4", "video/webm", "video/quicktime"] : ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"];
    if (!allowedMimes.includes(mimeType)) throw new ApiError(400, "This media format is not supported.");
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `revrse-editor/${resourceType}s/${user.id}/${crypto.randomUUID()}-${safeName}`;
    await r2For(env).put(key, bytes, { httpMetadata: { contentType: mimeType } });
    if (resourceType === "video") {
      const created = await db.prepare(`INSERT INTO shared_videos (creator_id, title, description, category, storage_key, original_name, mime_type, byte_size, duration_ms, width, height, rights_attested, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', ${nowSql}, ${nowSql})`)
        .bind(user.id, title, description, category, key, originalName, mimeType, bytes.byteLength, integer(input.durationMs, "durationMs", 0, 7_200_000), integer(input.width, "width", 0, 7680), integer(input.height, "height", 0, 7680)).run();
      return json({ id: Number(created.meta.last_row_id) });
    }
    const sourceUrl = text(input, "sourceUrl", 0, 500, false);
    if (!isSafeHttpsUrl(sourceUrl)) throw new ApiError(400, "Use an HTTPS source link or leave it blank.");
    const licenseType = text(input, "licenseType", 1, 32);
    if (!(["creator-owned", "public-domain", "royalty-free", "permission"] as string[]).includes(licenseType)) throw new ApiError(400, "licenseType is invalid.");
    const created = await db.prepare(`INSERT INTO shared_sounds (creator_id, title, description, category, moods, license_type, credit_line, source_url, storage_key, original_name, mime_type, byte_size, duration_ms, rights_attested, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', ${nowSql}, ${nowSql})`)
      .bind(user.id, title, description, category, text(input, "moods", 0, 160, false), licenseType, text(input, "creditLine", 0, 300, false), sourceUrl || null, key, originalName, mimeType, bytes.byteLength, integer(input.durationMs, "durationMs", 0, 1_800_000)).run();
    return json({ id: Number(created.meta.last_row_id) });
  }
  throw new ApiError(404, "API route not found.");
}

async function sharedMediaRoute(env: Env, parts: string[]): Promise<Response> {
  const resourceType = parts[2];
  if ((resourceType !== "video" && resourceType !== "sound") || parts.length !== 4) throw new ApiError(404, "API route not found.");
  const id = idFromPath(parts[3]);
  const table = mediaTables[resourceType];
  const db = dbFor(env);
  const item = await db.prepare(`SELECT storage_key as storageKey, mime_type as mimeType FROM ${table} WHERE id = ? AND status = 'published'`).bind(id).first<{ storageKey: string; mimeType: string }>();
  if (!item) throw new ApiError(404, "This shared resource is unavailable.");
  const object = await r2For(env).get(item.storageKey);
  if (!object) throw new ApiError(404, "This shared media object is unavailable.");
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || item.mimeType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function favoriteRoutes(request: Request, env: Env, parts: string[]): Promise<Response> {
  const user = await currentUser(request, env);
  const db = dbFor(env);
  const kind = parts[2];
  if (kind !== "templates" && kind !== "sounds") throw new ApiError(404, "API route not found.");
  const type: ResourceType = kind === "templates" ? "template" : "sound";
  const table = type === "template" ? "template_favorites" : "sound_favorites";
  const idColumn = type === "template" ? "template_id" : "sound_id";
  if (request.method === "GET") {
    const rows = await listRows<{ id: number }>(db.prepare(`SELECT ${idColumn} as id FROM ${table} WHERE user_id = ?`).bind(user.id));
    return json(rows.map(row => row.id));
  }
  if (request.method === "POST") {
    const input = await body(request);
    const resourceId = integer(input[type === "template" ? "templateId" : "soundId"], "resourceId", 1, Number.MAX_SAFE_INTEGER);
    if (!(await resourceExists(db, type, resourceId))) throw new ApiError(404, "This shared resource is unavailable.");
    const existing = await db.prepare(`SELECT id FROM ${table} WHERE user_id = ? AND ${idColumn} = ?`).bind(user.id, resourceId).first<{ id: number }>();
    if (existing) {
      await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(existing.id).run();
      return json({ [type === "template" ? "templateId" : "soundId"]: resourceId, favorited: false });
    }
    await db.prepare(`INSERT INTO ${table} (user_id, ${idColumn}, created_at) VALUES (?, ?, ${nowSql})`).bind(user.id, resourceId).run();
    return json({ [type === "template" ? "templateId" : "soundId"]: resourceId, favorited: true });
  }
  throw new ApiError(404, "API route not found.");
}

async function reviewRoutes(request: Request, env: Env, url: URL, parts: string[]): Promise<Response> {
  const db = dbFor(env);
  if (request.method === "GET") {
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = idFromPath(url.searchParams.get("resourceId") ?? undefined, "resourceId");
    if (!isResourceType(resourceType)) throw new ApiError(400, "resourceType is invalid.");
    const identity = await optionalIdentity(request, env);
    const user = identity ? await currentUser(request, env) : null;
    const summary = await db.prepare("SELECT ROUND(AVG(stars), 1) as average, COUNT(*) as count FROM resource_reviews WHERE resource_type = ? AND resource_id = ?").bind(resourceType, resourceId).first<{ average: number | null; count: number }>();
    const reviews = await listRows<JsonRecord>(db.prepare(`SELECT r.id, r.user_id as userId, r.stars, r.body, r.created_at * 1000 as createdAt, r.updated_at * 1000 as updatedAt, u.display_name as reviewerName
      FROM resource_reviews r LEFT JOIN users u ON u.id = r.user_id WHERE r.resource_type = ? AND r.resource_id = ? ORDER BY r.updated_at DESC LIMIT 50`).bind(resourceType, resourceId));
    return json({ summary: summary ?? { average: null, count: 0 }, reviews: reviews.map(row => ({ ...row, canManage: user?.id === row.userId })) });
  }
  const user = await currentUser(request, env);
  if (request.method === "POST") {
    const input = await body(request);
    if (!isResourceType(input.resourceType)) throw new ApiError(400, "resourceType is invalid.");
    const resourceId = integer(input.resourceId, "resourceId", 1, Number.MAX_SAFE_INTEGER);
    const creatorId = await publishedCreatorId(db, input.resourceType, resourceId);
    if (!creatorId) throw new ApiError(404, "This shared resource is unavailable for review.");
    if (creatorId === user.id) throw new ApiError(403, "Creators cannot rate their own shared resource.");
    await db.prepare(`INSERT INTO resource_reviews (user_id, resource_type, resource_id, stars, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ${nowSql}, ${nowSql}) ON CONFLICT(user_id, resource_type, resource_id) DO UPDATE SET stars = excluded.stars, body = excluded.body, updated_at = ${nowSql}`)
      .bind(user.id, input.resourceType, resourceId, integer(input.stars, "stars", 1, 5), text(input, "body", 0, 600, false)).run();
    return json({ ok: true });
  }
  if (request.method === "DELETE" && parts.length === 3) {
    const id = idFromPath(parts[2]);
    const deleted = await db.prepare("DELETE FROM resource_reviews WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!deleted.meta.changes) throw new ApiError(403, "Only your own review can be removed.");
    return json({ id });
  }
  throw new ApiError(404, "API route not found.");
}

async function reportRoutes(request: Request, env: Env, parts: string[]): Promise<Response> {
  const user = await currentUser(request, env);
  const db = dbFor(env);
  if (request.method === "POST" && parts.length === 2) {
    const input = await body(request);
    if (!isResourceType(input.resourceType) || !(reportReasons as readonly string[]).includes(String(input.reason))) throw new ApiError(400, "The report details are invalid.");
    const resourceId = integer(input.resourceId, "resourceId", 1, Number.MAX_SAFE_INTEGER);
    const creatorId = await publishedCreatorId(db, input.resourceType, resourceId);
    if (!creatorId) throw new ApiError(404, "This shared resource is unavailable.");
    if (creatorId === user.id) throw new ApiError(403, "Creators cannot report their own resource.");
    const openKey = `open:${user.id}:${input.resourceType}:${resourceId}`;
    const alreadyOpen = await db.prepare("SELECT id FROM resource_reports WHERE open_key = ?").bind(openKey).first<{ id: number }>();
    if (alreadyOpen) throw new ApiError(409, "You already have an open report for this resource.");
    const created = await db.prepare(`INSERT INTO resource_reports (reporter_id, resource_type, resource_id, reason, details, status, open_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ${nowSql}, ${nowSql})`).bind(user.id, input.resourceType, resourceId, input.reason, text(input, "details", 0, 600, false), openKey).run();
    return json({ id: Number(created.meta.last_row_id), status: "open" });
  }
  if (request.method === "GET" && parts.length === 3 && parts[2] === "mine") {
    const rows = await listRows<JsonRecord>(db.prepare(`SELECT id, resource_type as resourceType, resource_id as resourceId, reason, details, status, moderator_note as moderatorNote,
      created_at * 1000 as createdAt, updated_at * 1000 as updatedAt FROM resource_reports WHERE reporter_id = ? ORDER BY updated_at DESC`).bind(user.id));
    return json(rows);
  }
  throw new ApiError(404, "API route not found.");
}

async function moderationRoutes(request: Request, env: Env, parts: string[]): Promise<Response> {
  const user = await currentUser(request, env);
  requireAdmin(user);
  const db = dbFor(env);
  if (request.method === "GET" && parts.length === 3) {
    const rows = await listRows<JsonRecord>(db.prepare(`SELECT r.id, r.reporter_id as reporterId, u.display_name as reporterName, r.resource_type as resourceType,
      r.resource_id as resourceId, r.reason, r.details, r.status, r.created_at * 1000 as createdAt FROM resource_reports r LEFT JOIN users u ON u.id = r.reporter_id
      WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100`));
    return json(rows);
  }
  if (request.method === "PATCH" && parts.length === 4) {
    const input = await body(request);
    if (!(reportResolutions as readonly string[]).includes(String(input.status))) throw new ApiError(400, "status is invalid.");
    const id = idFromPath(parts[3]);
    const changed = await db.prepare(`UPDATE resource_reports SET status = ?, moderator_id = ?, moderator_note = ?, open_key = NULL, updated_at = ${nowSql}
      WHERE id = ? AND status = 'open'`).bind(input.status, user.id, text(input, "moderatorNote", 0, 500, false) || null, id).run();
    return json({ id, resolved: Boolean(changed.meta.changes) });
  }
  throw new ApiError(404, "API route not found.");
}

async function movieSearch(url: URL): Promise<Response> {
  const query = (url.searchParams.get("query") ?? "").trim();
  const country = (url.searchParams.get("country") ?? "IN").trim().toUpperCase();
  if (query.length < 2 || query.length > 120 || !/^[A-Z]{2}$/.test(country)) throw new ApiError(400, "Enter a movie search of 2–120 characters.");
  const params = new URLSearchParams({ term: query, country, media: "movie", entity: "movie", limit: "8" });
  const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ApiError(502, "Movie discovery is temporarily unavailable. Try again shortly.");
  const payload = (await response.json()) as { results?: JsonRecord[] };
  return json((payload.results ?? []).map(item => ({
    id: typeof item.trackId === "number" ? item.trackId : 0,
    title: typeof item.trackName === "string" ? item.trackName : "Untitled movie",
    year: typeof item.releaseDate === "string" ? item.releaseDate.slice(0, 4) : "",
    genre: typeof item.primaryGenreName === "string" ? item.primaryGenreName : "Movie",
    artworkUrl: typeof item.artworkUrl100 === "string" ? item.artworkUrl100.replace("100x100bb", "600x600bb") : "",
    storeUrl: typeof item.trackViewUrl === "string" ? item.trackViewUrl : "",
    previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : "",
  })).filter(item => item.id > 0));
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, POST, PATCH, DELETE, OPTIONS" } });
  if (parts[1] === "auth" && parts[2] === "me" && request.method === "GET") {
    const identity = await optionalIdentity(request, env);
    if (!identity) return json(null);
    const user = await currentUser(request, env);
    return json({ id: user.id, email: user.email, name: user.name, role: user.role });
  }
  if (parts[1] === "projects") return projectRoutes(request, env, url, parts);
  if (parts[1] === "templates") return templateRoutes(request, env, parts);
  if (parts[1] === "videos" || parts[1] === "sounds") return mediaRoutes(request, env, parts);
  if (parts[1] === "media") return sharedMediaRoute(env, parts);
  if (parts[1] === "favorites") return favoriteRoutes(request, env, parts);
  if (parts[1] === "reviews") return reviewRoutes(request, env, url, parts);
  if (parts[1] === "reports") return reportRoutes(request, env, parts);
  if (parts[1] === "moderation" && parts[2] === "reports") return moderationRoutes(request, env, parts);
  if (parts[1] === "movies" && request.method === "GET") return movieSearch(url);
  if (parts[1] === "music" && parts[2] === "status" && request.method === "GET") return json({ provider: "Jamendo", configured: false, mode: "metadata-only" });
  if (parts[1] === "music" && request.method === "GET") throw new ApiError(503, "Music discovery is intentionally disabled until an authorized server-side provider agreement is configured.");
  throw new ApiError(404, "API route not found.");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (isWorkerApiPath(url.pathname)) return await api(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error("Unhandled REVRSE EDITOR Worker error", error);
      return json({ error: "The Cloudflare service could not complete this request." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
