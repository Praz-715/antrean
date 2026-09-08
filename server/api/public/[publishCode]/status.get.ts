import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { prisma } from '../../../utils/prisma'
import { queueService } from '../../../services/queue.service'
import { eventService } from '../../../services/event.service'
import { errors } from '../../../utils/response'
import { rateLimit } from '../../../utils/rate-limit'

/** Papan status ringkas: nomor yang sedang dipanggil per layanan. */
export default defineApiHandler(async (event) => {
  rateLimit(event, 'public:status', 240)
  const publishCode = getRouterParam(event, 'publishCode') as string

  const page = await prisma.publicPage.findFirst({
    where: { publishCode, isPublished: true, deletedAt: null },
    select: { eventId: true },
  })
  if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')

  const [board, openState] = await Promise.all([
    queueService.publicBoard(page.eventId),
    eventService.getOpenState(page.eventId),
  ])

  return ok({ ...board, openState })
})
