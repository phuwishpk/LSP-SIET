import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// KMITL: SIET frontend packages (docs/ARCHITECTURE.md)
const sietPackages = { platform: 'siet-platform', 'kmitl-rag': 'kmitl-rag', community: 'community' }
const sietAliases = Object.fromEntries(
  Object.entries(sietPackages).map(([name, dir]) => [`@siet/${name}`, path.resolve(__dirname, `../../${dir}/frontend/src`)])
)
const sietTests = Object.values(sietPackages).map((dir) => `../../${dir}/frontend/src/**/*.{test,spec}.?(c|m)[jt]s?(x)`)

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [path.resolve(__dirname, '../..')] } },
  // jsdom doesn't paint, so tests never need real CSS/style computation - and
  // without this, importing a component that bundles its own .css (e.g.
  // @uiw/react-markdown-preview) fails to resolve this project's Tailwind v4
  // postcss.config.mjs (string-form plugin list) outside of Next.js's own
  // build pipeline. `test.css: false` alone doesn't prevent Vite from trying
  // to resolve the postcss config; this bypasses it outright.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...sietAliases,
      // shared/ (navbar, mascot) - same as `@shared/*` in tsconfig.json
      '@shared': path.resolve(__dirname, '../../shared'),
    },
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', ...sietTests],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
      // Note: reportsDirectory is NOT specified - vitest 4.x uses default location
    }
  }
})
