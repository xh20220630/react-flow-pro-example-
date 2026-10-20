import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
}
const externalPackages = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })

export default defineConfig({
  // Keep emitted WASM relative to the library so a host can deploy below any base path.
  base: './',
  build: {
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'react-flow-pro',
    },
    sourcemap: true,
    rolldownOptions: {
      external: (id) => externalPackages.some((name) => id === name || id.startsWith(`${name}/`)),
      output: { banner: "'use client';" },
    },
  },
})
