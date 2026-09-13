// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, path aliases (vite-tsconfig-paths), and Nitro.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**", "**/.output/**", "**/.nitro/**", "**/.tanstack/**"],
      },
    },
    optimizeDeps: {
      // Wait until deps exist before serving — avoids 404s on /.vite/deps/*.
      holdUntilCrawlEnd: true,
      // Never prebundle Start into the browser — it uses node:async_hooks.
      exclude: ["jspdf", "@tanstack/react-start", "@tanstack/react-start/server"],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "@supabase/supabase-js",
        "sonner",
        "@radix-ui/react-dialog",
        "clsx",
        "tailwind-merge",
      ],
    },
    build: {
      target: "es2022",
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/jspdf")) return "pdf";
            if (id.includes("node_modules/@supabase")) return "supabase";
            // Keep react-start out of a shared browser chunk (Node APIs).
            if (id.includes("node_modules/@tanstack/react-start")) return undefined;
            if (id.includes("node_modules/@tanstack")) return "tanstack";
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
              return "react";
            }
            return undefined;
          },
        },
      },
    },
  },
});
