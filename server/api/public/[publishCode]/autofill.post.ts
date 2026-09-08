import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { publicPageService } from '../../../services/public-page.service'
import { rateLimit } from '../../../utils/rate-limit'

const bodySchema = z.object({
  lookup: z.string().trim().min(1, 'Isi dulu nilai yang ingin dicari').max(190),
})

/**
 * Isi otomatis formulir dari sistem eksternal (§6).
 *
 * Dibatasi ketat: satu permintaan di sini memicu satu permintaan keluar dari server,
 * jadi tanpa rem ia bisa dipakai membanjiri sistem pihak ketiga atas nama kita.
 */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:autofill', 15)

  const publishCode = getRouterParam(event, 'publishCode') as string
  const { lookup } = bodySchema.parse(await readBody(event))

  const values = await publicPageService.autofill(publishCode, lookup)

  return ok(values, 'Data ditemukan')
})
