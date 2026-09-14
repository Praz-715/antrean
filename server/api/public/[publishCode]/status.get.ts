import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { prisma } from '../../../utils/prisma'
import { queueService } from '../../../services/queue.service'
import { eventService } from '../../../services/event.service'
import { errors } from '../../../utils/response'
import { rateLimit } from '../../../utils/rate-limit'
import { byCodeOrSlug, pickCanonical } from '../../../utils/public-page-lookup'

/** Papan status ringkas: nomor yang sedang dipanggil per layanan. */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:status', 240)
  const publishCode = getRouterParam(event, 'publishCode') as string

  // Kode publikasi maupun slug sama-sama diterima, seperti halaman publiknya sendiri.
  const page = pickCanonical(
    await prisma.publicPage.findMany({
      where: { isPublished: true, deletedAt: null, ...byCodeOrSlug(publishCode) },
      take: 2,
      select: { publishCode: true, eventId: true },
    }),
    publishCode,
  )
  if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')

  const [board, openState] = await Promise.all([
    queueService.publicBoard(page.eventId),
    eventService.getOpenState(page.eventId),
  ])

  return ok({ ...board, openState })
})
