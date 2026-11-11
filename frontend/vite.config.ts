import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import path from 'path'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
const frontendPort = Number(process.env.VITE_PORT) || 5173
const backendPort = Number(process.env.VITE_BACKEND_PORT) || Number(process.env.PORT) || 4100

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    port: frontendPort,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              (res as any).writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Servidor backend reiniciando ou indisponível temporariamente.' }));
            }
          });
        },
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})

