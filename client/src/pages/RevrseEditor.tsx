import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { trpc } from "@/lib/trpc";
import { findProjects, getProjectFinderStats, ProjectFinderSort } from "@/lib/project-finder";
import {
  addKeyframe,
  addMarker,
  addTrack,
  CanvasRatio,
  CaptionSegment,
  canvasPresets,
  classifyFile,
  createClip,
  createEmptyProject,
  duplicateClip,
  EditorAsset,
  EditorProject,
  getVisibleDuration,
  normalizeAssets,
  normalizeProject,
  projectDuration,
  removeClip,
  serializableProject,
  splitClip,
  TimelineClip,
  TimelineTrack,
  updateClip,
  updateTrack,
} from "@/lib/editor-model";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDot,
  Clapperboard,
  Clock3,
  Command as CommandIcon,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Film,
  FlipHorizontal2,
  FolderOpen,
  Grid2X2,
  ImageIcon,
  Keyboard,
  Layers3,
  List,
  Lock,
  Magnet,
  Maximize2,
  Music2,
  MousePointer2,
  PanelBottom,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Split,
  SquareStack,
  Star,
  StepBack,
  StepForward,
  Subtitles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const PROJECT_STORAGE_KEY = "revrse-editor-local-project";
const ASSET_STORAGE_KEY = "revrse-editor-local-assets";
const RECENT_STORAGE_KEY = "revrse-editor-recent-projects";
const LEGACY_PROJECT_STORAGE_KEY = "vyra-edit-local-project";
const LEGACY_ASSET_STORAGE_KEY = "vyra-edit-local-asset-list";
const MAX_FILE_SIZE = 750 * 1024 * 1024;
const DEFAULT_PX_PER_SECOND = 72;

type EditorMode = "dashboard" | "editor";
type Panel = "media" | "text" | "captions" | "effects" | "transitions" | "templates" | "elements" | "search" | "movies" | "sounds" | "studio" | "assistant";
type Tool = "select" | "razor" | "hand";
type RecentProject = { id: string; name: string; updatedAt: number; createdAt: number; duration: number; canvas: EditorProject["canvas"]; aspectRatio: CanvasRatio; projectData: ReturnType<typeof serializableProject> };
type ServerProjectSummary = { id: number; title: string; durationMs: number; updatedAt: Date; thumbnailKey: string | null };
type SharedVideoResource = { id: number; title: string; description: string; category: string; url: string; originalName: string; mimeType: string; byteSize: number; durationMs: number; width: number; height: number; creatorName: string | null };
type SharedSoundResource = { id: number; title: string; description: string; category: string; url: string; originalName: string; mimeType: string; byteSize: number; durationMs: number; creatorName: string | null };
type SharedTemplateResource = { id: number; title: string; description: string; category: string; aspectRatio: string; creatorName: string | null };
type MovieResult = { id: number; title: string; year: string; genre: string; artworkUrl: string; storeUrl: string; previewUrl: string };
type CommunityResource = { type: "template" | "video" | "sound"; id: number; title: string };
type CommunityReviewData = { summary: { average: number | null; count: number }; reviews: Array<{ id: number; userId: number; stars: number; body: string; createdAt: Date; updatedAt: Date; reviewerName: string | null; canManage: boolean }> };

const panelItems: Array<{ id: Panel; label: string; icon: typeof FolderOpen }> = [
  { id: "media", label: "Media", icon: FolderOpen },
  { id: "text", label: "Text", icon: Type },
  { id: "captions", label: "Captions", icon: Subtitles },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "transitions", label: "Transitions", icon: Split },
  { id: "templates", label: "Templates", icon: SquareStack },
  { id: "elements", label: "Elements", icon: Layers3 },
  { id: "search", label: "Search", icon: Search },
  { id: "movies", label: "Dialogue", icon: Film },
  { id: "sounds", label: "Sounds", icon: Music2 },
  { id: "studio", label: "Studio", icon: Star },
  { id: "assistant", label: "Edit assistant", icon: WandSparkles },
];

const templateRecipes = [
  { name: "Vertical momentum", category: "Social", ratio: "9:16" as CanvasRatio, duration: "12s", clips: 3, color: "from-cyan-400/30 via-slate-950 to-fuchsia-500/20", style: "headline" as const },
  { name: "Cinematic chapter", category: "Cinematic", ratio: "16:9" as CanvasRatio, duration: "18s", clips: 4, color: "from-amber-300/25 via-slate-950 to-rose-500/20", style: "chapter" as const },
  { name: "Clean product card", category: "Promotion", ratio: "4:5" as CanvasRatio, duration: "10s", clips: 2, color: "from-emerald-300/25 via-slate-950 to-cyan-500/20", style: "lower-third" as const },
];

const transitionOptions: Array<{ id: TimelineClip["transitionOut"]; label: string; description: string }> = [
  { id: "fade", label: "Fade", description: "Soft dissolve between edits" },
  { id: "slide", label: "Slide", description: "Directional handoff" },
  { id: "push", label: "Push", description: "Layered movement" },
  { id: "zoom", label: "Zoom", description: "Scale into the next clip" },
  { id: "flash", label: "Flash", description: "High-energy accent" },
  { id: "glitch", label: "Glitch", description: "Digital distortion accent" },
];

const effectOptions: Array<{ id: TimelineClip["effect"]; label: string; description: string }> = [
  { id: "film-grain", label: "Film grain", description: "Fine analogue texture" },
  { id: "vignette", label: "Vignette", description: "Focus the frame edge" },
  { id: "letterbox", label: "Letterbox", description: "Cinematic frame bars" },
  { id: "bloom", label: "Bloom", description: "Highlight glow" },
  { id: "rgb-split", label: "RGB split", description: "Colour-channel offset" },
  { id: "scanlines", label: "Scanlines", description: "Digital scan texture" },
  { id: "vhs", label: "VHS", description: "Retro signal treatment" },
  { id: "shake", label: "Camera shake", description: "Motion emphasis" },
];

function safeRead(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function hydrateProject(): EditorProject {
  try {
    const current = safeRead(PROJECT_STORAGE_KEY);
    if (current) return normalizeProject(JSON.parse(current));
    const legacy = safeRead(LEGACY_PROJECT_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeProject(JSON.parse(legacy));
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Invalid browser-local state must never prevent the editor from starting.
  }
  return createEmptyProject();
}

function hydrateAssets(): EditorAsset[] {
  try {
    const current = safeRead(ASSET_STORAGE_KEY);
    if (current) return normalizeAssets(JSON.parse(current));
    const legacy = safeRead(LEGACY_ASSET_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeAssets(JSON.parse(legacy));
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Fall through to a safe empty media bin.
  }
  return [];
}

function hydrateRecents(): RecentProject[] {
  try {
    const value = JSON.parse(safeRead(RECENT_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is RecentProject => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string")) : [];
  } catch { return []; }
}

function formatTime(value: number) {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  const frames = Math.floor((safeValue % 1) * 30);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function formatSrtTime(value: number) {
  const total = Math.max(0, Math.floor(value * 1000));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milliseconds = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function formatSize(bytes: number) {
  if (!bytes) return "Generated";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function aspectClass(ratio: CanvasRatio) {
  if (ratio === "9:16") return "aspect-[9/16] max-w-[22rem]";
  if (ratio === "1:1") return "aspect-square max-w-[38rem]";
  if (ratio === "4:5") return "aspect-[4/5] max-w-[31rem]";
  if (ratio === "21:9") return "aspect-[21/9]";
  if (ratio === "4:3") return "aspect-[4/3] max-w-[52rem]";
  return "aspect-video";
}

function clipFilter(clip: TimelineClip | null) {
  if (!clip) return "";
  const filters: Record<TimelineClip["filter"], string> = { none: "", cinematic: "contrast-[1.18] saturate-[.78]", mono: "grayscale", warm: "sepia-[.28] saturate-125", vintage: "sepia-[.48] contrast-90", neon: "contrast-125 saturate-150", dream: "brightness-110 saturate-75" };
  return filters[clip.filter];
}

function isActiveAt(clip: TimelineClip, at: number) {
  return at >= clip.start && at <= clip.start + getVisibleDuration(clip);
}

function assetIcon(kind: EditorAsset["kind"]) {
  return kind === "video" ? <Video className="h-4 w-4" /> : kind === "image" ? <ImageIcon className="h-4 w-4" /> : <Type className="h-4 w-4" />;
}

function buildDemoProject() {
  const project = createEmptyProject({ name: "REVRSE Motion Study", aspectRatio: "9:16" });
  const hero: EditorAsset = { id: crypto.randomUUID(), name: "REVRSE / Motion", kind: "text", url: "", size: 0, duration: 4, createdAt: Date.now() };
  const subtitle: EditorAsset = { id: crypto.randomUUID(), name: "Editable typography", kind: "text", url: "", size: 0, duration: 4, createdAt: Date.now() };
  project.clips = [
    createClip(hero, "text-1", 0, { textContent: "REVRSE", textStyle: "headline", filter: "neon", effect: "bloom", transitionOut: "flash" }),
    createClip(subtitle, "text-1", 4.2, { textContent: "AN EDITABLE MOTION STUDY", textStyle: "caption", filter: "cinematic", effect: "film-grain", transitionIn: "fade" }),
  ];
  project.markers = [{ id: crypto.randomUUID(), at: 4, label: "Title change", color: "#fbbf24" }];
  return { project, assets: [hero, subtitle] };
}

export default function RevrseEditor() {
  const { data: currentUser } = trpc.auth.me.useQuery();
  const [mode, setMode] = useState<EditorMode>("dashboard");
  const [project, setProject] = useState<EditorProject>(hydrateProject);
  const [assets, setAssets] = useState<EditorAsset[]>(hydrateAssets);
  const [recents, setRecents] = useState<RecentProject[]>(hydrateRecents);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>("media");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<EditorProject[]>([]);
  const [future, setFuture] = useState<EditorProject[]>([]);
  const [search, setSearch] = useState("");
  const [assetView, setAssetView] = useState<"grid" | "list">("grid");
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [previewScale, setPreviewScale] = useState(100);
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_PX_PER_SECOND);
  const [tool, setTool] = useState<Tool>("select");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("Add an editable caption");
  const [assistantCommand, setAssistantCommand] = useState("");
  const [keyframeProperty, setKeyframeProperty] = useState<TimelineClip["keyframes"][number]["property"]>("opacity");
  const [clipClipboard, setClipClipboard] = useState<TimelineClip | null>(null);
  const [serverProjectId, setServerProjectId] = useState<number | null>(null);
  const [requestedServerProjectId, setRequestedServerProjectId] = useState<number | null>(null);
  const [movieQuery, setMovieQuery] = useState("");
  const [communityResource, setCommunityResource] = useState<CommunityResource | null>(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const selectedClip = project.clips.find(clip => clip.id === selectedClipId) ?? null;
  const selectedAsset = selectedClip ? assets.find(asset => asset.id === selectedClip.assetId) : undefined;
  const activeVisualClip = project.clips.find(clip => (clip.kind === "video" || clip.kind === "image") && isActiveAt(clip, currentTime)) ?? selectedClip;
  const previewAsset = activeVisualClip ? assets.find(asset => asset.id === activeVisualClip.assetId) : undefined;
  const duration = projectDuration(project);
  const visibleAssets = assets.filter(asset => asset.name.toLowerCase().includes(search.toLowerCase()));
  const activeTextClips = project.clips.filter(clip => clip.kind === "text" && isActiveAt(clip, currentTime));
  const pxPerSecond = Math.max(36, Math.min(140, timelineZoom));
  const ruler = useMemo(() => Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, index) => index * 5), [duration]);
  const serverProjects = trpc.editorProjects.list.useQuery(undefined, { enabled: Boolean(currentUser), retry: false });
  const requestedServerProject = trpc.editorProjects.get.useQuery({ id: requestedServerProjectId ?? 1 }, { enabled: Boolean(currentUser && requestedServerProjectId), retry: false });
  const saveServerProject = trpc.editorProjects.save.useMutation();
  const sharedTemplates = trpc.templateStudio.listTemplates.useQuery(undefined, { retry: false });
  const sharedVideos = trpc.templateStudio.listVideos.useQuery(undefined, { retry: false });
  const sharedSounds = trpc.templateStudio.listSounds.useQuery(undefined, { retry: false });
  const favoriteIds = trpc.templateStudio.favoriteIds.useQuery(undefined, { enabled: Boolean(currentUser), retry: false });
  const favoriteSoundIds = trpc.templateStudio.soundFavoriteIds.useQuery(undefined, { enabled: Boolean(currentUser), retry: false });
  const requestedSharedTemplate = trpc.templateStudio.getTemplate.useQuery({ id: communityResource?.type === "template" ? communityResource.id : 1 }, { enabled: Boolean(communityResource?.type === "template"), retry: false });
  const movieResults = trpc.movieDiscovery.search.useQuery({ query: movieQuery.trim() || "revrse", country: "IN" }, { enabled: movieQuery.trim().length >= 2, retry: false });
  const resourceReviews = trpc.templateStudio.listReviews.useQuery({ resourceType: communityResource?.type ?? "template", resourceId: communityResource?.id ?? 1 }, { enabled: Boolean(communityResource), retry: false });
  const toggleTemplateFavorite = trpc.templateStudio.toggleFavorite.useMutation();
  const toggleSoundFavoriteMutation = trpc.templateStudio.toggleSoundFavorite.useMutation();
  const publishSharedTemplate = trpc.templateStudio.publishTemplate.useMutation();
  const publishSharedVideo = trpc.templateStudio.publishVideo.useMutation();
  const publishSharedSound = trpc.templateStudio.publishSound.useMutation();
  const saveResourceReview = trpc.templateStudio.saveReview.useMutation();
  const deleteResourceReview = trpc.templateStudio.deleteReview.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    try { localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(serializableProject(project))); } catch { /* browser storage may be unavailable */ }
    const record: RecentProject = { id: project.id, name: project.name, updatedAt: project.updatedAt, createdAt: project.createdAt, duration: projectDuration(project), canvas: project.canvas, aspectRatio: project.aspectRatio, projectData: serializableProject(project) };
    setRecents(current => {
      const next = [record, ...current.filter(item => item.id !== record.id)].slice(0, 8);
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* local-only optional persistence */ }
      return next;
    });
  }, [project]);

  useEffect(() => {
    try { localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assets.map(({ url: _url, ...asset }) => asset))); } catch { /* local-only optional persistence */ }
  }, [assets]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setShowCommand(true); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveVersion(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedClipId) { event.preventDefault(); duplicateSelected(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") { event.preventDefault(); copySelectedClip(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") { event.preventDefault(); cutSelectedClip(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") { event.preventDefault(); pasteClip(); return; }
      if (event.key === " ") { event.preventDefault(); togglePlayback(); return; }
      if (event.key.toLowerCase() === "s" && selectedClipId) { event.preventDefault(); splitSelectedClip(); return; }
      if (event.key.toLowerCase() === "m") { event.preventDefault(); addProjectMarker(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelectedClip(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVisualClip || activeVisualClip.kind !== "video") return;
    const requestedTime = activeVisualClip.trimStart + Math.max(0, currentTime - activeVisualClip.start) * activeVisualClip.speed;
    if (Math.abs(video.currentTime - requestedTime) > 0.4) video.currentTime = Math.min(requestedTime, Number.isFinite(video.duration) ? video.duration : requestedTime);
  }, [activeVisualClip?.id, currentTime]);

  useEffect(() => {
    if (!requestedServerProject.data || requestedServerProjectId === null) return;
    try {
      const loaded = normalizeProject(requestedServerProject.data.projectData);
      openEditor(loaded, []);
      setServerProjectId(requestedServerProject.data.id);
      setRequestedServerProjectId(null);
      toast.success("Opened your account-saved project. Re-import local media files to restore browser previews.");
    } catch {
      setRequestedServerProjectId(null);
      toast.error("This saved project could not be restored. Your browser-local projects are still available.");
    }
  }, [requestedServerProject.data, requestedServerProjectId]);

  useEffect(() => {
    if (!requestedSharedTemplate.data || communityResource?.type !== "template") return;
    useSharedTemplate(requestedSharedTemplate.data.projectData);
  }, [requestedSharedTemplate.data, communityResource?.type]);

  function applyProject(next: EditorProject, saveHistory = true) {
    if (saveHistory) {
      setHistory(previous => [...previous.slice(-39), project]);
      setFuture([]);
    }
    setProject(next);
  }

  function updateProject(next: Partial<EditorProject>) {
    applyProject({ ...project, ...next, updatedAt: Date.now() });
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture(next => [project, ...next].slice(0, 40));
    setHistory(next => next.slice(0, -1));
    setProject(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory(previous => [...previous, project].slice(-40));
    setFuture(previous => previous.slice(1));
    setProject(next);
  }

  function openEditor(nextProject = project, nextAssets = assets) {
    setProject(normalizeProject(nextProject));
    setAssets(nextAssets);
    setHistory([]);
    setFuture([]);
    setSelectedClipId(null);
    setCurrentTime(0);
    setMode("editor");
  }

  function createProject(ratio: CanvasRatio) {
    openEditor(createEmptyProject({ aspectRatio: ratio }), []);
    toast.success(`New ${ratio} project created.`);
  }

  function createProjectPreset(preset: typeof canvasPresets[number]) {
    const next = createEmptyProject({ aspectRatio: preset.aspectRatio });
    next.canvas = { ...next.canvas, width: preset.width, height: preset.height };
    openEditor(next, []);
    toast.success(`${preset.label} project created. Preview stays scaled for this device.`);
  }

  function applyCanvasPreset(preset: typeof canvasPresets[number]) {
    applyProject({ ...project, aspectRatio: preset.aspectRatio, canvas: { ...project.canvas, width: preset.width, height: preset.height }, updatedAt: Date.now() });
    toast.success(`${preset.label} canvas applied. Editing stays locally responsive while the project keeps its full dimensions.`);
  }

  function openDemo() {
    const demo = buildDemoProject();
    openEditor(demo.project, demo.assets);
    toast.success("Opened the original editable motion-study project.");
  }

  function deleteRecent(id: string) {
    setRecents(current => {
      const next = current.filter(item => item.id !== id);
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional local storage */ }
      return next;
    });
  }

  function copySelectedClip() {
    if (!selectedClip) { toast.message("Select a clip to copy."); return; }
    setClipClipboard({ ...selectedClip, keyframes: [...selectedClip.keyframes] });
    toast.success("Clip copied inside this project.");
  }

  function pasteClip() {
    if (!clipClipboard) { toast.message("Copy a clip before pasting."); return; }
    const track = project.tracks.find(item => item.id === clipClipboard.trackId);
    if (!track || track.locked) { toast.error("The copied clip's track is unavailable or locked. Unlock it before pasting."); return; }
    const pasted = { ...clipClipboard, id: crypto.randomUUID(), start: snapStart(currentTime, clipClipboard.id), keyframes: clipClipboard.keyframes.map(keyframe => ({ ...keyframe, id: crypto.randomUUID() })) };
    applyProject({ ...project, clips: [...project.clips, pasted], updatedAt: Date.now() });
    setSelectedClipId(pasted.id);
    toast.success("Clip pasted at the playhead.");
  }

  function cutSelectedClip() {
    if (!selectedClip) { toast.message("Select a clip to cut."); return; }
    copySelectedClip();
    deleteSelectedClip();
  }

  function openRecentProject(item: RecentProject) {
    openEditor(normalizeProject(item.projectData), []);
    toast.message("Opened browser-local project metadata. Re-import its media files to restore previews.");
  }

  function saveProjectToAccount() {
    if (!currentUser) { toast.message("Account sync is optional. Your project is autosaved in this browser and can be exported as a JSON backup."); return; }
    saveServerProject.mutate({ id: serverProjectId ?? undefined, title: project.name || "Untitled project", projectData: serializableProject(project), durationMs: Math.round(projectDuration(project) * 1000) }, {
      onSuccess: result => {
        setServerProjectId(result.id);
        void serverProjects.refetch();
        toast.success("Project structure saved to your account. Media stays in your browser and is never stored in the database.");
      },
      onError: () => toast.error("Account sync is unavailable. Your browser-local autosave and JSON backup remain intact."),
    });
  }

  function useSharedTemplate(projectData: unknown) {
    try {
      openEditor(normalizeProject(projectData), []);
      toast.success("Shared template opened as your own editable local project.");
    } catch {
      toast.error("This shared template could not be opened safely.");
    }
  }

  function useSharedVideo(video: SharedVideoResource) {
    const asset: EditorAsset = { id: crypto.randomUUID(), name: video.title, kind: "video", url: video.url, size: video.byteSize, duration: Math.max(0, video.durationMs / 1000), createdAt: Date.now(), width: video.width || undefined, height: video.height || undefined };
    const track = project.tracks.find(item => item.type === "video" && !item.locked) ?? project.tracks.find(item => item.type === "video");
    if (!track || track.locked) { toast.error("Unlock or add a video track before using a shared clip."); return; }
    const clip = createClip(asset, track.id, currentTime, { duration: Math.max(1, asset.duration || 5) });
    setAssets(current => [...current, asset]);
    applyProject({ ...project, clips: [...project.clips, clip], updatedAt: Date.now() });
    setSelectedClipId(clip.id);
    toast.success("Licensed shared video added to your local timeline.");
  }

  function useSharedSound(sound: SharedSoundResource) {
    const asset: EditorAsset = { id: crypto.randomUUID(), name: sound.title, kind: "audio", url: sound.url, size: sound.byteSize, duration: Math.max(0, sound.durationMs / 1000), createdAt: Date.now() };
    const track = project.tracks.find(item => item.type === "audio" && !item.locked) ?? project.tracks.find(item => item.type === "audio");
    if (!track || track.locked) { toast.error("Unlock or add a licensed-sound track before using this resource."); return; }
    const clip = createClip(asset, track.id, currentTime, { duration: Math.max(1, asset.duration || 5) });
    setAssets(current => [...current, asset]);
    applyProject({ ...project, clips: [...project.clips, clip], updatedAt: Date.now() });
    setSelectedClipId(clip.id);
    toast.success("Licensed sound added to your local timeline. It will not autoplay.");
  }

  function openSharedTemplate(id: number, title: string) {
    setCommunityResource({ type: "template", id, title });
  }

  function toggleFavorite(templateId: number) {
    if (!currentUser) { toast.message("Sign in to save favourites. You can still use shared templates locally."); return; }
    toggleTemplateFavorite.mutate({ templateId }, { onSuccess: () => { void utils.templateStudio.favoriteIds.invalidate(); }, onError: error => toast.error(error.message || "Favourite update is temporarily unavailable.") });
  }

  function toggleSoundFavorite(soundId: number) {
    if (!currentUser) { toast.message("Sign in to save lawful sound favourites. You can still use visible sounds locally."); return; }
    toggleSoundFavoriteMutation.mutate({ soundId }, { onSuccess: () => { void utils.templateStudio.soundFavoriteIds.invalidate(); }, onError: error => toast.error(error.message || "Sound favourite update is temporarily unavailable.") });
  }

  function openReview(resource: CommunityResource) {
    setCommunityResource(resource);
    setReviewBody("");
    setReviewStars(5);
  }

  function submitReview() {
    if (!communityResource) return;
    if (!currentUser) { toast.message("Sign in to leave a real rating or review."); return; }
    saveResourceReview.mutate({ resourceType: communityResource.type, resourceId: communityResource.id, stars: reviewStars, body: reviewBody.trim() }, { onSuccess: () => { toast.success("Your review is now visible to the community."); void utils.templateStudio.listReviews.invalidate(); }, onError: error => toast.error(error.message || "Your review could not be saved.") });
  }

  function removeReview(id: number) {
    deleteResourceReview.mutate({ id }, { onSuccess: () => { toast.success("Your review was removed."); void utils.templateStudio.listReviews.invalidate(); }, onError: error => toast.error(error.message || "Your review could not be removed.") });
  }

  function requestServerProject(id: number) {
    if (!currentUser) { toast.message("Sign in to access account-saved projects. Browser-local projects work without sign-in."); return; }
    setRequestedServerProjectId(id);
  }

  function duplicateRecentProject(item: RecentProject) {
    const source = normalizeProject(item.projectData);
    const now = Date.now();
    const copy = { ...source, id: crypto.randomUUID(), name: `${source.name} copy`.slice(0, 100), createdAt: now, updatedAt: now, versions: [] };
    openEditor(copy, []);
    toast.success("Created an editable project copy.");
  }

  function renameRecentProject(item: RecentProject) {
    const nextName = window.prompt("Rename project", item.name)?.trim().slice(0, 100);
    if (!nextName || nextName === item.name) return;
    setRecents(current => {
      const next = current.map(record => record.id === item.id ? { ...record, name: nextName, updatedAt: Date.now(), projectData: { ...record.projectData, name: nextName } } : record);
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional local storage */ }
      return next;
    });
    if (project.id === item.id) setProject(current => ({ ...current, name: nextName, updatedAt: Date.now() }));
    toast.success("Project renamed.");
  }

  function importProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeProject(JSON.parse(String(reader.result)));
        openEditor(imported, []);
        toast.success("Editable REVRSE project opened. Re-import media files to restore previews.");
      } catch { toast.error("This project file could not be read. Choose a valid REVRSE project JSON file."); }
    };
    reader.onerror = () => toast.error("The project file could not be opened.");
    reader.readAsText(file);
  }

  function updateProjectName(value: string) {
    setProject(current => ({ ...current, name: value.slice(0, 100), updatedAt: Date.now() }));
  }

  function addMetadata(asset: EditorAsset, file: File) {
    if (asset.kind !== "video" && asset.kind !== "image" && asset.kind !== "audio") return;
    if (asset.kind === "video") {
      const element = document.createElement("video");
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        setAssets(current => current.map(item => item.id === asset.id ? {
          ...item,
          duration: Number.isFinite(element.duration) ? Math.max(0.2, element.duration) : item.duration,
          width: element.videoWidth || item.width,
          height: element.videoHeight || item.height,
        } : item));
      };
      element.onerror = () => toast.message(`${file.name} was added, but this browser could not read all video metadata.`);
      element.src = asset.url;
      return;
    }
    if (asset.kind === "audio") {
      const element = document.createElement("audio");
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        setAssets(current => current.map(item => item.id === asset.id ? { ...item, duration: Number.isFinite(element.duration) ? Math.max(0.2, element.duration) : item.duration } : item));
      };
      element.onerror = () => toast.message(`${file.name} was added, but this browser could not read all sound metadata.`);
      element.src = asset.url;
      return;
    }
    const element = document.createElement("img");
    element.onload = () => {
      setAssets(current => current.map(item => item.id === asset.id ? { ...item, width: element.naturalWidth || item.width, height: element.naturalHeight || item.height } : item));
    };
    element.onerror = () => toast.message(`${file.name} was added, but this browser could not read all image metadata.`);
    element.src = asset.url;
  }

  function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const imported: EditorAsset[] = [];
    Array.from(files).forEach(file => {
      if (file.name.toLowerCase().endsWith(".srt")) { importSrtFile(file); return; }
      if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} is over the ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB browser-local limit.`); return; }
      const kind = classifyFile(file);
      if (kind === "unknown") { toast.error(`${file.name} is not a supported video, image, or sound file.`); return; }
      const asset: EditorAsset = { id: crypto.randomUUID(), name: file.name, kind, url: URL.createObjectURL(file), size: file.size, duration: kind === "image" ? 5 : 8, createdAt: Date.now() };
      imported.push(asset);
      addMetadata(asset, file);
    });
    if (!imported.length) return;
    setAssets(current => [...current, ...imported]);
    const createdClips = imported.flatMap((asset, index) => {
      const trackType = asset.kind === "audio" ? "audio" : "video";
      const trackId = project.tracks.find(track => track.type === trackType && !track.locked)?.id ?? project.tracks.find(track => track.type === trackType)?.id;
      return trackId ? [createClip(asset, trackId, projectDuration(project) + index * 0.2)] : [];
    });
    if (!createdClips.length) { toast.error("Unlock or add a usable video or licensed-sound track before importing media."); return; }
    applyProject({ ...project, clips: [...project.clips, ...createdClips], updatedAt: Date.now() });
    setSelectedClipId(createdClips.at(-1)?.id ?? null);
    toast.success(`${imported.length} media file${imported.length === 1 ? "" : "s"} added to the media bin and timeline.`);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDropHighlight(false);
    importFiles(event.dataTransfer.files);
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    importFiles(event.target.files);
    event.target.value = "";
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || !activeVisualClip || activeVisualClip.kind !== "video") { toast.message("Select an imported video clip to use browser playback."); return; }
    if (playing) { video.pause(); setPlaying(false); }
    else void video.play().then(() => setPlaying(true)).catch(() => toast.error("This browser could not play the selected video."));
  }

  function handleVideoEnded() {
    if (loopPlayback && videoRef.current) { videoRef.current.currentTime = activeVisualClip?.trimStart ?? 0; void videoRef.current.play(); return; }
    setPlaying(false);
  }

  function stepFrame(direction: -1 | 1) {
    const next = Math.max(0, Math.min(duration, currentTime + direction / project.canvas.fps));
    setCurrentTime(next);
  }

  function updateSelected(changes: Partial<TimelineClip>) {
    if (!selectedClip) { toast.message("Select a timeline clip first."); return; }
    applyProject(updateClip(project, selectedClip.id, changes));
  }

  function splitSelectedClip() {
    if (!selectedClip) { toast.message("Select a clip before splitting."); return; }
    const next = splitClip(project, selectedClip.id, currentTime);
    if (next === project) { toast.message("Place the playhead inside the selected clip to split it."); return; }
    applyProject(next);
    setSelectedClipId(next.clips.find(clip => clip.start === currentTime)?.id ?? null);
    toast.success("Clip split at the playhead.");
  }

  function deleteSelectedClip(ripple = false) {
    if (!selectedClipId) { toast.message("Select a clip before deleting."); return; }
    applyProject(removeClip(project, selectedClipId, ripple));
    setSelectedClipId(null);
  }

  function duplicateSelected() {
    if (!selectedClip) { toast.message("Select a clip before duplicating."); return; }
    const next = duplicateClip(project, selectedClip.id);
    applyProject(next);
    setSelectedClipId(next.clips.at(-1)?.id ?? null);
  }

  function addProjectMarker() {
    applyProject(addMarker(project, currentTime, `Marker ${project.markers.length + 1}`));
    toast.success("Marker added at the playhead.");
  }

  function addTextClip(text = "New title", style: TimelineClip["textStyle"] = "headline") {
    const asset: EditorAsset = { id: crypto.randomUUID(), name: text.slice(0, 40) || "Text layer", kind: "text", url: "", size: 0, duration: 4, createdAt: Date.now() };
    const trackId = project.tracks.find(track => track.type === "text" && !track.locked)?.id;
    if (!trackId) { toast.error("Unlock or add a text track before adding text."); return; }
    const clip = createClip(asset, trackId, currentTime, { textContent: text, textStyle: style, effect: style === "headline" ? "bloom" : "none" });
    setAssets(current => [...current, asset]);
    applyProject({ ...project, clips: [...project.clips, clip], updatedAt: Date.now() });
    setSelectedClipId(clip.id);
    toast.success("Editable text layer added.");
  }

  function addCaptionText(rawText: string, at = currentTime, until?: number) {
    const text = rawText.trim();
    if (!text) { toast.message("Write a caption before adding it."); return; }
    const start = at;
    const end = until ?? Math.min(duration + 4, start + Math.max(1.5, text.length / 9));
    const caption: CaptionSegment = { id: crypto.randomUUID(), start, end, text, style: "bold" };
    const asset: EditorAsset = { id: crypto.randomUUID(), name: `Caption: ${text.slice(0, 30)}`, kind: "text", url: "", size: 0, duration: end - start, createdAt: Date.now() };
    const trackId = project.tracks.find(track => track.type === "text" && !track.locked)?.id;
    if (!trackId) { toast.error("Unlock or add a text track before adding captions."); return; }
    const clip = createClip(asset, trackId, start, { duration: end - start, textContent: text, textStyle: "caption", filter: "none" });
    setAssets(current => [...current, asset]);
    applyProject({ ...project, captions: [...project.captions, caption], clips: [...project.clips, clip], updatedAt: Date.now() });
    setSelectedClipId(clip.id);
    setCaptionDraft("");
    toast.success("Editable caption added to the timeline.");
  }

  function addCaption() { addCaptionText(captionDraft); }

  function jumpToCaption(caption: CaptionSegment) {
    const clip = project.clips.find(item => item.kind === "text" && item.textStyle === "caption" && item.textContent === caption.text && Math.abs(item.start - caption.start) < 0.01);
    setCurrentTime(caption.start);
    setCaptionDraft(caption.text);
    setSelectedCaptionId(caption.id);
    if (clip) setSelectedClipId(clip.id);
    toast.message(`Moved playhead to caption at ${formatTime(caption.start)}.`);
  }

  function updateSelectedCaption() {
    const nextText = captionDraft.trim();
    const caption = project.captions.find(item => item.id === selectedCaptionId);
    if (!caption || !nextText) { toast.message("Select a caption row and enter text before updating it."); return; }
    const matchingClip = project.clips.find(item => item.kind === "text" && item.textStyle === "caption" && item.textContent === caption.text && Math.abs(item.start - caption.start) < 0.01);
    const nextCaptions = project.captions.map(item => item.id === caption.id ? { ...item, text: nextText } : item);
    const nextClips = matchingClip ? project.clips.map(item => item.id === matchingClip.id ? { ...item, textContent: nextText, name: `Caption: ${nextText.slice(0, 30)}` } : item) : project.clips;
    if (matchingClip) setAssets(current => current.map(asset => asset.id === matchingClip.assetId ? { ...asset, name: `Caption: ${nextText.slice(0, 30)}` } : asset));
    applyProject({ ...project, captions: nextCaptions, clips: nextClips, updatedAt: Date.now() });
    toast.success("Editable caption updated.");
  }

  useEffect(() => {
    const handleCaptionJump = (event: Event) => {
      const caption = (event as CustomEvent<CaptionSegment>).detail;
      if (caption?.id && Number.isFinite(caption.start)) jumpToCaption(caption);
    };
    const handleCaptionUpdate = () => updateSelectedCaption();
    window.addEventListener("revrse:jump-caption", handleCaptionJump);
    window.addEventListener("revrse:update-caption", handleCaptionUpdate);
    return () => {
      window.removeEventListener("revrse:jump-caption", handleCaptionJump);
      window.removeEventListener("revrse:update-caption", handleCaptionUpdate);
    };
  }, [project, captionDraft, selectedCaptionId]);

  function addMovieDialogueCaption(text: string) {
    if (!text.trim()) { toast.message("Paste or write licensed dialogue before adding it."); return; }
    addCaptionText(text);
    toast.message("Dialogue was added as an editable caption. Only use text you created or are permitted to use.");
  }

  function publishCurrentTemplate(input: { title: string; description: string; category: string }) {
    if (!currentUser) { toast.message("Sign in to publish an original template. You can keep editing locally without an account."); return; }
    publishSharedTemplate.mutate({ ...input, aspectRatio: project.aspectRatio, projectData: serializableProject(project), rightsAttested: true }, {
      onSuccess: () => { void utils.templateStudio.listTemplates.invalidate(); toast.success("Your original editable template is now in the Studio library."); },
      onError: error => toast.error(error.message || "Template publishing is temporarily unavailable."),
    });
  }

  async function publishLicensedVideo(file: File, input: { title: string; description: string; category: string }) {
    if (!currentUser) { toast.message("Sign in to publish a licensed reusable video. Local editing remains available without an account."); return; }
    const allowed = ["video/mp4", "video/webm", "video/quicktime"] as const;
    if (!allowed.includes(file.type as typeof allowed[number])) { toast.error("Choose an MP4, WebM, or MOV video file."); return; }
    if (file.size > 18 * 1024 * 1024) { toast.error("Shared clips are limited to 18 MB so the community library remains responsive."); return; }
    try {
      const metadata = await new Promise<{ durationMs: number; width: number; height: number }>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve({ durationMs: Math.round((Number.isFinite(probe.duration) ? probe.duration : 0) * 1000), width: probe.videoWidth || 0, height: probe.videoHeight || 0 }); };
        probe.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("metadata")); };
        probe.src = objectUrl;
      });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      publishSharedVideo.mutate({ ...input, originalName: file.name, mimeType: file.type as "video/mp4" | "video/webm" | "video/quicktime", base64, byteSize: file.size, ...metadata, rightsAttested: true }, {
        onSuccess: () => { void utils.templateStudio.listVideos.invalidate(); toast.success("Licensed video published. Other creators can add it to their own local timelines."); },
        onError: error => toast.error(error.message || "Video publishing is temporarily unavailable."),
      });
    } catch {
      toast.error("This video could not be read. Choose a valid licensed clip and try again.");
    }
  }

  async function publishLicensedSound(file: File, input: { title: string; description: string; category: string }) {
    if (!currentUser) { toast.message("Sign in to publish a creator-owned or properly licensed sound. Local editing remains available without an account."); return; }
    const allowed = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"] as const;
    if (!allowed.includes(file.type as typeof allowed[number])) { toast.error("Choose an MP3, M4A, WAV, OGG, or WebM audio file."); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error("Shared sounds are limited to 12 MB so the community library remains responsive."); return; }
    try {
      const metadata = await new Promise<{ durationMs: number }>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const probe = document.createElement("audio");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve({ durationMs: Math.round((Number.isFinite(probe.duration) ? probe.duration : 0) * 1000) }); };
        probe.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("metadata")); };
        probe.src = objectUrl;
      });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      publishSharedSound.mutate({ ...input, originalName: file.name, mimeType: file.type as "audio/mpeg" | "audio/mp4" | "audio/wav" | "audio/ogg" | "audio/webm", base64, byteSize: file.size, ...metadata, rightsAttested: true }, {
        onSuccess: () => { void utils.templateStudio.listSounds.invalidate(); toast.success("Licensed sound published. Other creators can place it on their local timelines."); },
        onError: error => toast.error(error.message || "Sound publishing is temporarily unavailable."),
      });
    } catch {
      toast.error("This sound could not be read. Choose a valid licensed audio file and try again.");
    }
  }

  function importSrtFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const blocks = String(reader.result).replace(/\r/g, "").trim().split(/\n\s*\n/);
      const captions: CaptionSegment[] = blocks.flatMap(block => {
        const lines = block.split("\n").filter(Boolean);
        const timing = lines.find(line => line.includes("-->"));
        if (!timing) return [];
        const [rawStart, rawEnd] = timing.split("-->").map(part => part.trim());
        const toSeconds = (value: string) => { const [hms, ms = "0"] = value.replace(",", ".").split("."); const [h, m, s] = hms.split(":").map(Number); return h * 3600 + m * 60 + s + Number(`0.${ms}`); };
        const start = toSeconds(rawStart); const end = toSeconds(rawEnd);
        const text = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
        return text && Number.isFinite(start) && Number.isFinite(end) ? [{ id: crypto.randomUUID(), start, end: Math.max(start + 0.1, end), text, style: "minimal" as const }] : [];
      });
      if (!captions.length) { toast.error("No valid timed captions were found in that SRT file."); return; }
      applyProject({ ...project, captions: [...project.captions, ...captions], updatedAt: Date.now() });
      toast.success(`${captions.length} timed captions imported. Add any caption to the text track when you want it visible in the edit.`);
    };
    reader.onerror = () => toast.error("The SRT file could not be read.");
    reader.readAsText(file);
  }

  function exportSrt() {
    if (!project.captions.length) { toast.message("Create or import timed captions before exporting an SRT file."); return; }
    const content = project.captions.map((caption, index) => `${index + 1}\n${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}\n${caption.text}`).join("\n\n");
    downloadText(`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "revrse-project"}.srt`, content, "application/x-subrip");
    toast.success("Timed captions exported as SRT.");
  }

  function addElement(name: string) {
    const asset: EditorAsset = { id: crypto.randomUUID(), name, kind: "element", url: "", size: 0, duration: 3, createdAt: Date.now() };
    const trackId = project.tracks.find(track => track.type === "overlay" && !track.locked)?.id;
    if (!trackId) { toast.error("Unlock or add an overlay track before adding an element."); return; }
    const clip = createClip(asset, trackId, currentTime, { textContent: name, effect: "none" });
    setAssets(current => [...current, asset]);
    applyProject({ ...project, clips: [...project.clips, clip], updatedAt: Date.now() });
    setSelectedClipId(clip.id);
  }

  function applyTemplate(template: typeof templateRecipes[number]) {
    const base = createEmptyProject({ name: template.name, aspectRatio: template.ratio });
    const titleAsset: EditorAsset = { id: crypto.randomUUID(), name: `${template.name} title`, kind: "text", url: "", size: 0, duration: 3, createdAt: Date.now() };
    const noteAsset: EditorAsset = { id: crypto.randomUUID(), name: "Replace with your media", kind: "text", url: "", size: 0, duration: 3, createdAt: Date.now() };
    base.clips = [
      createClip(titleAsset, "text-1", 0, { textContent: template.name.toUpperCase(), textStyle: template.style, effect: "bloom", transitionOut: "fade" }),
      createClip(noteAsset, "text-1", 3.2, { textContent: "DROP YOUR OWN MEDIA INTO THE TIMELINE", textStyle: "caption", transitionIn: "fade" }),
    ];
    base.markers = [{ id: crypto.randomUUID(), at: 3, label: "Replace media here", color: "#22d3ee" }];
    openEditor(base, [titleAsset, noteAsset]);
    toast.success(`${template.name} applied as a fully editable original template.`);
  }

  function openCreatorStudio() {
    setActivePanel("studio");
    setMobilePanelOpen(true);
    setMode("editor");
    toast.message("Creator Studio is ready. Browse lawful shared resources or publish only material you can share.");
  }

  function addKeyframeToSelected() {
    if (!selectedClip) { toast.message("Select a clip before adding a keyframe."); return; }
    const values: Record<TimelineClip["keyframes"][number]["property"], number> = { opacity: selectedClip.opacity, scale: selectedClip.scale, positionX: selectedClip.positionX, positionY: selectedClip.positionY, rotation: selectedClip.rotation, blur: selectedClip.blur, exposure: 0 };
    const clip = addKeyframe(selectedClip, { id: crypto.randomUUID(), at: Math.max(0, currentTime - selectedClip.start), property: keyframeProperty, value: values[keyframeProperty], easing: "ease-in-out" });
    applyProject(updateClip(project, selectedClip.id, { keyframes: clip.keyframes }));
    toast.success(`${keyframeProperty} keyframe added at the playhead.`);
  }

  function saveVersion() {
    const snapshot = serializableProject(project);
    const version = { id: crypto.randomUUID(), label: `${project.name} — v${project.versions.length + 1}`, savedAt: Date.now(), project: { ...snapshot, versions: [] } };
    applyProject({ ...project, versions: [...project.versions, version].slice(-8), updatedAt: Date.now() }, false);
    toast.success("Local project version saved.");
  }

  function restoreVersion(version: EditorProject["versions"][number]) {
    applyProject({ ...normalizeProject(version.project), versions: project.versions, updatedAt: Date.now() });
    toast.success(`Restored ${version.label}.`);
  }

  function downloadProjectBackup() {
    downloadText(`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "revrse-project"}.revrse.json`, JSON.stringify(serializableProject(project), null, 2), "application/json");
    toast.success("Editable REVRSE project backup downloaded.");
  }

  function changeAspectRatio(ratio: CanvasRatio) {
    const dimensions: Record<Exclude<CanvasRatio, "custom">, { width: number; height: number }> = { "16:9": { width: 1920, height: 1080 }, "9:16": { width: 1080, height: 1920 }, "1:1": { width: 1080, height: 1080 }, "4:5": { width: 1080, height: 1350 }, "21:9": { width: 2560, height: 1080 }, "4:3": { width: 1440, height: 1080 } };
    const canvas = ratio === "custom" ? project.canvas : { ...project.canvas, ...dimensions[ratio] };
    applyProject({ ...project, aspectRatio: ratio, canvas, updatedAt: Date.now() });
  }

  function runAssistant(command = assistantCommand) {
    const normalized = command.toLowerCase().trim();
    if (!normalized) { toast.message("Describe a local edit to apply, such as “make this cinematic” or “make this vertical”."); return; }
    if (normalized.includes("cinematic")) {
      applyProject({ ...project, clips: project.clips.map(clip => clip.kind === "video" || clip.kind === "image" ? { ...clip, filter: "cinematic", effect: "film-grain" } : clip), updatedAt: Date.now() });
      toast.success("Applied a cinematic colour treatment to visual clips.");
    } else if (normalized.includes("short") || normalized.includes("vertical") || normalized.includes("reel")) {
      changeAspectRatio("9:16");
      toast.success("Converted the project canvas to a vertical short-form layout.");
    } else if (normalized.includes("faster") || normalized.includes("pacing")) {
      applyProject({ ...project, clips: project.clips.map(clip => clip.kind === "video" ? { ...clip, speed: Math.min(2, Math.max(1.15, clip.speed)) } : clip), updatedAt: Date.now() });
      toast.success("Increased visual clip pacing; every speed remains editable.");
    } else if (normalized.includes("caption") || normalized.includes("subtitle")) {
      addTextClip("Add your caption text", "caption");
      toast.success("Added an editable caption placeholder at the playhead.");
    } else {
      toast.message("This local assistant can currently apply cinematic colour, vertical short-form framing, faster pacing, and editable captions. Provider-backed analysis is not configured.");
    }
    setAssistantCommand("");
  }

  function seekTo(value: number) { setCurrentTime(Math.max(0, Math.min(duration, value))); }

  function snapStart(start: number, clipId: string) {
    if (!snapping) return Math.max(0, Math.round(start * 10) / 10);
    const candidates = [0, ...project.markers.map(marker => marker.at), ...project.clips.filter(clip => clip.id !== clipId).flatMap(clip => [clip.start, clip.start + getVisibleDuration(clip)])];
    const close = candidates.find(point => Math.abs(point - start) < 0.18);
    return Math.max(0, Math.round((close ?? start) * 10) / 10);
  }

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-100 selection:bg-cyan-300/30">
      {mode === "dashboard" ? (
        <Dashboard recents={recents} serverProjects={serverProjects.data ?? []} sharedTemplates={(sharedTemplates.data ?? []) as SharedTemplateResource[]} favoriteTemplateIds={(favoriteIds.data ?? []) as number[]} accountReady={Boolean(currentUser)} serverLoading={serverProjects.isLoading} serverError={serverProjects.isError} onNew={createProject} onPreset={createProjectPreset} onOpenCurrent={() => openEditor()} onOpenRecent={openRecentProject} onOpenServer={requestServerProject} onDuplicate={duplicateRecentProject} onRename={renameRecentProject} onDemo={openDemo} onStudio={openCreatorStudio} onOpenSharedTemplate={openSharedTemplate} onToggleFavorite={toggleFavorite} onTemplate={applyTemplate} onImport={() => projectInputRef.current?.click()} onDelete={deleteRecent} />
      ) : (
        <EditorWorkspace
          project={project} assets={assets} selectedClip={selectedClip} selectedAsset={selectedAsset} previewAsset={previewAsset} activeVisualClip={activeVisualClip} activeTextClips={activeTextClips}
          currentTime={currentTime} duration={duration} playing={playing} activePanel={activePanel} mobilePanelOpen={mobilePanelOpen} search={search} assetView={assetView} showGrid={showGrid} showSafeZones={showSafeZones} snapping={snapping} loopPlayback={loopPlayback} previewScale={previewScale} timelineZoom={timelineZoom} tool={tool} draggingId={draggingId} dropHighlight={dropHighlight} ruler={ruler} pxPerSecond={pxPerSecond} historyAvailable={history.length > 0} futureAvailable={future.length > 0} keyframeProperty={keyframeProperty} captionDraft={captionDraft} assistantCommand={assistantCommand} movieQuery={movieQuery} movieResults={(movieResults.data ?? []) as MovieResult[]} movieLoading={movieResults.isFetching} sharedTemplates={(sharedTemplates.data ?? []) as SharedTemplateResource[]} sharedVideos={(sharedVideos.data ?? []) as SharedVideoResource[]} sharedSounds={(sharedSounds.data ?? []) as SharedSoundResource[]} favoriteTemplateIds={(favoriteIds.data ?? []) as number[]} favoriteSoundIds={(favoriteSoundIds.data ?? []) as number[]} communityResource={communityResource} communityReviews={resourceReviews.data as CommunityReviewData | undefined} reviewStars={reviewStars} reviewBody={reviewBody} accountReady={Boolean(currentUser)}
          videoRef={videoRef} previewRef={previewRef} timelineRef={timelineRef}
          onBack={() => setMode("dashboard")} onProjectName={updateProjectName} onImport={() => fileInputRef.current?.click()} onExport={() => setShowExport(true)} onSettings={() => setShowSettings(true)} onShortcuts={() => setShowShortcuts(true)} onCommand={() => setShowCommand(true)} onAccountSave={saveProjectToAccount} syncing={saveServerProject.isPending}
          onPanel={panel => { setActivePanel(panel); setMobilePanelOpen(true); }} onCloseMobilePanel={() => setMobilePanelOpen(false)} onSearch={setSearch} onAssetView={setAssetView} onDrop={handleDrop} onDragOver={() => setDropHighlight(true)} onDragLeave={() => setDropHighlight(false)} onTogglePlayback={togglePlayback} onStep={stepFrame} onSeek={seekTo} onEnded={handleVideoEnded} onGrid={() => setShowGrid(value => !value)} onSafeZones={() => setShowSafeZones(value => !value)} onSnapping={() => setSnapping(value => !value)} onLoop={() => setLoopPlayback(value => !value)} onPreviewScale={setPreviewScale}
          onUndo={undo} onRedo={redo} onSplit={splitSelectedClip} onDelete={deleteSelectedClip} onDuplicate={duplicateSelected} onMarker={addProjectMarker} onTool={setTool} onTimelineZoom={setTimelineZoom} onSelect={setSelectedClipId} onMoveClip={(clipId, start) => applyProject(updateClip(project, clipId, { start: snapStart(start, clipId) }))} onTrimClip={(clipId, changes) => applyProject(updateClip(project, clipId, changes))} onDragState={setDraggingId} onTrackChange={(id, changes) => applyProject(updateTrack(project, id, changes))} onAddTrack={type => applyProject(addTrack(project, type))}
          onUpdateSelected={updateSelected} onKeyframe={addKeyframeToSelected} onKeyframeProperty={setKeyframeProperty} onAddText={addTextClip} onAddCaption={addCaption} onCaptionDraft={setCaptionDraft} onInsertCaption={addCaptionText} onMovieQuery={setMovieQuery} onOpenSharedTemplate={openSharedTemplate} onUseSharedVideo={useSharedVideo} onUseSharedSound={useSharedSound} onToggleFavorite={toggleFavorite} onToggleSoundFavorite={toggleSoundFavorite} onOpenReview={openReview} onReviewStars={setReviewStars} onReviewBody={setReviewBody} onSubmitReview={submitReview} onDeleteReview={removeReview} onPublishTemplate={() => {}} onCreateTemplate={publishCurrentTemplate} onPublishVideo={publishLicensedVideo} onPublishSound={publishLicensedSound} onImportSrt={() => srtInputRef.current?.click()} onExportSrt={exportSrt} onTemplate={applyTemplate} onElement={addElement} onAssistant={runAssistant} onAssistantCommand={setAssistantCommand} onSaveVersion={saveVersion} onFullscreen={() => void previewRef.current?.requestFullscreen?.()}
        />
      )}

      <input ref={fileInputRef} onChange={handleImport} type="file" multiple accept="video/*,image/*,.srt,application/x-subrip" className="hidden" />
      <input ref={projectInputRef} onChange={importProjectFile} type="file" accept=".json,.revrse.json,application/json" className="hidden" />
      <input ref={srtInputRef} onChange={event => { const file = event.target.files?.[0]; if (file) importSrtFile(file); event.target.value = ""; }} type="file" accept=".srt,application/x-subrip,text/plain" className="hidden" />

      <CommandPalette open={showCommand} onOpenChange={setShowCommand} onSplit={splitSelectedClip} onCaption={() => addTextClip("Add your caption text", "caption")} onTemplates={() => { setActivePanel("templates"); setMobilePanelOpen(true); }} onExport={() => setShowExport(true)} onMarker={addProjectMarker} onAssistant={() => { setActivePanel("assistant"); setMobilePanelOpen(true); }} />
      {showExport && <ExportDialog project={project} onClose={() => setShowExport(false)} onProject={downloadProjectBackup} onSrt={exportSrt} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {showSettings && <SettingsDialog project={project} onClose={() => setShowSettings(false)} onRatio={changeAspectRatio} onPreset={applyCanvasPreset} onFps={fps => applyProject({ ...project, canvas: { ...project.canvas, fps }, updatedAt: Date.now() })} onBackground={background => applyProject({ ...project, canvas: { ...project.canvas, background }, updatedAt: Date.now() })} onRestore={restoreVersion} />}
    </div>
  );
}

function Dashboard({ recents, serverProjects, sharedTemplates, favoriteTemplateIds, accountReady, serverLoading, serverError, onNew, onPreset, onOpenCurrent, onOpenRecent, onOpenServer, onDuplicate, onRename, onDemo, onStudio, onOpenSharedTemplate, onToggleFavorite, onTemplate, onImport, onDelete }: { recents: RecentProject[]; serverProjects: ServerProjectSummary[]; sharedTemplates: SharedTemplateResource[]; favoriteTemplateIds: number[]; accountReady: boolean; serverLoading: boolean; serverError: boolean; onNew: (ratio: CanvasRatio) => void; onPreset: (preset: typeof canvasPresets[number]) => void; onOpenCurrent: () => void; onOpenRecent: (item: RecentProject) => void; onOpenServer: (id: number) => void; onDuplicate: (item: RecentProject) => void; onRename: (item: RecentProject) => void; onDemo: () => void; onStudio: () => void; onOpenSharedTemplate: (id: number, title: string) => void; onToggleFavorite: (templateId: number) => void; onTemplate: (template: typeof templateRecipes[number]) => void; onImport: () => void; onDelete: (id: string) => void }) {
  const presets = canvasPresets;
  const [projectQuery, setProjectQuery] = useState("");
  const [projectRatio, setProjectRatio] = useState("all");
  const [projectSort, setProjectSort] = useState<ProjectFinderSort>("updated");
  const projectRatios = useMemo(() => Array.from(new Set(recents.map(project => project.aspectRatio))), [recents]);
  const filteredProjects = useMemo(() => findProjects(recents, projectQuery, projectRatio, projectSort), [recents, projectQuery, projectRatio, projectSort]);
  const projectStats = useMemo(() => getProjectFinderStats(recents), [recents]);
  const finderActive = Boolean(projectQuery.trim()) || projectRatio !== "all" || projectSort !== "updated";
  const clearProjectFinder = () => { setProjectQuery(""); setProjectRatio("all"); setProjectSort("updated"); };
  return <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-5 sm:px-7 sm:py-8">
    <header className="flex items-center justify-between border-b border-white/[0.08] pb-5">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/15"><Clapperboard className="h-5 w-5" /></div><div><p className="text-xs font-extrabold tracking-[0.24em] text-cyan-200">REVRSE EDITOR</p><p className="mt-0.5 text-xs text-slate-500">Local-first creative workspace</p></div></div>
      <div className="flex items-center gap-2"><button onClick={onImport} className="revrse-button-secondary"><FileUp className="h-4 w-4" /> <span className="hidden sm:inline">Import project</span></button><button onClick={() => onNew("16:9")} className="revrse-button-primary"><Plus className="h-4 w-4" /> New project</button></div>
    </header>
    <section className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-semibold text-slate-100">Start a project</p><p className="mt-1 text-xs text-slate-500">Choose a canvas, then build with your own licensed media.</p></div><button onClick={onDemo} className="revrse-mini-button"><Sparkles className="h-3.5 w-3.5" /> Open demo</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{presets.map(preset => <button key={preset.id} onClick={() => onPreset(preset)} className="group min-h-36 rounded-xl border border-white/[0.09] bg-[#11141b] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-[#151a23]"><div className={`grid place-items-center rounded-lg border border-white/[0.08] bg-gradient-to-br from-cyan-300/15 to-transparent ${preset.aspectRatio === "9:16" ? "h-16 w-9" : preset.aspectRatio === "1:1" ? "h-12 w-12" : preset.aspectRatio === "4:5" ? "h-15 w-12" : "h-10 w-16"}`}><Plus className="h-4 w-4 text-cyan-100 transition group-hover:scale-110" /></div><p className="mt-4 text-sm font-semibold text-slate-100">{preset.label}</p><p className="mt-1 text-[11px] text-slate-500">{preset.aspectRatio} · {preset.description}</p></button>)}</div><p className="mt-3 text-xs leading-relaxed text-slate-500">4K canvases retain their full project dimensions; the live preview is deliberately scaled to fit the current device.</p>
        <section className="mt-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">Recent projects</p><p className="mt-1 text-xs text-slate-500">Find browser-local edits by title or canvas. Media files stay on this device.</p></div><div className="flex items-center gap-2"><button onClick={onOpenCurrent} className="revrse-mini-button"><FolderOpen className="h-3.5 w-3.5" /> Open current</button><button onClick={() => onNew("16:9")} className="revrse-mini-button text-cyan-100"><Plus className="h-3.5 w-3.5" /> New</button></div></div><div className="mt-3 grid gap-2 rounded-xl border border-white/[0.08] bg-[#10131a] p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" /><span className="sr-only">Search local projects</span><input value={projectQuery} onChange={event => setProjectQuery(event.target.value)} placeholder="Find a project by title" className="h-9 w-full rounded-lg border border-white/[0.1] bg-black/20 pl-9 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/60" /></label><label><span className="sr-only">Filter by canvas</span><select value={projectRatio} onChange={event => setProjectRatio(event.target.value)} className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#0c1017] px-2 text-xs text-slate-300 outline-none focus:border-cyan-300/60"><option value="all">All canvases</option>{projectRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}</select></label><label><span className="sr-only">Sort projects</span><select value={projectSort} onChange={event => setProjectSort(event.target.value as ProjectFinderSort)} className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#0c1017] px-2 text-xs text-slate-300 outline-none focus:border-cyan-300/60"><option value="updated">Last edited</option><option value="name">Title A–Z</option><option value="duration">Longest first</option></select></label></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-white/[0.08] px-2 py-1">{projectStats.totalProjects} local {projectStats.totalProjects === 1 ? "project" : "projects"}</span><span className="rounded-full border border-white/[0.08] px-2 py-1">{formatTime(projectStats.totalDuration)} total timeline</span><span className="rounded-full border border-white/[0.08] px-2 py-1">{projectStats.fourKProjects} 4K canvas</span>{finderActive && <button onClick={clearProjectFinder} className="revrse-mini-button py-1 text-slate-300">Clear finder</button>}</div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredProjects.length ? filteredProjects.map(item => <article key={item.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#11141b]"><div className="relative h-24 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,.2),transparent_30%),linear-gradient(120deg,#111827,#080b12)]"><div className="absolute inset-4 flex items-end justify-between"><span className="rounded bg-black/25 px-2 py-1 text-[10px] font-semibold text-cyan-100">{item.aspectRatio}</span><span className="font-mono text-[10px] text-slate-400">{formatTime(item.duration)}</span></div></div><div className="p-3"><p className="truncate text-sm font-semibold text-slate-100">{item.name}</p><p className="mt-1 text-[11px] text-slate-500">{item.canvas.width} × {item.canvas.height} · edited {formatDate(item.updatedAt)} · created {formatDate(item.createdAt)}</p><div className="mt-3 flex flex-wrap gap-1.5"><button onClick={() => onOpenRecent(item)} className="revrse-mini-button bg-white/[0.045] text-slate-200">Open</button><button onClick={() => onDuplicate(item)} className="revrse-mini-button" aria-label={`Duplicate ${item.name}`}><Copy className="h-3.5 w-3.5" /></button><button onClick={() => onRename(item)} className="revrse-mini-button" aria-label={`Rename ${item.name}`}><FileText className="h-3.5 w-3.5" /></button><button onClick={() => onDelete(item.id)} className="revrse-mini-button text-slate-500 hover:text-rose-200" aria-label={`Delete ${item.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div></div></article>) : recents.length ? <div className="col-span-full rounded-xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.025] p-7 text-center"><Search className="mx-auto h-5 w-5 text-cyan-200/75" /><p className="mt-3 text-sm text-slate-200">No local projects match this finder</p><p className="mt-1 text-xs text-slate-500">Try another title or canvas, or clear the finder to see all browser-local projects.</p><button onClick={clearProjectFinder} className="revrse-mini-button mt-3 text-cyan-100">Clear finder</button></div> : <div className="col-span-full rounded-xl border border-dashed border-white/[0.12] bg-white/[0.018] p-8 text-center"><FolderOpen className="mx-auto h-5 w-5 text-slate-600" /><p className="mt-3 text-sm text-slate-300">No browser-local projects yet</p><p className="mt-1 text-xs text-slate-500">Create a project or open the original editable demo.</p></div>}</div></section>
        <section className="mt-7"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-100">Original editable templates</p><p className="mt-1 text-xs text-slate-500">Start from an original layout, then replace every text and media placeholder.</p></div><button onClick={onDemo} className="revrse-mini-button">AI tools are local</button></div><div className="grid gap-3 md:grid-cols-3">{templateRecipes.map(template => <article key={template.name} className="rounded-xl border border-white/[0.08] bg-[#11141b] p-3"><div className={`h-16 rounded-lg bg-gradient-to-br ${template.color}`} /><div className="mt-3 flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-100">{template.name}</p><p className="mt-1 text-[10px] text-slate-500">{template.category} · {template.ratio} · {template.clips} placeholders</p></div><button onClick={() => onTemplate(template)} className="revrse-mini-button">Use</button></div></article>)}</div></section>
        <section className="mt-7 rounded-xl border border-cyan-300/15 bg-[linear-gradient(120deg,rgba(34,211,238,.08),rgba(15,23,42,.2))] p-4"><div className="sm:flex sm:items-center sm:justify-between sm:gap-5"><div><div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><Star className="h-4 w-4" /> Creator Studio</div><p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">Browse original editable templates and reusable creator-owned or properly licensed media. Save template favourites when signed in; ratings and reviews are always real user submissions.</p></div><button onClick={onStudio} className="revrse-button-primary mt-4 shrink-0 sm:mt-0">Open Creator Studio</button></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{sharedTemplates.slice(0, 3).map(template => { const saved = favoriteTemplateIds.includes(template.id); return <article key={template.id} className="rounded-lg border border-white/[0.08] bg-[#0a0d12]/70 p-3"><p className="truncate text-xs font-semibold text-slate-100">{template.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{template.description}</p><p className="mt-2 text-[10px] text-cyan-100/75">{template.category} · {template.aspectRatio}</p><div className="mt-3 flex flex-wrap gap-1.5"><button onClick={() => onOpenSharedTemplate(template.id, template.title)} className="revrse-mini-button">Use in edit</button><button onClick={() => onToggleFavorite(template.id)} className={`revrse-mini-button ${saved ? "text-cyan-100" : ""}`} aria-label={`${saved ? "Remove" : "Save"} ${template.title}`}>{saved ? "Saved" : "Save"}</button></div></article>; })}{!sharedTemplates.length && <div className="sm:col-span-3 rounded-lg border border-dashed border-white/[0.14] bg-black/10 p-3 text-xs text-slate-400">No shared templates are published yet. Open Creator Studio to publish an original editable template or browse again later.</div>}</div></section>
        <section className="mt-7"><div className="mb-3"><p className="text-sm font-semibold text-slate-100">Account-saved projects</p><p className="mt-1 text-xs text-slate-500">Optional structure sync only. Video and image files stay in your browser, so keep a JSON backup for portability.</p></div>{!accountReady ? <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.018] p-4 text-xs leading-relaxed text-slate-400">You are using browser-local editing. Sign in only when you choose to save an editable project structure to your account.</div> : serverLoading ? <div className="rounded-xl border border-white/[0.08] bg-[#11141b] p-4 text-xs text-slate-400">Loading account-saved projects…</div> : serverError ? <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs text-amber-100">Account sync is temporarily unavailable. Browser-local autosave and JSON backups continue to work.</div> : serverProjects.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{serverProjects.map(item => <article key={item.id} className="rounded-xl border border-white/[0.08] bg-[#11141b] p-3"><p className="truncate text-sm font-semibold text-slate-100">{item.title}</p><p className="mt-1 text-[11px] text-slate-500">{formatTime(item.durationMs / 1000)} · saved {formatDate(new Date(item.updatedAt).getTime())}</p><button onClick={() => onOpenServer(item.id)} className="revrse-mini-button mt-3">Open saved structure</button></article>)}</div> : <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.018] p-4 text-xs text-slate-400">No account-saved projects yet. Open an edit and choose “Save copy” in the header.</div>}</section>
      </div>
      <aside className="rounded-xl border border-white/[0.08] bg-[#10131a] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Workspace principles</p><div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-400"><p><strong className="font-medium text-slate-200">Your edit, your media.</strong> Import video and images you own or are allowed to use.</p><p><strong className="font-medium text-slate-200">No forced watermark.</strong> The project format and on-device editing tools add none.</p><p><strong className="font-medium text-slate-200">No hidden upload.</strong> Imports stay in the current browser session unless you explicitly save a project backup.</p></div><button onClick={onDemo} className="revrse-button-secondary mt-5 w-full"><Sparkles className="h-4 w-4" /> Explore demo timeline</button></aside>
    </section>
  </main>;
}

function EditorWorkspace(props: {
  project: EditorProject; assets: EditorAsset[]; selectedClip: TimelineClip | null; selectedAsset?: EditorAsset; previewAsset?: EditorAsset; activeVisualClip?: TimelineClip | null; activeTextClips: TimelineClip[]; currentTime: number; duration: number; playing: boolean; activePanel: Panel; mobilePanelOpen: boolean; search: string; assetView: "grid" | "list"; showGrid: boolean; showSafeZones: boolean; snapping: boolean; loopPlayback: boolean; previewScale: number; timelineZoom: number; tool: Tool; draggingId: string | null; dropHighlight: boolean; ruler: number[]; pxPerSecond: number; historyAvailable: boolean; futureAvailable: boolean; keyframeProperty: TimelineClip["keyframes"][number]["property"]; captionDraft: string; assistantCommand: string;
  videoRef: React.RefObject<HTMLVideoElement | null>; previewRef: React.RefObject<HTMLDivElement | null>; timelineRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void; onProjectName: (value: string) => void; onImport: () => void; onExport: () => void; onSettings: () => void; onShortcuts: () => void; onCommand: () => void; onAccountSave: () => void; syncing: boolean; onPanel: (panel: Panel) => void; onCloseMobilePanel: () => void; onSearch: (value: string) => void; onAssetView: (value: "grid" | "list") => void; onDrop: (event: DragEvent) => void; onDragOver: () => void; onDragLeave: () => void; onTogglePlayback: () => void; onStep: (direction: -1 | 1) => void; onSeek: (value: number) => void; onEnded: () => void; onGrid: () => void; onSafeZones: () => void; onSnapping: () => void; onLoop: () => void; onPreviewScale: (value: number) => void;
  onUndo: () => void; onRedo: () => void; onSplit: () => void; onDelete: (ripple?: boolean) => void; onDuplicate: () => void; onMarker: () => void; onTool: (tool: Tool) => void; onTimelineZoom: (value: number) => void; onSelect: (id: string | null) => void; onMoveClip: (id: string, start: number) => void; onTrimClip: (id: string, changes: Partial<TimelineClip>) => void; onDragState: (id: string | null) => void; onTrackChange: (id: string, changes: Partial<TimelineTrack>) => void; onAddTrack: (type: TimelineTrack["type"]) => void;
  onUpdateSelected: (changes: Partial<TimelineClip>) => void; onKeyframe: () => void; onKeyframeProperty: (value: TimelineClip["keyframes"][number]["property"]) => void; onAddText: (text?: string, style?: TimelineClip["textStyle"]) => void; onAddCaption: () => void; onCaptionDraft: (value: string) => void; onInsertCaption: (text: string) => void; movieQuery: string; movieResults: MovieResult[]; movieLoading: boolean; onMovieQuery: (value: string) => void; sharedTemplates: SharedTemplateResource[]; sharedVideos: SharedVideoResource[]; sharedSounds: SharedSoundResource[]; favoriteTemplateIds: number[]; favoriteSoundIds: number[]; communityResource: CommunityResource | null; communityReviews?: CommunityReviewData; reviewStars: number; reviewBody: string; accountReady: boolean; onOpenSharedTemplate: (id: number, title: string) => void; onUseSharedVideo: (video: SharedVideoResource) => void; onUseSharedSound: (sound: SharedSoundResource) => void; onToggleFavorite: (templateId: number) => void; onToggleSoundFavorite: (soundId: number) => void; onOpenReview: (resource: CommunityResource) => void; onReviewStars: (stars: number) => void; onReviewBody: (body: string) => void; onSubmitReview: () => void; onDeleteReview: (id: number) => void; onPublishTemplate: () => void; onCreateTemplate: (input: { title: string; description: string; category: string }) => void; onPublishVideo: (file: File, input: { title: string; description: string; category: string }) => Promise<void>; onPublishSound: (file: File, input: { title: string; description: string; category: string }) => Promise<void>; onImportSrt: () => void; onExportSrt: () => void; onTemplate: (template: typeof templateRecipes[number]) => void; onElement: (name: string) => void; onAssistant: (command?: string) => void; onAssistantCommand: (value: string) => void; onSaveVersion: () => void; onFullscreen: () => void;
}) {
  const { project, selectedClip, previewAsset, activeVisualClip, activeTextClips, currentTime, duration, playing } = props;
  const mediaStyle = activeVisualClip ? { opacity: activeVisualClip.opacity / 100, transform: `translate(${activeVisualClip.positionX}%, ${activeVisualClip.positionY}%) rotate(${activeVisualClip.rotation}deg) scale(${(activeVisualClip.scale / 100) * (props.previewScale / 100)}) scaleX(${activeVisualClip.flipX ? -1 : 1}) scaleY(${activeVisualClip.flipY ? -1 : 1})`, filter: activeVisualClip.blur ? `blur(${activeVisualClip.blur}px)` : undefined } : undefined;
  return <div className="h-[100dvh] min-h-[42rem] overflow-hidden bg-[#0a0d12]">
    <header className="flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#10131a] px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3"><button onClick={props.onBack} className="revrse-icon-button" aria-label="Return to projects"><ArrowLeft className="h-4 w-4" /></button><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950"><Clapperboard className="h-4 w-4" /></div><div className="min-w-0"><p className="hidden text-[10px] font-extrabold tracking-[0.22em] text-cyan-200 sm:block">REVRSE EDITOR</p><input value={project.name} onChange={event => props.onProjectName(event.target.value)} aria-label="Project name" className="w-32 max-w-full bg-transparent text-sm font-medium text-slate-100 outline-none sm:w-52" /></div><span className="hidden items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-2 py-0.5 text-[10px] text-emerald-200 lg:flex"><Check className="h-3 w-3" /> Local autosave</span></div>
      <div className="flex items-center gap-1"><button onClick={props.onCommand} className="revrse-icon-button" aria-label="Open command palette"><CommandIcon className="h-4 w-4" /></button><button onClick={props.onShortcuts} className="revrse-icon-button hidden sm:grid" aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></button><button onClick={props.onSettings} className="revrse-icon-button hidden sm:grid" aria-label="Project settings"><Settings2 className="h-4 w-4" /></button><button onClick={props.onAccountSave} disabled={props.syncing} className="revrse-button-secondary hidden lg:inline-flex disabled:cursor-wait disabled:opacity-60"><Save className="h-4 w-4" /> {props.syncing ? "Saving" : "Save copy"}</button><button onClick={props.onImport} className="revrse-button-secondary hidden md:inline-flex"><Upload className="h-4 w-4" /> Import</button><button onClick={props.onExport} className="revrse-button-primary"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></button></div>
    </header>
    <div className="lg:hidden border-b border-white/[0.08] bg-[#0e1117] px-2 py-2"><div className="flex gap-1 overflow-x-auto">{panelItems.map(item => <button key={item.id} onClick={() => props.onPanel(item.id)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] transition ${props.activePanel === item.id ? "bg-cyan-300/12 text-cyan-100" : "text-slate-400"}`}>{item.label}</button>)}</div></div>
    <div className="hidden h-[calc(100dvh-3.5rem)] lg:block"><ResizablePanelGroup direction="horizontal"><ResizablePanel defaultSize={18} minSize={14} maxSize={25} className="bg-[#0e1117]"><PanelContent panel={props.activePanel} assets={props.assets} project={project} selectedClip={selectedClip} search={props.search} assetView={props.assetView} captionDraft={props.captionDraft} assistantCommand={props.assistantCommand} movieQuery={props.movieQuery} movieResults={props.movieResults} movieLoading={props.movieLoading} sharedTemplates={props.sharedTemplates} sharedVideos={props.sharedVideos} sharedSounds={props.sharedSounds} favoriteTemplateIds={props.favoriteTemplateIds} favoriteSoundIds={props.favoriteSoundIds} communityResource={props.communityResource} communityReviews={props.communityReviews} reviewStars={props.reviewStars} reviewBody={props.reviewBody} accountReady={props.accountReady} onSearch={props.onSearch} onAssetView={props.onAssetView} onImport={props.onImport} onAddText={props.onAddText} onAddCaption={props.onAddCaption} onCaptionDraft={props.onCaptionDraft} onInsertCaption={props.onInsertCaption} onMovieQuery={props.onMovieQuery} onOpenSharedTemplate={props.onOpenSharedTemplate} onUseSharedVideo={props.onUseSharedVideo} onUseSharedSound={props.onUseSharedSound} onToggleFavorite={props.onToggleFavorite} onToggleSoundFavorite={props.onToggleSoundFavorite} onOpenReview={props.onOpenReview} onReviewStars={props.onReviewStars} onReviewBody={props.onReviewBody} onSubmitReview={props.onSubmitReview} onDeleteReview={props.onDeleteReview} onPublishTemplate={props.onPublishTemplate} onCreateTemplate={props.onCreateTemplate} onPublishVideo={props.onPublishVideo} onPublishSound={props.onPublishSound} onImportSrt={props.onImportSrt} onExportSrt={props.onExportSrt} onUpdateSelected={props.onUpdateSelected} onTemplate={props.onTemplate} onElement={props.onElement} onAssistant={props.onAssistant} onAssistantCommand={props.onAssistantCommand} /></ResizablePanel><ResizableHandle withHandle className="bg-white/[0.06]" /><ResizablePanel defaultSize={61} minSize={40}><ResizablePanelGroup direction="vertical"><ResizablePanel defaultSize={59} minSize={30}><PreviewStage project={project} previewAsset={previewAsset} activeVisualClip={activeVisualClip} activeTextClips={activeTextClips} currentTime={currentTime} duration={duration} playing={playing} showGrid={props.showGrid} showSafeZones={props.showSafeZones} previewScale={props.previewScale} dropHighlight={props.dropHighlight} previewRef={props.previewRef} videoRef={props.videoRef} onDrop={props.onDrop} onDragOver={props.onDragOver} onDragLeave={props.onDragLeave} onTogglePlayback={props.onTogglePlayback} onStep={props.onStep} onSeek={props.onSeek} onEnded={props.onEnded} onGrid={props.onGrid} onSafeZones={props.onSafeZones} onLoop={props.onLoop} onFullscreen={props.onFullscreen} onPreviewScale={props.onPreviewScale} /></ResizablePanel><ResizableHandle withHandle className="bg-white/[0.06]" /><ResizablePanel defaultSize={41} minSize={24}><Timeline project={project} selectedClipId={selectedClip?.id ?? null} currentTime={currentTime} tool={props.tool} pxPerSecond={props.pxPerSecond} ruler={props.ruler} timelineRef={props.timelineRef} draggingId={props.draggingId} snapping={props.snapping} historyAvailable={props.historyAvailable} futureAvailable={props.futureAvailable} onSeek={props.onSeek} onSelect={props.onSelect} onMoveClip={props.onMoveClip} onTrimClip={props.onTrimClip} onDragState={props.onDragState} onTrackChange={props.onTrackChange} onAddTrack={props.onAddTrack} onUndo={props.onUndo} onRedo={props.onRedo} onSplit={props.onSplit} onDelete={props.onDelete} onDuplicate={props.onDuplicate} onMarker={props.onMarker} onTool={props.onTool} onZoom={props.onTimelineZoom} onSnapping={props.onSnapping} /></ResizablePanel></ResizablePanelGroup></ResizablePanel><ResizableHandle withHandle className="bg-white/[0.06]" /><ResizablePanel defaultSize={21} minSize={16} maxSize={30} className="bg-[#0e1117]"><Inspector clip={selectedClip} onUpdate={props.onUpdateSelected} onKeyframe={props.onKeyframe} keyframeProperty={props.keyframeProperty} onKeyframeProperty={props.onKeyframeProperty} /></ResizablePanel></ResizablePanelGroup></div>
    <div className="grid h-[calc(100dvh-6.4rem)] grid-rows-[minmax(0,1fr)_15rem] lg:hidden"><PreviewStage project={project} previewAsset={previewAsset} activeVisualClip={activeVisualClip} activeTextClips={activeTextClips} currentTime={currentTime} duration={duration} playing={playing} showGrid={props.showGrid} showSafeZones={props.showSafeZones} previewScale={props.previewScale} dropHighlight={props.dropHighlight} previewRef={props.previewRef} videoRef={props.videoRef} onDrop={props.onDrop} onDragOver={props.onDragOver} onDragLeave={props.onDragLeave} onTogglePlayback={props.onTogglePlayback} onStep={props.onStep} onSeek={props.onSeek} onEnded={props.onEnded} onGrid={props.onGrid} onSafeZones={props.onSafeZones} onLoop={props.onLoop} onFullscreen={props.onFullscreen} onPreviewScale={props.onPreviewScale} /><Timeline project={project} selectedClipId={selectedClip?.id ?? null} currentTime={currentTime} tool={props.tool} pxPerSecond={Math.min(props.pxPerSecond, 56)} ruler={props.ruler} timelineRef={props.timelineRef} draggingId={props.draggingId} snapping={props.snapping} historyAvailable={props.historyAvailable} futureAvailable={props.futureAvailable} onSeek={props.onSeek} onSelect={props.onSelect} onMoveClip={props.onMoveClip} onTrimClip={props.onTrimClip} onDragState={props.onDragState} onTrackChange={props.onTrackChange} onAddTrack={props.onAddTrack} onUndo={props.onUndo} onRedo={props.onRedo} onSplit={props.onSplit} onDelete={props.onDelete} onDuplicate={props.onDuplicate} onMarker={props.onMarker} onTool={props.onTool} onZoom={props.onTimelineZoom} onSnapping={props.onSnapping} /></div>
    {props.mobilePanelOpen && <div className="fixed inset-x-0 bottom-0 z-40 max-h-[78dvh] overflow-y-auto rounded-t-2xl border-t border-white/[0.12] bg-[#10131a] p-4 shadow-2xl lg:hidden"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-100">{panelItems.find(item => item.id === props.activePanel)?.label}</p><button onClick={props.onCloseMobilePanel} className="revrse-icon-button" aria-label="Close panel"><X className="h-4 w-4" /></button></div><PanelContent panel={props.activePanel} assets={props.assets} project={project} selectedClip={selectedClip} search={props.search} assetView={props.assetView} captionDraft={props.captionDraft} assistantCommand={props.assistantCommand} movieQuery={props.movieQuery} movieResults={props.movieResults} movieLoading={props.movieLoading} sharedTemplates={props.sharedTemplates} sharedVideos={props.sharedVideos} sharedSounds={props.sharedSounds} favoriteTemplateIds={props.favoriteTemplateIds} favoriteSoundIds={props.favoriteSoundIds} communityResource={props.communityResource} communityReviews={props.communityReviews} reviewStars={props.reviewStars} reviewBody={props.reviewBody} accountReady={props.accountReady} onSearch={props.onSearch} onAssetView={props.onAssetView} onImport={props.onImport} onAddText={props.onAddText} onAddCaption={props.onAddCaption} onCaptionDraft={props.onCaptionDraft} onInsertCaption={props.onInsertCaption} onMovieQuery={props.onMovieQuery} onOpenSharedTemplate={props.onOpenSharedTemplate} onUseSharedVideo={props.onUseSharedVideo} onUseSharedSound={props.onUseSharedSound} onToggleFavorite={props.onToggleFavorite} onToggleSoundFavorite={props.onToggleSoundFavorite} onOpenReview={props.onOpenReview} onReviewStars={props.onReviewStars} onReviewBody={props.onReviewBody} onSubmitReview={props.onSubmitReview} onDeleteReview={props.onDeleteReview} onPublishTemplate={props.onPublishTemplate} onCreateTemplate={props.onCreateTemplate} onPublishVideo={props.onPublishVideo} onPublishSound={props.onPublishSound} onImportSrt={props.onImportSrt} onExportSrt={props.onExportSrt} onUpdateSelected={props.onUpdateSelected} onTemplate={props.onTemplate} onElement={props.onElement} onAssistant={props.onAssistant} onAssistantCommand={props.onAssistantCommand} /></div>}
  </div>;
}

function PreviewStage({ project, previewAsset, activeVisualClip, activeTextClips, currentTime, duration, playing, showGrid, showSafeZones, previewScale, dropHighlight, previewRef, videoRef, onDrop, onDragOver, onDragLeave, onTogglePlayback, onStep, onSeek, onEnded, onGrid, onSafeZones, onLoop, onFullscreen, onPreviewScale }: {
  project: EditorProject; previewAsset?: EditorAsset; activeVisualClip?: TimelineClip | null; activeTextClips: TimelineClip[]; currentTime: number; duration: number; playing: boolean; showGrid: boolean; showSafeZones: boolean; previewScale: number; dropHighlight: boolean; previewRef: React.RefObject<HTMLDivElement | null>; videoRef: React.RefObject<HTMLVideoElement | null>; onDrop: (event: DragEvent) => void; onDragOver: () => void; onDragLeave: () => void; onTogglePlayback: () => void; onStep: (direction: -1 | 1) => void; onSeek: (value: number) => void; onEnded: () => void; onGrid: () => void; onSafeZones: () => void; onLoop: () => void; onFullscreen: () => void; onPreviewScale: (value: number) => void;
}) {
  const style = activeVisualClip ? { opacity: activeVisualClip.opacity / 100, transform: `translate(${activeVisualClip.positionX}%, ${activeVisualClip.positionY}%) rotate(${activeVisualClip.rotation}deg) scale(${(activeVisualClip.scale / 100) * (previewScale / 100)}) scaleX(${activeVisualClip.flipX ? -1 : 1}) scaleY(${activeVisualClip.flipY ? -1 : 1})`, filter: activeVisualClip.blur ? `blur(${activeVisualClip.blur}px)` : undefined } : undefined;
  return <section className="flex min-h-0 flex-col bg-[#12151c]"><div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2"><div className="flex items-center gap-2 text-[11px] text-slate-400"><MousePointer2 className="h-3.5 w-3.5 text-cyan-200" /> {activeVisualClip ? activeVisualClip.name : "Canvas preview"}</div><div className="flex items-center gap-1"><button onClick={onGrid} className={`revrse-icon-button h-7 w-7 ${showGrid ? "bg-cyan-300/10 text-cyan-100" : ""}`} aria-label="Toggle grid"><Grid2X2 className="h-3.5 w-3.5" /></button><button onClick={onSafeZones} className={`revrse-icon-button h-7 w-7 ${showSafeZones ? "bg-cyan-300/10 text-cyan-100" : ""}`} aria-label="Toggle safe zones"><Ruler className="h-3.5 w-3.5" /></button><select value={previewScale} onChange={event => onPreviewScale(Number(event.target.value))} className="rounded border border-white/[0.08] bg-white/[0.035] px-1.5 py-1 text-[10px] text-slate-300"><option value={50}>50%</option><option value={75}>75%</option><option value={100}>Fit</option><option value={125}>125%</option><option value={200}>200%</option></select><button onClick={onFullscreen} className="revrse-icon-button h-7 w-7" aria-label="Fullscreen preview"><Maximize2 className="h-3.5 w-3.5" /></button></div></div><div ref={previewRef} onDrop={onDrop} onDragOver={event => { event.preventDefault(); onDragOver(); }} onDragLeave={onDragLeave} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#07090d] p-3"><div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_center,rgba(34,211,238,.13),transparent_45%)]" /><div className={`relative flex max-h-full w-full items-center justify-center overflow-hidden border border-white/[0.12] bg-[${project.canvas.background}] shadow-2xl ${aspectClass(project.aspectRatio)}`} style={{ background: project.canvas.background }}>
    {previewAsset?.url && previewAsset.kind === "video" ? <video ref={videoRef} src={previewAsset.url} className={`h-full w-full object-contain transition-transform duration-150 ${clipFilter(activeVisualClip ?? null)}`} style={style} onTimeUpdate={event => onSeek((activeVisualClip?.start ?? 0) + Math.max(0, event.currentTarget.currentTime - (activeVisualClip?.trimStart ?? 0)) / Math.max(0.1, activeVisualClip?.speed ?? 1))} onPlay={() => undefined} onPause={() => undefined} onEnded={onEnded} /> : previewAsset?.url && previewAsset.kind === "image" ? <img src={previewAsset.url} alt="Selected project asset" className={`h-full w-full object-contain transition-transform duration-150 ${clipFilter(activeVisualClip ?? null)}`} style={style} /> : <div className="relative z-10 max-w-xs px-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/5"><Upload className="h-5 w-5 text-cyan-100" /></div><p className="mt-3 text-sm font-medium text-slate-200">Drop your media into the canvas</p><p className="mt-1.5 text-xs leading-relaxed text-slate-500">Use your own licensed video or images. Imports remain in this browser session.</p></div>}
    {activeTextClips.map(clip => <div key={clip.id} className={`pointer-events-none absolute inset-x-[9%] text-center font-bold tracking-[.12em] text-white drop-shadow-[0_2px_7px_rgba(0,0,0,.8)] ${clip.textStyle === "caption" ? "bottom-[11%] text-sm sm:text-lg" : clip.textStyle === "lower-third" ? "bottom-[18%] text-left text-lg sm:text-2xl" : "top-[18%] text-2xl sm:text-4xl"}`} style={{ opacity: clip.opacity / 100, transform: `translate(${clip.positionX}%, ${clip.positionY}%) rotate(${clip.rotation}deg) scale(${clip.scale / 100})` }}>{clip.textContent || clip.name}</div>)}
    {showGrid && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.13)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.13)_1px,transparent_1px)] bg-[size:33.333%_33.333%]" />}{showSafeZones && <><div className="pointer-events-none absolute inset-[7%] border border-emerald-300/60" /><div className="pointer-events-none absolute inset-[13%] border border-amber-300/50" /></>}{dropHighlight && <div className="absolute inset-3 z-30 grid place-items-center border-2 border-dashed border-cyan-200 bg-cyan-300/10 text-sm font-semibold text-cyan-50">Drop media to import</div>}</div></div><div className="flex items-center justify-center gap-2 border-t border-white/[0.07] bg-[#10131a] px-3 py-2"><span className="w-16 text-right font-mono text-[11px] text-slate-500">{formatTime(currentTime)}</span><button onClick={() => onStep(-1)} className="revrse-icon-button" aria-label="Previous frame"><StepBack className="h-4 w-4" /></button><button onClick={onTogglePlayback} className="grid h-9 w-9 place-items-center rounded-full bg-cyan-300 text-slate-950 transition hover:bg-cyan-200 active:scale-95" aria-label={playing ? "Pause preview" : "Play preview"}>{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button><button onClick={() => onStep(1)} className="revrse-icon-button" aria-label="Next frame"><StepForward className="h-4 w-4" /></button><button onClick={onLoop} className="revrse-icon-button hidden sm:grid" aria-label="Loop playback"><RotateCcw className="h-3.5 w-3.5" /></button><span className="w-16 font-mono text-[11px] text-slate-500">{formatTime(duration)}</span><span className="hidden rounded bg-white/[0.04] px-1.5 py-1 text-[10px] text-slate-500 sm:block">{project.canvas.fps} fps</span></div></section>;
}

function SoundLibraryPanel({ sounds, favoriteIds = [], accountReady, onUse, onFavorite, onRate, onPublish }: { sounds: SharedSoundResource[]; favoriteIds?: number[]; accountReady: boolean; onUse?: (sound: SharedSoundResource) => void; onFavorite?: (soundId: number) => void; onRate?: (resource: CommunityResource) => void; onPublish?: (file: File, input: { title: string; description: string; category: string }) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Music");
  const [attested, setAttested] = useState(false);
  const visible = sounds.filter(sound => `${sound.title} ${sound.description} ${sound.category}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async () => {
    if (!file || !title.trim() || description.trim().length < 10 || !category.trim() || !attested || !onPublish) return;
    await onPublish(file, { title: title.trim(), description: description.trim(), category: category.trim() });
    setFile(null); setTitle(""); setDescription(""); setAttested(false);
  };
  return <div className="space-y-3"><div className="rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-fuchsia-100"><Music2 className="h-4 w-4" /> Licensed Sound Library</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">Browse creator-uploaded, royalty-free, public-domain, or properly licensed sounds. Commercial song, movie-dialogue, and meme catalogs are not hosted here. Added sounds never autoplay.</p></div><div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search licensed sounds" className="revrse-search" /></div><div className="space-y-2">{visible.length ? visible.map(sound => <article key={sound.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><div className="flex items-start gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-fuchsia-300/10 text-fuchsia-100"><Music2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{sound.title}</p><p className="mt-1 text-[10px] text-slate-500">{sound.category} · {formatTime(sound.durationMs / 1000)} · {sound.creatorName ?? "Creator"}</p><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{sound.description}</p></div></div><div className="mt-2 flex gap-1.5"><button onClick={() => onUse?.(sound)} className="revrse-mini-button">Use in edit</button><button onClick={() => onFavorite?.(sound.id)} className={`revrse-mini-button ${favoriteIds.includes(sound.id) ? "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100" : ""}`} aria-pressed={favoriteIds.includes(sound.id)}><Star className={`h-3 w-3 ${favoriteIds.includes(sound.id) ? "fill-current" : ""}`} /> {favoriteIds.includes(sound.id) ? "Saved" : "Save"}</button><button onClick={() => onRate?.({ type: "sound", id: sound.id, title: sound.title })} className="revrse-mini-button">Rate</button></div></article>) : <p className="rounded-lg border border-dashed border-white/[0.1] p-3 text-center text-[10px] leading-relaxed text-slate-500">No shared lawful sounds match this search. Publish a creator-owned or properly licensed resource to start the library.</p>}</div><details className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-200">Publish a lawful sound</summary><div className="mt-3 space-y-2"><p className="text-[10px] leading-relaxed text-slate-500">Upload MP3, M4A, WAV, OGG, or WebM audio up to 12 MB. Do not upload commercial music, film audio, or copied memes without explicit rights.</p><input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm" onChange={event => setFile(event.target.files?.[0] ?? null)} className="block w-full text-[10px] text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-white/[0.08] file:px-2 file:py-1 file:text-[10px] file:text-slate-200" /><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Sound title" className="revrse-search" /><input value={category} onChange={event => setCategory(event.target.value)} placeholder="Category, e.g. Ambient" className="revrse-search" /><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="Rights/source description (at least 10 characters)" className="revrse-search resize-none pl-3" /><label className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400"><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} className="mt-0.5" /> I own this sound, it is public domain, royalty-free under a compatible license, or I have permission to distribute it.</label><button onClick={() => void submit()} disabled={!accountReady || !file || !title.trim() || description.trim().length < 10 || !attested || !onPublish} className="revrse-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Publish lawful sound</button>{!accountReady && <p className="text-[10px] text-slate-500">Sign in to publish. You can still browse and add visible lawful sounds to an edit.</p>}</div></details></div>;
}

function MovieDialoguePanel({ movieQuery, movieResults, movieLoading, captionDraft, captions, onMovieQuery, onCaptionDraft, onInsertCaption }: { movieQuery: string; movieResults: MovieResult[]; movieLoading: boolean; captionDraft: string; captions: EditorProject["captions"]; onMovieQuery: (value: string) => void; onCaptionDraft: (value: string) => void; onInsertCaption: (text: string) => void }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [captionSearch, setCaptionSearch] = useState("");
  const captionMatches = (captionSearch.trim() ? captions.filter(caption => caption.text.toLowerCase().includes(captionSearch.trim().toLowerCase())) : captions).slice(0, 6);
  const selectCaption = (caption: CaptionSegment) => {
    onCaptionDraft(caption.text);
    window.dispatchEvent(new CustomEvent<CaptionSegment>("revrse:jump-caption", { detail: caption }));
  };

  return <div className="space-y-3">
    <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><Film className="h-4 w-4" /> Movie Dialogue Workspace</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">Find public movie listings here, but only add dialogue you created, own, or are licensed to use. REVRSE EDITOR does not download, extract, host, or re-share films.</p>
    </div>
    <input value={movieQuery} onChange={event => onMovieQuery(event.target.value)} placeholder="Search movie title for a legal listing" className="revrse-search" />
    {movieLoading ? <p className="text-[11px] text-slate-500">Finding legal listings…</p> : <div className="space-y-2">{movieResults.map(movie => <div key={movie.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><p className="text-xs font-semibold text-slate-200">{movie.title}</p><p className="mt-1 text-[10px] text-slate-500">{movie.year || "Year unavailable"}{movie.genre ? ` · ${movie.genre}` : ""}</p>{movie.storeUrl && <a href={movie.storeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[10px] font-medium text-cyan-200 hover:text-cyan-100">Open legal listing</a>}</div>)}{movieQuery.trim().length >= 2 && !movieResults.length && <p className="rounded-lg border border-dashed border-white/[0.1] p-3 text-center text-[11px] text-slate-500">No listing found. Try another title.</p>}</div>}
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"><p className="text-[11px] font-semibold text-slate-200">Permitted source record</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Optionally record the URL of your own, public-domain, or licensed source. It is not downloaded or embedded.</p><input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://licensed-source.example" className="revrse-search mt-2" /><label className="mt-2 flex items-start gap-2 text-[10px] leading-relaxed text-slate-400"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} className="mt-0.5" /> I created this dialogue or have the rights required to use it in this project.</label></div>
    <textarea value={captionDraft} onChange={event => onCaptionDraft(event.target.value)} rows={3} className="revrse-search resize-none pl-3" placeholder="Paste or write permitted dialogue as an editable caption" />
    <div className="grid gap-2"><button onClick={() => onInsertCaption(captionDraft)} disabled={!captionDraft.trim() || !rightsConfirmed} className="revrse-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><Subtitles className="h-4 w-4" /> Insert editable permitted caption</button><button onClick={() => window.dispatchEvent(new Event("revrse:update-caption"))} disabled={!captionDraft.trim()} className="revrse-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-50">Update selected caption</button></div>
    <div><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Existing editable captions</p><span className="text-[10px] text-slate-500">Select a row to jump and edit</span></div><input value={captionSearch} onChange={event => setCaptionSearch(event.target.value)} placeholder="Search saved captions" className="revrse-search mt-2" /><div className="mt-2 space-y-1.5">{captionMatches.length ? captionMatches.map(caption => <button key={caption.id} onClick={() => selectCaption(caption)} className="w-full rounded-md border border-white/[0.08] bg-white/[0.025] p-2 text-left hover:bg-white/[0.06]"><span className="font-mono text-[10px] text-cyan-200">{formatTime(caption.start)}</span><span className="ml-2 text-[10px] text-slate-300">{caption.text}</span></button>) : <p className="rounded-md border border-dashed border-white/[0.1] p-2 text-center text-[10px] text-slate-500">No matching editable captions yet.</p>}</div></div>
  </div>;
}

function CreatorPublishPanel({ accountReady, defaultTitle, onTemplate, onVideo }: { accountReady: boolean; defaultTitle: string; onTemplate?: (input: { title: string; description: string; category: string }) => void; onVideo?: (file: File, input: { title: string; description: string; category: string }) => Promise<void> }) {
  const [templateTitle, setTemplateTitle] = useState(defaultTitle);
  const [templateDescription, setTemplateDescription] = useState("Editable original REVRSE project structure.");
  const [templateCategory, setTemplateCategory] = useState("Creator template");
  const [templateAttested, setTemplateAttested] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [videoCategory, setVideoCategory] = useState("B-roll");
  const [videoAttested, setVideoAttested] = useState(false);
  return <div className="space-y-2"><details className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-3"><summary className="cursor-pointer text-xs font-semibold text-cyan-100">Publish original editable template</summary><div className="mt-3 space-y-2"><input value={templateTitle} onChange={event => setTemplateTitle(event.target.value)} placeholder="Template title" className="revrse-search" /><input value={templateCategory} onChange={event => setTemplateCategory(event.target.value)} placeholder="Category" className="revrse-search" /><textarea value={templateDescription} onChange={event => setTemplateDescription(event.target.value)} rows={2} placeholder="Describe the editable template" className="revrse-search resize-none pl-3" /><label className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400"><input type="checkbox" checked={templateAttested} onChange={event => setTemplateAttested(event.target.checked)} className="mt-0.5" /> I created this project or have permission to publish every included element as an editable template.</label><button onClick={() => onTemplate?.({ title: templateTitle.trim(), description: templateDescription.trim(), category: templateCategory.trim() })} disabled={!accountReady || !templateTitle.trim() || templateDescription.trim().length < 10 || !templateCategory.trim() || !templateAttested || !onTemplate} className="revrse-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Publish editable template</button></div></details><details className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-3"><summary className="cursor-pointer text-xs font-semibold text-cyan-100">Publish licensed reusable video</summary><div className="mt-3 space-y-2"><p className="text-[10px] leading-relaxed text-slate-500">Upload MP4, WebM, or MOV video up to 18 MB only when you own it or can lawfully share it for others to edit.</p><input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={event => setVideo(event.target.files?.[0] ?? null)} className="block w-full text-[10px] text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-white/[0.08] file:px-2 file:py-1 file:text-[10px] file:text-slate-200" /><input value={videoTitle} onChange={event => setVideoTitle(event.target.value)} placeholder="Video title" className="revrse-search" /><input value={videoCategory} onChange={event => setVideoCategory(event.target.value)} placeholder="Category, e.g. B-roll" className="revrse-search" /><textarea value={videoDescription} onChange={event => setVideoDescription(event.target.value)} rows={2} placeholder="Rights/source description (at least 10 characters)" className="revrse-search resize-none pl-3" /><label className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400"><input type="checkbox" checked={videoAttested} onChange={event => setVideoAttested(event.target.checked)} className="mt-0.5" /> I own this video, it is public domain or properly licensed, and I may share it for others to edit.</label><button onClick={() => { if (video) void onVideo?.(video, { title: videoTitle.trim(), description: videoDescription.trim(), category: videoCategory.trim() }); }} disabled={!accountReady || !video || !videoTitle.trim() || videoDescription.trim().length < 10 || !videoCategory.trim() || !videoAttested || !onVideo} className="revrse-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Publish licensed video</button></div></details></div>;
}

function PanelContent({ panel, assets, project, selectedClip, search, assetView, captionDraft, assistantCommand, movieQuery, movieResults, movieLoading, sharedTemplates = [], sharedVideos = [], sharedSounds = [], favoriteTemplateIds = [], favoriteSoundIds = [], communityResource, communityReviews, reviewStars = 5, reviewBody = "", accountReady = false, onSearch, onAssetView, onImport, onAddText, onAddCaption, onCaptionDraft, onInsertCaption, onMovieQuery, onOpenSharedTemplate, onUseSharedVideo, onUseSharedSound, onToggleFavorite, onToggleSoundFavorite, onOpenReview, onReviewStars, onReviewBody, onSubmitReview, onDeleteReview, onPublishTemplate, onCreateTemplate, onPublishVideo, onPublishSound, onImportSrt, onExportSrt, onUpdateSelected, onTemplate, onElement, onAssistant, onAssistantCommand }: { panel: Panel; assets: EditorAsset[]; project: EditorProject; selectedClip: TimelineClip | null; search: string; assetView: "grid" | "list"; captionDraft: string; assistantCommand: string; movieQuery: string; movieResults: MovieResult[]; movieLoading: boolean; sharedTemplates?: SharedTemplateResource[]; sharedVideos?: SharedVideoResource[]; sharedSounds?: SharedSoundResource[]; favoriteTemplateIds?: number[]; favoriteSoundIds?: number[]; communityResource?: CommunityResource | null; communityReviews?: CommunityReviewData; reviewStars?: number; reviewBody?: string; accountReady?: boolean; onSearch: (value: string) => void; onAssetView: (value: "grid" | "list") => void; onImport: () => void; onAddText: (text?: string, style?: TimelineClip["textStyle"]) => void; onAddCaption: () => void; onCaptionDraft: (value: string) => void; onInsertCaption: (text: string) => void; onMovieQuery: (value: string) => void; onOpenSharedTemplate?: (id: number, title: string) => void; onUseSharedVideo?: (video: SharedVideoResource) => void; onUseSharedSound?: (sound: SharedSoundResource) => void; onToggleFavorite?: (templateId: number) => void; onToggleSoundFavorite?: (soundId: number) => void; onOpenReview?: (resource: CommunityResource) => void; onReviewStars?: (stars: number) => void; onReviewBody?: (body: string) => void; onSubmitReview?: () => void; onDeleteReview?: (id: number) => void; onPublishTemplate?: () => void; onCreateTemplate?: (input: { title: string; description: string; category: string }) => void; onPublishVideo?: (file: File, input: { title: string; description: string; category: string }) => Promise<void>; onPublishSound?: (file: File, input: { title: string; description: string; category: string }) => Promise<void>; onImportSrt: () => void; onExportSrt: () => void; onUpdateSelected: (changes: Partial<TimelineClip>) => void; onTemplate: (template: typeof templateRecipes[number]) => void; onElement: (name: string) => void; onAssistant: (command?: string) => void; onAssistantCommand: (value: string) => void }) {
  const body: Partial<Record<Panel, ReactNode>> = {
    media: <><div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search media bin" className="revrse-search" /></div><div className="mt-3 flex gap-2"><button onClick={onImport} className="revrse-button-primary flex-1"><Upload className="h-3.5 w-3.5" /> Import</button><button onClick={() => onAssetView(assetView === "grid" ? "list" : "grid")} className="revrse-icon-button border border-white/[0.08]" aria-label="Change asset view">{assetView === "grid" ? <List className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}</button></div><div className={`mt-4 gap-2 ${assetView === "grid" ? "grid grid-cols-2" : "space-y-2"}`}>{assets.length ? assets.map(asset => <div key={asset.id} className={`rounded-lg border border-white/[0.08] bg-white/[0.025] p-2 ${assetView === "list" ? "flex items-center gap-2" : ""}`}><span className="grid h-9 w-9 place-items-center rounded bg-cyan-300/10 text-cyan-100">{assetIcon(asset.kind)}</span><div className="mt-2 min-w-0"><p className="truncate text-[11px] font-medium text-slate-200">{asset.name}</p><p className="mt-1 text-[10px] text-slate-500">{asset.kind} · {formatSize(asset.size)}</p></div></div>) : <div className="col-span-full rounded-lg border border-dashed border-white/[0.12] p-5 text-center text-xs leading-relaxed text-slate-500">No media yet. Drag video or image files here, or browse your device.</div>}</div></>,
    text: <div className="space-y-3"><p className="text-xs leading-relaxed text-slate-500">Create an editable text layer at the playhead. Select it to control transform, timing, effects, and keyframes.</p>{[["Headline", "headline"], ["Lower third", "lower-third"], ["Chapter marker", "chapter"]].map(([label, style]) => <button key={label} onClick={() => onAddText(label, style as TimelineClip["textStyle"])} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.06]"><p className="text-xs font-semibold text-slate-200">{label}</p><p className="mt-1 text-[10px] text-slate-500">Add an editable typographic layer</p></button>)}</div>,
    captions: <div className="space-y-3"><div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><Subtitles className="h-4 w-4" /> Timed caption workspace</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">Import an existing SRT or write an editable caption. Automated transcription is not shown unless a transcription provider is connected.</p></div><textarea value={captionDraft} onChange={event => onCaptionDraft(event.target.value)} rows={3} className="revrse-search resize-none pl-3" placeholder="Write a caption" /><button onClick={onAddCaption} className="revrse-button-primary w-full"><Plus className="h-4 w-4" /> Add caption at playhead</button><div className="grid grid-cols-2 gap-2"><button onClick={onImportSrt} className="revrse-button-secondary"><FileUp className="h-3.5 w-3.5" /> Import SRT</button><button onClick={onExportSrt} className="revrse-button-secondary"><Download className="h-3.5 w-3.5" /> Export SRT</button></div><p className="text-[10px] text-slate-500">{project.captions.length} timed caption segment{project.captions.length === 1 ? "" : "s"} in this project.</p></div>,
    effects: <div className="space-y-2">{effectOptions.map(effect => <button key={effect.id} disabled={!selectedClip} onClick={() => onUpdateSelected({ effect: effect.id })} className={`w-full rounded-lg border p-3 text-left transition ${selectedClip?.effect === effect.id ? "border-cyan-300/35 bg-cyan-300/[0.08]" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.055]"}`}><p className="text-xs font-medium text-slate-200">{effect.label}</p><p className="mt-1 text-[10px] text-slate-500">{effect.description}</p></button>)}{!selectedClip && <p className="pt-2 text-center text-[11px] text-slate-500">Select a clip to apply an effect.</p>}</div>,
    transitions: <div className="space-y-2">{transitionOptions.map(transition => <button key={transition.id} disabled={!selectedClip} onClick={() => onUpdateSelected({ transitionOut: transition.id })} className={`w-full rounded-lg border p-3 text-left transition ${selectedClip?.transitionOut === transition.id ? "border-cyan-300/35 bg-cyan-300/[0.08]" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.055]"}`}><p className="text-xs font-medium text-slate-200">{transition.label}</p><p className="mt-1 text-[10px] text-slate-500">{transition.description}</p></button>)}{!selectedClip && <p className="pt-2 text-center text-[11px] text-slate-500">Select a clip to assign its outgoing transition.</p>}</div>,
    templates: <div className="space-y-3">{templateRecipes.map(template => <article key={template.name} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#151a22]"><div className={`aspect-[16/7] bg-gradient-to-br ${template.color} p-3`}><div className="flex h-full items-start justify-between"><Sparkles className="h-4 w-4 text-white/80" /><span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/80">{template.ratio}</span></div></div><div className="p-3"><p className="text-xs font-semibold text-slate-100">{template.name}</p><p className="mt-1 text-[10px] text-slate-500">{template.category} · {template.duration} · {template.clips} editable placeholders</p><button onClick={() => onTemplate(template)} className="revrse-button-secondary mt-3 w-full"><Sparkles className="h-3.5 w-3.5" /> Use template</button></div></article>)}</div>,
    elements: <div className="grid grid-cols-2 gap-2">{["Rectangle", "Circle", "Arrow", "Line", "Frame", "Label"].map(element => <button key={element} onClick={() => onElement(element)} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.06]"><SquareStack className="h-4 w-4 text-cyan-100" /><p className="mt-3 text-xs font-medium text-slate-200">{element}</p><p className="mt-1 text-[10px] text-slate-500">Editable overlay layer</p></button>)}</div>,
    search: <div><div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search project text and captions" className="revrse-search" /></div><div className="mt-4 space-y-2">{project.captions.filter(caption => caption.text.toLowerCase().includes(search.toLowerCase())).length ? project.captions.filter(caption => caption.text.toLowerCase().includes(search.toLowerCase())).map(caption => <div key={caption.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"><p className="font-mono text-[10px] text-cyan-200">{formatTime(caption.start)}</p><p className="mt-1 text-xs text-slate-300">{caption.text}</p></div>) : <p className="rounded-lg border border-dashed border-white/[0.1] p-4 text-center text-xs leading-relaxed text-slate-500">Search imported caption text and editable on-screen captions. Transcript generation remains provider-based rather than simulated.</p>}</div></div>,
    movies: <div className="space-y-3"><div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><Film className="h-4 w-4" /> Movie Dialogue Workspace</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">Find a movie listing, then add only dialogue you created, own, or are licensed to use as an editable caption. REVRSE does not download or host films.</p></div><input value={movieQuery} onChange={event => onMovieQuery(event.target.value)} placeholder="Search movie title" className="revrse-search" />{movieLoading ? <p className="text-[11px] text-slate-500">Finding legal listings…</p> : <div className="space-y-2">{movieResults.map(movie => <div key={movie.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><p className="text-xs font-semibold text-slate-200">{movie.title}</p><p className="mt-1 text-[10px] text-slate-500">{movie.year || "Year unavailable"}{movie.genre ? ` · ${movie.genre}` : ""}</p>{movie.storeUrl && <a href={movie.storeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[10px] font-medium text-cyan-200 hover:text-cyan-100">Open legal listing</a>}</div>)}{movieQuery.trim().length >= 2 && !movieResults.length && <p className="rounded-lg border border-dashed border-white/[0.1] p-3 text-center text-[11px] text-slate-500">No listing found. Try another title.</p>}</div>}<textarea value={captionDraft} onChange={event => onCaptionDraft(event.target.value)} rows={3} className="revrse-search resize-none pl-3" placeholder="Paste or write dialogue you are allowed to use" /><button onClick={() => onInsertCaption(captionDraft)} disabled={!captionDraft.trim()} className="revrse-button-primary w-full disabled:opacity-50"><Subtitles className="h-4 w-4" /> Insert editable caption</button></div>,
    studio: <div className="space-y-3"><div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-amber-100"><Star className="h-4 w-4" /> Creator Studio</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">Share original templates and licensed video resources only. Ratings below appear only after real users submit them.</p></div><button onClick={onPublishTemplate} disabled={!accountReady || !onPublishTemplate} className="revrse-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Publish current project as template</button>{!accountReady && <p className="text-[10px] leading-relaxed text-slate-500">Sign in to publish, favourite, or review. You can still use visible shared resources in your local edit.</p>}<div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Shared templates</p><div className="space-y-2">{sharedTemplates.length ? sharedTemplates.map(template => <article key={template.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{template.title}</p><p className="mt-1 text-[10px] text-slate-500">{template.category} · {template.aspectRatio} · {template.creatorName ?? "Creator"}</p></div><button onClick={() => onToggleFavorite?.(template.id)} disabled={!onToggleFavorite} className={`revrse-icon-button ${favoriteTemplateIds.includes(template.id) ? "text-amber-200" : ""}`} aria-label={`Favourite ${template.title}`}><Star className="h-3.5 w-3.5" /></button></div><div className="mt-2 flex gap-1.5"><button onClick={() => onOpenSharedTemplate?.(template.id, template.title)} className="revrse-mini-button">Use</button><button onClick={() => onOpenReview?.({ type: "template", id: template.id, title: template.title })} className="revrse-mini-button">Rate</button></div></article>) : <p className="rounded-lg border border-dashed border-white/[0.1] p-3 text-center text-[10px] text-slate-500">No shared templates yet. Publish an original project to become the first creator.</p>}</div></div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Licensed video resources</p><div className="space-y-2">{sharedVideos.length ? sharedVideos.map(video => <article key={video.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><p className="truncate text-xs font-semibold text-slate-200">{video.title}</p><p className="mt-1 text-[10px] text-slate-500">{video.category} · {video.width}×{video.height} · {video.creatorName ?? "Creator"}</p><div className="mt-2 flex gap-1.5"><button onClick={() => onUseSharedVideo?.(video)} className="revrse-mini-button">Use in edit</button><button onClick={() => onOpenReview?.({ type: "video", id: video.id, title: video.title })} className="revrse-mini-button">Rate</button></div></article>) : <p className="rounded-lg border border-dashed border-white/[0.1] p-3 text-center text-[10px] text-slate-500">No shared licensed videos yet.</p>}</div></div>{communityResource && <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><p className="text-xs font-semibold text-cyan-100">Review: {communityResource.title}</p><p className="mt-1 text-[10px] text-slate-400">{communityReviews?.summary.count ? `${communityReviews.summary.average?.toFixed(1)} / 5 from ${communityReviews.summary.count} real review${communityReviews.summary.count === 1 ? "" : "s"}` : "No real ratings yet."}</p><div className="mt-2 flex gap-1">{[1,2,3,4,5].map(star => <button key={star} onClick={() => onReviewStars?.(star)} className={`p-1 ${star <= reviewStars ? "text-amber-200" : "text-slate-600"}`} aria-label={`${star} star${star === 1 ? "" : "s"}`}><Star className="h-3.5 w-3.5 fill-current" /></button>)}</div><textarea value={reviewBody} onChange={event => onReviewBody?.(event.target.value)} rows={2} className="revrse-search mt-2 resize-none pl-3" placeholder="Write an honest review (optional)" /><button onClick={onSubmitReview} disabled={!accountReady || !onSubmitReview} className="revrse-button-secondary mt-2 w-full disabled:opacity-50">Publish your rating</button><div className="mt-3 space-y-2">{communityReviews?.reviews.map(review => <div key={review.id} className="rounded-md border border-white/[0.08] bg-black/10 p-2"><p className="text-[10px] text-amber-200">{"★".repeat(review.stars)} <span className="text-slate-500">by {review.reviewerName ?? "Creator"}</span></p>{review.body && <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{review.body}</p>}{review.canManage && <button onClick={() => onDeleteReview?.(review.id)} className="mt-1 text-[10px] text-rose-200 hover:text-rose-100">Delete my review</button>}</div>)}</div></div>}</div>,
    assistant: <div className="space-y-3"><div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><WandSparkles className="h-4 w-4" /> Local edit assistant</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">It makes transparent, editable changes to your timeline. It does not claim to analyse files when no external provider is configured.</p></div><textarea value={assistantCommand} onChange={event => onAssistantCommand(event.target.value)} rows={3} className="revrse-search resize-none pl-3" placeholder="Make this cinematic" /><button onClick={() => onAssistant()} className="revrse-button-primary w-full"><WandSparkles className="h-4 w-4" /> Apply editable action</button><div className="grid gap-2">{["Make this cinematic", "Make this vertical short-form", "Make pacing faster", "Add captions"].map(command => <button key={command} onClick={() => onAssistant(command)} className="rounded-md border border-white/[0.08] px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/[0.05]">{command}</button>)}</div></div>,
  };
  body.studio = <div className="space-y-3"><CreatorPublishPanel accountReady={accountReady} defaultTitle={project.name || "Untitled REVRSE template"} onTemplate={onCreateTemplate} onVideo={onPublishVideo} />{body.studio}</div>;
  return <aside className="h-full overflow-y-auto border-r border-white/[0.08] p-3 lg:p-4"><div className="mb-4 flex items-center justify-between"><p className="text-sm font-semibold text-slate-100">{panelItems.find(item => item.id === panel)?.label}</p><span className="text-[10px] text-slate-500">{panel === "media" ? `${assets.length} items` : ""}</span></div>{panel === "sounds" ? <SoundLibraryPanel sounds={sharedSounds} favoriteIds={favoriteSoundIds} accountReady={accountReady} onUse={onUseSharedSound} onFavorite={onToggleSoundFavorite} onRate={onOpenReview} onPublish={onPublishSound} /> : panel === "movies" ? <MovieDialoguePanel movieQuery={movieQuery} movieResults={movieResults} movieLoading={movieLoading} captionDraft={captionDraft} captions={project.captions} onMovieQuery={onMovieQuery} onCaptionDraft={onCaptionDraft} onInsertCaption={onInsertCaption} /> : body[panel]}</aside>;
}

function Timeline({ project, selectedClipId, currentTime, tool, pxPerSecond, ruler, timelineRef, draggingId, snapping, historyAvailable, futureAvailable, onSeek, onSelect, onMoveClip, onTrimClip, onDragState, onTrackChange, onAddTrack, onUndo, onRedo, onSplit, onDelete, onDuplicate, onMarker, onTool, onZoom, onSnapping }: { project: EditorProject; selectedClipId: string | null; currentTime: number; tool: Tool; pxPerSecond: number; ruler: number[]; timelineRef: React.RefObject<HTMLDivElement | null>; draggingId: string | null; snapping: boolean; historyAvailable: boolean; futureAvailable: boolean; onSeek: (time: number) => void; onSelect: (id: string | null) => void; onMoveClip: (id: string, start: number) => void; onTrimClip: (id: string, changes: Partial<TimelineClip>) => void; onDragState: (id: string | null) => void; onTrackChange: (id: string, changes: Partial<TimelineTrack>) => void; onAddTrack: (type: TimelineTrack["type"]) => void; onUndo: () => void; onRedo: () => void; onSplit: () => void; onDelete: (ripple?: boolean) => void; onDuplicate: () => void; onMarker: () => void; onTool: (tool: Tool) => void; onZoom: (value: number) => void; onSnapping: () => void }) {
  const width = Math.max(780, projectDuration(project) * pxPerSecond + 160);
  const seek = (event: ReactPointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest("[data-clip]")) return; const rect = event.currentTarget.getBoundingClientRect(); onSeek((event.clientX - rect.left) / pxPerSecond); };
  return <section className="flex min-h-0 flex-col border-t border-white/[0.08] bg-[#0b0e14]"><div className="flex min-h-10 items-center justify-between gap-2 border-b border-white/[0.07] px-2 sm:px-3"><div className="flex min-w-0 items-center gap-0.5"><button onClick={onUndo} disabled={!historyAvailable} className="revrse-icon-button" aria-label="Undo"><Undo2 className="h-4 w-4" /></button><button onClick={onRedo} disabled={!futureAvailable} className="revrse-icon-button" aria-label="Redo"><Redo2 className="h-4 w-4" /></button><span className="mx-1 h-4 w-px bg-white/[0.1]" /><button onClick={() => onTool("select")} className={`revrse-icon-button ${tool === "select" ? "bg-cyan-300/10 text-cyan-100" : ""}`} aria-label="Select tool"><MousePointer2 className="h-3.5 w-3.5" /></button><button onClick={() => onTool("razor")} className={`revrse-icon-button ${tool === "razor" ? "bg-cyan-300/10 text-cyan-100" : ""}`} aria-label="Razor tool"><Scissors className="h-3.5 w-3.5" /></button><button onClick={onSplit} className="revrse-mini-button hidden sm:inline-flex"><Split className="h-3.5 w-3.5" /> Split</button><button onClick={() => onDelete(true)} className="revrse-mini-button hidden text-rose-300 sm:inline-flex"><Trash2 className="h-3.5 w-3.5" /> Ripple delete</button></div><div className="flex shrink-0 items-center gap-1"><button onClick={onMarker} className="revrse-icon-button" aria-label="Add marker"><CircleDot className="h-3.5 w-3.5" /></button><button onClick={onSnapping} className={`revrse-icon-button ${snapping ? "bg-cyan-300/10 text-cyan-100" : ""}`} aria-label="Toggle snapping"><Magnet className="h-3.5 w-3.5" /></button><input type="range" min={36} max={140} value={pxPerSecond} onChange={event => onZoom(Number(event.target.value))} className="revrse-range hidden w-16 sm:block" aria-label="Timeline zoom" /></div></div><div className="flex min-h-0 flex-1 overflow-auto"><div className="sticky left-0 z-20 w-28 shrink-0 border-r border-white/[0.08] bg-[#0b0e14] pt-8">{project.tracks.map(track => <div key={track.id} className={`flex h-14 items-center gap-1 border-b border-white/[0.06] px-2 ${track.hidden ? "opacity-40" : ""}`}><span className="h-2 w-2 rounded-full" style={{ background: track.color }} /><span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-400">{track.label}</span><button onClick={() => onTrackChange(track.id, { locked: !track.locked })} className={`text-slate-600 hover:text-slate-200 ${track.locked ? "text-amber-200" : ""}`} aria-label={`${track.locked ? "Unlock" : "Lock"} ${track.label}`}><Lock className="h-3 w-3" /></button><button onClick={() => onTrackChange(track.id, { hidden: !track.hidden })} className="text-slate-600 hover:text-slate-200" aria-label={`${track.hidden ? "Show" : "Hide"} ${track.label}`}>{track.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button></div>)}<div className="flex h-11 items-center gap-1 border-b border-white/[0.06] px-2"><button onClick={() => onAddTrack("video")} className="revrse-mini-button" aria-label="Add video track"><Plus className="h-3 w-3" /> V</button><button onClick={() => onAddTrack("text")} className="revrse-mini-button" aria-label="Add text track"><Plus className="h-3 w-3" /> T</button></div></div><div ref={timelineRef} className="relative min-w-max" style={{ width }} onPointerDown={seek}><div className="relative h-8 border-b border-white/[0.06] [background-image:linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)]" style={{ backgroundSize: `${pxPerSecond}px 100%` }}>{ruler.map(time => <span key={time} className="absolute top-2 text-[10px] text-slate-600" style={{ left: time * pxPerSecond + 4 }}>{time}s</span>)}{project.markers.map(marker => <div key={marker.id} className="absolute top-0 h-full w-px" style={{ left: marker.at * pxPerSecond, background: marker.color }} title={marker.label} />)}</div>{project.tracks.map(track => <div key={track.id} onPointerDown={seek} className={`relative h-14 border-b border-white/[0.06] [background-image:linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] ${track.hidden ? "opacity-30" : ""}`} style={{ backgroundSize: `${pxPerSecond}px 100%` }}>{project.clips.filter(clip => clip.trackId === track.id).map(clip => <TimelineClipCard key={clip.id} clip={clip} selected={clip.id === selectedClipId} dragging={clip.id === draggingId} locked={track.locked} tool={tool} pxPerSecond={pxPerSecond} onSelect={onSelect} onMove={onMoveClip} onTrim={onTrimClip} onDragState={onDragState} onSplit={onSplit} onDelete={onDelete} onDuplicate={onDuplicate} onMarker={onMarker} timelineRef={timelineRef} />)}</div>)}<div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-cyan-200" style={{ left: currentTime * pxPerSecond }}><span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-cyan-200" /></div></div></div></section>;
}

function TimelineClipCard({ clip, selected, dragging, locked, tool, pxPerSecond, onSelect, onMove, onTrim, onDragState, onSplit, onDelete, onDuplicate, onMarker, timelineRef }: { clip: TimelineClip; selected: boolean; dragging: boolean; locked: boolean; tool: Tool; pxPerSecond: number; onSelect: (id: string) => void; onMove: (id: string, start: number) => void; onTrim: (id: string, changes: Partial<TimelineClip>) => void; onDragState: (id: string | null) => void; onSplit: () => void; onDelete: (ripple?: boolean) => void; onDuplicate: () => void; onMarker: () => void; timelineRef: React.RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ x: number; start: number; trimStart: number; trimEnd: number; mode: "move" | "left" | "right" } | null>(null);
  const tint = clip.kind === "text" ? "from-amber-400/65 to-orange-500/35" : clip.kind === "element" ? "from-violet-400/65 to-fuchsia-500/35" : "from-cyan-400/65 to-blue-600/45";
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>, mode: "move" | "left" | "right") { event.stopPropagation(); if (locked) return; onSelect(clip.id); if (tool === "razor" && mode === "move") { onSplit(); return; } event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, start: clip.start, trimStart: clip.trimStart, trimEnd: clip.trimEnd, mode }; onDragState(clip.id); }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) { if (!drag.current || !timelineRef.current) return; const delta = (event.clientX - drag.current.x) / pxPerSecond; if (drag.current.mode === "move") onMove(clip.id, Math.max(0, drag.current.start + delta)); else if (drag.current.mode === "left") onTrim(clip.id, { trimStart: Math.max(0, Math.min(clip.duration - clip.trimEnd - 0.1, drag.current.trimStart + delta * clip.speed)) }); else onTrim(clip.id, { trimEnd: Math.max(0, Math.min(clip.duration - clip.trimStart - 0.1, drag.current.trimEnd - delta * clip.speed)) }); }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) { if (!drag.current) return; event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; onDragState(null); }
  return <ContextMenu><ContextMenuTrigger asChild><div data-clip role="button" tabIndex={0} onPointerDown={event => pointerDown(event, "move")} onPointerMove={pointerMove} onPointerUp={pointerUp} onKeyDown={event => { if (event.key === "Enter") onSelect(clip.id); }} className={`absolute top-1.5 h-11 overflow-hidden rounded-md border text-left outline-none transition ${selected ? "border-cyan-100 ring-1 ring-cyan-200/50" : "border-white/10 hover:border-white/30"} ${locked ? "cursor-not-allowed opacity-60" : dragging ? "z-30 cursor-grabbing shadow-xl" : tool === "razor" ? "cursor-crosshair" : "cursor-grab"}`} style={{ left: clip.start * pxPerSecond, width: Math.max(46, getVisibleDuration(clip) * pxPerSecond) }} aria-label={`${clip.name} timeline clip`}><div className={`absolute inset-0 bg-gradient-to-r ${tint}`} />{clip.transitionIn !== "none" && <span className="absolute left-0 top-0 h-full w-2 bg-white/30" />}{clip.transitionOut !== "none" && <span className="absolute right-0 top-0 h-full w-2 bg-white/30" />}<div onPointerDown={event => pointerDown(event, "left")} className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-ew-resize bg-white/10 opacity-0 hover:opacity-100" aria-label="Trim start" /><span className="relative flex h-full items-center gap-1.5 truncate px-2 text-[11px] font-medium text-white"><Film className="h-3.5 w-3.5 shrink-0 opacity-80" />{clip.textContent || clip.name}</span><div onPointerDown={event => pointerDown(event, "right")} className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-ew-resize bg-white/10 opacity-0 hover:opacity-100" aria-label="Trim end" /></div></ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={() => onDuplicate()}><Copy className="h-3.5 w-3.5" /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut></ContextMenuItem><ContextMenuItem onSelect={() => onSplit()}><Scissors className="h-3.5 w-3.5" /> Split <ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem><ContextMenuItem onSelect={() => onMarker()}><CircleDot className="h-3.5 w-3.5" /> Add marker</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem onSelect={() => onDelete(true)} variant="destructive"><Trash2 className="h-3.5 w-3.5" /> Ripple delete</ContextMenuItem></ContextMenuContent></ContextMenu>;
}

function Inspector({ clip, onUpdate, onKeyframe, keyframeProperty, onKeyframeProperty }: { clip: TimelineClip | null; onUpdate: (changes: Partial<TimelineClip>) => void; onKeyframe: () => void; keyframeProperty: TimelineClip["keyframes"][number]["property"]; onKeyframeProperty: (value: TimelineClip["keyframes"][number]["property"]) => void }) {
  if (!clip) return <aside className="flex h-full flex-col items-center justify-center p-6 text-center"><Settings2 className="h-6 w-6 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">Inspector</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Select a clip to edit transform, timing, look, transitions, and keyframes.</p></aside>;
  return <aside className="h-full overflow-y-auto border-l border-white/[0.08] p-4"><div className="border-b border-white/[0.08] pb-4"><p className="truncate text-sm font-semibold text-slate-100">{clip.textContent || clip.name}</p><p className="mt-1 text-[11px] text-slate-500">{clip.kind} · {getVisibleDuration(clip).toFixed(1)} seconds</p></div><div className="space-y-5 pt-4"><InspectorSection title="Transform"><RangeField label="Scale" value={clip.scale} min={10} max={300} suffix="%" onChange={scale => onUpdate({ scale })} /><RangeField label="Position X" value={clip.positionX} min={-100} max={100} suffix="%" onChange={positionX => onUpdate({ positionX })} /><RangeField label="Position Y" value={clip.positionY} min={-100} max={100} suffix="%" onChange={positionY => onUpdate({ positionY })} /><RangeField label="Rotation" value={clip.rotation} min={-180} max={180} suffix="°" onChange={rotation => onUpdate({ rotation })} /><div className="grid grid-cols-2 gap-2"><button onClick={() => onUpdate({ flipX: !clip.flipX })} className={`revrse-mini-button justify-center border border-white/[0.08] ${clip.flipX ? "bg-cyan-300/10 text-cyan-100" : ""}`}><FlipHorizontal2 className="h-3.5 w-3.5" /> Flip X</button><button onClick={() => onUpdate({ opacity: 100, scale: 100, positionX: 0, positionY: 0, rotation: 0 })} className="revrse-mini-button justify-center border border-white/[0.08]"><RotateCcw className="h-3.5 w-3.5" /> Reset</button></div></InspectorSection><InspectorSection title="Appearance"><RangeField label="Opacity" value={clip.opacity} min={0} max={100} suffix="%" onChange={opacity => onUpdate({ opacity })} /><RangeField label="Blur" value={clip.blur} min={0} max={20} suffix="px" onChange={blur => onUpdate({ blur })} /><select value={clip.filter} onChange={event => onUpdate({ filter: event.target.value as TimelineClip["filter"] })} className="revrse-select"><option value="none">No colour treatment</option><option value="cinematic">Cinematic</option><option value="warm">Warm</option><option value="mono">Monochrome</option><option value="vintage">Vintage</option><option value="neon">Neon</option><option value="dream">Dream</option></select></InspectorSection><InspectorSection title="Timing"><RangeField label="Start trim" value={clip.trimStart} min={0} max={Math.max(0, clip.duration - clip.trimEnd - 0.1)} step={0.1} suffix="s" onChange={trimStart => onUpdate({ trimStart })} /><RangeField label="End trim" value={clip.trimEnd} min={0} max={Math.max(0, clip.duration - clip.trimStart - 0.1)} step={0.1} suffix="s" onChange={trimEnd => onUpdate({ trimEnd })} /><RangeField label="Speed" value={clip.speed} min={0.25} max={4} step={0.25} suffix="×" onChange={speed => onUpdate({ speed })} /><button onClick={() => onUpdate({ reversed: !clip.reversed })} className={`revrse-mini-button w-full justify-center border border-white/[0.08] ${clip.reversed ? "bg-cyan-300/10 text-cyan-100" : ""}`}>Reverse metadata</button></InspectorSection><InspectorSection title="Keyframes"><div className="flex gap-2"><select value={keyframeProperty} onChange={event => onKeyframeProperty(event.target.value as typeof keyframeProperty)} className="revrse-select flex-1"><option value="opacity">Opacity</option><option value="scale">Scale</option><option value="positionX">Position X</option><option value="positionY">Position Y</option><option value="rotation">Rotation</option><option value="blur">Blur</option></select><button onClick={onKeyframe} className="revrse-button-secondary"><Plus className="h-3.5 w-3.5" /></button></div><p className="text-[10px] text-slate-500">{clip.keyframes.length} visual keyframe{clip.keyframes.length === 1 ? "" : "s"} · ease in/out</p></InspectorSection></div></aside>;
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) { return <section><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p><div className="space-y-3">{children}</div></section>; }
function RangeField({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) { return <label className="block"><span className="mb-1.5 flex justify-between text-[11px] text-slate-400"><span>{label}</span><span className="font-mono text-slate-200">{Number(value.toFixed(2))}{suffix}</span></span><input value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} type="range" className="revrse-range w-full" /></label>; }

function CommandPalette({ open, onOpenChange, onSplit, onCaption, onTemplates, onExport, onMarker, onAssistant }: { open: boolean; onOpenChange: (open: boolean) => void; onSplit: () => void; onCaption: () => void; onTemplates: () => void; onExport: () => void; onMarker: () => void; onAssistant: () => void }) { const run = (action: () => void) => { action(); onOpenChange(false); }; return <CommandDialog open={open} onOpenChange={onOpenChange} title="REVRSE command palette"><CommandInput placeholder="Search editing commands..." /><CommandList><CommandEmpty>No matching command.</CommandEmpty><CommandGroup heading="Edit"><CommandItem onSelect={() => run(onSplit)}><Scissors /> Split selected clip <CommandShortcut>S</CommandShortcut></CommandItem><CommandItem onSelect={() => run(onCaption)}><Subtitles /> Add caption <CommandShortcut>C</CommandShortcut></CommandItem><CommandItem onSelect={() => run(onMarker)}><CircleDot /> Add marker <CommandShortcut>M</CommandShortcut></CommandItem></CommandGroup><CommandGroup heading="Workspace"><CommandItem onSelect={() => run(onTemplates)}><SquareStack /> Open templates</CommandItem><CommandItem onSelect={() => run(onAssistant)}><WandSparkles /> Open edit assistant</CommandItem><CommandItem onSelect={() => run(onExport)}><Download /> Export project</CommandItem></CommandGroup></CommandList></CommandDialog>; }

function ExportDialog({ project, onClose, onProject, onSrt }: { project: EditorProject; onClose: () => void; onProject: () => void; onSrt: () => void }) { return <div className="revrse-dialog-backdrop"><div className="revrse-dialog"><button onClick={onClose} className="absolute right-4 top-4 text-slate-500 hover:text-slate-100" aria-label="Close export dialog"><X className="h-4 w-4" /></button><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-100"><Download className="h-5 w-5" /></div><h2 className="mt-4 text-lg font-semibold text-slate-100">Export workspace</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Download a real editable project backup or timed captions. The browser-local foundation does not misrepresent a finished-video encoder that is not configured.</p><div className="mt-4 space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-xs"><div className="flex justify-between text-slate-300"><span>Canvas</span><span>{project.canvas.width} × {project.canvas.height} · {project.canvas.fps} fps</span></div><div className="flex justify-between text-slate-300"><span>Watermark</span><span className="text-emerald-200">None added</span></div><div className="flex justify-between text-slate-300"><span>Timed captions</span><span>{project.captions.length}</span></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button onClick={onProject} className="revrse-button-primary"><Download className="h-4 w-4" /> Project JSON</button><button onClick={onSrt} className="revrse-button-secondary"><FileText className="h-4 w-4" /> Caption SRT</button></div></div></div>; }

function ShortcutsDialog({ onClose }: { onClose: () => void }) { const items = [["Space", "Play or pause selected video"], ["S", "Split selected clip"], ["M", "Add marker"], ["Delete", "Remove selected clip"], ["Ctrl / ⌘ + D", "Duplicate selected clip"], ["Ctrl / ⌘ + Z", "Undo"], ["Ctrl / ⌘ + Shift + Z", "Redo"], ["Ctrl / ⌘ + K", "Open command palette"], ["Ctrl / ⌘ + S", "Save local version"]]; return <div className="revrse-dialog-backdrop"><div className="revrse-dialog"><button onClick={onClose} className="absolute right-4 top-4 text-slate-500 hover:text-slate-100" aria-label="Close shortcuts"><X className="h-4 w-4" /></button><Keyboard className="h-6 w-6 text-cyan-100" /><h2 className="mt-4 text-lg font-semibold text-slate-100">Keyboard shortcuts</h2><div className="mt-4 space-y-2">{items.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-md bg-white/[0.035] px-3 py-2 text-sm"><span className="text-slate-400">{label}</span><kbd className="shrink-0 rounded border border-white/[0.1] bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-200">{key}</kbd></div>)}</div></div></div>; }

function CustomCanvasSizeFields({ project, onApply }: { project: EditorProject; onApply: (preset: typeof canvasPresets[number]) => void }) {
  const [width, setWidth] = useState(String(project.canvas.width));
  const [height, setHeight] = useState(String(project.canvas.height));
  useEffect(() => { setWidth(String(project.canvas.width)); setHeight(String(project.canvas.height)); }, [project.canvas.height, project.canvas.width]);
  const apply = () => {
    const boundedWidth = Math.min(7680, Math.max(160, Math.round(Number(width)) || 160));
    const boundedHeight = Math.min(7680, Math.max(160, Math.round(Number(height)) || 160));
    onApply({ id: "custom", label: "Custom high-res", description: `${boundedWidth} × ${boundedHeight}`, aspectRatio: "custom", width: boundedWidth, height: boundedHeight });
  };
  return <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-cyan-100">Custom high-resolution canvas</p><span className="text-[10px] text-slate-500">160–7680 px</span></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Width<input aria-label="Custom canvas width" value={width} onChange={event => setWidth(event.target.value)} type="number" min={160} max={7680} inputMode="numeric" className="revrse-search mt-1 pl-2" /></label><label className="text-[10px] text-slate-400">Height<input aria-label="Custom canvas height" value={height} onChange={event => setHeight(event.target.value)} type="number" min={160} max={7680} inputMode="numeric" className="revrse-search mt-1 pl-2" /></label></div><button onClick={apply} className="revrse-mini-button mt-2">Apply custom dimensions</button><p className="mt-2 text-[10px] leading-relaxed text-slate-500">Values outside the safe 160–7680 px range are clamped. A larger canvas preserves project dimensions, but preview and final export speed depend on your browser, device, source media, and encoder.</p></div>;
}

function SettingsDialog({ project, onClose, onRatio, onPreset, onFps, onBackground, onRestore }: { project: EditorProject; onClose: () => void; onRatio: (ratio: CanvasRatio) => void; onPreset: (preset: typeof canvasPresets[number]) => void; onFps: (fps: number) => void; onBackground: (background: string) => void; onRestore: (version: EditorProject["versions"][number]) => void }) {
  return <div className="revrse-dialog-backdrop"><div className="revrse-dialog max-w-lg"><button onClick={onClose} className="absolute right-4 top-4 text-slate-500 hover:text-slate-100" aria-label="Close settings"><X className="h-4 w-4" /></button><Settings2 className="h-6 w-6 text-cyan-100" /><h2 className="mt-4 text-lg font-semibold text-slate-100">Project settings</h2><div className="mt-5 space-y-4"><div><p className="text-xs text-slate-400">Canvas presets</p><div className="mt-2 grid grid-cols-2 gap-2">{canvasPresets.map(preset => <button key={preset.id} onClick={() => onPreset(preset)} className={`rounded-lg border p-2 text-left text-[11px] ${project.canvas.width === preset.width && project.canvas.height === preset.height ? "border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-100" : "border-white/[0.08] bg-white/[0.025] text-slate-300 hover:bg-white/[0.06]"}`}><span className="block font-semibold">{preset.label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{preset.width} × {preset.height}</span></button>)}</div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">4K projects preview at a safe scaled size on this device while retaining their original canvas dimensions.</p></div><label className="block text-xs text-slate-400">Canvas ratio<select value={project.aspectRatio} onChange={event => onRatio(event.target.value as CanvasRatio)} className="revrse-select mt-1.5"><option value="16:9">16:9 Widescreen</option><option value="9:16">9:16 Vertical</option><option value="1:1">1:1 Square</option><option value="4:5">4:5 Portrait</option><option value="21:9">21:9 Cinematic</option><option value="4:3">4:3 Standard</option><option value="custom">Custom</option></select></label><CustomCanvasSizeFields project={project} onApply={onPreset} /><label className="block text-xs text-slate-400">Frame rate<select value={project.canvas.fps} onChange={event => onFps(Number(event.target.value))} className="revrse-select mt-1.5"><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><label className="block text-xs text-slate-400">Canvas background<input value={project.canvas.background} onChange={event => onBackground(event.target.value)} type="color" className="mt-1.5 h-9 w-full rounded border border-white/[0.1] bg-transparent" /></label><div className="border-t border-white/[0.08] pt-4"><p className="text-xs font-semibold text-slate-200">Local versions</p>{project.versions.length ? <div className="mt-2 space-y-2">{[...project.versions].reverse().map(version => <div key={version.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.035] p-2"><div className="min-w-0"><p className="truncate text-[11px] text-slate-200">{version.label}</p><p className="text-[10px] text-slate-500">{formatDate(version.savedAt)}</p></div><button onClick={() => onRestore(version)} className="revrse-mini-button">Restore</button></div>)}</div> : <p className="mt-1 text-[11px] text-slate-500">Save a version with Ctrl/⌘ + S.</p>}</div></div></div></div>;
}
