import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    // Guard against duplicate React copies (lib is a linked workspace package)
    dedupe: ['react', 'react-dom'],
  },
})
