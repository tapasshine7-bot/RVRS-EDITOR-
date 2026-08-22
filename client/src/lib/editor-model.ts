export type AssetKind = "video" | "audio" | "image" | "text" | "element" | "unknown";

export type CanvasRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9" | "4:3" | "custom";
export type CanvasPresetId = "vertical-hd" | "widescreen-hd" | "square-hd" | "portrait-hd" | "cinematic-hd" | "four-k-landscape" | "four-k-vertical" | "four-k-square" | "custom";
export type TrackType = "video" | "audio" | "text" | "overlay" | "adjustment";
export type ClipFilter = "none" | "cinematic" | "mono" | "warm" | "vintage" | "neon" | "dream";
export type KeyframeProperty = "opacity" | "scale" | "positionX" | "positionY" | "rotation" | "blur" | "exposure";

export type EditorAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  url: string;
  size: number;
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  createdAt?: number;
  favorite?: boolean;
};

export type Keyframe = {
  id: string;
  at: number;
  property: KeyframeProperty;
  value: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

export type Marker = { id: string; at: number; label: string; color: string };

export type ClipEffect = "film-grain" | "vignette" | "letterbox" | "bloom" | "rgb-split" | "scanlines" | "vhs" | "shake" | "none";
export type TransitionName = "none" | "fade" | "slide" | "push" | "zoom" | "flash" | "glitch";

export type TimelineClip = {
  id: string;
  assetId: string;
  name: string;
  kind: AssetKind;
  trackId: string;
  start: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  opacity: number;
  scale: number;
  positionX: number;
  positionY: number;
  rotation: number;
  blur: number;
  crop: number;
  speed: number;
  volume: number;
  muted: boolean;
  flipX: boolean;
  flipY: boolean;
  reversed: boolean;
  frozen: boolean;
  filter: ClipFilter;
  effect: ClipEffect;
  transitionIn: TransitionName;
  transitionOut: TransitionName;
  transitionDuration: number;
  keyframes: Keyframe[];
  textContent?: string;
  textStyle?: "headline" | "lower-third" | "caption" | "chapter";
  groupId?: string;
};

export type TimelineTrack = {
  id: string;
  label: string;
  type: TrackType;
  color: string;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
};

export type CaptionSegment = { id: string; start: number; end: number; text: string; style: "minimal" | "bold" | "highlight" | "cinematic" };

export type ProjectVersion = { id: string; label: string; savedAt: number; project: Omit<EditorProject, "versions"> };

export type EditorProject = {
  id: string;
  name: string;
  aspectRatio: CanvasRatio;
  canvas: { width: number; height: number; fps: number; background: string };
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: Marker[];
  captions: CaptionSegment[];
  versions: ProjectVersion[];
  updatedAt: number;
  createdAt: number;
};

const trackSeed: Array<Pick<TimelineTrack, "id" | "label" | "type" | "color">> = [
  { id: "video-1", label: "Primary video", type: "video", color: "#22d3ee" },
  { id: "audio-1", label: "Licensed sound", type: "audio", color: "#34d399" },
  { id: "overlay-1", label: "Overlays", type: "overlay", color: "#a78bfa" },
  { id: "text-1", label: "Titles & captions", type: "text", color: "#fbbf24" },
  { id: "adjustment-1", label: "Adjustment", type: "adjustment", color: "#fb7185" },
];

export const defaultTracks: TimelineTrack[] = trackSeed.map(track => ({ ...track, locked: false, hidden: false, muted: false, solo: false }));

const ratioCanvas: Record<Exclude<CanvasRatio, "custom">, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "21:9": { width: 2560, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
};

export const canvasPresets: Array<{ id: CanvasPresetId; label: string; description: string; aspectRatio: CanvasRatio; width: number; height: number }> = [
  { id: "vertical-hd", label: "Vertical HD", description: "1080 × 1920", aspectRatio: "9:16", width: 1080, height: 1920 },
  { id: "widescreen-hd", label: "Widescreen HD", description: "1920 × 1080", aspectRatio: "16:9", width: 1920, height: 1080 },
  { id: "square-hd", label: "Square HD", description: "1080 × 1080", aspectRatio: "1:1", width: 1080, height: 1080 },
  { id: "portrait-hd", label: "Portrait HD", description: "1080 × 1350", aspectRatio: "4:5", width: 1080, height: 1350 },
  { id: "cinematic-hd", label: "Cinematic", description: "2560 × 1080", aspectRatio: "21:9", width: 2560, height: 1080 },
  { id: "four-k-landscape", label: "4K landscape", description: "3840 × 2160", aspectRatio: "16:9", width: 3840, height: 2160 },
  { id: "four-k-vertical", label: "4K vertical", description: "2160 × 3840", aspectRatio: "9:16", width: 2160, height: 3840 },
  { id: "four-k-square", label: "4K square", description: "2160 × 2160", aspectRatio: "1:1", width: 2160, height: 2160 },
  { id: "custom", label: "Custom", description: "Set your own canvas", aspectRatio: "custom", width: 1920, height: 1080 },
];

export function canvasForPreset(id: CanvasPresetId) {
  const preset = canvasPresets.find(item => item.id === id) ?? canvasPresets[1];
  return { aspectRatio: preset.aspectRatio, width: preset.width, height: preset.height };
}

export function canvasForRatio(aspectRatio: CanvasRatio) {
  return aspectRatio === "custom" ? { width: 1920, height: 1080 } : ratioCanvas[aspectRatio];
}

export function createEmptyProject(options: Partial<Pick<EditorProject, "name" | "aspectRatio">> & { canvas?: Partial<EditorProject["canvas"]> } = {}): EditorProject {
  const aspectRatio = options.aspectRatio ?? "16:9";
  const canvas = { ...canvasForRatio(aspectRatio), ...options.canvas };
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: options.name?.trim() || "Untitled project",
    aspectRatio,
    canvas: { ...canvas, fps: options.canvas?.fps ?? 30, background: options.canvas?.background ?? "#050608" },
    tracks: defaultTracks.map(track => ({ ...track })),
    clips: [],
    markers: [],
    captions: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isRatio(value: unknown): value is CanvasRatio {
  return value === "16:9" || value === "9:16" || value === "1:1" || value === "4:5" || value === "21:9" || value === "4:3" || value === "custom";
}

function isTrackType(value: unknown): value is TrackType {
  return value === "video" || value === "audio" || value === "text" || value === "overlay" || value === "adjustment";
}

function normalizeTrack(value: unknown, index: number): TimelineTrack {
  const fallback = defaultTracks[index % defaultTracks.length];
  const candidate = value && typeof value === "object" ? value as Partial<TimelineTrack> : {};
  return {
    id: typeof candidate.id === "string" ? candidate.id : `${fallback.id}-${index}`,
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : fallback.label,
    type: isTrackType(candidate.type) ? candidate.type : fallback.type,
    color: typeof candidate.color === "string" ? candidate.color : fallback.color,
    locked: Boolean(candidate.locked),
    hidden: Boolean(candidate.hidden),
    muted: Boolean(candidate.muted),
    solo: Boolean(candidate.solo),
  };
}

function normalizeKeyframe(value: unknown): Keyframe | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Keyframe>;
  const propertyMap: Record<string, KeyframeProperty> = { opacity: "opacity", scale: "scale", position: "positionX", positionX: "positionX", positionY: "positionY", rotation: "rotation", blur: "blur", exposure: "exposure" };
  if (typeof item.id !== "string" || typeof item.at !== "number" || typeof item.value !== "number" || !item.property) return null;
  const property = propertyMap[String(item.property)];
  if (!property) return null;
  return { id: item.id, at: Math.max(0, item.at), value: item.value, property, easing: item.easing === "ease-in" || item.easing === "ease-out" || item.easing === "ease-in-out" ? item.easing : "linear" };
}

function normalizeClip(value: unknown, trackIds: Set<string>): TimelineClip | null {
  if (!value || typeof value !== "object") return null;
  const clip = value as Partial<TimelineClip>;
  if (typeof clip.id !== "string" || typeof clip.trackId !== "string" || !trackIds.has(clip.trackId)) return null;
  const kind: AssetKind = clip.kind === "video" || clip.kind === "audio" || clip.kind === "image" || clip.kind === "text" || clip.kind === "element" ? clip.kind : "unknown";
  const filter: ClipFilter = clip.filter === "cinematic" || clip.filter === "mono" || clip.filter === "warm" || clip.filter === "vintage" || clip.filter === "neon" || clip.filter === "dream" ? clip.filter : "none";
  const effect: ClipEffect = clip.effect === "film-grain" || clip.effect === "vignette" || clip.effect === "letterbox" || clip.effect === "bloom" || clip.effect === "rgb-split" || clip.effect === "scanlines" || clip.effect === "vhs" || clip.effect === "shake" ? clip.effect : "none";
  const transition = (value: unknown): TransitionName => value === "fade" || value === "slide" || value === "push" || value === "zoom" || value === "flash" || value === "glitch" ? value : "none";
  return {
    id: clip.id,
    assetId: typeof clip.assetId === "string" ? clip.assetId : `missing-${clip.id}`,
    name: typeof clip.name === "string" ? clip.name : "Untitled clip",
    kind,
    trackId: clip.trackId,
    start: typeof clip.start === "number" ? Math.max(0, clip.start) : 0,
    duration: typeof clip.duration === "number" ? Math.max(0.2, clip.duration) : 5,
    trimStart: typeof clip.trimStart === "number" ? Math.max(0, clip.trimStart) : 0,
    trimEnd: typeof clip.trimEnd === "number" ? Math.max(0, clip.trimEnd) : 0,
    opacity: typeof clip.opacity === "number" ? Math.min(100, Math.max(0, clip.opacity)) : 100,
    scale: typeof clip.scale === "number" ? Math.min(400, Math.max(10, clip.scale)) : 100,
    positionX: typeof clip.positionX === "number" ? clip.positionX : 0,
    positionY: typeof clip.positionY === "number" ? clip.positionY : 0,
    rotation: typeof clip.rotation === "number" ? clip.rotation : 0,
    blur: typeof clip.blur === "number" ? Math.max(0, clip.blur) : 0,
    crop: typeof clip.crop === "number" ? Math.min(50, Math.max(0, clip.crop)) : 0,
    speed: typeof clip.speed === "number" && clip.speed > 0 ? Math.min(4, clip.speed) : 1,
    volume: typeof clip.volume === "number" ? Math.min(100, Math.max(0, clip.volume)) : kind === "audio" ? 100 : 0,
    muted: kind === "audio" ? Boolean(clip.muted) : true,
    flipX: Boolean(clip.flipX),
    flipY: Boolean(clip.flipY),
    reversed: Boolean(clip.reversed),
    frozen: Boolean(clip.frozen),
    filter,
    effect,
    transitionIn: transition(clip.transitionIn),
    transitionOut: transition(clip.transitionOut),
    transitionDuration: typeof clip.transitionDuration === "number" ? Math.min(2, Math.max(0.1, clip.transitionDuration)) : 0.35,
    keyframes: Array.isArray(clip.keyframes) ? clip.keyframes.map(normalizeKeyframe).filter((item): item is Keyframe => Boolean(item)) : [],
    textContent: typeof clip.textContent === "string" ? clip.textContent : undefined,
    textStyle: clip.textStyle === "headline" || clip.textStyle === "lower-third" || clip.textStyle === "caption" || clip.textStyle === "chapter" ? clip.textStyle : undefined,
    groupId: typeof clip.groupId === "string" ? clip.groupId : undefined,
  };
}

export function normalizeProject(value: unknown): EditorProject {
  const fallback = createEmptyProject();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<EditorProject>;
  const aspectRatio = isRatio(candidate.aspectRatio) ? candidate.aspectRatio : fallback.aspectRatio;
  const tracks = Array.isArray(candidate.tracks) && candidate.tracks.length ? candidate.tracks.map(normalizeTrack) : defaultTracks.map(track => ({ ...track }));
  const trackIds = new Set(tracks.map(track => track.id));
  const clips = Array.isArray(candidate.clips) ? candidate.clips.map(item => normalizeClip(item, trackIds)).filter((item): item is TimelineClip => Boolean(item)) : [];
  const inferredCanvas = canvasForRatio(aspectRatio);
  const rawCanvas = candidate.canvas && typeof candidate.canvas === "object" ? candidate.canvas : {};
  const canvasCandidate = rawCanvas as Partial<EditorProject["canvas"]>;
  return {
    ...fallback,
    id: typeof candidate.id === "string" ? candidate.id : fallback.id,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 100) : fallback.name,
    aspectRatio,
    canvas: {
      width: typeof canvasCandidate.width === "number" ? Math.min(7680, Math.max(160, canvasCandidate.width)) : inferredCanvas.width,
      height: typeof canvasCandidate.height === "number" ? Math.min(7680, Math.max(160, canvasCandidate.height)) : inferredCanvas.height,
      fps: canvasCandidate.fps === 24 || canvasCandidate.fps === 25 || canvasCandidate.fps === 30 || canvasCandidate.fps === 60 ? canvasCandidate.fps : 30,
      background: typeof canvasCandidate.background === "string" ? canvasCandidate.background : "#050608",
    },
    tracks,
    clips,
    markers: Array.isArray(candidate.markers) ? candidate.markers.filter((item): item is Marker => Boolean(item && typeof item === "object" && typeof (item as Marker).id === "string" && typeof (item as Marker).at === "number")).map(item => ({ ...item, label: typeof item.label === "string" ? item.label : "Marker", color: typeof item.color === "string" ? item.color : "#fbbf24" })) : [],
    captions: Array.isArray(candidate.captions) ? candidate.captions.filter((item): item is CaptionSegment => Boolean(item && typeof item === "object" && typeof (item as CaptionSegment).id === "string" && typeof (item as CaptionSegment).text === "string")).map(item => ({ ...item, end: Math.max(item.start + 0.1, item.end), style: item.style === "bold" || item.style === "highlight" || item.style === "cinematic" ? item.style : "minimal" })) : [],
    versions: [],
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : fallback.createdAt,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : fallback.updatedAt,
  };
}

export function normalizeAssets(value: unknown): EditorAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((asset): asset is EditorAsset => Boolean(asset && typeof asset === "object" && typeof (asset as EditorAsset).id === "string" && typeof (asset as EditorAsset).name === "string")).map(asset => ({
    ...asset,
    url: "",
    kind: asset.kind === "video" || asset.kind === "audio" || asset.kind === "image" || asset.kind === "text" || asset.kind === "element" ? asset.kind : "unknown",
    size: typeof asset.size === "number" ? Math.max(0, asset.size) : 0,
    duration: typeof asset.duration === "number" ? Math.max(0, asset.duration) : 0,
  }));
}

export function classifyFile(file: Pick<File, "type">): AssetKind {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "image/gif") return "image";
  return "unknown";
}

export function needsAudioRightsConfirmation(files: ReadonlyArray<Pick<File, "type">>, rightsConfirmed: boolean): boolean {
  return !rightsConfirmed && files.some(file => classifyFile(file) === "audio");
}

export function preferredVoiceOverMimeType(isSupported: (type: string) => boolean): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(isSupported);
}

export function getVoiceOverUnavailableMessage(options: { hasGetUserMedia: boolean; hasMediaRecorder: boolean }): string | null {
  if (!options.hasGetUserMedia || !options.hasMediaRecorder) return "Voice-over recording is not supported by this browser. Import an original or licensed audio file instead.";
  return null;
}

export function getVoiceOverStartErrorMessage(errorName?: string): string {
  return errorName === "NotAllowedError" ? "Microphone permission was not granted." : "Voice-over recording could not start.";
}

export function shouldKeepVoiceOverRecording(options: { discard: boolean; chunkCount: number }): boolean {
  return !options.discard && options.chunkCount > 0;
}

export function getLocalWorkspaceStatus(project: Pick<EditorProject, "clips" | "tracks">) {
  const clipCount = project.clips.length;
  const trackCount = project.tracks.length;
  return {
    label: "Local" as const,
    detail: `${clipCount} ${clipCount === 1 ? "clip" : "clips"}`,
    ariaLabel: `${clipCount} ${clipCount === 1 ? "clip" : "clips"} · ${trackCount} ${trackCount === 1 ? "track" : "tracks"} · browser-local`,
  };
}

export function isWorkspacePanelActive<T extends string>(activePanel: T, panel: T): boolean {
  return activePanel === panel;
}

export function createClip(asset: EditorAsset, trackId: string, start: number, overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    trackId,
    start: Math.max(0, start),
    duration: Math.max(asset.duration || (asset.kind === "image" ? 5 : 8), 0.5),
    trimStart: 0,
    trimEnd: 0,
    opacity: 100,
    scale: 100,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    blur: 0,
    crop: 0,
    speed: 1,
    volume: asset.kind === "audio" ? 100 : 0,
    muted: asset.kind !== "audio",
    flipX: false,
    flipY: false,
    reversed: false,
    frozen: false,
    filter: "none",
    effect: "none",
    transitionIn: "none",
    transitionOut: "none",
    transitionDuration: 0.35,
    keyframes: [],
    ...overrides,
  };
}

export function getVisibleDuration(clip: TimelineClip): number {
  return Math.max(0.1, (clip.duration - clip.trimStart - clip.trimEnd) / Math.max(0.1, clip.speed));
}

export function projectDuration(project: EditorProject): number {
  return Math.max(10, ...project.clips.map(clip => clip.start + getVisibleDuration(clip)));
}

export function updateClip(project: EditorProject, clipId: string, changes: Partial<TimelineClip>): EditorProject {
  return { ...project, updatedAt: Date.now(), clips: project.clips.map(clip => clip.id === clipId ? { ...clip, ...changes } : clip) };
}

export function removeClip(project: EditorProject, clipId: string, ripple = false): EditorProject {
  const target = project.clips.find(clip => clip.id === clipId);
  if (!target) return project;
  const offset = getVisibleDuration(target);
  return {
    ...project,
    updatedAt: Date.now(),
    clips: project.clips.filter(clip => clip.id !== clipId).map(clip => ripple && clip.trackId === target.trackId && clip.start >= target.start ? { ...clip, start: Math.max(0, clip.start - offset) } : clip),
  };
}

export function duplicateClip(project: EditorProject, clipId: string, start?: number): EditorProject {
  const original = project.clips.find(clip => clip.id === clipId);
  if (!original) return project;
  const copy = { ...original, id: crypto.randomUUID(), start: start ?? original.start + getVisibleDuration(original) + 0.15, name: `${original.name} copy` };
  return { ...project, updatedAt: Date.now(), clips: [...project.clips, copy] };
}

export function splitClip(project: EditorProject, clipId: string, at: number): EditorProject {
  const original = project.clips.find(clip => clip.id === clipId);
  if (!original) return project;
  const relativeAt = at - original.start;
  const visibleDuration = getVisibleDuration(original);
  if (relativeAt <= 0.1 || relativeAt >= visibleDuration - 0.1) return project;
  const sourceSplit = relativeAt * original.speed;
  const first: TimelineClip = { ...original, id: crypto.randomUUID(), trimEnd: original.trimEnd + (original.duration - original.trimStart - original.trimEnd - sourceSplit) };
  const second: TimelineClip = { ...original, id: crypto.randomUUID(), start: at, trimStart: original.trimStart + sourceSplit };
  return { ...project, updatedAt: Date.now(), clips: project.clips.flatMap(clip => clip.id === clipId ? [first, second] : [clip]) };
}

export function addKeyframe(clip: TimelineClip, keyframe: Keyframe): TimelineClip {
  const withoutDuplicate = clip.keyframes.filter(item => !(item.property === keyframe.property && Math.abs(item.at - keyframe.at) < 0.01));
  return { ...clip, keyframes: [...withoutDuplicate, keyframe].sort((a, b) => a.at - b.at) };
}

export function addTrack(project: EditorProject, type: TrackType): EditorProject {
  const number = project.tracks.filter(track => track.type === type).length + 1;
  const color: Record<TrackType, string> = { video: "#22d3ee", audio: "#34d399", text: "#fbbf24", overlay: "#a78bfa", adjustment: "#fb7185" };
  const label: Record<TrackType, string> = { video: "Video", audio: "Sound", text: "Text", overlay: "Overlay", adjustment: "Adjustment" };
  const track: TimelineTrack = { id: `${type}-${crypto.randomUUID()}`, label: `${label[type]} ${number}`, type, color: color[type], locked: false, hidden: false, muted: type !== "audio", solo: false };
  return { ...project, tracks: [...project.tracks, track], updatedAt: Date.now() };
}

export function updateTrack(project: EditorProject, trackId: string, changes: Partial<TimelineTrack>): EditorProject {
  return { ...project, tracks: project.tracks.map(track => track.id === trackId ? { ...track, ...changes } : track), updatedAt: Date.now() };
}

export function addMarker(project: EditorProject, at: number, label = "Marker"): EditorProject {
  return { ...project, updatedAt: Date.now(), markers: [...project.markers, { id: crypto.randomUUID(), at: Math.max(0, at), label, color: "#fbbf24" }].sort((a, b) => a.at - b.at) };
}

export function serializableProject(project: EditorProject) {
  return { ...project, versions: [], exportedAt: new Date().toISOString(), format: "revrse-editor-project-v1" };
}
