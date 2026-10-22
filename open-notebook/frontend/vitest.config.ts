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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...sietAliases,
    },
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', ...sietTests],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
      // Note: reportsDirectory is NOT specified - vitest 4.x uses default location
    }
  }
})
