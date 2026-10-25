import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Web-search assisted product identification for manual product entry.
// Uses the z-ai SDK web_search function (Google Search-style results) to help
// identify product name, category and approximate price. Gracefully degrades.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 3) return NextResponse.json({ suggestions: [], source: 'none' })

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = (await Promise.race([
      zai.functions.invoke('web_search', {
        query: `South Africa supermarket price "${q}" rand`,
        num: 6,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ])) as Array<{ name?: string; url?: string; snippet?: string }>

    const suggestions = (results || [])
      .slice(0, 5)
      .map((r) => {
        // try to pull a rand price out of the snippet
        let price: number | null = null
        const m = r.snippet?.match(/R\s?(\d{1,5}(?:[.,]\d{2})?)/)
        if (m) price = parseFloat(m[1].replace(',', '.'))
        return {
          title: r.name || '',
          snippet: (r.snippet || '').slice(0, 220),
          url: r.url || '',
          price,
        }
      })
      .filter((s) => s.title)

    return NextResponse.json({ suggestions, source: 'web' })
  } catch {
    return NextResponse.json({ suggestions: [], source: 'none' })
  }
}
