import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { errors } from '../../../utils/response'
import { prisma } from '../../../utils/prisma'
import { settingService } from '../../../services/setting.service'
import { safeFetchBinary } from '../../../utils/ssrf'
import { SETTING_KEYS } from '../../../../shared/constants/settings'
import { ERROR_CODES } from '../../../../shared/constants/errors'

/**
 * Suara panggilan dari layanan TTS eksternal (§22).
 *
 * Layar TIDAK memanggil layanan TTS-nya langsung, melainkan lewat endpoint ini.
 * Tiga alasannya:
 *  - URL layanan sering memuat kunci API; kalau dipanggil dari peramban, kuncinya
 *    ikut terbaca siapa pun yang membuka layar itu;
 *  - CSP aplikasi ini hanya mengizinkan koneksi ke origin sendiri, dan melonggarkannya
 *    demi satu fitur berarti melonggarkannya untuk semua halaman;
 *  - permintaan keluar jadi melewati penjaga SSRF yang sama dengan sumber data lain.
 *
 * Tidak butuh login: perangkat display memang menyajikan layar publik, sama seperti
 * endpoint state-nya. Yang dibatasi adalah panjang teks dan ukuran jawaban.
 */
const querySchema = z.object({
  text: z.string().trim().min(1).max(200),
})

/** Cukup untuk satu kalimat panggilan; lebih dari ini bukan lagi TTS panggilan. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024

export default defineApiHandler(async (event) => {
  const deviceCode = getRouterParam(event, 'deviceCode') as string
  const { text } = querySchema.parse(getQuery(event))

  const device = await prisma.displayDevice.findFirst({
    where: { deviceCode, deletedAt: null },
    select: {
      event: { select: { organizationId: true, settings: true } },
    },
  })
  if (!device) throw errors.notFound('Perangkat display tidak ditemukan')

  const settings = await settingService.forEvent(device.event)

  if (String(settings[SETTING_KEYS.DISPLAY_VOICE_PROVIDER]) !== 'external') {
    throw errors.badRequest(ERROR_CODES.VALIDATION_ERROR, 'Sumber suara event ini bukan TTS eksternal')
  }

  const template = String(settings[SETTING_KEYS.DISPLAY_VOICE_EXTERNAL_URL] ?? '').trim()
  if (!template.includes('{text}')) {
    throw errors.badRequest(
      ERROR_CODES.VALIDATION_ERROR,
      'URL TTS eksternal belum diisi atau tidak memuat penanda {text}',
    )
  }

  const target = template
    .replaceAll('{text}', encodeURIComponent(text))
    .replaceAll('{lang}', encodeURIComponent(String(settings[SETTING_KEYS.DISPLAY_VOICE_LANGUAGE] ?? 'id-ID')))

  const response = await safeFetchBinary(target, { timeoutMs: 8000, maxBytes: MAX_AUDIO_BYTES })
  if (!response.ok) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      `Layanan TTS menjawab HTTP ${response.status}`,
    )
  }

  /**
   * Jawaban yang bukan audio ditolak, bukan diteruskan. Endpoint ini boleh diakses
   * tanpa login, jadi tidak boleh berubah jadi proxy serbaguna yang meneruskan
   * halaman HTML atau JSON apa pun dari internet.
   */
  const contentType = response.contentType.split(';')[0]!.trim().toLowerCase()
  if (!contentType.startsWith('audio/')) {
    throw errors.badRequest(
      ERROR_CODES.DATA_SOURCE_UNREACHABLE,
      `Layanan TTS mengembalikan ${contentType || 'tipe tidak dikenal'}, bukan audio`,
    )
  }

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Length': String(response.bytes.byteLength),
    // Suara panggilan berubah tiap nomor; jangan sampai tersimpan di cache bersama.
    'Cache-Control': 'no-store',
  })
  return response.bytes
})
