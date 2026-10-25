#!/usr/bin/env python3
"""Re-theme admin dashboard: orange/emerald accents -> sky/blue/lime/red. stone -> zinc."""
import pathlib

path = pathlib.Path('/home/z/my-project/src/components/admin/admin-view.tsx')
text = path.read_text()

REPLACEMENTS = [
    # specific button variants first
    ('className="bg-orange-500 hover:bg-orange-600 h-9"', 'className="bg-lime-600 hover:bg-lime-700 text-zinc-950 h-9"'),
    ('className="mt-3 bg-orange-500 hover:bg-orange-600 h-10"', 'className="mt-3 bg-lime-600 hover:bg-lime-700 text-zinc-950 h-10"'),
    ('className="w-full h-11 bg-orange-500 hover:bg-orange-600 font-bold"', 'className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-bold"'),
    ('bg-amber-500/20 text-amber-400', 'bg-sky-500/20 text-sky-300'),          # DEMO badge
    ('className="text-emerald-400 hover:underline"', 'className="text-sky-400 hover:underline"'),  # download link
    ('bg-gradient-to-r from-orange-500 to-amber-500', 'bg-gradient-to-r from-blue-700 to-sky-500'),
    ('bg-emerald-900/20 border border-emerald-800', 'bg-lime-900/20 border border-lime-800'),
    ('bg-emerald-600 hover:bg-emerald-700', 'bg-blue-600 hover:bg-blue-700'),
    ('h-14 w-14 rounded-2xl bg-orange-500', 'h-14 w-14 rounded-2xl bg-sky-500'),
    ('h-9 w-9 rounded-xl bg-orange-500', 'h-9 w-9 rounded-xl bg-sky-500'),
    ("tab === t.key ? 'bg-orange-500 text-white'", "tab === t.key ? 'bg-sky-500 text-zinc-950'"),
    ('hover:border-orange-400', 'hover:border-sky-400'),
    ('text-orange-100', 'text-sky-100'),
    ('text-orange-400', 'text-sky-400'),
    ('text-emerald-400', 'text-lime-400'),   # whatsapp, import summary, promo price, published badge
    ('text-amber-400', 'text-red-400'),      # paused badge + warnings -> alert red
    # warm neutrals -> zinc
    ('bg-stone-950', 'bg-zinc-950'),
    ('bg-stone-900/60', 'bg-zinc-900/60'),
    ('bg-stone-900', 'bg-zinc-900'),
    ('hover:bg-stone-800/40', 'hover:bg-zinc-800/40'),
    ('bg-stone-800/60', 'bg-zinc-800/60'),
    ('hover:bg-stone-800', 'hover:bg-zinc-800'),
    ('bg-stone-800', 'bg-zinc-800'),
    ('hover:bg-stone-50', 'hover:bg-zinc-50'),
    ('border-stone-800', 'border-zinc-800'),
    ('border-stone-700', 'border-zinc-700'),
    ('hover:text-stone-200', 'hover:text-zinc-200'),
    ('text-stone-100', 'text-zinc-100'),
    ('text-stone-200', 'text-zinc-200'),
    ('text-stone-300', 'text-zinc-300'),
    ('text-stone-400', 'text-zinc-400'),
    ('text-stone-500', 'text-zinc-500'),
    ('placeholder:text-stone-500', 'placeholder:text-zinc-500'),
]

for old, new in REPLACEMENTS:
    text = text.replace(old, new)

path.write_text(text)

leftovers = [t for t in ['emerald', 'stone', 'amber', 'orange', 'rose', 'teal'] if t in text]
print('Admin themed. Leftover tokens:', leftovers if leftovers else 'NONE')
