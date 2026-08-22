import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const signedInUser = {
  id: 42,
  openId: "revrse-test-creator",
  email: "creator@example.com",
  name: "Test Creator",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("templateStudio validation", () => {
  it("requires a signed-in account before a sound favourite can be changed", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.templateStudio.toggleSoundFavorite({ soundId: 1 })).rejects.toThrow(/login/i);
  });

  it("requires a literal rights attestation and a supported audio MIME type before upload work begins", async () => {
    const caller = appRouter.createCaller(context(signedInUser));
    const input = {
      title: "Licensed ambience",
      description: "Creator-owned ambience cleared for editing use.",
      category: "Ambient",
      originalName: "ambience.mp3",
      mimeType: "audio/mpeg",
      base64: "Y3JlYXRvci1vd25lZC1saWNlbnNlZC1hdWRpbw==",
      byteSize: 28,
      durationMs: 1_200,
      rightsAttested: false,
    };

    await expect(caller.templateStudio.publishSound(input)).rejects.toThrow();
    await expect(caller.templateStudio.publishSound({ ...input, rightsAttested: true, mimeType: "audio/flac" })).rejects.toThrow();
  });

  it("keeps real community reviews within one-to-five stars and the supported resource types", async () => {
    const caller = appRouter.createCaller(context(signedInUser));
    await expect(caller.templateStudio.saveReview({ resourceType: "sound", resourceId: 1, stars: 6, body: "" })).rejects.toThrow();
    await expect(caller.templateStudio.saveReview({ resourceType: "movie", resourceId: 1, stars: 5, body: "" } as never)).rejects.toThrow();
  });
});
