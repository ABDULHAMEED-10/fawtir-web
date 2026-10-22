/**
 * The Oman HS list search (`GET /v1/code-lists/hs?q=&limit=`), as `src/api/codeLists/hs.ts` reads
 * it: a few entries of the published 14,313, enough for the catalogue form and the composers'
 * classification picker to name the codes the mock products and drafts carry. "Other"
 * (000000000000) is added by the picker itself.
 */

const HS = [
  { code: '080410000000', name: 'Edible fruit > Dates > Fresh or dried', nameAr: 'فواكه صالحة للأكل > تمور > طازجة أو مجففة' },
  { code: '090111000000', name: 'Coffee > Not roasted > Not decaffeinated', nameAr: 'بن > غير محمص > غير منزوع الكافيين' },
  { code: '090121000000', name: 'Coffee > Roasted coffee > Not decaffeinated', nameAr: 'بن > بن محمص > غير منزوع الكافيين' },
  { code: '090122000000', name: 'Coffee > Roasted coffee > Decaffeinated', nameAr: 'بن > بن محمص > منزوع الكافيين' },
  { code: '210111000000', name: 'Extracts of coffee > Extracts, essences and concentrates', nameAr: 'خلاصات البن > خلاصات وأرواح ومركزات' },
  { code: '210690000000', name: 'Food preparations n.e.s. > Other', nameAr: 'محضرات غذائية غير مذكورة > غيرها' },
]

export default [
  {
    match: '/api/v1/code-lists/hs',
    reply: ({ query }) => {
      const q = (query.get('q') ?? '').toLowerCase()
      const limit = Number(query.get('limit') ?? 20)
      const found = HS.filter((entry) => !q || entry.code.startsWith(q) || entry.name.toLowerCase().includes(q))
      return { items: found.slice(0, limit), total: found.length }
    },
  },
]
