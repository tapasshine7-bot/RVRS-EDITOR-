import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { deleteResourceReview, getEditorProject, getPublishedEditorTemplate, listEditorProjects, listFavoriteSoundIds, listFavoriteTemplateIds, listPublishedEditorSounds, listPublishedEditorTemplates, listPublishedEditorVideos, listResourceReviews, publishEditorSound, publishEditorTemplate, publishEditorVideo, saveEditorProject, saveResourceReview, toggleFavoriteEditorSound, toggleFavoriteEditorTemplate } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { storageGet, storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  editorProjects: router({
    list: protectedProcedure.query(({ ctx }) => listEditorProjects(ctx.user.id)),
    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ ctx, input }) => getEditorProject(ctx.user.id, input.id)),
    save: protectedProcedure
      .input(z.object({
        id: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(160),
        projectData: z.unknown(),
        durationMs: z.number().int().min(0).max(86_400_000),
      }))
      .mutation(({ ctx, input }) => saveEditorProject({ ...input, userId: ctx.user.id })),
  }),
  templateStudio: router({
    listTemplates: publicProcedure.query(() => listPublishedEditorTemplates()),
    getTemplate: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => getPublishedEditorTemplate(input.id)),
    favoriteIds: protectedProcedure.query(async ({ ctx }) => (await listFavoriteTemplateIds(ctx.user.id)).map(row => row.templateId)),
    toggleFavorite: protectedProcedure
      .input(z.object({ templateId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => toggleFavoriteEditorTemplate(ctx.user.id, input.templateId)),
    soundFavoriteIds: protectedProcedure.query(async ({ ctx }) => (await listFavoriteSoundIds(ctx.user.id)).map(row => row.soundId)),
    toggleSoundFavorite: protectedProcedure
      .input(z.object({ soundId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => toggleFavoriteEditorSound(ctx.user.id, input.soundId)),
    publishTemplate: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(3).max(160),
        description: z.string().trim().min(10).max(500),
        category: z.string().trim().min(2).max(64),
        aspectRatio: z.string().trim().min(3).max(16),
        projectData: z.unknown(),
        rightsAttested: z.literal(true),
      }))
      .mutation(({ ctx, input }) => publishEditorTemplate({
        creatorId: ctx.user.id,
        title: input.title,
        description: input.description,
        category: input.category,
        aspectRatio: input.aspectRatio,
        projectData: input.projectData,
      })),
    listVideos: publicProcedure.query(async () => {
      const videos = await listPublishedEditorVideos();
      return Promise.all(videos.map(async video => ({ ...video, url: (await storageGet(video.storageKey)).url })));
    }),
    listSounds: publicProcedure.query(async () => {
      const sounds = await listPublishedEditorSounds();
      return Promise.all(sounds.map(async sound => ({ ...sound, url: (await storageGet(sound.storageKey)).url })));
    }),
    publishVideo: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(3).max(160),
        description: z.string().trim().min(10).max(500),
        category: z.string().trim().min(2).max(64),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
        base64: z.string().min(16).max(25_165_824),
        byteSize: z.number().int().positive().max(18 * 1024 * 1024),
        durationMs: z.number().int().min(0).max(7_200_000),
        width: z.number().int().min(0).max(7680),
        height: z.number().int().min(0).max(7680),
        rightsAttested: z.literal(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const data = Buffer.from(input.base64, "base64");
        if (!data.byteLength || data.byteLength > 18 * 1024 * 1024 || Math.abs(data.byteLength - input.byteSize) > 2) {
          throw new Error("The selected clip could not be verified. Choose a licensed video no larger than 18 MB.");
        }
        const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`revrse-editor/shared-videos/${ctx.user.id}/${safeName}`, data, input.mimeType);
        return publishEditorVideo({
          creatorId: ctx.user.id,
          title: input.title,
          description: input.description,
          category: input.category,
          storageKey: stored.key,
          originalName: input.originalName,
          mimeType: input.mimeType,
          byteSize: data.byteLength,
          durationMs: input.durationMs,
          width: input.width,
          height: input.height,
        });
      }),
    publishSound: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(3).max(160),
        description: z.string().trim().min(10).max(500),
        category: z.string().trim().min(2).max(64),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.enum(["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"]),
        base64: z.string().min(16).max(16_777_216),
        byteSize: z.number().int().positive().max(12 * 1024 * 1024),
        durationMs: z.number().int().min(0).max(1_800_000),
        rightsAttested: z.literal(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const data = Buffer.from(input.base64, "base64");
        if (!data.byteLength || data.byteLength > 12 * 1024 * 1024 || Math.abs(data.byteLength - input.byteSize) > 2) {
          throw new Error("The selected sound could not be verified. Choose a licensed sound no larger than 12 MB.");
        }
        const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`revrse-editor/shared-sounds/${ctx.user.id}/${safeName}`, data, input.mimeType);
        return publishEditorSound({
          creatorId: ctx.user.id,
          title: input.title,
          description: input.description,
          category: input.category,
          storageKey: stored.key,
          originalName: input.originalName,
          mimeType: input.mimeType,
          byteSize: data.byteLength,
          durationMs: input.durationMs,
        });
      }),
    listReviews: publicProcedure
      .input(z.object({ resourceType: z.enum(["template", "video", "sound"]), resourceId: z.number().int().positive() }))
      .query(({ ctx, input }) => listResourceReviews(input.resourceType, input.resourceId, ctx.user?.id)),
    saveReview: protectedProcedure
      .input(z.object({
        resourceType: z.enum(["template", "video", "sound"]),
        resourceId: z.number().int().positive(),
        stars: z.number().int().min(1).max(5),
        body: z.string().trim().max(600),
      }))
      .mutation(({ ctx, input }) => saveResourceReview({ ...input, userId: ctx.user.id })),
    deleteReview: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteResourceReview(ctx.user.id, input.id)),
  }),
  movieDiscovery: router({
    search: publicProcedure
      .input(z.object({ query: z.string().trim().min(2).max(120), country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("IN") }))
      .query(async ({ input }) => {
        const params = new URLSearchParams({ term: input.query, country: input.country, media: "movie", entity: "movie", limit: "8" });
        const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("Movie discovery is temporarily unavailable. Try again shortly.");
        const payload = await response.json() as { results?: Array<Record<string, unknown>> };
        return (payload.results ?? []).map(item => ({
          id: typeof item.trackId === "number" ? item.trackId : 0,
          title: typeof item.trackName === "string" ? item.trackName : "Untitled movie",
          year: typeof item.releaseDate === "string" ? item.releaseDate.slice(0, 4) : "",
          genre: typeof item.primaryGenreName === "string" ? item.primaryGenreName : "Movie",
          artworkUrl: typeof item.artworkUrl100 === "string" ? item.artworkUrl100.replace("100x100bb", "600x600bb") : "",
          storeUrl: typeof item.trackViewUrl === "string" ? item.trackViewUrl : "",
          previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : "",
        })).filter(item => item.id > 0);
      }),
  }),
});

export type AppRouter = typeof appRouter;
