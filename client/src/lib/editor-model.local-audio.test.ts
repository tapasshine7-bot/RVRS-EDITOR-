import { describe, expect, it } from "vitest";
import { getLocalWorkspaceStatus, getVoiceOverStartErrorMessage, getVoiceOverUnavailableMessage, isWorkspacePanelActive, needsAudioRightsConfirmation, preferredVoiceOverMimeType, shouldKeepVoiceOverRecording } from "./editor-model";

describe("browser-local original audio safeguards", () => {
  it("requires an explicit rights confirmation only when an import includes audio", () => {
    expect(needsAudioRightsConfirmation([{ type: "audio/mpeg" }], false)).toBe(true);
    expect(needsAudioRightsConfirmation([{ type: "audio/mpeg" }], true)).toBe(false);
    expect(needsAudioRightsConfirmation([{ type: "video/mp4" }, { type: "image/png" }], false)).toBe(false);
  });

  it("selects the first supported browser-local voice-over MIME type", () => {
    expect(preferredVoiceOverMimeType(type => type === "audio/webm")).toBe("audio/webm");
    expect(preferredVoiceOverMimeType(() => false)).toBeUndefined();
  });

  it("handles unsupported and denied microphone states without starting a recording", () => {
    expect(getVoiceOverUnavailableMessage({ hasGetUserMedia: false, hasMediaRecorder: true })).toContain("not supported");
    expect(getVoiceOverUnavailableMessage({ hasGetUserMedia: true, hasMediaRecorder: false })).toContain("not supported");
    expect(getVoiceOverUnavailableMessage({ hasGetUserMedia: true, hasMediaRecorder: true })).toBeNull();
    expect(getVoiceOverStartErrorMessage("NotAllowedError")).toBe("Microphone permission was not granted.");
    expect(getVoiceOverStartErrorMessage("AbortError")).toBe("Voice-over recording could not start.");
  });

  it("does not retain a discarded or empty voice-over recording", () => {
    expect(shouldKeepVoiceOverRecording({ discard: true, chunkCount: 2 })).toBe(false);
    expect(shouldKeepVoiceOverRecording({ discard: false, chunkCount: 0 })).toBe(false);
    expect(shouldKeepVoiceOverRecording({ discard: false, chunkCount: 1 })).toBe(true);
  });

  it("reports local workspace status and active sidebar panel deterministically", () => {
    const status = getLocalWorkspaceStatus({ clips: [{ id: "clip-1" }], tracks: [{ id: "audio-1" }, { id: "video-1" }] });
    expect(status).toEqual({ label: "Local", detail: "1 clip", ariaLabel: "1 clip · 2 tracks · browser-local" });
    expect(isWorkspacePanelActive("media", "media")).toBe(true);
    expect(isWorkspacePanelActive("media", "sounds")).toBe(false);
  });
});
