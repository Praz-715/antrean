<script setup lang="ts">
import { apiFetch } from '../../../composables/useApi'
import { EVENT_STATUS_COLOR, EVENT_STATUS_LABEL } from '../../../../shared/utils/queue-format'
import { PERMISSIONS } from '../../../../shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const eventId = route.params.id as string
const { can } = useMe()
const { call } = useApi()
const { setCurrent, loadEvents } = useCurrentEvent()

interface ScheduleRow {
  id: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
  overrideDate: string | null
}

interface EventBranding {
  primaryColor?: string
  secondaryColor?: string
  logoUrl?: string
  backgroundUrl?: string
  fontFamily?: string
  footerText?: string
}

/** Penimpa pengaturan sistem khusus event ini (§48, §49). */
interface EventOverrides {
  recallLimit?: number
  maxWaitingPerType?: number
  ratingEnabled?: boolean
  voiceEnabled?: boolean
  voiceLanguage?: string
  estimateEnabled?: boolean
}

interface EventDetail {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  timezone: string
  allowFinishAfterClose: boolean
  branding: EventBranding | null
  settings: EventOverrides | null
  schedules: ScheduleRow[]
  queueTypes: Array<{ id: string, code: string, name: string, color: string, isActive: boolean }>
  counters: Array<{ id: string, code: string, name: string }>
  openState: { isOpen: boolean, message: string, openTime: string | null, closeTime: string | null, serviceDate: string }
  _count: { queues: number, visitors: number }
}

const detail = ref<EventDetail | null>(null)
const pending = ref(true)

async function load() {
  pending.value = true
  try {
    detail.value = await apiFetch<EventDetail>(`/api/admin/events/${eventId}`)
    Object.assign(form, {
      name: detail.value.name,
      description: detail.value.description ?? '',
      timezone: detail.value.timezone,
      allowFinishAfterClose: detail.value.allowFinishAfterClose,
    })
    Object.assign(branding, {
      primaryColor: detail.value.branding?.primaryColor ?? '#1b5cf5',
      secondaryColor: detail.value.branding?.secondaryColor ?? '#0f172a',
      logoUrl: detail.value.branding?.logoUrl ?? '',
      backgroundUrl: detail.value.branding?.backgroundUrl ?? '',
      fontFamily: detail.value.branding?.fontFamily ?? '',
      footerText: detail.value.branding?.footerText ?? '',
    })
    const stored = detail.value.settings ?? {}
    Object.assign(overrides, {
      recallLimit: stored.recallLimit ?? null,
      maxWaitingPerType: stored.maxWaitingPerType ?? null,
      ratingEnabled: stored.ratingEnabled ?? null,
      voiceEnabled: stored.voiceEnabled ?? null,
    })
    schedules.value = DAYS.map((_, day) => {
      const found = detail.value!.schedules.find(s => s.dayOfWeek === day && !s.overrideDate)
      return {
        dayOfWeek: day,
        openTime: found?.openTime ?? '08:00',
        closeTime: found?.closeTime ?? '16:00',
        isClosed: found?.isClosed ?? day === 0,
      }
    })
  }
  finally {
    pending.value = false
  }
}

useHead({ title: () => detail.value?.name ?? 'Event' })

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const form = reactive({ name: '', description: '', timezone: 'Asia/Jakarta', allowFinishAfterClose: true })

const branding = reactive({
  primaryColor: '#1b5cf5',
  secondaryColor: '#0f172a',
  logoUrl: '',
  backgroundUrl: '',
  fontFamily: '',
  footerText: '',
})

/**
 * Penimpa per event. `null` berarti "ikuti pengaturan sistem" — beda dari 0, yang
 * berarti "tanpa batas". Karena itu nilainya disimpan nullable, bukan diberi angka
 * bawaan yang diam-diam mengunci event ke nilai tertentu.
 */
const overrides = reactive<{
  recallLimit: number | null
  maxWaitingPerType: number | null
  ratingEnabled: boolean | null
  voiceEnabled: boolean | null
}>({ recallLimit: null, maxWaitingPerType: null, ratingEnabled: null, voiceEnabled: null })
const schedules = ref<Array<{ dayOfWeek: number, openTime: string, closeTime: string, isClosed: boolean }>>([])

const timezones = [
  { label: 'WIB — Asia/Jakarta', value: 'Asia/Jakarta' },
  { label: 'WITA — Asia/Makassar', value: 'Asia/Makassar' },
  { label: 'WIT — Asia/Jayapura', value: 'Asia/Jayapura' },
]

await load()

const savingInfo = ref(false)
async function saveInfo() {
  savingInfo.value = true
  await call(
    `/api/admin/events/${eventId}`,
    { method: 'PATCH', body: { ...form, description: form.description || null } },
    'Informasi event disimpan',
  )
  savingInfo.value = false
  await Promise.all([load(), loadEvents(true)])
}

const savingSchedule = ref(false)
async function saveSchedules() {
  savingSchedule.value = true
  await call(
    `/api/admin/events/${eventId}/schedules`,
    { method: 'PUT', body: { schedules: schedules.value } },
    'Jam layanan disimpan',
  )
  savingSchedule.value = false
  await load()
}

const savingBranding = ref(false)
async function saveBranding() {
  savingBranding.value = true
  await call(
    `/api/admin/events/${eventId}`,
    {
      method: 'PATCH',
      body: {
        branding: {
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          ...(branding.logoUrl.trim() ? { logoUrl: branding.logoUrl.trim() } : {}),
          ...(branding.backgroundUrl.trim() ? { backgroundUrl: branding.backgroundUrl.trim() } : {}),
          ...(branding.fontFamily.trim() ? { fontFamily: branding.fontFamily.trim() } : {}),
          ...(branding.footerText.trim() ? { footerText: branding.footerText.trim() } : {}),
        },
        settings: Object.fromEntries(
          Object.entries(overrides).filter(([, value]) => value !== null && value !== undefined),
        ),
      },
    },
    'Branding & preferensi event disimpan',
  )
  savingBranding.value = false
  await load()
}

const statusPending = ref(false)
async function setStatus(status: string) {
  statusPending.value = true
  await call(`/api/admin/events/${eventId}/status`, { method: 'POST', body: { status } }, 'Status diperbarui')
  statusPending.value = false
  await Promise.all([load(), loadEvents(true)])
}

function copyAll(fromDay: number) {
  const src = schedules.value[fromDay]
  if (!src) return
  schedules.value = schedules.value.map(s =>
    s.dayOfWeek === 0 ? s : { ...s, openTime: src.openTime, closeTime: src.closeTime, isClosed: src.isClosed },
  )
}
</script>

<template>
  <div v-if="detail">
    <UiPageHeading :title="detail.name" icon="i-lucide-calendar-days" :description="`/${detail.slug} · ${detail.timezone}`">
      <template #actions>
        <UBadge
          size="lg"
          variant="subtle"
          :color="(EVENT_STATUS_COLOR[detail.status] as never) ?? 'neutral'"
          :label="EVENT_STATUS_LABEL[detail.status] ?? detail.status"
        />
        <UButton variant="outline" color="neutral" icon="i-lucide-arrow-left" to="/admin/events" label="Semua Event" />
      </template>
    </UiPageHeading>

    <!-- Status layanan hari ini -->
    <div
      class="mb-6 flex flex-wrap items-center gap-4 rounded-xl border p-4"
      :class="detail.openState.isOpen
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'"
    >
      <div class="flex items-center gap-3">
        <span
          class="size-3 rounded-full"
          :class="detail.openState.isOpen ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'"
        />
        <div>
          <p class="font-semibold">
            {{ detail.openState.isOpen ? 'Sedang melayani' : 'Tidak melayani' }}
          </p>
          <p class="text-sm text-slate-500">
            {{ detail.openState.message }} · {{ detail.openState.serviceDate }}
          </p>
        </div>
      </div>

      <div class="ml-auto flex flex-wrap gap-2">
        <UButton
          v-if="can(PERMISSIONS.EVENT_CONTROL) && detail.status !== 'OPEN'"
          icon="i-lucide-play"
          label="Buka Antrean"
          :loading="statusPending"
          @click="setStatus('OPEN')"
        />
        <UButton
          v-if="can(PERMISSIONS.EVENT_CONTROL) && detail.status === 'OPEN'"
          icon="i-lucide-pause"
          color="warning"
          variant="soft"
          label="Jeda"
          :loading="statusPending"
          @click="setStatus('PAUSED')"
        />
        <UButton
          v-if="can(PERMISSIONS.EVENT_CONTROL) && !['CLOSED', 'COMPLETED'].includes(detail.status)"
          icon="i-lucide-square"
          color="error"
          variant="soft"
          label="Tutup"
          :loading="statusPending"
          @click="setStatus('CLOSED')"
        />
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Informasi -->
      <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
        <h2 class="mb-4 font-semibold">
          Informasi Event
        </h2>

        <div class="space-y-4">
          <UFormField label="Nama Event" required>
            <UInput v-model="form.name" class="w-full" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UFormField label="Deskripsi">
            <UTextarea v-model="form.description" :rows="3" class="w-full" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UFormField
            label="Zona Waktu"
            help="Tanggal layanan (reset nomor harian) dan jam buka-tutup dihitung memakai zona waktu ini, bukan zona waktu server."
          >
            <USelect v-model="form.timezone" :items="timezones" class="w-full" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UCheckbox
            v-model="form.allowFinishAfterClose"
            :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
            label="Operator boleh menyelesaikan antrean berjalan setelah jam tutup"
          />

          <div v-if="can(PERMISSIONS.EVENT_MANAGE)" class="flex justify-end">
            <UButton :loading="savingInfo" icon="i-lucide-save" label="Simpan" @click="saveInfo" />
          </div>
        </div>
      </div>

      <!-- Ringkasan -->
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 font-semibold">
            Ringkasan
          </h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Jenis antrean
              </dt>
              <dd class="font-semibold">
                {{ detail.queueTypes.length }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Loket
              </dt>
              <dd class="font-semibold">
                {{ detail.counters.length }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Total antrean
              </dt>
              <dd class="font-semibold">
                {{ detail._count.queues.toLocaleString('id-ID') }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">
                Total pengunjung
              </dt>
              <dd class="font-semibold">
                {{ detail._count.visitors.toLocaleString('id-ID') }}
              </dd>
            </div>
          </dl>

          <div class="mt-4 space-y-2">
            <UButton
              block
              variant="outline"
              color="neutral"
              icon="i-lucide-tags"
              label="Kelola Jenis Antrean"
              to="/admin/queue-types"
              @click="setCurrent(eventId)"
            />
            <UButton
              block
              variant="outline"
              color="neutral"
              icon="i-lucide-door-open"
              label="Kelola Loket"
              to="/admin/counters"
              @click="setCurrent(eventId)"
            />
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 font-semibold">
            Jenis Antrean
          </h2>
          <div v-if="!detail.queueTypes.length" class="text-sm text-slate-500">
            Belum ada.
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <span
              v-for="qt in detail.queueTypes"
              :key="qt.id"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold"
              :style="{ backgroundColor: qt.color + '1a', color: qt.color }"
            >
              {{ qt.code }} · {{ qt.name }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Jam layanan -->
    <div class="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">
            Jam Layanan
          </h2>
          <p class="text-sm text-slate-500">
            Di luar jam ini pendaftaran publik ditutup otomatis dan display menampilkan status TUTUP.
          </p>
        </div>
        <UButton
          v-if="can(PERMISSIONS.EVENT_MANAGE)"
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-copy"
          label="Samakan dengan Senin"
          @click="copyAll(1)"
        />
      </div>

      <div class="space-y-2">
        <div
          v-for="row in schedules"
          :key="row.dayOfWeek"
          class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
        >
          <span class="w-20 text-sm font-medium">{{ DAYS[row.dayOfWeek] }}</span>

          <USwitch
            v-model="row.isClosed"
            :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
            :label="row.isClosed ? 'Tutup' : 'Buka'"
            :ui="{ base: 'data-[state=checked]:bg-rose-500' }"
          />

          <div class="flex items-center gap-2" :class="{ 'opacity-40': row.isClosed }">
            <UInput
              v-model="row.openTime"
              type="time"
              size="sm"
              :disabled="row.isClosed || !can(PERMISSIONS.EVENT_MANAGE)"
            />
            <span class="text-slate-400">—</span>
            <UInput
              v-model="row.closeTime"
              type="time"
              size="sm"
              :disabled="row.isClosed || !can(PERMISSIONS.EVENT_MANAGE)"
            />
          </div>

          <span
            v-if="!row.isClosed && row.openTime >= row.closeTime"
            class="text-xs text-rose-600"
          >
            Jam tutup harus setelah jam buka
          </span>
        </div>
      </div>

      <div v-if="can(PERMISSIONS.EVENT_MANAGE)" class="mt-4 flex justify-end">
        <UButton :loading="savingSchedule" icon="i-lucide-save" label="Simpan Jam Layanan" @click="saveSchedules" />
      </div>
    </div>

    <!-- Branding & preferensi event (§48, §49) -->
    <div class="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 class="font-semibold">
        Branding & Preferensi Event
      </h2>
      <p class="mb-4 text-sm text-slate-500">
        Dipakai halaman publik dan layar antrean event ini. Preferensi yang dikosongkan mengikuti pengaturan sistem.
      </p>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Warna utama">
              <div class="flex gap-2">
                <UInput v-model="branding.primaryColor" type="color" class="w-16" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
                <UInput v-model="branding.primaryColor" class="w-full font-mono text-sm" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
              </div>
            </UFormField>
            <UFormField label="Warna pendukung">
              <div class="flex gap-2">
                <UInput v-model="branding.secondaryColor" type="color" class="w-16" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
                <UInput v-model="branding.secondaryColor" class="w-full font-mono text-sm" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
              </div>
            </UFormField>
          </div>

          <UFormField label="URL logo" hint="opsional">
            <UInput v-model="branding.logoUrl" class="w-full" placeholder="/media/logo.png" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UFormField label="URL latar layar" hint="opsional">
            <UInput v-model="branding.backgroundUrl" class="w-full" placeholder="/media/latar.jpg" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UFormField label="Font" hint="opsional" help="Nama keluarga font CSS, mis. Inter">
            <UInput v-model="branding.fontFamily" class="w-full" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>

          <UFormField label="Teks footer" hint="opsional">
            <UInput v-model="branding.footerText" class="w-full" :disabled="!can(PERMISSIONS.EVENT_MANAGE)" />
          </UFormField>
        </div>

        <div class="space-y-4">
          <UFormField label="Batas panggil ulang" help="Kosongkan untuk mengikuti pengaturan sistem. 0 berarti tanpa batas.">
            <UInputNumber
              v-model="overrides.recallLimit"
              :min="0"
              :max="20"
              class="w-full"
              placeholder="ikuti sistem"
              :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
            />
          </UFormField>

          <UFormField label="Maksimum antrean menunggu" help="Kosongkan untuk mengikuti pengaturan sistem.">
            <UInputNumber
              v-model="overrides.maxWaitingPerType"
              :min="0"
              class="w-full"
              placeholder="ikuti sistem"
              :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
            />
          </UFormField>

          <UFormField label="Minta rating setelah dilayani">
            <USelect
              :model-value="overrides.ratingEnabled === null ? 'inherit' : String(overrides.ratingEnabled)"
              class="w-full"
              :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
              :items="[
                { label: 'Ikuti pengaturan sistem', value: 'inherit' },
                { label: 'Ya', value: 'true' },
                { label: 'Tidak', value: 'false' },
              ]"
              @update:model-value="(v: string) => (overrides.ratingEnabled = v === 'inherit' ? null : v === 'true')"
            />
          </UFormField>

          <UFormField label="Panggilan suara di display">
            <USelect
              :model-value="overrides.voiceEnabled === null ? 'inherit' : String(overrides.voiceEnabled)"
              class="w-full"
              :disabled="!can(PERMISSIONS.EVENT_MANAGE)"
              :items="[
                { label: 'Ikuti pengaturan sistem', value: 'inherit' },
                { label: 'Ya', value: 'true' },
                { label: 'Tidak', value: 'false' },
              ]"
              @update:model-value="(v: string) => (overrides.voiceEnabled = v === 'inherit' ? null : v === 'true')"
            />
          </UFormField>
        </div>
      </div>

      <div v-if="can(PERMISSIONS.EVENT_MANAGE)" class="mt-4 flex justify-end">
        <UButton :loading="savingBranding" icon="i-lucide-save" label="Simpan Branding" @click="saveBranding" />
      </div>
    </div>
  </div>

  <div v-else-if="pending" class="space-y-4">
    <USkeleton class="h-10 w-64" />
    <USkeleton class="h-40 w-full" />
  </div>
</template>
