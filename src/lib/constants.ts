// Shared client constants

// Canonical public URL of the deployed app. Used as the fallback "share the
// app" link when the current origin is unavailable (e.g. during static
// pre-render). Views prefer window.location.origin at runtime so the link is
// correct on any domain (Cloudflare Pages, Firebase, or a custom domain).
export const APP_SHARE_URL = 'https://grocery-hauls-za.pages.dev'

export const ADMIN_EMAIL_PRIMARY = 'rick@endintcap.online'
