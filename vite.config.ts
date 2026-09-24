import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset path relative, so the same build works at
// <user>.github.io/skeam and later at <org>.github.io/skeam.
export default defineConfig({
  base: './',
  plugins: [react()],
})
