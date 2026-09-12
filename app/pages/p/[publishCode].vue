<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import type { ApiError } from '../../composables/useApi'

definePageMeta({ layout: 'public' })

const route = useRoute()
// Warna layanan dipilih admin; disesuaikan agar tetap terbaca di tema gelap.
const { readable } = useReadableColor()
const publishCode = route.params.publishCode as string

interface FormFieldDef {
  id: string
  key: string
  label: string
  type: string
  placeholder: string | null
  helpText: string | null
  isRequired: boolean
  defaultValue: string | null
  options: unknown
  validation: unknown
}

interface PublicPageData {
  page: {
    publishCode: string
    title: string
    subtitle: string | null
    description: string | null
    logoUrl: string | null
    backgroundUrl: string | null
    theme: { primaryColor?: string, secondaryColor?: string, footerText?: string, fontFamily?: string } | null
    infoHtml: string | null
    requireCaptcha: boolean
  }
  organization: { name: string, logoUrl: string | null } | null
  event: { id: string, name: string, status: string, timezone: string, branding: Record<string, unknown> | null }
  openState: { isOpen: boolean, acceptsNewQueue: boolean, message: string, openTime: string | null, closeTime: string | null, serviceDate: string }
  queueTypes: Array<{
    id: string
    code: string
    name: string
    description: string | null
    color: string
    icon: string | null
    waitingCount: number
    estServiceSeconds: number
  }>
  form: {
    id: string
    name: string
    description: string | null
    autofillFieldKey: string | null
    fields: FormFieldDef[]
  } | null
  features: { publicRegistration: boolean, ratingEnabled: boolean }
}

const { data, error, refresh } = await useAsyncData(`public-page-${publishCode}`, () =>
  apiFetch<PublicPageData>(`/api/public/${publishCode}`))

useHead(() => ({
  title: data.value?.page.title ?? 'Ambil Antrean',
  meta: [{ name: 'description', content: data.value?.page.subtitle ?? 'Ambil nomor antrean online' }],
}))

/**
 * Branding halaman publik (§48).
 *
 * Nilai halaman didahulukan, lalu branding event, baru warna bawaan — jadi satu event
 * bisa punya beberapa halaman dengan tampilan berbeda tanpa menyalin seluruh setelan.
 */
const branding = computed(() => {
  const pageTheme = data.value?.page.theme ?? {}
  const eventBranding = (data.value?.event.branding ?? {}) as {
    primaryColor?: string
    secondaryColor?: string
    fontFamily?: string
    footerText?: string
  }
  return {
    primary: pageTheme.primaryColor ?? eventBranding.primaryColor ?? '#1b5cf5',
    secondary: pageTheme.secondaryColor ?? eventBranding.secondaryColor ?? '#0f172a',
    fontFamily: pageTheme.fontFamily ?? eventBranding.fontFamily ?? null,
    footerText: pageTheme.footerText ?? eventBranding.footerText ?? null,
  }
})

const primary = computed(() => branding.value.primary)

// ---- antrean yang sudah diambil dari perangkat ini ----
interface TiketSaya {
  token: string
  queueNumber: string
  status: string
  serviceDate: string
  queueTypeId: string
  ahead: number
  nowServing: string | null
}

const tickets = usePublicTickets(publishCode)
/** Kunci: id jenis antrean. Hanya berisi antrean yang MASIH berlaku hari ini. */
const myTickets = ref<Record<string, TiketSaya>>({})

const STATUS_AKTIF = ['WAITING', 'CALLED', 'SERVING']

/**
 * Ingatan perangkat diperiksa ulang ke server, bukan dipercaya begitu saja.
 *
 * Tokennya bisa saja milik antrean kemarin, sudah selesai dilayani, atau dibatalkan
 * petugas. Menampilkannya sebagai "antrean Anda" pada keadaan itu justru menyesatkan,
 * jadi yang sudah tidak berlaku dilupakan diam-diam — pengunjung kembali melihat
 * formulir seperti biasa.
 *
 * Dijalankan setelah komponen terpasang: localStorage tidak ada saat render server,
 * dan menebaknya di sana hanya akan membuat hasil hidrasi berbeda.
 */
async function muatTiketSaya() {
  const tersimpan = tickets.read()
  const hasil: Record<string, TiketSaya> = {}

  await Promise.all(Object.entries(tersimpan).map(async ([queueTypeId, token]) => {
    try {
      const tiket = await apiFetch<{
        queueNumber: string
        status: string
        serviceDate: string
        queueType: { id: string }
        position: { ahead: number }
        nowServing: { queueNumber: string } | null
      }>(`/api/public/track/${token}`)

      const masihBerlaku = STATUS_AKTIF.includes(tiket.status)
        && tiket.serviceDate === data.value?.openState.serviceDate

      if (!masihBerlaku) { tickets.forget(queueTypeId); return }

      hasil[tiket.queueType.id] = {
        token,
        queueNumber: tiket.queueNumber,
        status: tiket.status,
        serviceDate: tiket.serviceDate,
        queueTypeId: tiket.queueType.id,
        ahead: tiket.position?.ahead ?? 0,
        nowServing: tiket.nowServing?.queueNumber ?? null,
      }
    }
    catch {
      // Token tidak dikenal lagi (antrean dihapus) — buang saja dari ingatan.
      tickets.forget(queueTypeId)
    }
  }))

  myTickets.value = hasil
}

onMounted(() => { void muatTiketSaya() })

// ---- alur ----
const step = ref<'pick' | 'form' | 'ticket'>('pick')
const selectedTypeId = ref<string | null>(null)
const selectedType = computed(() => data.value?.queueTypes.find(t => t.id === selectedTypeId.value) ?? null)

const values = reactive<Record<string, unknown>>({})
const fieldErrors = ref<Record<string, string[]>>({})
const submitting = ref(false)
const submitError = ref('')

// ---- anti-bot (§36) ----
const turnstileSiteKey = useRuntimeConfig().public.turnstileSiteKey
const captchaToken = ref('')
const captchaRef = ref<{ reset: () => void } | null>(null)
const captchaRequired = computed(() => !!data.value?.page.requireCaptcha && !!turnstileSiteKey)

watchEffect(() => {
  for (const field of data.value?.form?.fields ?? []) {
    if (values[field.key] === undefined) {
      values[field.key] = field.type === 'CHECKBOX' ? [] : (field.defaultValue ?? '')
    }
  }
})

/**
 * Field HIDDEN tetap dikirim (memakai nilai bawaannya) tetapi tidak boleh muncul
 * di layar pengunjung — sesuai namanya.
 */
const visibleFields = computed(() =>
  (data.value?.form?.fields ?? []).filter(f => f.type !== 'HIDDEN'))

const selectedTicket = computed(() =>
  selectedTypeId.value ? myTickets.value[selectedTypeId.value] ?? null : null)

/**
 * Membuka layanan yang antreannya SUDAH dimiliki tidak langsung menyodorkan formulir.
 *
 * Pengunjung yang menekan "kembali" hanya ingin melihat-lihat; disuruh mengisi
 * formulir lagi membuatnya mengira nomornya hilang — dan sebagian akan benar-benar
 * mendaftar dua kali. Nomornya ditampilkan lebih dulu, dan mendaftar lagi jadi
 * tindakan yang harus dipilih sendiri.
 */
function chooseType(id: string) {
  selectedTypeId.value = id
  submitError.value = ''
  fieldErrors.value = {}

  if (myTickets.value[id]) { step.value = 'ticket'; return }
  if (visibleFields.value.length) step.value = 'form'
  else submit()
}

/** "Registrasi Kembali" — pengunjung memang ingin nomor kedua. */
function daftarLagi() {
  submitError.value = ''
  fieldErrors.value = {}
  if (visibleFields.value.length) step.value = 'form'
  else submit()
}

function labelStatus(status: string) {
  if (status === 'CALLED') return 'Sedang dipanggil'
  if (status === 'SERVING') return 'Sedang dilayani'
  return 'Menunggu dipanggil'
}

// ---- isi otomatis dari sistem eksternal (§6) ----
const autofillKey = computed(() => data.value?.form?.autofillFieldKey ?? null)
const autofilling = ref(false)
const autofillMessage = ref('')
const autofillStatus = ref<'idle' | 'ok' | 'error'>('idle')
const autofilledKeys = ref<string[]>([])

async function runAutofill() {
  const key = autofillKey.value
  if (!key) return

  const lookup = String(values[key] ?? '').trim()
  if (!lookup) {
    autofillStatus.value = 'error'
    autofillMessage.value = 'Isi dulu nilainya sebelum mencari.'
    return
  }

  autofilling.value = true
  autofillStatus.value = 'idle'
  autofillMessage.value = ''
  try {
    const filled = await apiFetch<Record<string, string | number | boolean>>(
      `/api/public/${publishCode}/autofill`,
      { method: 'POST', body: { lookup } },
    )
    // Field pemicu tidak ditimpa: yang baru saja diketik pengunjung yang benar.
    const applied: string[] = []
    for (const [fieldKey, value] of Object.entries(filled)) {
      if (fieldKey === key) continue
      values[fieldKey] = value
      applied.push(fieldKey)
    }
    autofilledKeys.value = applied
    autofillStatus.value = 'ok'
    autofillMessage.value = applied.length
      ? `${applied.length} isian terisi otomatis. Periksa kembali sebelum mengirim.`
      : 'Data ditemukan, tetapi tidak ada isian yang cocok.'
  }
  catch (e) {
    autofillStatus.value = 'error'
    autofillMessage.value = (e as Error).message
    autofilledKeys.value = []
  }
  finally {
    autofilling.value = false
  }
}

function optionsOf(field: FormFieldDef): Array<{ label: string, value: string }> {
  const raw = field.options
  if (!Array.isArray(raw)) return []
  return raw.map(o =>
    typeof o === 'string' ? { label: o, value: o } : (o as { label: string, value: string }),
  )
}

async function submit() {
  if (!selectedTypeId.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  fieldErrors.value = {}

  try {
    const result = await apiFetch<{ token: string }>(`/api/public/${publishCode}/queue`, {
      method: 'POST',
      body: { queueTypeId: selectedTypeId.value, values, captchaToken: captchaToken.value || undefined },
    })
    // Diingat supaya kunjungan berikutnya menampilkan nomor ini, bukan formulir kosong.
    tickets.remember(selectedTypeId.value, result.token)
    await navigateTo(`/queue/${result.token}`)
  }
  catch (e) {
    const err = e as ApiError
    submitError.value = err.message
    // token Turnstile sekali pakai — minta yang baru setelah gagal
    captchaRef.value?.reset()
    if (err.errors) fieldErrors.value = err.errors
    if (err.code === 'EVENT_NOT_OPEN' || err.code === 'OUTSIDE_SERVICE_HOURS' || err.code === 'EVENT_PAUSED') {
      await refresh()
      step.value = 'pick'
    }
  }
  finally {
    submitting.value = false
  }
}

function minutesLabel(seconds: number, count: number) {
  const total = Math.round((seconds * count) / 60)
  if (count === 0) return 'Tanpa antrean'
  return `± ${total} menit`
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-10 dark:bg-slate-950">
    <div v-if="error" class="mx-auto max-w-md px-4 py-20 text-center">
      <UIcon name="i-lucide-unplug" class="mx-auto size-12 text-slate-400" />
      <h1 class="mt-4 text-xl font-bold">
        Halaman tidak tersedia
      </h1>
      <p class="mt-2 text-slate-500">
        {{ (error as unknown as ApiError).message }}
      </p>
    </div>

    <template v-else-if="data">
      <!-- Header brand -->
      <header
        class="relative overflow-hidden bg-cover bg-center px-5 pb-16 pt-10 text-white"
        :style="{
          backgroundColor: primary,
          ...(data.page.backgroundUrl ? { backgroundImage: `url(${data.page.backgroundUrl})` } : {}),
        }"
      >
        <!-- Lapisan gelap menjaga teks tetap terbaca di atas gambar latar apa pun -->
        <div
          v-if="data.page.backgroundUrl"
          class="pointer-events-none absolute inset-0"
          :style="{ backgroundColor: primary, opacity: 0.78 }"
        />
        <div
          v-else
          class="pointer-events-none absolute inset-0 opacity-15"
          style="background-image: radial-gradient(circle at 15% 15%, white 0, transparent 40%), radial-gradient(circle at 85% 60%, white 0, transparent 35%)"
        />
        <div class="relative mx-auto max-w-md text-center">
          <img
            v-if="data.page.logoUrl || data.organization?.logoUrl"
            :src="data.page.logoUrl ?? data.organization?.logoUrl ?? ''"
            alt=""
            class="mx-auto mb-3 h-14 w-auto object-contain"
          >
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Antrean
          </p>
          <h1 class="mt-1 text-2xl font-extrabold leading-tight">
            {{ data.page.title }}
          </h1>
          <p v-if="data.page.subtitle" class="mt-1 text-white/80">
            {{ data.page.subtitle }}
          </p>
        </div>
      </header>

      <main class="mx-auto -mt-10 max-w-md px-4">
        <!-- Status buka/tutup -->
        <div class="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span
            class="size-3 shrink-0 rounded-full"
            :class="data.openState.isOpen ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'"
          />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              {{ data.openState.isOpen ? 'BUKA' : 'TUTUP' }}
            </p>
            <p class="truncate text-sm text-slate-500">
              {{ data.openState.message }}
            </p>
          </div>
          <div v-if="data.openState.openTime" class="text-right text-sm">
            <p class="font-medium">
              {{ data.openState.openTime }}–{{ data.openState.closeTime }}
            </p>
            <p class="text-xs text-slate-400">
              {{ data.openState.serviceDate }}
            </p>
          </div>
        </div>

        <div v-if="data.page.description" class="mb-4 rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
          {{ data.page.description }}
        </div>

        <!-- Informasi layanan dari admin. Sengaja dirender sebagai teks (interpolasi
             Vue meng-escape otomatis), bukan v-html — tidak ada sanitizer di sistem ini. -->
        <div
          v-if="data.page.infoHtml"
          class="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
          <p class="whitespace-pre-line">
            {{ data.page.infoHtml }}
          </p>
        </div>

        <!-- Pendaftaran mandiri dimatikan admin (§49): jangan tampilkan tombol yang
             pasti ditolak server — cukup jelaskan apa yang harus dilakukan pengunjung. -->
        <UAlert
          v-if="!data.features.publicRegistration"
          class="mb-4"
          color="warning"
          variant="soft"
          icon="i-lucide-hand"
          title="Pengambilan nomor mandiri sedang ditutup"
          description="Silakan hubungi petugas di lokasi untuk mendapatkan nomor antrean."
        />

        <!-- Langkah 1: pilih layanan -->
        <section v-else-if="step === 'pick'">
          <h2 class="mb-3 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pilih layanan
          </h2>

          <div v-if="!data.queueTypes.length" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm dark:bg-slate-900">
            Belum ada layanan yang tersedia.
          </div>

          <div v-else class="space-y-3">
            <button
              v-for="type in data.queueTypes"
              :key="type.id"
              type="button"
              :disabled="!data.openState.acceptsNewQueue"
              class="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"
              @click="chooseType(type.id)"
            >
              <div
                class="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
                :style="{ backgroundColor: type.color + '1a', color: readable(type.color) }"
              >
                {{ type.code }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold">
                  {{ type.name }}
                </p>
                <p class="truncate text-sm text-slate-500">
                  {{ type.description || `${type.waitingCount} orang menunggu` }}
                </p>
                <!-- Sudah punya nomor di layanan ini: itu yang paling ingin ia lihat -->
                <p
                  v-if="myTickets[type.id]"
                  class="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                  :style="{ backgroundColor: type.color + '1a', color: readable(type.color) }"
                >
                  <UIcon name="i-lucide-ticket" class="size-3.5" />
                  Nomor Anda {{ myTickets[type.id]?.queueNumber }}
                </p>
                <p v-else class="mt-0.5 text-xs text-slate-400">
                  {{ minutesLabel(type.estServiceSeconds, type.waitingCount) }}
                </p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-slate-300" />
            </button>
          </div>

          <UAlert
            v-if="!data.openState.acceptsNewQueue"
            class="mt-4"
            color="warning"
            variant="soft"
            icon="i-lucide-clock"
            title="Pendaftaran sedang ditutup"
            :description="data.openState.message"
          />
        </section>

        <!-- Sudah punya nomor di layanan ini -->
        <section v-else-if="step === 'ticket' && selectedType && selectedTicket">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 text-sm text-slate-500"
            @click="step = 'pick'"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
            Ganti layanan
          </button>

          <div class="rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
            <p class="text-sm text-slate-500">
              Anda sudah punya nomor di {{ selectedType.name }}
            </p>
            <p class="queue-number mt-2 text-6xl" :style="{ color: readable(selectedType.color) }">
              {{ selectedTicket.queueNumber }}
            </p>
            <p class="mt-2 text-sm font-medium">
              {{ labelStatus(selectedTicket.status) }}
            </p>

            <div class="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-center dark:border-slate-800">
              <div>
                <p class="text-xs uppercase tracking-wide text-slate-500">
                  Antrean di depan
                </p>
                <p class="mt-0.5 text-xl font-bold">
                  {{ selectedTicket.ahead }}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-slate-500">
                  Sedang dipanggil
                </p>
                <p class="mt-0.5 text-xl font-bold">
                  {{ selectedTicket.nowServing ?? '—' }}
                </p>
              </div>
            </div>

            <UButton
              class="mt-5 w-full justify-center"
              size="lg"
              icon="i-lucide-ticket"
              label="Lihat Antrean Saya"
              :to="`/queue/${selectedTicket.token}`"
              :style="{ backgroundColor: primary }"
            />

            <!--
              Mendaftar lagi disengaja dibuat sebagai pilihan kedua: sebagian besar
              pengunjung yang kembali ke sini hanya ingin melihat nomornya, bukan
              mengambil nomor baru.
            -->
            <UButton
              v-if="data.features.publicRegistration && data.openState.acceptsNewQueue"
              class="mt-2 w-full justify-center"
              size="lg"
              variant="ghost"
              color="neutral"
              icon="i-lucide-plus"
              label="Registrasi Kembali"
              @click="daftarLagi"
            />
            <p class="mt-2 text-xs text-slate-500">
              Nomor lama tetap berlaku bila Anda mengambil nomor baru.
            </p>
          </div>
        </section>

        <!-- Langkah 2: isi formulir -->
        <section v-else-if="data.features.publicRegistration && step === 'form' && selectedType">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 text-sm text-slate-500"
            @click="step = 'pick'"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
            Ganti layanan
          </button>

          <div class="mb-4 flex items-center gap-3 rounded-2xl border-2 p-4" :style="{ borderColor: selectedType.color, backgroundColor: selectedType.color + '0d' }">
            <div
              class="flex size-11 items-center justify-center rounded-xl text-lg font-extrabold"
              :style="{ backgroundColor: selectedType.color + '22', color: readable(selectedType.color) }"
            >
              {{ selectedType.code }}
            </div>
            <div>
              <p class="font-semibold">
                {{ selectedType.name }}
              </p>
              <p class="text-sm text-slate-500">
                {{ selectedType.waitingCount }} orang menunggu
              </p>
            </div>
          </div>

          <form class="space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900" @submit.prevent="submit">
            <p v-if="data.form?.description" class="text-sm text-slate-500">
              {{ data.form.description }}
            </p>

            <UFormField
              v-for="field in visibleFields"
              :key="field.id"
              :label="field.label"
              :required="field.isRequired"
              :help="field.helpText ?? undefined"
              :error="fieldErrors[field.key]?.[0]"
            >
              <UTextarea
                v-if="field.type === 'TEXTAREA'"
                v-model="values[field.key] as string"
                :placeholder="field.placeholder ?? ''"
                :rows="3"
                size="lg"
                class="w-full"
              />
              <USelect
                v-else-if="field.type === 'SELECT'"
                v-model="values[field.key] as string"
                :items="optionsOf(field)"
                :placeholder="field.placeholder ?? 'Pilih…'"
                size="lg"
                class="w-full"
              />
              <URadioGroup
                v-else-if="field.type === 'RADIO'"
                v-model="values[field.key] as string"
                :items="optionsOf(field)"
              />
              <UCheckboxGroup
                v-else-if="field.type === 'CHECKBOX'"
                v-model="values[field.key] as string[]"
                :items="optionsOf(field)"
              />
              <!-- Unggah berkas menunggu media library (Phase 5); jangan pura-pura bisa. -->
              <div
                v-else-if="field.type === 'FILE'"
                class="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-400 dark:border-slate-700"
              >
                <UIcon name="i-lucide-paperclip" class="size-4" />
                Unggah berkas belum tersedia
              </div>
              <div v-else class="flex gap-2">
                <UInput
                  v-model="values[field.key] as string"
                  :type="field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : field.type === 'DATETIME' ? 'datetime-local' : field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'"
                  :placeholder="field.placeholder ?? ''"
                  size="lg"
                  class="w-full"
                  :class="autofilledKeys.includes(field.key) ? 'ring-1 ring-emerald-400 rounded-lg' : ''"
                  @keydown.enter.prevent="field.key === autofillKey ? runAutofill() : undefined"
                />
                <!-- Tombol cari hanya pada field pemicu yang ditentukan admin (§6) -->
                <UButton
                  v-if="field.key === autofillKey"
                  size="lg"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-search"
                  label="Cari Data"
                  :loading="autofilling"
                  @click="runAutofill"
                />
              </div>
            </UFormField>

            <UAlert
              v-if="autofillMessage"
              :color="autofillStatus === 'ok' ? 'success' : 'warning'"
              variant="soft"
              :icon="autofillStatus === 'ok' ? 'i-lucide-wand-sparkles' : 'i-lucide-info'"
              :description="autofillMessage"
            />

            <PublicTurnstileWidget
              v-if="captchaRequired"
              ref="captchaRef"
              v-model="captchaToken"
              :site-key="turnstileSiteKey"
            />

            <UAlert
              v-if="submitError"
              color="error"
              variant="soft"
              icon="i-lucide-alert-circle"
              :description="submitError"
            />

            <UButton
              type="submit"
              size="xl"
              block
              :loading="submitting"
              :disabled="!data.openState.acceptsNewQueue || (captchaRequired && !captchaToken)"
              label="Ambil Nomor Antrean"
              icon="i-lucide-ticket"
              :style="{ backgroundColor: primary }"
            />
          </form>
        </section>

        <p v-if="branding.footerText" class="mt-8 text-center text-sm" :style="{ color: branding.secondary }">
          {{ branding.footerText }}
        </p>
        <p class="mt-2 text-center text-xs text-slate-400">
          Ditenagai ANTREAN · {{ data.organization?.name ?? data.event.name }}
        </p>
      </main>
    </template>
  </div>
</template>
