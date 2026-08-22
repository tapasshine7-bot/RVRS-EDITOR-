import { describe, expect, it } from "vitest";
import { assertRightsAttestation, canServeSharedMedia, isSafeHttpsUrl, isWorkerApiPath, roleForEmail } from "./guards";

describe("Cloudflare Worker community safeguards", () => {
  it("requires an affirmative rights attestation before publication", () => {
    expect(() => assertRightsAttestation(false)).toThrow(/must confirm/i);
    expect(() => assertRightsAttestation(undefined)).toThrow(/must confirm/i);
    expect(() => assertRightsAttestation(true)).not.toThrow();
  });

  it("keeps moderation authority server-determined by the verified email", () => {
    expect(roleForEmail("owner@example.com", "owner@example.com")).toBe("admin");
    expect(roleForEmail("member@example.com", "owner@example.com")).toBe("user");
    expect(roleForEmail("OWNER@example.com", "owner@example.com")).toBe("admin");
  });

  it("accepts only HTTPS attribution links and never serves unpublished media", () => {
    expect(isSafeHttpsUrl("https://creator.example/licence")).toBe(true);
    expect(isSafeHttpsUrl("http://creator.example/licence")).toBe(false);
    expect(canServeSharedMedia(true)).toBe(true);
    expect(canServeSharedMedia(false)).toBe(false);
  });

  it("routes only API paths through the Worker and leaves editor routes to the static SPA", () => {
    expect(isWorkerApiPath("/api/projects")).toBe(true);
    expect(isWorkerApiPath("/api")).toBe(true);
    expect(isWorkerApiPath("/workspace/project-123")).toBe(false);
    expect(isWorkerApiPath("/assets/index.js")).toBe(false);
  });
});
