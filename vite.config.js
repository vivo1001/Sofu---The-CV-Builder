import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ponytail: texlive.net sends no CORS headers, so proxy in dev;
    // production hosting needs the same rewrite (e.g. a Netlify/nginx proxy)
    proxy: {
      '/latexcgi': {
        target: 'https://texlive.net',
        changeOrigin: true,
        // exact endpoint -> cgi-bin; /latexcgi/<file>.pdf (redirect target) stays as-is
        rewrite: (p) => (p === '/latexcgi' ? '/cgi-bin/latexcgi' : p),
      },
    },
  },
})
