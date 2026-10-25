#!/usr/bin/env python3
"""Rebuild download/groceryhauls-pro-za-app-phase2.zip from the project tree.
Excludes node_modules/.git/.next/sandbox internals, secrets, logs and big images.
Clamps file timestamps (snapshot-restored files may predate 1980)."""
import zipfile, os, time

SRC = '/home/z/my-project'
OUT = os.path.join(SRC, 'download/groceryhauls-pro-za-app-phase2.zip')
EXCLUDE_DIRS = {'node_modules', '.git', '.next', '.pgtest', '.pgtest-shim', '.zscripts', 'dist', '.vercel',
                'skills', 'tool-results', 'agent-ctx', 'examples', 'download', '.claude'}
EXCLUDE_EXT = ('.png', '.jpeg', '.jpg', '.log', '.db', '.sqlite', '.sqlite3', '-shm', '-wal')
EXCLUDE_FILES = {'.env', '.z-ai-config', 'nohup.out', '.DS_Store'}
EXCLUDE_PATH_PREFIX = ('out/uploads/', 'public/uploads/', 'skills/', 'tool-results/', 'agent-ctx/')
KEY = ['firebase.json', '.firebaserc', 'firestore.rules', 'storage.rules', 'package.json',
       '.env.example', 'README.md', 'LOCAL-DEPLOY.md',
       'src/lib/static-data.ts', 'src/lib/api.ts', 'src/lib/admin-data.ts', 'src/lib/admin-config.ts',
       'src/components/views/create-list-view.tsx', 'scripts/test-static-data.ts', 'scripts/test-import.ts',
       'out/index.html', 'out/admin.html', 'out/admin/login.html', 'out/data/products.json', 'out/data/promos.json']


def clamp(p):
    try:
        ts = os.stat(p).st_mtime
    except OSError:
        return (2026, 1, 1, 0, 0, 0)
    if ts < 315532800:  # before 1980-01-01
        return (2026, 1, 1, 0, 0, 0)
    return time.localtime(ts)[:6]


n = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(SRC):
        rel_root = os.path.relpath(root, SRC)
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.pg')
                   and os.path.join(rel_root, d) not in ('download', 'download/')]
        if rel_root == 'download':
            dirs[:] = []
            files = []
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, SRC)
            if f in EXCLUDE_FILES:
                continue
            if f.endswith(EXCLUDE_EXT) and rel != 'db/custom.db':
                # images ARE needed inside out/ and public/ (PWA icons, brand,
                # _next media); they are excluded everywhere else (working files)
                if not (rel.startswith('out/') or rel.startswith('public/')):
                    continue
            if rel.startswith(EXCLUDE_PATH_PREFIX) or rel == 'download/groceryhauls-pro-za-app-phase2.zip':
                continue
            # never ship the preview-download mirror of the ZIP itself (public/ + out/ copies)
            if (rel.startswith('public/') or rel.startswith('out/')) and f == 'groceryhauls-pro-za-app-phase2.zip':
                continue
            zi = zipfile.ZipInfo(rel, date_time=clamp(p))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (os.stat(p).st_mode & 0xFFFF) << 16
            with open(p, 'rb') as fh:
                z.writestr(zi, fh.read())
            n += 1
    names = set(z.namelist())
    missing = [k for k in KEY if k not in names]
    leaks = [nm for nm in names
             if nm.endswith(('.env', '.pem', '.key', 'serviceAccountKey.json')) or 'node_modules' in nm]

print('files:', n)
print('missing keys:', missing if missing else 'NONE — all 20 present')
print('secret/node_modules leaks:', leaks if leaks else 'NONE')
print('size MB:', round(os.path.getsize(OUT) / 1e6, 1))
