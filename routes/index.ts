import type { ShikijiTransformer } from 'shikiji'
import { bundledLanguages, bundledThemes, getHighlighterCore, loadWasm } from 'shikiji'

function STYLE(color: string) {
  return `
<link rel="stylesheet" href="https://esm.sh/shikiji-twoslash/style-rich.css" />
<style>
html {
  color-scheme: ${color};
}
body {
  margin: 0;
  padding: 0;
}
.shiki {
  padding: 2em;
}
${color === 'dark' ? '.twoslash { --twoslash-popup-bg: #1e1e1e; }' : ''}
</style>
`
}

const EXAMPLE = `/**
 * This is an example of Shikiji running on Edge
 *
 * Available query parameters:
 *   - code: code to highlight, default to the example
 *   - lang: language to highlight, default to "ts"
 *   - theme: theme to use, default to "vitesse-dark"
 *   - twoslash: enable twoslash, default to false, only works for TypeScript
 *   - style: inject CSS style, default to true
 * 
 * Source repo: https://github.com/antfu/nitro-shikiji
 */
// @annotate: Hover on tokens to see the types


import { ref, computed } from '@vue/reactivity'

console.log("Hello World!")

const value = ref(1)
const double = computed(() => value.value * 2)
//      ^?



double.value = 5
`

export default lazyEventHandler(async () => {
  await loadWasm({ data: await import('shikiji/wasm').then(r => r.getWasmInlined()).then(r => r.data) })
  const shiki = await getHighlighterCore()

  return cachedEventHandler(async (event) => {
    const {
      code = EXAMPLE,
      lang = 'ts',
      theme = 'vitesse-dark',
      twoslash = code === EXAMPLE,
      style = true,
    } = {
      ...getQuery(event),
      ...event.node.req.method === 'POST' ? await readBody(event) : {},
    }

    if (!bundledLanguages[lang as keyof typeof bundledLanguages])
      return new Response(`Does not support language "${lang}"`, { status: 400 })
    if (!bundledThemes[theme as keyof typeof bundledThemes])
      return new Response(`Does not support theme "${theme}"`, { status: 400 })

    const transformers: ShikijiTransformer[] = []

    await Promise.all([
      shiki.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages]),
      shiki.loadTheme(bundledThemes[theme as keyof typeof bundledThemes]),
      twoslash
        ? import('../chunks/twoslash').then(r => r.prepare(code))
          .then(({ transformer }) => transformers.push(transformer))
        : undefined,
    ])

    let result = shiki.codeToHtml(code, {
      lang,
      theme,
      transformers,
    })

    if (style)
      result = STYLE(shiki.getTheme(theme)?.type || 'auto') + result

    return result
  }, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
})
