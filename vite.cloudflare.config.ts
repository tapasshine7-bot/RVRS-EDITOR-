import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss(), jsxLocPlugin()],
  resolve: {
    alias: [
      { find: "@/lib/trpc", replacement: path.resolve(root, "cloudflare/client/trpc.ts") },
      { find: "@", replacement: path.resolve(root, "client/src") },
      { find: "@shared", replacement: path.resolve(root, "shared") },
    ],
  },
  root: path.resolve(root, "cloudflare/client"),
  publicDir: path.resolve(root, "client/public"),
  build: {
    outDir: path.resolve(root, "cloudflare/dist"),
    emptyOutDir: true,
  },
});
