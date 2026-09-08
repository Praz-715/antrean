import { z } from 'zod'
import { defineApiHandler } from '../../../utils/handler'
import { ok } from '../../../utils/response'
import { requireOrganization, requirePermission } from '../../../utils/context'
import { publishService } from '../../../services/publish.service'
import { idSchema } from '../../../../shared/schemas/common'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

const bodySchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  subtitle: z.string().trim().max(190).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  slug: z.string().trim().max(120).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  backgroundUrl: z.string().trim().max(500).optional().nullable(),
  // Disimpan & ditampilkan sebagai TEKS BIASA, bukan HTML — tidak ada sanitizer di
  // sistem ini, jadi jangan pernah merender markup dari input admin.
  infoHtml: z.string().max(5000).optional().nullable(),
  theme: z.record(z.string(), z.unknown()).optional(),
  allowedQueueTypeIds: z.array(idSchema).optional(),
  maxPerIpPerDay: z.number().int().min(0).max(1000).optional(),
  requireCaptcha: z.boolean().optional(),
})

export default defineApiHandler(async (event) => {
  const ctx = await requirePermission(event, PERMISSIONS.PUBLIC_PAGE_MANAGE)
  const id = getRouterParam(event, 'id') as string
  const input = bodySchema.parse(await readBody(event))
  return ok(await publishService.update(requireOrganization(ctx), id, input), 'Halaman publik diperbarui')
})
