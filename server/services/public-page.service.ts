import { prisma } from '../utils/prisma'
import { errors } from '../utils/response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { resolveServiceDate } from '../utils/datetime'
import { buildFormValidator, extractVisitorCore } from '../utils/dynamic-form'
import { verifyCaptcha } from '../utils/captcha'
import { consumeTicket } from '../utils/slider-captcha'
import { eventService } from './event.service'
import { queueService } from './queue.service'
import { settingService } from './setting.service'
import { datasourceService } from './datasource.service'
import { SETTING_KEYS } from '../../shared/constants/settings'

export const publicPageService = {
  /** Konfigurasi halaman publik + layanan yang tersedia + status buka (§4). */
  async getByPublishCode(publishCode: string) {
    const page = await prisma.publicPage.findFirst({
      where: { publishCode, deletedAt: null },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            timezone: true,
            branding: true,
            settings: true,
            organizationId: true,
            organization: { select: { name: true, logoUrl: true } },
          },
        },
      },
    })

    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')
    if (!page.isPublished) {
      throw errors.badRequest(ERROR_CODES.PAGE_NOT_PUBLISHED, 'Halaman antrean ini sedang tidak aktif')
    }

    const allowed = Array.isArray(page.allowedQueueTypeIds)
      ? (page.allowedQueueTypeIds as string[])
      : []

    const [settings, queueTypes, form, openState] = await Promise.all([
      settingService.forEvent(page.event),
      prisma.queueType.findMany({
        where: {
          eventId: page.eventId,
          isActive: true,
          deletedAt: null,
          ...(allowed.length ? { id: { in: allowed } } : {}),
        },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, code: true, name: true, description: true, color: true, icon: true, estServiceSeconds: true, maxWaiting: true },
      }),
      prisma.formDefinition.findFirst({
        where: { eventId: page.eventId, isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
          fields: { orderBy: { displayOrder: 'asc' } },
          dataSource: { select: { id: true, isActive: true, queryTemplate: true } },
        },
      }),
      eventService.getOpenState(page.eventId),
    ])

    const serviceDate = resolveServiceDate(page.event.timezone)
    const waitingCounts = await prisma.queue.groupBy({
      by: ['queueTypeId'],
      where: {
        eventId: page.eventId,
        serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      _count: { _all: true },
    })

    return {
      page: {
        publishCode: page.publishCode,
        slug: page.slug,
        title: page.title,
        subtitle: page.subtitle,
        description: page.description,
        logoUrl: page.logoUrl,
        backgroundUrl: page.backgroundUrl,
        theme: page.theme,
        infoHtml: page.infoHtml,
        requireCaptcha: page.requireCaptcha,
      },
      organization: page.event.organization,
      event: {
        id: page.event.id,
        name: page.event.name,
        status: page.event.status,
        timezone: page.event.timezone,
        branding: page.event.branding,
      },
      openState,
      // Fitur yang boleh dipakai halaman ini — halaman publik merender sesuai ini (§49).
      features: {
        publicRegistration: Boolean(settings[SETTING_KEYS.QUEUE_PUBLIC_REGISTRATION]),
        ratingEnabled: Boolean(settings[SETTING_KEYS.FEEDBACK_RATING_ENABLED]),
      },
      queueTypes: queueTypes.map(qt => ({
        ...qt,
        waitingCount: waitingCounts.find(w => w.queueTypeId === qt.id)?._count._all ?? 0,
      })),
      form: form
        ? {
            id: form.id,
            name: form.name,
            description: form.description,
            /** Halaman publik memunculkan captcha geser sebelum mengirim bila ini menyala (§36). */
            requireCaptcha: form.requireCaptcha,
            /**
             * Field pemicu autofill — halaman publik menampilkan tombol "Cari data"
             * di sebelahnya. Kosong berarti fitur ini tidak aktif untuk formulir itu.
             */
            autofillFieldKey: form.dataSource?.isActive
              ? ((form.dataSource.queryTemplate as { lookupFieldKey?: string } | null)?.lookupFieldKey ?? null)
              : null,
            fields: form.fields.map(f => ({
              id: f.id,
              key: f.key,
              label: f.label,
              type: f.type,
              placeholder: f.placeholder,
              helpText: f.helpText,
              isRequired: f.isRequired,
              defaultValue: f.defaultValue,
              options: f.options,
              validation: f.validation,
              visibility: f.visibility,
            })),
          }
        : null,
    }
  },

  /**
   * Isi otomatis formulir dari sumber data eksternal (§6).
   *
   * Daftar field yang boleh diisi diambil dari definisi formulir aktif, bukan dari
   * pemetaan — sehingga respons pihak ketiga tidak bisa menitipkan kunci lain.
   */
  async autofill(publishCode: string, lookup: string) {
    const page = await prisma.publicPage.findFirst({
      where: { publishCode, deletedAt: null, isPublished: true },
      select: { eventId: true },
    })
    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')

    const form = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        dataSourceId: true,
        fields: { select: { key: true } },
      },
    })

    if (!form?.dataSourceId) {
      throw errors.badRequest(ERROR_CODES.DATA_SOURCE_DISABLED, 'Formulir ini tidak terhubung ke sumber data')
    }

    return datasourceService.autofill({
      dataSourceId: form.dataSourceId,
      lookup,
      allowedFieldKeys: form.fields.map(f => f.key),
    })
  },

  /** Pengunjung mengambil nomor antrean (§4, §57.11). */
  async register(params: {
    publishCode: string
    queueTypeId: string
    values: Record<string, unknown>
    captchaToken?: string | null
    sliderToken?: string | null
    ipAddress?: string | null
    userAgent?: string | null
  }) {
    const page = await prisma.publicPage.findFirst({
      where: { publishCode: params.publishCode, deletedAt: null },
      select: {
        id: true,
        eventId: true,
        isPublished: true,
        allowedQueueTypeIds: true,
        maxPerIpPerDay: true,
        requireCaptcha: true,
        event: { select: { organizationId: true, settings: true, timezone: true } },
      },
    })
    if (!page) throw errors.notFound('Halaman antrean tidak ditemukan')
    if (!page.isPublished) {
      throw errors.badRequest(ERROR_CODES.PAGE_NOT_PUBLISHED, 'Halaman antrean ini sedang tidak aktif')
    }

    // Pendaftaran mandiri bisa dimatikan menyeluruh dari pengaturan sistem (§49)
    const settings = await settingService.forEvent(page.event)
    if (!settings[SETTING_KEYS.QUEUE_PUBLIC_REGISTRATION]) {
      throw errors.badRequest(
        ERROR_CODES.REGISTRATION_DISABLED,
        'Pengambilan nomor mandiri sedang dinonaktifkan. Silakan hubungi petugas.',
      )
    }

    // Anti-bot (§36) — diperiksa sebelum apa pun menyentuh database
    if (page.requireCaptcha) {
      await verifyCaptcha(params.captchaToken, params.ipAddress)
    }

    /**
     * Captcha geser, dinyalakan per formulir di /admin/forms.
     *
     * Kuerinya sengaja hanya mengambil satu kolom: pemeriksaan anti-bot berdiri
     * paling depan, jadi permintaan dari skrip tidak boleh sempat menarik seluruh
     * definisi formulir beserta field-nya.
     */
    const gerbang = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { requireCaptcha: true },
    })
    if (gerbang?.requireCaptcha) {
      consumeTicket(params.sliderToken, 'queue', params.ipAddress ?? 'unknown')
    }

    // Event harus benar-benar sedang melayani
    await eventService.assertAcceptsNewQueue(page.eventId)

    const allowed = Array.isArray(page.allowedQueueTypeIds) ? (page.allowedQueueTypeIds as string[]) : []
    if (allowed.length && !allowed.includes(params.queueTypeId)) {
      throw errors.badRequest(ERROR_CODES.QUEUE_TYPE_UNAVAILABLE, 'Layanan ini tidak tersedia pada halaman tersebut')
    }

    // Batas pengambilan per IP per hari — rem tambahan di atas rate limit (§36)
    if (page.maxPerIpPerDay > 0 && params.ipAddress) {
      const serviceDate = resolveServiceDate(page.event.timezone)
      const taken = await prisma.queue.count({
        where: {
          eventId: page.eventId,
          serviceDate,
          deletedAt: null,
          visitor: { ipAddress: params.ipAddress },
        },
      })
      if (taken >= page.maxPerIpPerDay) {
        throw errors.badRequest(
          ERROR_CODES.DAILY_LIMIT_REACHED,
          `Perangkat ini sudah mengambil ${taken} antrean hari ini`,
        )
      }
    }

    // Validasi jawaban terhadap definisi form aktif
    const form = await prisma.formDefinition.findFirst({
      where: { eventId: page.eventId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { fields: { orderBy: { displayOrder: 'asc' } } },
    })

    let values: Record<string, unknown> = {}
    let fieldValues: Array<{ formFieldId: string | null, fieldKey: string, value: unknown, type?: string }> = []

    if (form?.fields.length) {
      values = buildFormValidator(form.fields).parse(params.values ?? {}) as Record<string, unknown>
      fieldValues = form.fields
        .filter(f => values[f.key] !== undefined && values[f.key] !== null && values[f.key] !== '')
        .map(f => ({ formFieldId: f.id, fieldKey: f.key, value: values[f.key], type: f.type }))
    }

    const core = extractVisitorCore(values)

    const queue = await queueService.create({
      eventId: page.eventId,
      queueTypeId: params.queueTypeId,
      source: 'PUBLIC',
      visitor: {
        ...core,
        data: values,
        fieldValues,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })

    return queue
  },
}
