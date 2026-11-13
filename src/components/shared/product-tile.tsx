'use client'

// Product names are more reliable than generic category emojis or mismatched photos.
// Keep this component as a no-op so existing callers remain compatible while the UI
// displays the exact product name as text.
export function ProductTile(_props: {
  icon: string
  imageUrl?: string | null
  color?: string
  size?: 'sm' | 'md' | 'lg'
  alt?: string
}) {
  return null
}
