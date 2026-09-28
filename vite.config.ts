import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Link card for the site itself (a game's own card lives in app/<id>/, made by
// build-data). Link previews need absolute addresses, so the site's address
// comes from the data build (site.json), which knows which repo it runs in.
function linkCard(): Plugin {
  return {
    name: 'skeam-link-card',
    transformIndexHtml() {
      let url = 'https://kh32-7.github.io/skeam/'
      try {
        url = JSON.parse(fs.readFileSync('public/data/site.json', 'utf8')).url || url
      } catch {
        /* data not built yet */
      }
      const meta = (property: string, content: string) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' as const })
      return [
        { tag: 'meta', attrs: { name: 'description', content: '게임 제작 동아리 KING의 게임 상점' }, injectTo: 'head' },
        meta('og:type', 'website'),
        meta('og:site_name', 'SKEAM'),
        meta('og:title', 'SKEAM'),
        meta('og:description', '게임 제작 동아리 KING의 게임 상점. 동아리 프로젝트부터 Steam 출시작까지 바로 플레이해 보세요'),
        meta('og:url', url),
        // ?v= makes KakaoTalk and Discord fetch the picture again when it changes.
        meta('og:image', url + 'og.png?v=2'),
        meta('og:image:width', '1200'),
        meta('og:image:height', '630'),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#66c0f4' }, injectTo: 'head' },
      ]
    },
  }
}

// base './' keeps every asset path relative, so the same build works at
// <user>.github.io/skeam and later at <org>.github.io/skeam.
export default defineConfig({
  base: './',
  plugins: [react(), linkCard()],
})
