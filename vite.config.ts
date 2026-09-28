import crypto from 'node:crypto'
import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The SKEAM mark's address carries a hash of the file, so browsers (and
// GitHub Pages' 10-minute cache) pick up a redrawn icon right away instead of
// showing the old one until their cache runs out.
const ICON = `./skeam-icon.svg?v=${crypto.createHash('md5').update(fs.readFileSync('public/skeam-icon.svg')).digest('hex').slice(0, 8)}`

// When the data build ran (site.json's builtAt). The page compares it with the
// live site.json to notice it was served from an old cached index.html.
let BUILT_AT = ''
try {
  BUILT_AT = JSON.parse(fs.readFileSync('public/data/site.json', 'utf8')).builtAt ?? ''
} catch {
  /* data not built yet */
}

// Link card for the site itself (a game's own card lives in app/<id>/, made by
// build-data). Link previews need absolute addresses, so the site's address
// comes from the data build (site.json), which knows which repo it runs in.
function linkCard(): Plugin {
  return {
    name: 'skeam-link-card',
    transformIndexHtml(html) {
      let url = 'https://kh32-7.github.io/skeam/'
      try {
        url = JSON.parse(fs.readFileSync('public/data/site.json', 'utf8')).url || url
      } catch {
        /* data not built yet */
      }
      const meta = (property: string, content: string) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' as const })
      const tags = [
        { tag: 'meta', attrs: { name: 'description', content: 'KING의 게임 상점' }, injectTo: 'head' },
        meta('og:type', 'website'),
        meta('og:site_name', 'SKEAM'),
        meta('og:title', 'SKEAM'),
        meta('og:description', 'KING의 게임 상점. 동아리 프로젝트부터 Steam 출시작까지 바로 플레이해 보세요'),
        meta('og:url', url),
        // ?v= makes KakaoTalk and Discord fetch the picture again when it changes.
        meta('og:image', url + 'og.png?v=5'),
        meta('og:image:width', '1200'),
        meta('og:image:height', '630'),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#66c0f4' }, injectTo: 'head' },
      ]
      return { html: html.replace('href="./skeam-icon.svg"', `href="${ICON}"`), tags }
    },
  }
}

// base './' keeps every asset path relative, so the same build works at
// <user>.github.io/skeam and later at <org>.github.io/skeam.
export default defineConfig({
  base: './',
  plugins: [react(), linkCard()],
  define: { __SKEAM_ICON__: JSON.stringify(ICON), __BUILT_AT__: JSON.stringify(BUILT_AT) },
})
