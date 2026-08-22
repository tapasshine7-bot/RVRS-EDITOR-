export type RecordingCapabilities = { webm: boolean; mp4: boolean };

export function getRecordingCapabilities(isTypeSupported?: (mimeType: string) => boolean): RecordingCapabilities {
  if (!isTypeSupported) return { webm: false, mp4: false };
  return {
    webm: isTypeSupported("video/webm;codecs=vp9,opus"),
    mp4: isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2"),
  };
}

export function nextExportPreparationProgress(current: number): number {
  const safeCurrent = Math.min(100, Math.max(0, current));
  return Math.min(100, safeCurrent + (safeCurrent < 58 ? 13 : 7));
}
