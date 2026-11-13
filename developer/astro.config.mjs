// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// ```mermaid blocks become <pre class="mermaid">, drawn in the browser (src/components/Head.astro).
function remarkMermaid() {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const walk = (node) => {
    if (!node.children) return
    node.children = node.children.map((child) =>
      child.type === 'code' && child.lang === 'mermaid'
        ? { type: 'html', value: `<pre class="mermaid not-content">${escape(child.value)}</pre>` }
        : (walk(child), child),
    )
  }
  return (tree) => walk(tree)
}

// Every table sits in its own scroll box: full width on a desktop, scrolling sideways on a
// phone, never widening the page.
function rehypeTableWrap() {
  const walk = (node) => {
    if (!node.children) return
    node.children = node.children.map((child) => {
      walk(child)
      return child.type === 'element' && child.tagName === 'table'
        ? {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [child],
          }
        : child
    })
  }
  return (tree) => walk(tree)
}

export default defineConfig({
  site: 'https://developer.fawtir.om',
  markdown: { remarkPlugins: [remarkMermaid], rehypePlugins: [rehypeTableWrap] },
  integrations: [
    starlight({
      title: { en: 'Fawtir Developers', ar: 'مطوّرو فوتر' },
      description:
        'Guides and API reference for connecting an ERP, accounting or POS system to Fawtir.',
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
      },
      customCss: ['./src/styles/fawtir.css'],
      components: {
        Head: './src/components/Head.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        Hero: './src/components/Hero.astro',
        Footer: './src/components/Footer.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      expressiveCode: {
        themes: ['github-light'],
        shiki: { langAlias: { jsonata: 'javascript' } },
        styleOverrides: {
          borderRadius: '10px',
          borderColor: 'var(--sl-color-hairline)',
          codeFontSize: '0.85rem',
          frames: { shadowColor: 'transparent' },
        },
      },
      // Kept out of search engines until the guide passes its publication gate.
      head: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }],
      lastUpdated: false,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [
        { label: 'Overview', translations: { ar: 'نظرة عامة' }, link: '/guide/' },
        {
          label: 'Get started',
          translations: { ar: 'البدء' },
          autogenerate: { directory: 'get-started' },
        },
        { label: 'API', translations: { ar: 'واجهة البرمجة' }, autogenerate: { directory: 'api' } },
        {
          label: 'Integrate',
          translations: { ar: 'التكامل' },
          autogenerate: { directory: 'integrate' },
        },
        {
          label: 'Test and go live',
          translations: { ar: 'الاختبار والتشغيل' },
          autogenerate: { directory: 'go-live' },
        },
        {
          label: 'Reference',
          translations: { ar: 'المرجع' },
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
})
