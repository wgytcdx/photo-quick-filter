import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.monkeycode-ai.online'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
