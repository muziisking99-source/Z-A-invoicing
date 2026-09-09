// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, path aliases, and Nitro. Pass extra Vite knobs via `vite: {}`.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      // Don't block "ready" on a full dependency crawl (Vite 6+/8).
      holdUntilCrawlEnd: false,
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "@supabase/supabase-js",
        "sonner",
        "@radix-ui/react-dialog",
        "clsx",
        "tailwind-merge",
      ],
      exclude: ["jspdf"],
    },
    server: {
      warmup: {
        clientFiles: [
          "./src/routes/__root.tsx",
          "./src/routes/index.tsx",
          "./src/routes/auth.tsx",
          "./src/styles.css",
        ],
      },
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
