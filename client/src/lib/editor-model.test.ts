import { describe, expect, it } from "vitest";
import { addKeyframe, addMarker, canvasForPreset, classifyFile, createClip, createEmptyProject, getVisibleDuration, normalizeAssets, normalizeProject, removeClip, serializableProject, splitClip } from "./editor-model";

const asset = {
  id: "asset-1",
  name: "clip.mp4",
  kind: "video" as const,
  url: "blob:test",
  size: 100,
  duration: 10,
};

describe("editor timeline model", () => {
  it("creates clips with an editable visible duration", () => {
    const clip = createClip(asset, "video-1", 0);
    expect(getVisibleDuration(clip)).toBe(10);
    expect(getVisibleDuration({ ...clip, trimStart: 2, trimEnd: 3 })).toBe(5);
  });

  it("splits a selected clip without altering its source duration", () => {
    const project = createEmptyProject();
    const clip = createClip(asset, "video-1", 0);
    const result = splitClip({ ...project, clips: [clip] }, clip.id, 4);
    expect(result.clips).toHaveLength(2);
    expect(getVisibleDuration(result.clips[0]!)).toBe(4);
    expect(getVisibleDuration(result.clips[1]!)).toBe(6);
    expect(result.clips[1]!.start).toBe(4);
  });

  it("normalizes incomplete legacy snapshots without missing array collections", () => {
    const recovered = normalizeProject({ id: "older-project", name: "Older draft", tracks: undefined, clips: undefined });
    expect(recovered.tracks).toHaveLength(5);
    expect(recovered.tracks.some(track => track.type === "audio")).toBe(true);
    expect(recovered.clips).toEqual([]);
    expect(recovered.name).toBe("Older draft");
    expect(normalizeAssets({ unexpected: true })).toEqual([]);
  });

  it("supports licensed sound tracks while preserving markers and editable keyframes", () => {
    const project = createEmptyProject({ aspectRatio: "9:16" });
    const clip = createClip(asset, "video-1", 1);
    const keyed = addKeyframe(clip, { id: "key-1", at: 0.5, property: "opacity", value: 70, easing: "ease-in-out" });
    const marked = addMarker({ ...project, clips: [keyed] }, 2, "Beat");
    expect(marked.aspectRatio).toBe("9:16");
    expect(marked.tracks.map(track => track.type)).toContain("audio");
    expect(marked.markers).toHaveLength(1);
    expect(marked.clips[0]?.keyframes[0]?.easing).toBe("ease-in-out");
  });

  it("normalizes licensed audio and prepares audio clips for a sound track", () => {
    const normalized = normalizeAssets([{ id: "sound-1", name: "licensed-loop.mp3", kind: "audio", size: 32, duration: 14 }]);
    const sound = normalized[0]!;
    const clip = createClip(sound, "audio-1", 3);
    expect(sound.kind).toBe("audio");
    expect(clip.volume).toBe(100);
    expect(clip.muted).toBe(false);
    expect(classifyFile({ type: "audio/mpeg" })).toBe("audio");
  });

  it("preserves true 4K canvas dimensions while the browser preview can remain scaled", () => {
    expect(canvasForPreset("four-k-landscape")).toMatchObject({ aspectRatio: "16:9", width: 3840, height: 2160 });
    expect(canvasForPreset("four-k-vertical")).toMatchObject({ aspectRatio: "9:16", width: 2160, height: 3840 });
    expect(canvasForPreset("four-k-square")).toMatchObject({ aspectRatio: "1:1", width: 2160, height: 2160 });
  });

  it("ripple-deletes only later clips on the selected track and creates portable backups", () => {
    const project = createEmptyProject();
    const first = createClip(asset, "video-1", 0);
    const second = createClip(asset, "video-1", 12);
    const overlay = createClip(asset, "overlay-1", 12);
    const afterDelete = removeClip({ ...project, clips: [first, second, overlay] }, first.id, true);
    expect(afterDelete.clips.find(clip => clip.id === second.id)?.start).toBe(2);
    expect(afterDelete.clips.find(clip => clip.id === overlay.id)?.start).toBe(12);
    expect(serializableProject(afterDelete).format).toBe("revrse-editor-project-v1");
  });
});
