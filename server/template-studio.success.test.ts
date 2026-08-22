import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbSpies = vi.hoisted(() => ({
  publishEditorSound: vi.fn(),
  publishEditorVideo: vi.fn(),
  toggleFavoriteEditorTemplate: vi.fn(),
  toggleFavoriteEditorSound: vi.fn(),
  createSharedResourceReport: vi.fn(),
  listOpenSharedResourceReports: vi.fn(),
  resolveSharedResourceReport: vi.fn(),
}));
const storageSpies = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, ...dbSpies };
});

vi.mock("./storage", async importOriginal => {
  const actual = await importOriginal<typeof import("./storage")>();
  return { ...actual, ...storageSpies };
});

import { appRouter } from "./routers";

const creator = {
  id: 9,
  openId: "revrse-creator-test",
  email: "creator@example.com",
  name: "Creator Test",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(): TrpcContext {
  return {
    user: creator,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function adminContext(): TrpcContext {
  return {
    user: { ...creator, id: 1, openId: "revrse-owner-test", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("templateStudio lawful shared-resource success paths", () => {
  it("forwards an attested reusable video to object storage and stores only metadata", async () => {
    const data = Buffer.from("licensed-video-bytes");
    storageSpies.storagePut.mockResolvedValue({ key: "revrse-editor/shared-videos/9/scene.webm", url: "https://example.invalid/file" });
    dbSpies.publishEditorVideo.mockResolvedValue({ id: 61, title: "Creator b-roll" });

    const result = await appRouter.createCaller(context()).templateStudio.publishVideo({
      title: "Creator b-roll",
      description: "Creator-owned clip cleared for editable creator projects.",
      category: "B-roll",
      originalName: "scene.webm",
      mimeType: "video/webm",
      base64: data.toString("base64"),
      byteSize: data.byteLength,
      durationMs: 2_000,
      width: 1920,
      height: 1080,
      rightsAttested: true,
    });

    expect(storageSpies.storagePut).toHaveBeenCalledWith("revrse-editor/shared-videos/9/scene.webm", data, "video/webm");
    expect(dbSpies.publishEditorVideo).toHaveBeenCalledWith(expect.objectContaining({ creatorId: 9, storageKey: "revrse-editor/shared-videos/9/scene.webm", width: 1920, height: 1080 }));
    expect(result).toEqual({ id: 61, title: "Creator b-roll" });
  });

  it("forwards a rights-attested sound to object storage and stores only its metadata", async () => {
    const data = Buffer.from("licensed-sound-bytes");
    storageSpies.storagePut.mockResolvedValue({ key: "revrse-editor/shared-sounds/9/ambience.mp3", url: "https://example.invalid/file" });
    dbSpies.publishEditorSound.mockResolvedValue({ id: 73, title: "Licensed ambience" });

    const result = await appRouter.createCaller(context()).templateStudio.publishSound({
      title: "Licensed ambience",
      description: "Creator-owned ambience cleared for editable videos.",
      category: "Ambient",
      moods: "calm, atmospheric",
      licenseType: "creator-owned",
      creditLine: "",
      sourceUrl: "",
      originalName: "ambience.mp3",
      mimeType: "audio/mpeg",
      base64: data.toString("base64"),
      byteSize: data.byteLength,
      durationMs: 1_200,
      rightsAttested: true,
    });

    expect(storageSpies.storagePut).toHaveBeenCalledWith("revrse-editor/shared-sounds/9/ambience.mp3", data, "audio/mpeg");
    expect(dbSpies.publishEditorSound).toHaveBeenCalledWith(expect.objectContaining({ creatorId: 9, storageKey: "revrse-editor/shared-sounds/9/ambience.mp3", byteSize: data.byteLength, moods: "calm, atmospheric", licenseType: "creator-owned" }));
    expect(result).toEqual({ id: 73, title: "Licensed ambience" });
  });

  it("forwards a signed-in user's saved-sound action without generating community content", async () => {
    dbSpies.toggleFavoriteEditorSound.mockResolvedValue({ favorite: true });
    const caller = appRouter.createCaller(context());

    await expect(caller.templateStudio.toggleSoundFavorite({ soundId: 73 })).resolves.toEqual({ favorite: true });
    expect(dbSpies.toggleFavoriteEditorSound).toHaveBeenCalledWith(9, 73);
  });

  it("forwards a signed-in user's saved-template action without generating template data", async () => {
    dbSpies.toggleFavoriteEditorTemplate.mockResolvedValue({ favorite: true });
    const caller = appRouter.createCaller(context());

    await expect(caller.templateStudio.toggleFavorite({ templateId: 81 })).resolves.toEqual({ favorite: true });
    expect(dbSpies.toggleFavoriteEditorTemplate).toHaveBeenCalledWith(9, 81);
  });

  it("forwards an authenticated report privately without creating community content", async () => {
    dbSpies.createSharedResourceReport.mockResolvedValue({ id: 44, status: "open" });

    await expect(appRouter.createCaller(context()).templateStudio.createReport({
      resourceType: "sound",
      resourceId: 73,
      reason: "rights",
      details: "The publishing rights for this sound need to be verified.",
    })).resolves.toEqual({ id: 44, status: "open" });

    expect(dbSpies.createSharedResourceReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 9,
      resourceType: "sound",
      resourceId: 73,
      reason: "rights",
    }));
  });

  it("allows only an admin caller to view and resolve the private moderation queue", async () => {
    dbSpies.listOpenSharedResourceReports.mockResolvedValue([{ id: 44, status: "open" }]);
    dbSpies.resolveSharedResourceReport.mockResolvedValue({ id: 44, status: "resolved" });

    await expect(appRouter.createCaller(context()).templateStudio.moderationQueue()).rejects.toThrow();
    await expect(appRouter.createCaller(adminContext()).templateStudio.moderationQueue()).resolves.toEqual([{ id: 44, status: "open" }]);
    await expect(appRouter.createCaller(adminContext()).templateStudio.resolveReport({
      id: 44,
      status: "resolved",
      moderatorNote: "Rights documentation was checked by the owner.",
    })).resolves.toEqual({ id: 44, status: "resolved" });

    expect(dbSpies.resolveSharedResourceReport).toHaveBeenCalledWith(expect.objectContaining({ id: 44, moderatorId: 1, status: "resolved" }));
  });

  it("reports whether music-provider discovery has a server-side app credential", async () => {
    const caller = appRouter.createCaller(context());
    const status = await caller.musicDiscovery.status();
    expect(status).toEqual({ provider: "Jamendo", configured: Boolean(process.env.JAMENDO_CLIENT_ID?.trim()), mode: "metadata-only" });
    if (!status.configured) {
      await expect(caller.musicDiscovery.search({ query: "ambient" })).rejects.toThrow("Jamendo discovery is not configured");
    }
  });
});
