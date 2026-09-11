/**
 * Uji Phase 5: media library, playlist, display builder.
 *
 * Menyiapkan event + template sendiri lalu membersihkannya, jadi data demo aman.
 * Jalankan: npm run smoke:phase5   (server dev harus sudah berjalan)
 */
import { chromium } from 'playwright'
import { deflateSync } from 'node:zlib'

const BASE = 'http://localhost:3000'
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

let cookie = ''
async function api(method, path, body, isForm = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Origin: BASE,
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  })
  const sc = res.headers.getSetCookie?.() ?? []
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ')
  return res.json()
}

async function login(email, password = 'password123') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    cookie = ''
    const res = await api('POST', '/api/auth/sign-in/email', { email, password })
    if (res?.token) return
    if (attempt === 3) throw new Error(`gagal login: ${res?.message}`)
    await new Promise(r => setTimeout(r, 20_000))
  }
}

async function waitFor(fn, timeout = 15_000, interval = 300) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

/** PNG 2×2 asli, dirakit manual supaya tidak perlu berkas contoh di repo. */
function makePng() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
    let crc = 0xFFFFFFFF
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0)
    return Buffer.concat([length, body, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0) // lebar
  ihdr.writeUInt32BE(2, 4) // tinggi
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  // baris: 1 byte filter + 3 byte per piksel
  const raw = Buffer.from([0, 27, 92, 245, 27, 92, 245, 0, 27, 92, 245, 27, 92, 245])

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function main() {
  await login('superadmin@antrean.local')

  const stamp = Date.now()
  const eventId = (await api('POST', '/api/admin/events', { name: `Uji Phase5 ${stamp}`, timezone: 'Asia/Jakarta' })).data.id
  await api('PUT', `/api/admin/events/${eventId}/schedules`, {
    schedules: Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: '00:00', closeTime: '23:59', isClosed: false })),
  })
  await api('POST', `/api/admin/events/${eventId}/status`, { status: 'OPEN' })
  const queueType = (await api('POST', '/api/admin/queue-types', {
    eventId, code: 'P', name: 'Layanan Phase5', prefix: 'P', startingNumber: 1,
    numberFormat: '{prefix}{seq}', padding: 3, color: '#1b5cf5', isActive: true, displayOrder: 1, estServiceSeconds: 300,
  })).data

  try {
    // ---- 1. unggah media ----
    const form = new FormData()
    form.append('file', new Blob([makePng()], { type: 'image/png' }), 'logo-uji.png')
    form.append('name', `Logo Uji ${stamp}`)
    const upload = await api('POST', '/api/admin/media', form, true)
    record('unggah gambar tervalidasi magic byte', !!upload.success,
      upload.success ? `${upload.data.width}×${upload.data.height}, ${upload.data.sizeBytes} byte` : upload.message)
    const media = upload.data

    // ---- 2. tolak berkas palsu ----
    const fake = new FormData()
    fake.append('file', new Blob([Buffer.from('bukan gambar sama sekali')], { type: 'image/png' }), 'palsu.png')
    const rejected = await api('POST', '/api/admin/media', fake, true)
    record('berkas berekstensi palsu ditolak', !rejected.success, rejected.code ?? 'lolos (salah!)')

    // ---- 3. berkas benar-benar tersaji ----
    const fileRes = await fetch(BASE + media.url)
    record('berkas media tersaji lewat /media', fileRes.status === 200 && fileRes.headers.get('content-type') === 'image/png',
      `HTTP ${fileRes.status} ${fileRes.headers.get('content-type')}`)

    // ---- 4. playlist ----
    const playlist = (await api('POST', '/api/admin/playlists', { name: `Playlist Uji ${stamp}` })).data
    const withItems = await api('PUT', `/api/admin/playlists/${playlist.id}/items`, {
      items: [{ mediaId: media.id, durationSeconds: 5 }],
    })
    record('playlist menyimpan item berdurasi', !!withItems.success && withItems.data.items.length === 1,
      withItems.success ? `${withItems.data.items.length} item` : withItems.message)

    // ---- 5. media terpakai tidak boleh dihapus ----
    const blockedDelete = await api('DELETE', `/api/admin/media/${media.id}`)
    record('media yang dipakai playlist tidak bisa dihapus', !blockedDelete.success, blockedDelete.code ?? 'terhapus (salah!)')

    // ---- 6. template + widget ----
    const template = (await api('POST', '/api/admin/display-templates', {
      name: `Template Uji ${stamp}`, type: 'GLOBAL', eventId,
    })).data
    const saved = await api('PUT', `/api/admin/display-templates/${template.id}/widgets`, {
      widgets: [
        {
          type: 'CURRENT_QUEUE', x: 120, y: 200, width: 900, height: 500, zIndex: 1,
          config: { queueTypeId: queueType.id, showCounter: true },
          style: { color: '#ffffff', backgroundColor: '#0f172a', fontSize: 180, align: 'center', radius: 24 },
          isVisible: true,
        },
        {
          type: 'LOGO', x: 1400, y: 120, width: 300, height: 300, zIndex: 2,
          mediaId: media.id, style: { objectFit: 'contain' }, isVisible: true,
        },
        {
          type: 'RUNNING_TEXT', x: 0, y: 980, width: 1920, height: 90, zIndex: 3,
          config: { text: 'Selamat datang' }, style: { color: '#e2e8f0', backgroundColor: '#1e293b', fontSize: 34, align: 'left' },
          isVisible: true,
        },
      ],
    })
    record('template menyimpan tata letak widget', !!saved.success && saved.data.widgets.length === 3,
      saved.success ? `${saved.data.widgets.length} widget` : saved.message)

    // ---- 7. duplikasi template ----
    const copy = await api('POST', `/api/admin/display-templates/${template.id}/duplicate`)
    record('template bisa diduplikasi beserta widget', !!copy.success && copy.data.widgets.length === 3,
      copy.success ? copy.data.name : copy.message)
    if (copy.success) await api('DELETE', `/api/admin/display-templates/${copy.data.id}`)

    // ---- 8. pasang ke perangkat & render di layar ----
    const device = (await api('POST', '/api/admin/displays', { eventId, name: 'Display Phase5', type: 'GLOBAL' })).data
    await api('PATCH', `/api/admin/displays/${device.id}`, { templateId: template.id })

    const state = await api('GET', `/api/display/${device.deviceCode}/state`)
    const hasAssets = !!state.data?.mediaById?.[media.id]
    record('state display membawa template + URL media', !!state.data?.template && hasAssets,
      state.data?.template ? `${state.data.template.widgets.length} widget, aset ${hasAssets ? 'ada' : 'tidak ada'}` : 'tanpa template')

    // ambil satu antrean lalu panggil, supaya widget nomor ada isinya
    const publicPage = (await api('POST', '/api/admin/public-pages', {
      eventId, title: 'Phase5', allowedQueueTypeIds: [], maxPerIpPerDay: 0, requireCaptcha: false,
    })).data
    await api('POST', `/api/admin/public-pages/${publicPage.id}/publish`, { isPublished: true })
    await fetch(`${BASE}/api/public/${publicPage.publishCode}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ queueTypeId: queueType.id, values: {} }),
    })

    const counter = (await api('POST', '/api/admin/counters', { eventId, code: 'PL1', name: 'Loket Phase5', isActive: true, displayOrder: 1 })).data
    // Operator khusus untuk event uji ini (§28: satu operator satu event).
    const operatorEmail = `op.uji.${stamp}@antrean.local`
    const operatorRoleId = (await api('GET', '/api/admin/users')).data.roles.find(r => r.key === 'OPERATOR').id
    const operator = (await api('POST', '/api/admin/users', {
      name: `Operator Uji ${stamp}`,
      email: operatorEmail,
      password: 'password123',
      roleId: operatorRoleId,
      isActive: true,
    })).data
    await api('PUT', `/api/admin/counters/${counter.id}/services`, { queueTypeIds: [queueType.id] })
    await api('POST', '/api/admin/assignments', { userId: operator.id, counterId: counter.id })

    const adminCookie = cookie
    await login(operatorEmail)
    const called = await api('POST', '/api/operator/queue/next', { queueTypeId: queueType.id, counterId: counter.id })
    cookie = adminCookie

    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(`${BASE}/display/${device.deviceCode}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })

    const rendered = await waitFor(async () => {
      const text = await page.locator('body').innerText()
      return text.includes(called.data?.queueNumber ?? 'P001') && text.includes('Selamat datang')
    }, 20_000)
    record('layar merender template buatan builder', rendered,
      rendered ? `${called.data?.queueNumber} + teks berjalan tampil` : 'template tidak terlihat')

    const logoShown = await page.locator(`img[src="${media.url}"]`).count()
    record('widget logo memakai berkas dari media library', logoShown > 0, logoShown ? 'gambar termuat' : 'gambar tidak ada')

    await browser.close()

    // ---- 9. template terpakai tidak boleh dihapus ----
    const blockedTemplate = await api('DELETE', `/api/admin/display-templates/${template.id}`)
    record('template yang dipakai perangkat tidak bisa dihapus', !blockedTemplate.success,
      blockedTemplate.code ?? 'terhapus (salah!)')
  }
  finally {
    await login('superadmin@antrean.local').catch(() => {})
      const leftovers = await api('GET', `/api/admin/queues?eventId=${eventId}&perPage=200`).catch(() => null)
      for (const q of leftovers?.data?.items ?? []) {
        if (['WAITING', 'CALLED', 'SERVING'].includes(q.status)) {
          await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji' }).catch(() => {})
        }
      }
    await api('DELETE', `/api/admin/events/${eventId}`).catch(() => {})
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} lolos`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
