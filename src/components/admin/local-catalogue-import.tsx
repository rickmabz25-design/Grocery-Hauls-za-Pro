'use client'

// Preview rebuild trigger: comment only; no application behaviour change    <section className="rounded-2xl border border-sky-800 bg-sky-950/20 p-5 space-y-3">
      <div className="flex items-center gap-2"><Download className="h-5 w-5 text-sky-400" /><h3 className="font-bold text-sm">Restore a saved catalogue backup</h3></div>
      <p className="text-xs leading-relaxed text-zinc-300">Use this to move the three JSON files exported from another preview into this browser. Select all three files below. The restore merges records by ID and keeps other local catalogue records; it does not upload data or publish anything.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ['products', 'Products JSON'],
          ['promos', 'Promotions JSON'],
          ['multiBuyPromos', 'Multi-buy promotions JSON'],
        ] as const).map(([kind, label]) => <label key={kind} className="block text-xs font-semibold text-zinc-300">{label}
          <input type="file" accept=".json,application/json" className="mt-2 block w-full text-[11px] text-zinc-400 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-700 file:px-2 file:py-1.5 file:text-zinc-100" onChange={e => { void readBackupFile(kind, e.target.files?.[0]); e.currentTarget.value = '' }} />
          <span className="mt-1 block truncate text-[10px] font-normal text-zinc-500">{backupNames[kind] || 'No file selected'}</span>
        </label>)}
      </div>
      <Button type="button" onClick={restoreCatalogueBackup} disabled={backupBusy || !backupFiles.products || !backupFiles.promos || !backupFiles.multiBuyPromos} className="bg-sky-600 hover:bg-sky-700">{backupBusy ? 'Restoring locally…' : 'Restore these 3 catalogue files'}</Button>
      {backupError && <p role="alert" className="text-xs text-red-300">{backupError}</p>}
      {backupResult && <p role="status" className="text-xs text-lime-300">Restored: {backupResult.productsImported} products · {backupResult.promosImported} promotions · {backupResult.multiBuyOffersImported} multi-buy offers. Existing local records were retained.</p>}
    </section>

      <h3 className="font-bold text-sm">Export approved catalogue</h3>
      <p className="text-xs text-zinc-400">Download the merged catalogue snapshots after importing. These files are for a separate, reviewed repository update; this button does not deploy or publish anything.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportCatalogueFile('products')} className="border-zinc-700 text-zinc-200"><Download className="mr-2 h-4 w-4" /> Export products.json</Button><Button variant="outline" onClick={() => exportCatalogueFile('promos')} className="border-zinc-700 text-zinc-200"><Download className="mr-2 h-4 w-4" /> Export promos.json</Button><Button variant="outline" onClick={() => exportCatalogueFile('multiBuyPromos')} className="border-zinc-700 text-zinc-200"><Download className="mr-2 h-4 w-4" /> Export multi-buy-promos.json</Button></div>
    </section>
  </div>
}
