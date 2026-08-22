export const resourceTypes = ["template", "video", "sound"] as const;
export type ResourceType = (typeof resourceTypes)[number];
export const reportReasons = ["rights", "copyright", "harassment", "spam", "other"] as const;
export const reportResolutions = ["resolved", "dismissed"] as const;

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (resourceTypes as readonly string[]).includes(value);
}

export function assertRightsAttestation(value: unknown): void {
  if (value !== true) throw new Error("You must confirm that you own the media or have permission to share it.");
}

export function isSafeHttpsUrl(value: string): boolean {
  return !value || /^https:\/\//i.test(value);
}

export function roleForEmail(email: string, adminEmail?: string): "admin" | "user" {
  return adminEmail && email.trim().toLowerCase() === adminEmail.trim().toLowerCase() ? "admin" : "user";
}

export function canServeSharedMedia(resourceIsPublished: boolean): boolean {
  return resourceIsPublished;
}

export function isWorkerApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
