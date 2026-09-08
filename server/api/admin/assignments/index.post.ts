import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { assignmentService } from '../../../services/user.service'
import { auditAsync, AUDIT_ACTIONS } from '../../../utils/audit'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  userId: idSchema,
  eventId: idSchema,
  queueTypeId: idSchema,
  counterId: idSchema.optional().nullable(),
  isDefault: z.boolean().default(false),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.ASSIGNMENT_MANAGE)
  const organizationId = requireOrganization(ctx)
  const input = bodySchema.parse(await readBody(event))

  const assignment = await assignmentService.upsert(organizationId, input)
  auditAsync(event, {
    organizationId,
    userId: ctx.userId,
    action: AUDIT_ACTIONS.ASSIGNMENT_UPDATED,
    entity: 'OperatorAssignment',
    entityId: assignment.id,
    newData: { user: assignment.user.name, queueType: assignment.queueType.name, counter: assignment.counter?.name },
  })

  return ok(assignment, 'Penugasan disimpan')
})
