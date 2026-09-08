import { defineApiHandler } from '../utils/handler'
import { ok } from '../utils/response'
import { getAuthContext } from '../utils/context'
import { prisma } from '../utils/prisma'

/** Profil + permission + assignment user yang sedang login. Dipakai klien untuk gating UI. */
export default defineApiHandler(async (event) => {
  const ctx = await getAuthContext(event)
  if (!ctx) return ok(null, 'Belum login')

  const [organization, assignments] = await Promise.all([
    ctx.organizationId
      ? prisma.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { id: true, name: true, slug: true, logoUrl: true, timezone: true },
        })
      : null,
    prisma.operatorAssignment.findMany({
      where: { userId: ctx.userId },
      select: {
        id: true,
        isDefault: true,
        queueType: { select: { id: true, code: true, name: true, color: true, icon: true } },
        counter: { select: { id: true, code: true, name: true } },
        event: { select: { id: true, name: true, status: true, timezone: true } },
      },
      orderBy: { isDefault: 'desc' },
    }),
  ])

  return ok({
    user: { id: ctx.userId, name: ctx.name, email: ctx.email },
    organization,
    roles: ctx.roleKeys,
    isSuperadmin: ctx.isSuperadmin,
    permissions: [...ctx.permissions],
    assignments,
  })
})
