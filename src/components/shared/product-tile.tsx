'use client'

// Colourful emoji tile used for catalogue products (no external images needed).
// Admin-uploaded product images use imageUrl when present.
export function ProductTile({
  icon,
  imageUrl,
  color = '#2563EB',
  size = 'md',
  alt,
}: {
  icon: string
  imageUrl?: string | null
  color?: string
  size?: 'sm' | 'md' | 'lg'
  alt?: string
}) {
  const dims = size === 'sm' ? 'h-12 w-12 text-2xl' : size === 'lg' ? 'h-20 w-20 text-4xl' : 'h-14 w-14 text-3xl'
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt || 'Product image'}
        className={`${dims} rounded-xl object-cover border border-zinc-200`}
      />
    )
  }
  return (
    <div
      className={`${dims} rounded-xl flex items-center justify-center shrink-0`}
      style={{ background: color + '18' }}
      role="img"
      aria-label={alt || 'Product'}
    >
      <span aria-hidden>{icon}</span>
    </div>
  )
}
