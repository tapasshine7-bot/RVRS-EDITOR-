import { describe, expect, it } from "vitest";
import { sharedEditorSounds, sharedResourceReviews, sharedSoundFavorites } from "../drizzle/schema";

describe("lawful shared-resource schema", () => {
  it("keeps shared sound metadata separate from its stored media bytes", () => {
    expect(sharedEditorSounds.title.notNull).toBe(true);
    expect(sharedEditorSounds.storageKey.notNull).toBe(true);
    expect(sharedEditorSounds.mimeType.notNull).toBe(true);
    expect(sharedEditorSounds.byteSize.notNull).toBe(true);
    expect(sharedEditorSounds.rightsAttested.notNull).toBe(true);
    expect(Object.keys(sharedEditorSounds)).not.toContain("content");
    expect(Object.keys(sharedEditorSounds)).not.toContain("data");
  });

  it("models a user-specific saved-sound relation", () => {
    expect(sharedSoundFavorites.userId.notNull).toBe(true);
    expect(sharedSoundFavorites.soundId.notNull).toBe(true);
    expect(sharedSoundFavorites.userId.name).toBe("userId");
    expect(sharedSoundFavorites.soundId.name).toBe("soundId");
  });

  it("allows authentic reviews to target lawful sound resources", () => {
    expect(sharedResourceReviews.resourceType.enumValues).toEqual(["template", "video", "sound"]);
    expect(sharedResourceReviews.stars.notNull).toBe(true);
    expect(sharedResourceReviews.body.notNull).toBe(true);
  });
});
