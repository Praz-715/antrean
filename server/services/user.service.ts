import { prisma } from '../utils/prisma'
import { auth } from '../utils/auth'
import { newId } from '../utils/id'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { invalidateAuthContext } from '../utils/context'

export const userService = {
  async list(organizationId: string, params: { search?: string } = {}) {
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search } },
                { email: { contains: params.search } },
                { username: { contains: params.search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, key: true, name: true } } } },
        assignments: {
          select: {
            id: true,
            queueType: { select: { id: true, code: true, name: true, color: true } },
            counter: { select: { id: true, name: true } },
            event: { select: { id: true, name: true } },
          },
        },
      },
    })

    return users.map(u => ({
      ...u,
      roles: u.userRoles.map(r => r.role),
      userRoles: undefined,
    }))
  },

  async roles(organizationId: string) {
    return prisma.role.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { key: 'asc' },
      select: { id: true, key: true, name: true, isSystem: true },
    })
  },

  /**
   * Buat pengguna baru. Password di-hash oleh Better Auth (bukan kode kita sendiri),
   * lalu kolom khusus ANTREAN dilengkapi setelahnya.
   */
  async create(organizationId: string, input: {
    name: string
    email: string
    password: string
    username?: string | null
    phone?: string | null
    roleId: string
  }) {
    const existing = await prisma.user.findFirst({ where: { email: input.email } })
    if (existing) throw errors.conflict(ERROR_CODES.CONFLICT, 'Email sudah terdaftar')

    const role = await prisma.role.findFirst({
      where: { id: input.roleId, OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true },
    })
    if (!role) throw errors.notFound('Role tidak ditemukan')

    await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    })

    const user = await prisma.user.findFirst({ where: { email: input.email } })
    if (!user) throw errors.badRequest(ERROR_CODES.INTERNAL_ERROR, 'Gagal membuat pengguna')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId,
        username: input.username || null,
        phone: input.phone || null,
        emailVerified: true,
      },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })

    return this.getById(organizationId, user.id)
  },

  async getById(organizationId: string, id: string) {
    const user = await prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, key: true, name: true } } } },
      },
    })
    if (!user) throw errors.notFound('Pengguna tidak ditemukan')
    return { ...user, roles: user.userRoles.map(r => r.role), userRoles: undefined }
  },

  async update(organizationId: string, id: string, input: {
    name?: string
    username?: string | null
    phone?: string | null
    isActive?: boolean
    roleId?: string
  }) {
    await this.getById(organizationId, id)

    await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.username !== undefined ? { username: input.username || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })

    if (input.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: input.roleId, OR: [{ organizationId }, { organizationId: null }] },
        select: { id: true },
      })
      if (!role) throw errors.notFound('Role tidak ditemukan')
      await prisma.userRole.deleteMany({ where: { userId: id } })
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } })
    }

    invalidateAuthContext(id)
    return this.getById(organizationId, id)
  },

  /** Soft delete + cabut sesi aktif, supaya akun langsung tidak bisa dipakai. */
  async softDelete(organizationId: string, id: string, actorId: string) {
    if (id === actorId) throw errors.badRequest(ERROR_CODES.CONFLICT, 'Anda tidak dapat menghapus akun sendiri')

    const user = await this.getById(organizationId, id)
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    ])
    invalidateAuthContext(id)
    return user
  },

  async resetPassword(organizationId: string, id: string, newPassword: string) {
    const user = await this.getById(organizationId, id)
    const ctx = await auth.$context
    const hash = await ctx.password.hash(newPassword)

    const account = await prisma.account.findFirst({ where: { userId: id, providerId: 'credential' } })
    if (!account) throw errors.notFound('Akun kredensial tidak ditemukan')

    await prisma.account.update({ where: { id: account.id }, data: { password: hash } })
    await prisma.session.deleteMany({ where: { userId: id } })
    invalidateAuthContext(id)

    return user
  },
}

export const assignmentService = {
  async list(organizationId: string, eventId?: string) {
    return prisma.operatorAssignment.findMany({
      where: {
        event: { organizationId, deletedAt: null },
        ...(eventId ? { eventId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        queueType: { select: { id: true, code: true, name: true, color: true } },
        counter: { select: { id: true, code: true, name: true } },
        event: { select: { id: true, name: true } },
      },
    })
  },

  async upsert(organizationId: string, input: {
    userId: string
    eventId: string
    queueTypeId: string
    counterId?: string | null
    isDefault?: boolean
  }) {
    const [user, queueType] = await Promise.all([
      prisma.user.findFirst({ where: { id: input.userId, organizationId, deletedAt: null }, select: { id: true } }),
      prisma.queueType.findFirst({
        where: { id: input.queueTypeId, eventId: input.eventId, deletedAt: null, event: { organizationId } },
        select: { id: true },
      }),
    ])
    if (!user) throw errors.notFound('Pengguna tidak ditemukan')
    if (!queueType) throw errors.notFound('Jenis antrean tidak ditemukan')

    if (input.counterId) {
      const counter = await prisma.counter.findFirst({
        where: { id: input.counterId, eventId: input.eventId },
        select: { id: true },
      })
      if (!counter) throw errors.notFound('Loket tidak ditemukan')
    }

    invalidateAuthContext(input.userId)

    return prisma.operatorAssignment.upsert({
      where: { userId_queueTypeId: { userId: input.userId, queueTypeId: input.queueTypeId } },
      update: { counterId: input.counterId ?? null, isDefault: input.isDefault ?? false, eventId: input.eventId },
      create: {
        id: newId(),
        userId: input.userId,
        eventId: input.eventId,
        queueTypeId: input.queueTypeId,
        counterId: input.counterId ?? null,
        isDefault: input.isDefault ?? false,
      },
      include: {
        user: { select: { id: true, name: true } },
        queueType: { select: { id: true, code: true, name: true } },
        counter: { select: { id: true, name: true } },
      },
    })
  },

  async remove(organizationId: string, id: string) {
    const assignment = await prisma.operatorAssignment.findFirst({
      where: { id, event: { organizationId, deletedAt: null } },
      select: { id: true, userId: true, queueTypeId: true },
    })
    if (!assignment) throw errors.notFound('Penugasan tidak ditemukan')

    const active = await prisma.queue.count({
      where: { operatorId: assignment.userId, queueTypeId: assignment.queueTypeId, status: { in: ['CALLED', 'SERVING'] } },
    })
    if (active > 0) {
      throw errors.conflict(ERROR_CODES.CONFLICT, 'Operator sedang melayani antrean pada layanan ini')
    }

    await prisma.operatorAssignment.delete({ where: { id } })
    invalidateAuthContext(assignment.userId)
    return assignment
  },
}
