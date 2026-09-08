import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { publicPageService } from '../../../services/public-page.service'
import { rateLimit } from '../../../utils/rate-limit'

/** Konfigurasi halaman publik: branding, layanan, formulir, status buka. */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:page', 120)
  const publishCode = getRouterParam(event, 'publishCode') as string
  return ok(await publicPageService.getByPublishCode(publishCode))
})
