import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const sharedResolve = {
  alias: {
    '@': path.resolve(__dirname, 'src/renderer/src'),
  },
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  resolve: sharedResolve,
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/renderer/src/**/*.{ts,tsx}', 'src/main/**/*.js'],
      exclude: [
        'src/renderer/src/__tests__/**',
        'src/renderer/src/main.tsx',
        'src/main/__tests__/**',
        'src/main/index.js',
      ],
    },
    projects: [
      {
        plugins: [react()],
        define: {
          __APP_VERSION__: JSON.stringify('test'),
        },
        resolve: sharedResolve,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/renderer/src/__tests__/setup.ts'],
          include: ['src/renderer/src/__tests__/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: 'main',
          environment: 'node',
          globals: true,
          include: ['src/main/__tests__/**/*.test.{js,ts}'],
        },
      },
    ],
  },
})
