import { z } from 'zod'
import { defineApiHandler } from '../../../../utils/handler'
import { errors, ok } from '../../../../utils/response'
import { requirePermission } from '../../../../utils/context'
import { operatorQueueService } from '../../../../services/operator.service'
import { broadcastQueue } from '../../../../realtime/queue-broadcast'
import { auditAsync, AUDIT_ACTIONS } from '../../../../utils/audit'
import { SOCKET_EVENTS } from '../../../../../shared/constants/socket'
import { PERMISSIONS, type Permission } from '../../../../../shared/constants/permissions'

/**
 * Aksi operator terhadap satu antrean:
 *   POST /api/operator/queue/{id}/call | recall | serving | skip | complete | no-show | cancel
 *
 * Satu berkas untuk semua aksi agar aturan izin, broadcast, dan audit tidak
 * tercecer di banyak tempat.
 */
const ACTIONS = {
  'call': {
    permission: PERMISSIONS.QUEUE_CALL,
    socket: SOCKET_EVENTS.QUEUE_CALLED,
    audit: AUDIT_ACTIONS.QUEUE_CALLED,
    message: 'dipanggil',
  },
  'recall': {
    permission: PERMISSIONS.QUEUE_RECALL,
    socket: SOCKET_EVENTS.QUEUE_RECALLED,
    audit: AUDIT_ACTIONS.QUEUE_RECALLED,
    message: 'dipanggil ulang',
  },
  'serving': {
    permission: PERMISSIONS.QUEUE_CALL,
    socket: SOCKET_EVENTS.QUEUE_SERVING,
    audit: AUDIT_ACTIONS.QUEUE_CALLED,
    message: 'mulai dilayani',
  },
  'skip': {
    permission: PERMISSIONS.QUEUE_SKIP,
    socket: SOCKET_EVENTS.QUEUE_SKIPPED,
    audit: AUDIT_ACTIONS.QUEUE_SKIPPED,
    message: 'dilewati',
  },
  'complete': {
    permission: PERMISSIONS.QUEUE_COMPLETE,
    socket: SOCKET_EVENTS.QUEUE_COMPLETED,
    audit: AUDIT_ACTIONS.QUEUE_COMPLETED,
    message: 'selesai dilayani',
  },
  'no-show': {
    permission: PERMISSIONS.QUEUE_SKIP,
    socket: SOCKET_EVENTS.QUEUE_UPDATED,
    audit: AUDIT_ACTIONS.QUEUE_SKIPPED,
    message: 'ditandai tidak hadir',
  },
  'cancel': {
    permission: PERMISSIONS.QUEUE_CANCEL,
    socket: SOCKET_EVENTS.QUEUE_CANCELLED,
    audit: AUDIT_ACTIONS.QUEUE_CANCELLED,
    message: 'dibatalkan',
  },
} as const

type ActionKey = keyof typeof ACTIONS

const bodySchema = z.object({
  counterId: z.string().length(26).optional().nullable(),
  reason: z.string().max(500).optional(),
}).default({})

export default defineApiHandler(async (event) => {
  const action = getRouterParam(event, 'action') as ActionKey
  const config = ACTIONS[action]
  if (!config) throw errors.notFound('Aksi tidak dikenal')

  const ctx = await requirePermission(event, config.permission as Permission)
  const queueId = getRouterParam(event, 'id') as string
  const body = bodySchema.parse(await readBody(event).catch(() => ({})))

  const queue = await (async () => {
    switch (action) {
      case 'call':
        return operatorQueueService.callSpecific({ userId: ctx.userId, queueId, counterId: body.counterId ?? null })
      case 'recall':
        return operatorQueueService.recall({ userId: ctx.userId, queueId })
      case 'serving':
        return operatorQueueService.startServing({ userId: ctx.userId, queueId })
      case 'skip':
        return operatorQueueService.skip({ userId: ctx.userId, queueId })
      case 'complete':
        return operatorQueueService.complete({ userId: ctx.userId, queueId })
      case 'no-show':
        return operatorQueueService.noShow({ userId: ctx.userId, queueId })
      case 'cancel':
        return operatorQueueService.cancel({ userId: ctx.userId, queueId, reason: body.reason })
    }
  })()

  broadcastQueue(config.socket, queue)

  auditAsync(event, {
    organizationId: queue.organizationId,
    userId: ctx.userId,
    action: config.audit,
    entity: 'Queue',
    entityId: queue.id,
    newData: { queueNumber: queue.queueNumber, status: queue.status },
  })

  return ok(queue, 'Antrean ' + queue.queueNumber + ' ' + config.message)
})
