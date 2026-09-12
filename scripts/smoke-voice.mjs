/**
 * Uji suara panggilan di layar antrean (§22, §49).
 *
 * Berbeda dari skrip smoke lain yang membuat event sendiri, yang ini sengaja memakai
 * DATA NYATA — event, halaman publik, layanan, dan akun operator yang benar-benar
 * dipakai — karena pertanyaannya memang "apakah nada panggil yang saya pasang benar
 * terdengar di layar saya", bukan "apakah fiturnya jalan di data buatan".
 *
 * Yang diperiksa, semuanya di peramban sungguhan:
 *  1. berkas audio pilihan admin sampai ke layar sebagai URL siap putar;
 *  2. saat operator memanggil, berkas ITU yang benar-benar diputar (bukan hanya TTS);
 *  3. mode "hanya nada panggil" memang tidak membacakan nomor;
 *  4. mode "suara peramban" membacakan nomor SETELAH nadanya selesai.
 *
 * Karena memakai data nyata, uji ini MENAMBAH dua nomor antrean pada papan hari ini
 * (satu per putaran). Nomor yang masih aktif dibatalkan saat bersih-bersih, tetapi
 * yang terlanjur selesai tetap tercatat seperti antrean biasa — itu konsekuensi yang
 * disengaja dari menguji di data sungguhan, bukan kebocoran.
 *
 * Pengaturan event, batas pengambilan per IP, dan perangkat display uji dikembalikan
 * persis seperti semula pada blok `finally`.
 *
 * Jalankan: node scripts/smoke-voice.mjs   (server dev harus sudah berjalan)
 *           EVENT_ID=… PUBLISH_CODE=… OPERATOR_EMAIL=… OPERATOR_PASSWORD=… untuk data lain
 */
import { chromium } from 'playwright'

/** Alamat server yang diuji; timpa dengan SMOKE_BASE untuk menguji hasil build. */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const EVENT_ID = process.env.EVENT_ID || '01M25DM9RHXZJ1QNPTD96J1TYB'
const PUBLISH_CODE = process.env.PUBLISH_CODE || 'w8j4hz76'
const SERVICE_MATCH = new RegExp(process.env.SERVICE_MATCH || 'pidana', 'i')
const OPERATOR = {
  email: process.env.OPERATOR_EMAIL || 'loketpidana1@mail.com',
  password: process.env.OPERATOR_PASSWORD || 'operator123',
}
const ADMIN = { email: 'superadmin@antrean.local', password: 'password123' }

const results = []
function record(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'OK  ' : 'GAGAL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

let cookie = ''
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Origin': BASE, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith('better-auth.session_token')) cookie = c.split(';')[0]
  }
  return res.json().catch(() => null)
}

async function login(email, password) {
  cookie = ''
  const res = await api('POST', '/api/auth/sign-in/email', { email, password })
  if (!res || res.error) throw new Error(`Login ${email} gagal: ${res?.message ?? res?.error?.message ?? '?'}`)
}

const tidur = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  await login(ADMIN.email, ADMIN.password)

  // ---------- 1. siapkan berkas audio & pasang sebagai nada panggil event ----------
  const daftarAudio = (await api('GET', '/api/admin/media?type=AUDIO')).data ?? []
  let audio = daftarAudio[0]
  let audioBuatanUji = false

  if (!audio) {
    // Tidak ada berkas audio di organisasi ini: buat satu supaya uji tetap bermakna.
    const form = new FormData()
    form.append('file', new Blob([wavPendek()], { type: 'audio/wav' }), 'nada-uji.wav')
    form.append('name', `Nada Uji ${Date.now()}`)
    const res = await fetch(`${BASE}/api/admin/media`, {
      method: 'POST',
      headers: { Origin: BASE, Cookie: cookie },
      body: form,
    }).then(r => r.json())
    audio = res.data
    audioBuatanUji = true
  }
  record('ada berkas audio di Media Library', !!audio?.id, audio ? `${audio.name} (${audio.mime})` : 'tidak ada')

  const eventSebelum = (await api('GET', `/api/admin/events/${EVENT_ID}`)).data
  const settingsAsli = { ...(eventSebelum?.settings ?? {}) }

  const halaman = ((await api('GET', `/api/admin/public-pages?eventId=${EVENT_ID}`)).data ?? [])
    .find(p => p.publishCode === PUBLISH_CODE)
  if (!halaman) throw new Error(`Halaman publik ${PUBLISH_CODE} tidak ditemukan pada event ini`)
  const batasAsli = halaman.maxPerIpPerDay

  const perangkat = (await api('POST', '/api/admin/displays', {
    eventId: EVENT_ID,
    name: `Display Uji Suara ${Date.now()}`,
    type: 'GLOBAL',
  })).data

  const browser = await chromium.launch()
  /**
   * SATU konteks peramban dipakai untuk seluruh putaran.
   *
   * Perangkat display hanya bisa dipasangkan sekali, dan tokennya disimpan di
   * localStorage. Konteks baru = tanpa token = pairing ditolak = layar tidak menerima
   * siaran panggilan sama sekali — putaran kedua akan "sunyi" karena alasan yang tidak
   * ada hubungannya dengan suara.
   */
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })

  try {
    /**
     * Seluruh pendaftaran uji datang dari satu IP, jadi batas per IP dilonggarkan
     * sementara — dan dikembalikan pada blok `finally`, apa pun yang terjadi.
     */
    await api('PATCH', `/api/admin/public-pages/${halaman.id}`, { maxPerIpPerDay: 0 })

    await api('PATCH', `/api/admin/events/${EVENT_ID}`, {
      settings: { ...settingsAsli, voiceEnabled: true, voiceProvider: 'browser', voiceChimeMediaId: audio.id },
    })

    const state = (await api('GET', `/api/display/${perangkat.deviceCode}/state`)).data
    record('nada panggil event sampai ke layar sebagai URL siap putar',
      !!state?.settings?.voiceChimeUrl,
      state?.settings?.voiceChimeUrl ?? 'null')

    const publik = await (await fetch(`${BASE}/api/public/${PUBLISH_CODE}`, { headers: { Origin: BASE } })).json()
    const layanan = (publik.data?.queueTypes ?? []).find(t => SERVICE_MATCH.test(t.name))
    record('layanan yang diuji ditemukan di halaman publik', !!layanan,
      layanan ? `${layanan.code} · ${layanan.name}` : String(SERVICE_MATCH))
    if (!layanan) return

    // ---------- 2. mode "suara peramban": nada DULU, baru nomor dibacakan ----------
    const jejak1 = await panggilDanDengar(context, perangkat.deviceCode, layanan, publik.data.form, nomorUji)
    const adaNada = jejak1.some(j => j.tipe === 'audio' && j.volume === 1)
    const adaUcapan = jejak1.some(j => j.tipe === 'tts')
    const nadaSebelumUcapan = adaNada && adaUcapan
      && jejak1.findIndex(j => j.tipe === 'audio' && j.volume === 1) < jejak1.findIndex(j => j.tipe === 'tts')

    record('berkas audio dari Media Library benar-benar diputar saat dipanggil', adaNada,
      adaNada ? jejak1.find(j => j.tipe === 'audio' && j.volume === 1)?.src.split('/').pop() : 'tidak ada audio.play() saat panggilan')
    record('nomor tetap dibacakan setelah nada (mode suara peramban)', nadaSebelumUcapan,
      adaUcapan ? jejak1.find(j => j.tipe === 'tts')?.teks : 'tidak ada ucapan')

    // ---------- 3. mode "hanya nada panggil": nomor TIDAK dibacakan ----------
    await api('PATCH', `/api/admin/events/${EVENT_ID}`, {
      settings: { ...settingsAsli, voiceEnabled: true, voiceProvider: 'chime', voiceChimeMediaId: audio.id },
    })

    const jejak2 = await panggilDanDengar(context, perangkat.deviceCode, layanan, publik.data.form, nomorUji)
    const nada2 = jejak2.some(j => j.tipe === 'audio' && j.volume === 1)
    const ucapan2 = jejak2.some(j => j.tipe === 'tts')
    record('mode "hanya nada panggil" membunyikan nada', nada2,
      nada2 ? 'nada diputar' : 'nada tidak diputar')
    record('mode "hanya nada panggil" TIDAK membacakan nomor', nada2 && !ucapan2,
      ucapan2 ? `masih membacakan: ${jejak2.find(j => j.tipe === 'tts')?.teks}` : 'layar hanya berbunyi nada')

    // ---------- 4. nada BAWAAN SISTEM (tanpa Media Library sama sekali) ----------
    /**
     * Nilai & URL nada bawaan ditulis langsung di sini, bukan diimpor.
     * Skrip ini berjalan sebagai .mjs polos sehingga tidak bisa memuat berkas TypeScript;
     * kalau konvensinya berubah (`shared/constants/tones.ts`), pemeriksaan URL di bawah
     * akan gagal dengan jelas, bukan diam-diam ikut berubah.
     */
    const bawaan = { value: 'system:tone1', url: '/tone/tone1.mp3' }
    await api('PATCH', `/api/admin/events/${EVENT_ID}`, {
      settings: { ...settingsAsli, voiceEnabled: true, voiceProvider: 'browser', voiceChimeMediaId: bawaan.value },
    })

    const stateBawaan = (await api('GET', `/api/display/${perangkat.deviceCode}/state`)).data
    record('nada bawaan sistem sampai ke layar tanpa lewat Media Library',
      stateBawaan?.settings?.voiceChimeUrl === bawaan.url,
      `${bawaan.value} → ${stateBawaan?.settings?.voiceChimeUrl}`)

    const jejak3 = await panggilDanDengar(context, perangkat.deviceCode, layanan, publik.data.form, nomorUji)
    const nadaBawaan = jejak3.find(j => j.tipe === 'audio' && j.volume === 1)
    record('nada bawaan sistem benar-benar diputar saat dipanggil',
      !!nadaBawaan && nadaBawaan.src.endsWith(bawaan.url),
      nadaBawaan ? nadaBawaan.src.split('/').slice(-2).join('/') : 'tidak ada audio.play() saat panggilan')
  }
  finally {
    await context.close().catch(() => {})
    await browser.close()
    await login(ADMIN.email, ADMIN.password).catch(() => {})

    // Kembalikan persis seperti semula: pengaturan event, batas IP, perangkat uji.
    await api('PATCH', `/api/admin/events/${EVENT_ID}`, { settings: settingsAsli }).catch(() => {})
    await api('PATCH', `/api/admin/public-pages/${halaman.id}`, { maxPerIpPerDay: batasAsli }).catch(() => {})
    await api('DELETE', `/api/admin/displays/${perangkat.id}`).catch(() => {})

    // Antrean uji dibatalkan supaya papan hari ini tidak tercemar.
    const sisa = await api('GET', `/api/admin/queues?eventId=${EVENT_ID}&perPage=100`).catch(() => null)
    for (const q of sisa?.data?.items ?? []) {
      if (['WAITING', 'CALLED', 'SERVING'].includes(q.status) && nomorUji.has(q.queueNumber)) {
        await api('POST', `/api/operator/queue/${q.id}/cancel`, { reason: 'Pembersihan uji suara' }).catch(() => {})
      }
    }

    if (audioBuatanUji && audio?.id) await api('DELETE', `/api/admin/media/${audio.id}`).catch(() => {})
  }

  const gagal = results.filter(r => !r.ok)
  console.log(`\n${results.length - gagal.length}/${results.length} lolos`)
  process.exit(gagal.length ? 1 : 0)
}

/** Nomor antrean bikinan uji ini — hanya ini yang dibereskan saat bersih-bersih. */
const nomorUji = new Set()

/**
 * Satu putaran penuh: buka layar, izinkan bunyi, daftarkan pengunjung, panggil lewat
 * akun operator sungguhan, lalu kembalikan jejak bunyi yang benar-benar terjadi.
 *
 * `play()` dan `speechSynthesis.speak()` disadap DI DALAM halaman karena hanya itu
 * cara mengetahui bunyi benar-benar dimainkan — permintaan jaringan saja tidak cukup,
 * berkas bisa saja terambil lalu ditolak kebijakan autoplay.
 */
async function panggilDanDengar(context, deviceCode, layanan, form, nomorUji) {
  const page = await context.newPage()
  const jejak = []

  await page.addInitScript(() => {
    const asli = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      console.log(`[suara] audio|${this.src}|${this.volume}`)
      return asli.call(this)
    }
    const speak = window.speechSynthesis?.speak?.bind(window.speechSynthesis)
    if (speak) {
      window.speechSynthesis.speak = (u) => {
        console.log(`[suara] tts|${String(u.text).slice(0, 60)}`)
        return speak(u)
      }
    }
  })

  page.on('console', (m) => {
    const teks = m.text()
    if (!teks.startsWith('[suara] ')) return
    const [tipe, a, b] = teks.replace('[suara] ', '').split('|')
    if (tipe === 'audio') jejak.push({ tipe, src: a, volume: Number(b) })
    else jejak.push({ tipe, teks: a })
  })

  await page.goto(`${BASE}/display/${deviceCode}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30_000 })
  await page.waitForTimeout(2500)

  const tombol = page.getByRole('button', { name: /Aktifkan Suara/ })
  if (await tombol.count()) {
    await tombol.first().click()
    await page.waitForTimeout(1200)
  }

  // Jejak dari tahap "aktifkan suara" dibuang: yang diuji adalah bunyi saat dipanggil.
  jejak.length = 0

  const nilai = {}
  for (const field of form?.fields ?? []) {
    if (field.type === 'EMAIL') nilai[field.key] = 'uji.suara@contoh.id'
    else if (field.type === 'PHONE') nilai[field.key] = '081200000000'
    else nilai[field.key] = 'Uji Suara'
  }

  const tiket = await fetch(`${BASE}/api/public/${PUBLISH_CODE}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ queueTypeId: layanan.id, values: nilai }),
  }).then(r => r.json())
  if (tiket?.data?.queueNumber) nomorUji.add(tiket.data.queueNumber)

  const cookieAdmin = cookie
  await login(OPERATOR.email, OPERATOR.password)
  const workspace = (await api('GET', '/api/operator/workspace')).data ?? []
  const penugasan = workspace.find(a => a.queueType.id === layanan.id) ?? workspace[0]
  if (penugasan) {
    await api('POST', '/api/operator/queue/next', {
      queueTypeId: penugasan.queueType.id,
      counterId: penugasan.counter?.id ?? null,
    })
  }
  cookie = cookieAdmin

  // Beri waktu nada selesai berbunyi sebelum ucapannya menyusul.
  await tidur(7000)
  await page.close()
  return jejak
}

/** WAV 8-bit mono setengah detik — dipakai hanya bila organisasi belum punya audio. */
function wavPendek() {
  const sampleRate = 8000
  const samples = 4000
  const data = Buffer.alloc(samples)
  for (let i = 0; i < samples; i++) {
    data[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 880 * i) / sampleRate))
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
