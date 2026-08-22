import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type QueryOptions = { enabled?: boolean; retry?: boolean | number };
type MutationOptions<TData = unknown> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "The Cloudflare service could not complete this request.");
  return payload;
}

function query<T>(key: unknown[], path: () => string, options?: QueryOptions) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => request<T>(path()),
    enabled: options?.enabled ?? true,
    retry: options?.retry ?? false,
  });
}

function mutation<TInput, TData>(path: (input: TInput) => string, method = "POST") {
  return useMutation<TData, Error, TInput>({
    mutationFn: (input) => request<TData>(path(input), { method, body: method === "DELETE" ? undefined : JSON.stringify(input) }),
  });
}

const encode = (value: string | number) => encodeURIComponent(String(value));
const api = "/api";

export const trpc = {
  auth: {
    me: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "auth", "me"], () => `${api}/auth/me`, options) },
  },
  editorProjects: {
    list: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "projects"], () => `${api}/projects`, options) },
    get: { useQuery: (input: { id: number }, options?: QueryOptions) => query(["cf", "projects", input.id], () => `${api}/projects/${encode(input.id)}`, options) },
    save: { useMutation: () => mutation<object, { id: number }>(() => `${api}/projects`) },
  },
  templateStudio: {
    listTemplates: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "templates"], () => `${api}/templates`, options) },
    getTemplate: { useQuery: (input: { id: number }, options?: QueryOptions) => query(["cf", "template", input.id], () => `${api}/templates/${encode(input.id)}`, options) },
    favoriteIds: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "favorites", "templates"], () => `${api}/favorites/templates`, options) },
    toggleFavorite: { useMutation: () => mutation<{ templateId: number }, { templateId: number; favorited: boolean }>(() => `${api}/favorites/templates`) },
    soundFavoriteIds: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "favorites", "sounds"], () => `${api}/favorites/sounds`, options) },
    toggleSoundFavorite: { useMutation: () => mutation<{ soundId: number }, { soundId: number; favorited: boolean }>(() => `${api}/favorites/sounds`) },
    publishTemplate: { useMutation: () => mutation<object, { id: number }>(() => `${api}/templates`) },
    listVideos: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "videos"], () => `${api}/videos`, options) },
    publishVideo: { useMutation: () => mutation<object, { id: number }>(() => `${api}/videos`) },
    listSounds: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "sounds"], () => `${api}/sounds`, options) },
    publishSound: { useMutation: () => mutation<object, { id: number }>(() => `${api}/sounds`) },
    listReviews: {
      useQuery: (input: { resourceType: string; resourceId: number }, options?: QueryOptions) =>
        query(["cf", "reviews", input.resourceType, input.resourceId], () => `${api}/reviews?resourceType=${encode(input.resourceType)}&resourceId=${encode(input.resourceId)}`, options),
    },
    saveReview: { useMutation: () => mutation<object, unknown>(() => `${api}/reviews`) },
    deleteResourceReview: { useMutation: () => mutation<{ id: number }, { id: number }>((input) => `${api}/reviews/${encode(input.id)}`, "DELETE") },
    createReport: { useMutation: () => mutation<object, { id: number; status: "open" }>(() => `${api}/reports`) },
    moderationQueue: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "moderation"], () => `${api}/moderation/reports`, options) },
    resolveReport: { useMutation: () => mutation<{ id: number; status: string; moderatorNote: string }, { id: number; resolved: boolean }>((input) => `${api}/moderation/reports/${encode(input.id)}`, "PATCH") },
  },
  movieDiscovery: {
    search: {
      useQuery: (input: { query: string; country: string }, options?: QueryOptions) =>
        query(["cf", "movies", input.query, input.country], () => `${api}/movies?query=${encode(input.query)}&country=${encode(input.country)}`, options),
    },
  },
  musicDiscovery: {
    status: { useQuery: (_input?: unknown, options?: QueryOptions) => query(["cf", "music", "status"], () => `${api}/music/status`, options) },
    search: {
      useQuery: (input: { query: string }, options?: QueryOptions) => query(["cf", "music", input.query], () => `${api}/music?query=${encode(input.query)}`, options),
    },
  },
  useUtils: () => {
    const client = useQueryClient();
    const invalidate = (key: unknown[]) => () => client.invalidateQueries({ queryKey: key });
    return {
      templateStudio: {
        favoriteIds: { invalidate: invalidate(["cf", "favorites", "templates"]) },
        soundFavoriteIds: { invalidate: invalidate(["cf", "favorites", "sounds"]) },
        listTemplates: { invalidate: invalidate(["cf", "templates"]) },
        listVideos: { invalidate: invalidate(["cf", "videos"]) },
        listSounds: { invalidate: invalidate(["cf", "sounds"]) },
        listReviews: { invalidate: invalidate(["cf", "reviews"]) },
        moderationQueue: { invalidate: invalidate(["cf", "moderation"]) },
      },
    };
  },
};

export type CloudflareMutationOptions<TData = unknown> = MutationOptions<TData>;
