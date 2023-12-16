import type { ShikijiTransformer } from 'shikiji/core'
import { getHighlighterCore, loadWasm } from 'shikiji/core'
import { bundledThemes } from 'shikiji/themes'
import { bundledLanguages } from 'shikiji/langs'

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


import { ref } from '@vue/reactivity'

console.log("Hello World!")

const a = ref(1)
//         ^?
`

export default lazyEventHandler(async () => {
  try {
    // try loading `.wasm` directly for Cloudflare Workers
    const wasm = await import('shikiji/onig.wasm').then(r => r.default)
    await loadWasm(async obj => WebAssembly.instantiate(wasm, obj))
  }
  catch {
    // otherwise fallback to base64 inlined wasm
    await loadWasm({ data: await import('shikiji/wasm').then(r => r.getWasmInlined()).then(r => r.data) })
  }

  const shiki = await getHighlighterCore()

  return eventHandler(async (event) => {
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
        ? import('../twoslash').then(r => r.prepare(code))
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
  })
})
