import { vitePlugin as remix } from "@remix-run/dev";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tailwindcss(),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          // Rewrite Set-Cookie headers so localhost dev works.
          // The API sets Domain=.gamefix.fun; Secure; SameSite=None (production
          // cookie settings), which browsers silently reject for localhost.
          // Stripping those attributes lets the browser accept the session cookie.
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((c) =>
                c
                  .replace(/;\s*Domain=[^;]*/gi, '')
                  .replace(/;\s*Secure/gi, '')
                  .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
              );
            }
          });
        },
      },
    },
  },
  optimizeDeps: {
    include: ["katex"],
  },
});
