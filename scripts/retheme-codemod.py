#!/usr/bin/env python3
"""Re-theme Grocery Hauls Pro za: emerald/orange/stone -> blue/sky/lime/red/zinc.
Palette: sky blue + blue (brand), black + white (neutrals), lime (What's New + savings), red (alerts).
Excludes admin-view.tsx (themed separately) and store brand colors (data, not theme).
"""
import pathlib
import sys

ROOT = pathlib.Path('/home/z/my-project/src')
TARGETS = list((ROOT / 'components' / 'views').glob('*.tsx')) + \
          list((ROOT / 'components' / 'shared').glob('*.tsx')) + \
          [ROOT / 'app' / 'page.tsx']
TARGETS = [t for t in TARGETS if t.name != 'admin-view.tsx']

# Ordered: most specific multi-word patterns first, then generic class swaps
REPLACEMENTS = [
    # --- wish list banner (conditional) ---
    ("{hasWhatsApp ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}",
     "{hasWhatsApp ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'}"),
    ('<p className="text-xs leading-relaxed text-amber-800 flex items-start gap-2">',
     '<p className={`text-xs leading-relaxed ${hasWhatsApp ? \'text-sky-900\' : \'text-red-700\'} flex items-start gap-2`}>'),
    ("text-emerald-700 font-semibold mt-1.5", "text-sky-700 font-semibold mt-1.5"),
    ("meetsTarget ? 'text-emerald-600'", "meetsTarget ? 'text-lime-700'"),
    ("border-amber-400 text-amber-700 hover:bg-amber-100", "border-red-400 text-red-700 hover:bg-red-100"),
    # --- what's new tag colors (lime = What's New highlight) ---
    ("'black-friday': 'bg-stone-800 text-white'", "'black-friday': 'bg-black text-white'"),
    ("bulk: 'bg-amber-500 text-white'", "bulk: 'bg-zinc-900 text-white'"),
    ("campaign: 'bg-emerald-600 text-white'", "campaign: 'bg-blue-600 text-white'"),
    ("new: 'bg-orange-500 text-white'", "new: 'bg-lime-500 text-black'"),
    # --- gradients ---
    ("from-emerald-600 via-emerald-500 to-teal-500", "from-blue-700 via-blue-600 to-sky-500"),
    ("from-emerald-600 to-emerald-500", "from-blue-700 to-sky-500"),
    ("from-red-500 to-orange-500", "from-zinc-900 to-sky-700"),
    # --- split view ---
    ("bg-orange-50 border-orange-300", "bg-lime-50 border-lime-300"),
    ("border-orange-200/60", "border-lime-300/60"),
    ("bg-orange-500 text-white rounded-2xl p-3.5", "bg-lime-600 text-black rounded-2xl p-3.5"),
    ("text-xs text-orange-100 mt-0.5", "text-xs text-black/70 mt-0.5"),
    # --- shop mode ---
    ("border-emerald-300 bg-emerald-50/50", "border-blue-300 bg-blue-50/50"),
    ("bg-red-500 hover:bg-red-600", "bg-blue-600 hover:bg-blue-700"),
    ("border-red-300 bg-black", "border-sky-400 bg-black"),
    ("bg-orange-100 text-orange-700", "bg-lime-100 text-lime-800"),
    ("bg-teal-100 text-teal-700", "bg-sky-100 text-sky-700"),
    # --- notifications (price-drop = alert) ---
    ("bg-orange-100 text-orange-600", "bg-red-100 text-red-600"),
    # --- generic button / state patterns ---
    ("bg-rose-500 hover:bg-rose-600", "bg-blue-600 hover:bg-blue-700"),
    ("text-rose-600 hover:bg-rose-50", "text-sky-700 hover:bg-sky-50"),
    ("bg-orange-500 hover:bg-orange-600", "bg-blue-600 hover:bg-blue-700"),
    ("border-emerald-300 text-emerald-700 hover:bg-emerald-50", "border-blue-300 text-blue-700 hover:bg-blue-50"),
    ("text-emerald-700 hover:bg-emerald-50", "text-blue-700 hover:bg-blue-50"),
    ("hover:text-emerald-600", "hover:text-blue-600"),
    ("hover:text-emerald-700", "hover:text-blue-700"),
    ("hover:border-emerald-300", "hover:border-blue-300"),
    ("bg-emerald-600 hover:bg-emerald-700", "bg-blue-600 hover:bg-blue-700"),
    ("bg-emerald-50 border border-emerald-200", "bg-sky-50 border border-sky-200"),
    ("bg-emerald-50 border-emerald-200", "bg-sky-50 border-sky-200"),
    ("bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700"),
    ("bg-emerald-100 text-emerald-600", "bg-sky-100 text-sky-600"),
    ("bg-emerald-500 border-emerald-500", "bg-blue-500 border-blue-500"),
    ("bg-emerald-600 text-white border-emerald-600", "bg-blue-600 text-white border-blue-600"),
    ("bg-emerald-600 border-emerald-600", "bg-blue-600 border-blue-600"),
    ("border-emerald-400", "border-blue-500"),
    ("bg-emerald-600", "bg-blue-600"),
    ("border-emerald-200", "border-sky-200"),
    ("text-emerald-600", "text-blue-600"),
    ("text-emerald-700", "text-lime-700"),
    ("text-emerald-800", "text-sky-900"),
    ("text-emerald-400", "text-sky-400"),
    ("text-emerald-100", "text-sky-100"),
    ("text-emerald-50", "text-sky-50"),
    # --- savings highlights -> lime ---
    ("text-orange-600", "text-lime-700"),
    ("text-orange-400", "text-lime-400"),
    ("text-orange-800", "text-lime-800"),
    ("text-orange-100", "text-sky-300"),
    ("bg-orange-500", "bg-blue-600"),
    ("bg-orange-50", "bg-lime-50"),
    # --- alerts / warnings -> red ---
    ("text-amber-800", "text-red-800"),
    ("text-amber-700", "text-red-700"),
    ("text-amber-600", "text-red-600"),
    ("text-amber-400", "text-red-400"),
    ("bg-amber-50 border-amber-200", "bg-red-50 border-red-200"),
    ("border-amber-200", "border-red-200"),
    ("bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700"),
    # --- compare view leftovers ---
    ("bg-stone-100 text-stone-500", "bg-zinc-100 text-zinc-500"),
    ("text-red-100", "text-sky-300"),
    # --- warm neutrals -> cool zinc (black/white family) ---
    ("bg-stone-950", "bg-zinc-950"),
    ("bg-stone-900/60", "bg-zinc-900/60"),
    ("bg-stone-900", "bg-zinc-900"),
    ("hover:bg-stone-800/40", "hover:bg-zinc-800/40"),
    ("bg-stone-800/60", "bg-zinc-800/60"),
    ("hover:bg-stone-800", "hover:bg-zinc-800"),
    ("bg-stone-800", "bg-zinc-800"),
    ("hover:bg-stone-50", "hover:bg-zinc-50"),
    ("bg-stone-100", "bg-zinc-100"),
    ("bg-stone-50", "bg-zinc-50"),
    ("border-stone-800", "border-zinc-800"),
    ("border-stone-700", "border-zinc-700"),
    ("border-stone-300", "border-zinc-300"),
    ("border-stone-200", "border-zinc-200"),
    ("border-stone-100", "border-zinc-100"),
    ("text-stone-800", "text-zinc-900"),
    ("text-stone-700", "text-zinc-700"),
    ("text-stone-600", "text-zinc-600"),
    ("text-stone-500", "text-zinc-500"),
    ("text-stone-400", "text-zinc-400"),
    ("text-stone-300", "text-zinc-300"),
    ("text-stone-200", "text-zinc-200"),
    ("text-stone-100", "text-zinc-100"),
]

changed = []
for path in TARGETS:
    text = path.read_text()
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text)
        changed.append(path.name)

print(f"Modified {len(changed)} files:")
for name in changed:
    print(f"  - {name}")

# Report any leftover themed classes
leftovers = {}
for path in TARGETS:
    text = path.read_text()
    for token in ['emerald', 'stone', 'amber', 'orange', 'rose', 'teal']:
        if token in text:
            leftovers.setdefault(path.name, []).append(token)
if leftovers:
    print("\nLEFTOVERS (need manual review):")
    for name, tokens in leftovers.items():
        print(f"  {name}: {', '.join(tokens)}")
else:
    print("\nAll view/shared files clean of old palette tokens.")
