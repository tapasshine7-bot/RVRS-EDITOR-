import { describe, expect, it } from "vitest";
import { getRecordingCapabilities, nextExportPreparationProgress } from "./export-preparation";

describe("export preparation helpers", () => {
  it("reports browser recording capability without claiming a final render", () => {
    expect(getRecordingCapabilities()).toEqual({ webm: false, mp4: false });
    expect(getRecordingCapabilities(mimeType => mimeType.startsWith("video/webm"))).toEqual({ webm: true, mp4: false });
  });

  it("moves preparation progress toward completion without exceeding 100 percent", () => {
    expect(nextExportPreparationProgress(8)).toBe(21);
    expect(nextExportPreparationProgress(60)).toBe(67);
    expect(nextExportPreparationProgress(95)).toBe(100);
    expect(nextExportPreparationProgress(200)).toBe(100);
  });
});
