<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { PERMISSIONS } from '#shared/constants/permissions'
import { SELECT_NONE, nullableValue } from '#shared/constants/ui'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Halaman Publik' })

interface PublicPageRow {
  id: string
  publishCode: string
  slug: string | null
  title: string
  subtitle: string | null
  description: string | null
  isPublished: boolean
  maxPerIpPerDay: number
  requireCaptcha: boolean
  allowedQueueTypeIds: string[] | null
  infoHtml: string | null
  logoUrl: string | null
  backgroundUrl: string | null
  theme: { primaryColor?: string, secondaryColor?: string, footerText?: string, fontFamily?: string } | null
  url: string
  event: { id: string, name: string, status: string }
  qrCodes: Array<{ id: string, version: number }>
}

const { can } = useMe()
const { call } = useApi()
const toast = useToast()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const pages = ref<PublicPageRow[]>([])
const queueTypes = ref<Array<{ id: string, code: string, name: string }>>([])
const pending = ref(false)

/**
 * Gambar dari media library, untuk memilih logo & latar halaman publik.
 *
 * Sebelumnya kedua kolom ini berupa URL yang harus ditulis tangan — mudah salah
 * ketik dan tidak ada cara tahu berkas apa saja yang sudah diunggah. Bila akun yang
 * membuka halaman ini tidak punya izin `media.view`, daftarnya dibiarkan kosong dan
 * kolomnya kembali menjadi kolom URL biasa — bukan jalan buntu.
 */
const mediaImages = ref<Array<{ id: string, name: string, url: string, type: string }>>([])
const mediaReadable = ref(true)

async function load() {
  if (!currentId.value) { pages.value = []; return }
  pending.value = true
  try {
    /**
     * Ketiga permintaan dimulai BERSAMAAN, bukan berurutan: `apiFetch` yang
     * dipanggil setelah `await` di dalam setup kehilangan konteks Nuxt dan
     * menjatuhkan render server.
     */
    const [list, types, media] = await Promise.all([
      apiFetch<PublicPageRow[]>('/api/admin/public-pages', { query: { eventId: currentId.value } }),
      apiFetch<typeof queueTypes.value>('/api/admin/queue-types', { query: { eventId: currentId.value } }),
      apiFetch<typeof mediaImages.value>('/api/admin/media', { query: { type: 'IMAGE' } }).catch(() => null),
    ])
    pages.value = list
    queueTypes.value = types
    mediaReadable.value = media !== null
    mediaImages.value = media ?? []
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

/**
 * Pilihan gambar untuk satu kolom.
 *
 * Nilai yang tersimpan adalah URL-nya, bukan id media — itulah yang dipakai halaman
 * publik. URL lama yang tidak (lagi) ada di media library tetap ditawarkan sebagai
 * satu opsi, supaya menyunting halaman tidak diam-diam menghapus gambarnya.
 */
function imageOptions(current: string) {
  const options = [
    { label: '— tanpa gambar —', value: SELECT_NONE },
    ...mediaImages.value.map(m => ({ label: m.name, value: m.url })),
  ]
  if (current && !mediaImages.value.some(m => m.url === current)) {
    options.push({ label: `${current} (di luar media library)`, value: current })
  }
  return options
}

// ---- form ----
const modalOpen = ref(false)
const editing = ref<PublicPageRow | null>(null)
/** Sentinel select tidak menerima string kosong; proksi ini menerjemahkannya. */
function imageProxy(field: 'logoUrl' | 'backgroundUrl') {
  return computed({
    get: () => form[field] || SELECT_NONE,
    set: (value: string) => { form[field] = nullableValue(value) ?? '' },
  })
}
const saving = ref(false)
const form = reactive({
  title: '',
  subtitle: '',
  description: '',
  slug: '',
  infoText: '',
  primaryColor: '#1b5cf5',
  secondaryColor: '#0f172a',
  logoUrl: '',
  backgroundUrl: '',
  footerText: '',
  allowedQueueTypeIds: [] as string[],
  maxPerIpPerDay: 5,
  requireCaptcha: false,
})

const logoValue = imageProxy('logoUrl')
const backgroundValue = imageProxy('backgroundUrl')

function openCreate() {
  editing.value = null
  Object.assign(form, {
    title: '',
    subtitle: 'Silakan ambil nomor antrean',
    description: '',
    slug: '',
    infoText: '',
    primaryColor: '#1b5cf5',
    secondaryColor: '#0f172a',
    logoUrl: '',
    backgroundUrl: '',
    footerText: '',
    allowedQueueTypeIds: [],
    maxPerIpPerDay: 5,
    requireCaptcha: false,
  })
  modalOpen.value = true
}

function openEdit(page: PublicPageRow) {
  editing.value = page
  Object.assign(form, {
    title: page.title,
    subtitle: page.subtitle ?? '',
    description: page.description ?? '',
    slug: page.slug ?? '',
    infoText: page.infoHtml ?? '',
    primaryColor: page.theme?.primaryColor ?? '#1b5cf5',
    secondaryColor: page.theme?.secondaryColor ?? '#0f172a',
    logoUrl: page.logoUrl ?? '',
    backgroundUrl: page.backgroundUrl ?? '',
    footerText: page.theme?.footerText ?? '',
    allowedQueueTypeIds: page.allowedQueueTypeIds ?? [],
    maxPerIpPerDay: page.maxPerIpPerDay,
    requireCaptcha: page.requireCaptcha,
  })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const body = {
    title: form.title,
    subtitle: form.subtitle || null,
    description: form.description || null,
    slug: form.slug || null,
    infoHtml: form.infoText || null,
    logoUrl: form.logoUrl.trim() || null,
    backgroundUrl: form.backgroundUrl.trim() || null,
    theme: {
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      ...(form.footerText.trim() ? { footerText: form.footerText.trim() } : {}),
    },
    allowedQueueTypeIds: form.allowedQueueTypeIds,
    maxPerIpPerDay: Number(form.maxPerIpPerDay),
    requireCaptcha: form.requireCaptcha,
  }
  const res = editing.value
    ? await call(`/api/admin/public-pages/${editing.value.id}`, { method: 'PATCH', body }, 'Halaman diperbarui')
    : await call('/api/admin/public-pages', { method: 'POST', body: { ...body, eventId: currentId.value } }, 'Halaman dibuat')
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

async function togglePublish(page: PublicPageRow) {
  await call(
    `/api/admin/public-pages/${page.id}/publish`,
    { method: 'POST', body: { isPublished: !page.isPublished } },
    page.isPublished ? 'Publikasi dihentikan' : 'Halaman dipublikasikan',
  )
  await load()
}

async function regenerateQr(page: PublicPageRow, rotateCode: boolean) {
  await call(
    `/api/admin/public-pages/${page.id}/qr`,
    { method: 'POST', body: { rotateCode } },
    rotateCode ? 'Tautan & QR baru dibuat' : 'QR diperbarui',
  )
  await load()
  qrVersion.value++
}

const deleteTarget = ref<PublicPageRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  const res = await call(`/api/admin/public-pages/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Halaman dihapus')
  deleting.value = false
  if (res) { deleteTarget.value = null; await load() }
}

// ---- QR ----
const qrTarget = ref<PublicPageRow | null>(null)
const qrVersion = ref(0)
const qrSrc = computed(() =>
  qrTarget.value ? `/api/admin/public-pages/${qrTarget.value.id}/qr?format=png&size=600&v=${qrVersion.value}` : '')

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: 'Tautan disalin', color: 'success', icon: 'i-lucide-copy' })
}

function printQr() {
  if (!qrTarget.value) return
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  win.document.write(`
    <html><head><title>QR ${qrTarget.value.title}</title>
    <style>
      body { font-family: system-ui, sans-serif; text-align: center; padding: 48px; }
      h1 { font-size: 28px; margin: 0 0 4px; }
      p { color: #64748b; margin: 0 0 24px; }
      img { width: 380px; height: 380px; }
      .url { margin-top: 16px; font-family: monospace; font-size: 14px; }
    </style></head>
    <body>
      <h1>${qrTarget.value.title}</h1>
      <p>${qrTarget.value.subtitle ?? 'Pindai untuk mengambil nomor antrean'}</p>
      <img src="${window.location.origin}${qrSrc.value}" onload="window.print()" />
      <div class="url">${qrTarget.value.url}</div>
    </body></html>
  `)
  win.document.close()
}

const typeOptions = computed(() => queueTypes.value.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id })))

// Anti-bot hanya bisa dinyalakan bila kunci Turnstile sudah dipasang; kalau tidak,
// setelan ini akan menjadi tombol yang tidak berefek apa pun.
const captchaConfigured = computed(() => !!useRuntimeConfig().public.turnstileSiteKey)
</script>

<template>
  <div>
    <UiPageHeading
      title="Halaman Publik & QR"
      icon="i-lucide-qr-code"
      description="Halaman yang dibuka pengunjung untuk mengambil nomor antrean. Setiap halaman punya kode publikasi dan QR sendiri."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
          icon="i-lucide-plus"
          label="Halaman Baru"
          :disabled="!currentId"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !pages.length" class="grid gap-4 md:grid-cols-2">
      <USkeleton v-for="i in 2" :key="i" class="h-48" />
    </div>

    <div
      v-else-if="!pages.length"
      class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700"
    >
      <UIcon name="i-lucide-qr-code" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada halaman publik
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Buat halaman, publikasikan, lalu cetak QR-nya untuk ditempel di lokasi layanan.
      </p>
      <UButton
        v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
        class="mt-4"
        icon="i-lucide-plus"
        label="Buat Halaman"
        :disabled="!currentId"
        @click="openCreate"
      />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2">
      <div
        v-for="page in pages"
        :key="page.id"
        class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ page.title }}
            </p>
            <p class="truncate text-sm text-slate-500">
              {{ page.subtitle || 'Tanpa subjudul' }}
            </p>
          </div>
          <UBadge
            variant="subtle"
            :color="page.isPublished ? 'success' : 'neutral'"
            :label="page.isPublished ? 'Terbit' : 'Draf'"
          />
        </div>

        <div class="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <UIcon name="i-lucide-link" class="size-4 shrink-0 text-slate-400" />
          <code class="min-w-0 flex-1 truncate text-xs">{{ page.url }}</code>
          <UButton icon="i-lucide-copy" aria-label="Salin tautan halaman" title="Salin tautan halaman" size="xs" variant="ghost" color="neutral" @click="copyUrl(page.url)" />
          <UButton icon="i-lucide-external-link" aria-label="Buka halaman publik" title="Buka halaman publik" size="xs" variant="ghost" color="neutral" :to="page.url" target="_blank" />
        </div>

        <div class="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span>Kode: <b class="font-mono">{{ page.publishCode }}</b></span>
          <span>QR v{{ page.qrCodes[0]?.version ?? 1 }}</span>
          <span>Maks {{ page.maxPerIpPerDay || '∞' }} / IP / hari</span>
          <span>{{ page.allowedQueueTypeIds?.length ? `${page.allowedQueueTypeIds.length} layanan` : 'Semua layanan' }}</span>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton size="sm" icon="i-lucide-qr-code" variant="outline" color="neutral" label="QR Code" @click="qrTarget = page" />
          <UiActionButton
            v-if="can(PERMISSIONS.PUBLIC_PAGE_PUBLISH)"
            size="sm"
            :icon="page.isPublished ? 'i-lucide-eye-off' : 'i-lucide-globe'"
            :color="page.isPublished ? 'warning' : 'primary'"
            :variant="page.isPublished ? 'soft' : 'solid'"
            :label="page.isPublished ? 'Hentikan' : 'Publikasikan'"
            :action="() => togglePublish(page)"
          />
          <UDropdownMenu
            v-if="can(PERMISSIONS.PUBLIC_PAGE_MANAGE)"
            :items="[
              [
                { label: 'Ubah', icon: 'i-lucide-pencil', onSelect: () => openEdit(page) },
                { label: 'Perbarui QR', icon: 'i-lucide-refresh-cw', onSelect: () => regenerateQr(page, false) },
                { label: 'Ganti tautan & QR', icon: 'i-lucide-shuffle', onSelect: () => regenerateQr(page, true) },
              ],
              [{ label: 'Hapus', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteTarget = page) }],
            ]"
          >
            <UButton size="sm" icon="i-lucide-ellipsis-vertical" aria-label="Menu tindakan" title="Menu tindakan" variant="ghost" color="neutral" />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <!-- Modal QR -->
    <UModal
      :open="!!qrTarget"
      :title="qrTarget?.title"
      description="Pindai untuk membuka halaman pengambilan antrean."
      @update:open="(v) => { if (!v) qrTarget = null }"
    >
      <template #body>
        <div class="text-center">
          <img
            v-if="qrSrc"
            :src="qrSrc"
            alt="QR Code"
            class="mx-auto size-64 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700"
          >
          <code class="mt-3 block break-all text-xs text-slate-500">{{ qrTarget?.url }}</code>

          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="PNG"
              :to="`/api/admin/public-pages/${qrTarget?.id}/qr?format=png&size=1200&download=true`"
              external
            />
            <UButton
              size="sm"
              icon="i-lucide-download"
              variant="outline"
              color="neutral"
              label="SVG"
              :to="`/api/admin/public-pages/${qrTarget?.id}/qr?format=svg&download=true`"
              external
            />
            <UButton size="sm" icon="i-lucide-printer" variant="outline" color="neutral" label="Cetak" @click="printQr" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal form -->
    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'Ubah Halaman Publik' : 'Halaman Publik Baru'"
      description="Tampilan dan aturan halaman yang dibuka pengunjung."
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Judul" required class="sm:col-span-2">
            <UInput v-model="form.title" class="w-full" placeholder="RS ABC" />
          </UFormField>

          <UFormField label="Subjudul" class="sm:col-span-2">
            <UInput v-model="form.subtitle" class="w-full" placeholder="Silakan ambil nomor antrean" />
          </UFormField>

          <UFormField label="Deskripsi" class="sm:col-span-2">
            <UTextarea v-model="form.description" :rows="2" class="w-full" placeholder="Informasi tambahan untuk pengunjung" />
          </UFormField>

          <UFormField
            label="Informasi Layanan"
            class="sm:col-span-2"
            help="Ditampilkan sebagai teks biasa di bawah deskripsi — mis. syarat berkas atau jam istirahat. Markup HTML tidak dirender."
          >
            <UTextarea
              v-model="form.infoText"
              :rows="4"
              class="w-full"
              placeholder="Bawa fotokopi KTP&#10;Istirahat 12.00 – 13.00"
            />
          </UFormField>

          <UFormField label="Slug URL" help="Opsional, untuk tautan yang mudah diingat.">
            <UInput v-model="form.slug" class="w-full" placeholder="rs-abc-2026" />
          </UFormField>

          <UFormField label="Warna Utama">
            <UiColorPicker v-model="form.primaryColor" label="Warna utama" />
          </UFormField>

          <UFormField label="Warna pendukung">
            <UiColorPicker v-model="form.secondaryColor" label="Warna pendukung" />
          </UFormField>

          <UFormField label="Logo" hint="opsional">
            <div class="flex items-center gap-2">
              <USelectMenu
                v-if="mediaReadable && mediaImages.length"
                v-model="logoValue"
                :items="imageOptions(form.logoUrl)"
                value-key="value"
                :search-input="{ placeholder: 'Cari berkas…' }"
                placeholder="Pilih dari media library"
                class="w-full"
              />
              <UInput v-else v-model="form.logoUrl" class="w-full" placeholder="/media/logo.png" />

              <img
                v-if="form.logoUrl"
                :src="form.logoUrl"
                alt=""
                class="size-9 shrink-0 rounded border border-slate-200 object-contain dark:border-slate-800"
              >
            </div>
            <template #help>
              <span v-if="mediaReadable && !mediaImages.length">
                Media library masih kosong —
                <NuxtLink to="/admin/media" class="underline">unggah gambar dulu</NuxtLink>,
                atau tulis URL-nya langsung.
              </span>
            </template>
          </UFormField>

          <UFormField label="Gambar latar" hint="opsional">
            <div class="flex items-center gap-2">
              <USelectMenu
                v-if="mediaReadable && mediaImages.length"
                v-model="backgroundValue"
                :items="imageOptions(form.backgroundUrl)"
                value-key="value"
                :search-input="{ placeholder: 'Cari berkas…' }"
                placeholder="Pilih dari media library"
                class="w-full"
              />
              <UInput v-else v-model="form.backgroundUrl" class="w-full" placeholder="/media/latar.jpg" />

              <img
                v-if="form.backgroundUrl"
                :src="form.backgroundUrl"
                alt=""
                class="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
              >
            </div>
          </UFormField>

          <UFormField label="Teks footer" hint="opsional">
            <UInput v-model="form.footerText" class="w-full" placeholder="Dikelola oleh Bagian Pelayanan" />
          </UFormField>

          <UFormField label="Layanan yang Ditampilkan" help="Kosongkan untuk menampilkan semua layanan aktif." class="sm:col-span-2">
            <USelectMenu
              v-model="form.allowedQueueTypeIds"
              :items="typeOptions"
              value-key="value"
              multiple
              placeholder="Semua layanan"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Batas per IP per hari" help="0 = tanpa batas">
            <UInputNumber v-model="form.maxPerIpPerDay" :min="0" class="w-full" />
          </UFormField>

          <div class="pb-2">
            <UCheckbox
              v-model="form.requireCaptcha"
              :disabled="!captchaConfigured"
              label="Wajib verifikasi anti-bot"
            />
            <p v-if="!captchaConfigured" class="mt-1 text-xs text-slate-400">
              Isi TURNSTILE_SITE_KEY dan TURNSTILE_SECRET_KEY pada .env untuk mengaktifkan.
            </p>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton :loading="saving" :disabled="form.title.trim().length < 2" icon="i-lucide-save" :label="editing ? 'Simpan' : 'Buat'" @click="save" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus halaman publik?"
      :description="`&quot;${deleteTarget?.title}&quot; akan dihapus dan tautannya tidak dapat diakses lagi.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UButton color="error" :loading="deleting" label="Hapus" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
