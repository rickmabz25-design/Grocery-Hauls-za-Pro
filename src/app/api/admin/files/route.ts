import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getAdmin, unauthorized, badRequest } from '@/lib/server/auth'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Admin file upload: CSV/Excel (for import preview) or JPEG/PDF (for storage)
// multipart/form-data: file=<File>, purpose=import|asset, relatedStore=<optional>
export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')

  const form = await req.formData()
  const file = form.get('file') as File | null
  const purpose = String(form.get('purpose') || 'asset')
  const relatedStore = String(form.get('relatedStore') || '') || null
  if (!file) return badRequest('Choose a file to upload')

  const ext = path.extname(file.name).toLowerCase().replace('.', '')
  const size = file.size
  if (size > 15 * 1024 * 1024) return badRequest('File is too large (max 15MB)')

  ensureUploadDir()
  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // CSV / Excel import preview: parse and return headers + first 100 rows
  if (purpose === 'import') {
    if (!['csv', 'xlsx', 'xls'].includes(ext)) return badRequest('Import needs a CSV or Excel file')
    try {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
      if (!rows.length) return badRequest('The file has no data rows')
      const headers = Object.keys(rows[0])
      // save the file for reference
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer)
      await db.upload.create({
        data: {
          filename: file.name,
          fileType: ext,
          fileSize: size,
          uploadedBy: admin.email,
          relatedStore,
          url: '/uploads/' + storedName,
        },
      })
      return NextResponse.json({
        headers,
        rows: rows.slice(0, 100),
        totalRows: rows.length,
        storedName,
      })
    } catch {
      return badRequest('Could not read the file. Make sure it is a valid CSV or Excel file.')
    }
  }

  // Asset upload (JPEG/PNG images, PDF leaflets)
  const allowedAssets: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', pdf: 'pdf' }
  if (!allowedAssets[ext]) return badRequest('Only JPEG, PNG or PDF files are supported for uploads')
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer)
  const upload = await db.upload.create({
    data: {
      filename: file.name,
      fileType: allowedAssets[ext],
      fileSize: size,
      uploadedBy: admin.email,
      relatedStore,
      url: '/uploads/' + storedName,
    },
  })

  return NextResponse.json({ upload })
}

export async function GET(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const files = await db.upload.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return NextResponse.json({ files })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return unauthorized('Admin access required')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return badRequest('Missing id')
  const upload = await db.upload.findUnique({ where: { id } })
  if (!upload) return badRequest('File not found')
  if (upload.url) {
    const filePath = path.join(process.cwd(), 'public', upload.url)
    fs.unlink(filePath).catch(() => {})
  }
  await db.upload.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
