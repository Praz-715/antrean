<script setup lang="ts">
import type { PublicPageDraft } from '#shared/types/public-page'
import { BRANDING_PRESETS, matchPreset } from '#shared/constants/public-page'
import { accentOf } from '#shared/schemas/public-page'
import { SELECT_NONE, nullableValue } from '#shared/constants/ui'

/**
 * Panel setelan builder halaman publik.
 *
 * Disusun sebagai tab mendatar di atas pratinjau, bukan kolom di sampingnya:
 * pratinjau membutuhkan lebar penuh untuk menunjukkan tata letak desktop apa
 * adanya, dan setelan yang dijejalkan ke kolom 380px hanya menghasilkan satu
 * lajur isian yang panjang. Di sini isian satu bagian tersebar 2–3 kolom,
 * sehingga tinggi panelnya tetap pendek dan pratinjau tidak terdorong jauh.
 */
const props = defineProps<{
  queueTypes: Array<{ id: string, code: string, name: string }>
  mediaImages: Array<{ id: string, name: string, url: string }>
  mediaReadable: boolean
  /** Turnstile hanya bisa dinyalakan bila kuncinya sudah dipasang di server. */
  captchaConfigured: boolean
  isPublished: boolean
  publishCode: string
  publicUrl: string
}>()

const emit = defineEmits<{
  regenerateQr: []
  rotateCode: []
  showQr: []
  remove: []
  copyUrl: []
}>()

const draft = defineModel<PublicPageDraft>({ required: true })

const BAGIAN = [
  { key: 'halaman', label: 'Halaman', icon: 'i-lucide-file-text' },
  { key: 'branding', label: 'Branding', icon: 'i-lucide-palette' },
  { key: 'hero', label: 'Hero', icon: 'i-lucide-image' },
  { key: 'layanan', label: 'Layanan', icon: 'i-lucide-layout-grid' },
  { key: 'informasi', label: 'Informasi', icon: 'i-lucide-info' },
  { key: 'antrean', label: 'Antrean', icon: 'i-lucide-ticket' },
  { key: 'footer', label: 'Footer', icon: 'i-lucide-panel-bottom' },
  { key: 'lanjutan', label: 'Lanjutan', icon: 'i-lucide-settings-2' },
] as const

const aktif = ref<(typeof BAGIAN)[number]['key']>('halaman')

const theme = computed(() => draft.value.theme)

/* ---------------- gambar dari media library ---------------- */

/**
 * Yang disimpan adalah URL-nya, bukan id media — itulah yang dipakai halaman publik.
 * URL lama yang tidak lagi ada di media library tetap ditawarkan sebagai satu opsi,
 * supaya menyunting halaman tidak diam-diam menghapus gambarnya.
 */
function imageOptions(current: string) {
  const options = [
    { label: '— tanpa gambar —', value: SELECT_NONE },
    ...props.mediaImages.map(m => ({ label: m.name, value: m.url })),
  ]
  if (current && !props.mediaImages.some(m => m.url === current)) {
    options.push({ label: `${current} (di luar media library)`, value: current })
  }
  return options
}

function imageProxy(field: 'logoUrl' | 'backgroundUrl') {
  return computed({
    get: () => draft.value[field] || SELECT_NONE,
    set: (value: string) => { draft.value[field] = nullableValue(value) ?? '' },
  })
}
const logoValue = imageProxy('logoUrl')
const backgroundValue = imageProxy('backgroundUrl')

/* ---------------- paket warna ---------------- */

const presetAktif = computed(() =>
  matchPreset(theme.value.primaryColor, theme.value.secondaryColor, accentOf(theme.value)))

function pakaiPreset(key: string) {
  const preset = BRANDING_PRESETS.find(p => p.key === key)
  if (!preset) return
  draft.value.theme.primaryColor = preset.primary
  draft.value.theme.secondaryColor = preset.secondary
  draft.value.theme.accentColor = preset.accent
}

/* ---------------- pilihan bentuk tombol ---------------- */

const PERATAAN = [
  { value: 'left', label: 'Kiri', icon: 'i-lucide-align-left' },
  { value: 'center', label: 'Tengah', icon: 'i-lucide-align-center' },
  { value: 'right', label: 'Kanan', icon: 'i-lucide-align-right' },
] as const

const TINGGI = [
  { value: 'compact', label: 'Ringkas' },
  { value: 'medium', label: 'Sedang' },
  { value: 'large', label: 'Tinggi' },
] as const

const GAYA_KARTU = [
  { value: 'elevated', label: 'Berbayang' },
  { value: 'outlined', label: 'Bergaris' },
  { value: 'soft', label: 'Lembut' },
] as const

const typeOptions = computed(() =>
  props.queueTypes.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id })))
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <!-- Tab bagian; menggulir mendatar di layar sempit alih-alih membungkus jadi
         tiga baris yang memakan tinggi -->
    <div class="overflow-x-auto border-b border-slate-100 dark:border-slate-800">
      <div class="flex min-w-max gap-1 p-2" role="tablist" aria-label="Bagian halaman">
        <button
          v-for="b in BAGIAN"
          :key="b.key"
          type="button"
          role="tab"
          :aria-selected="aktif === b.key"
          class="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="aktif === b.key
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
            : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'"
          @click="aktif = b.key"
        >
          <UIcon :name="b.icon" class="size-4" />
          {{ b.label }}
        </button>
      </div>
    </div>

    <div class="p-4">
      <!-- 1. HALAMAN -->
      <div v-if="aktif === 'halaman'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul" required :hint="`${draft.title.length}/150`">
          <UInput v-model="draft.title" class="w-full" maxlength="150" placeholder="Galeri Inovasi AHU" />
        </UFormField>

        <UFormField label="Subjudul" :hint="`${draft.subtitle.length}/190`">
          <UInput v-model="draft.subtitle" class="w-full" maxlength="190" placeholder="Silakan ambil nomor antrean" />
        </UFormField>

        <UFormField label="Slug URL" help="Opsional, untuk tautan yang mudah diingat.">
          <UInput v-model="draft.slug" class="w-full" placeholder="galeri-inovasi-ahu" />
        </UFormField>

        <UFormField
          label="Deskripsi"
          class="sm:col-span-2"
          :hint="`${draft.description.length}/2000`"
          help="Satu paragraf pengantar di bawah judul."
        >
          <UTextarea v-model="draft.description" :rows="3" class="w-full" maxlength="2000" />
        </UFormField>

        <UFormField label="Layanan yang ditampilkan" help="Kosongkan untuk menampilkan semua layanan aktif.">
          <USelectMenu
            v-model="draft.allowedQueueTypeIds"
            :items="typeOptions"
            value-key="value"
            multiple
            placeholder="Semua layanan"
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- 2. BRANDING -->
      <div v-else-if="aktif === 'branding'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2 xl:col-span-3">
          <p class="mb-2 text-xs font-medium text-slate-500">
            Paket warna
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            <button
              v-for="preset in BRANDING_PRESETS"
              :key="preset.key"
              type="button"
              class="flex items-center gap-2 rounded-lg border p-2 text-left transition-colors"
              :class="presetAktif === preset.key
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/60'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'"
              :title="preset.description"
              @click="pakaiPreset(preset.key)"
            >
              <span class="flex shrink-0 gap-0.5" aria-hidden="true">
                <span class="size-4 rounded-sm" :style="{ backgroundColor: preset.primary }" />
                <span class="size-4 rounded-sm" :style="{ backgroundColor: preset.accent }" />
              </span>
              <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ preset.label }}</span>
            </button>
          </div>
          <p v-if="presetAktif === 'custom'" class="mt-2 text-xs text-slate-500">
            Warna diatur sendiri — memilih paket akan menimpanya.
          </p>
        </div>

        <UFormField label="Warna utama">
          <UiColorPicker v-model="draft.theme.primaryColor" label="Warna utama" />
        </UFormField>

        <UFormField label="Warna pendukung">
          <UiColorPicker v-model="draft.theme.secondaryColor" label="Warna pendukung" />
        </UFormField>

        <UFormField label="Warna aksen" help="Dipakai gradien hero. Kosong mengikuti warna utama.">
          <UiColorPicker
            :model-value="accentOf(draft.theme)"
            label="Warna aksen"
            @update:model-value="(v: string) => (draft.theme.accentColor = v)"
          />
        </UFormField>

        <UFormField label="Logo" hint="opsional">
          <div class="flex items-center gap-2">
            <USelectMenu
              v-if="mediaReadable && mediaImages.length"
              v-model="logoValue"
              :items="imageOptions(draft.logoUrl)"
              value-key="value"
              :search-input="{ placeholder: 'Cari berkas…' }"
              placeholder="Pilih dari media library"
              class="w-full"
            />
            <UInput v-else v-model="draft.logoUrl" class="w-full" placeholder="/media/logo.png" />
            <img
              v-if="draft.logoUrl"
              :src="draft.logoUrl"
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
              :items="imageOptions(draft.backgroundUrl)"
              value-key="value"
              :search-input="{ placeholder: 'Cari berkas…' }"
              placeholder="Pilih dari media library"
              class="w-full"
            />
            <UInput v-else v-model="draft.backgroundUrl" class="w-full" placeholder="/media/latar.jpg" />
            <img
              v-if="draft.backgroundUrl"
              :src="draft.backgroundUrl"
              alt=""
              class="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
            >
          </div>
        </UFormField>

        <UFormField label="Font" help="Nama keluarga font CSS, mis. Inter.">
          <UInput v-model="draft.theme.fontFamily" class="w-full" placeholder="Inter" />
        </UFormField>
      </div>

      <!-- 3. HERO -->
      <div v-else-if="aktif === 'hero'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2 xl:col-span-3">
          <USwitch v-model="draft.theme.hero.enabled" label="Tampilkan hero" />
          <p class="mt-1 text-xs text-slate-500">
            Dimatikan berarti halaman dibuka dengan kepala ringkas berisi logo dan judul saja.
          </p>
        </div>

        <template v-if="draft.theme.hero.enabled">
          <UFormField label="Judul hero" help="Kosongkan untuk memakai judul halaman.">
            <UInput v-model="draft.theme.hero.title" class="w-full" :placeholder="draft.title" maxlength="150" />
          </UFormField>

          <UFormField label="Subjudul hero" help="Kosongkan untuk memakai subjudul halaman.">
            <UInput v-model="draft.theme.hero.subtitle" class="w-full" :placeholder="draft.subtitle" maxlength="190" />
          </UFormField>

          <UFormField
            label="Teks tombol"
            :help="draft.theme.hero.ctaEnabled
              ? 'Tombol ini menggulir ke daftar layanan — pengunjung tetap memilih layanannya sendiri.'
              : 'Tombol sedang disembunyikan.'"
          >
            <UInput
              v-model="draft.theme.hero.ctaText"
              class="w-full"
              maxlength="60"
              :disabled="!draft.theme.hero.ctaEnabled"
              placeholder="Ambil Nomor Antrean"
            />
          </UFormField>

          <UFormField label="Deskripsi hero" class="sm:col-span-2" :hint="`${draft.theme.hero.description.length}/500`">
            <UTextarea v-model="draft.theme.hero.description" :rows="2" class="w-full" maxlength="500" />
          </UFormField>

          <UFormField label="Perataan">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opsi in PERATAAN"
                :key="opsi.value"
                type="button"
                class="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors"
                :class="draft.theme.hero.align === opsi.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                :aria-pressed="draft.theme.hero.align === opsi.value"
                @click="draft.theme.hero.align = opsi.value"
              >
                <UIcon :name="opsi.icon" class="size-4" />
                {{ opsi.label }}
              </button>
            </div>
          </UFormField>

          <UFormField label="Tinggi">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opsi in TINGGI"
                :key="opsi.value"
                type="button"
                class="rounded-lg border py-2 text-xs font-medium transition-colors"
                :class="draft.theme.hero.height === opsi.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
                :aria-pressed="draft.theme.hero.height === opsi.value"
                @click="draft.theme.hero.height = opsi.value"
              >
                {{ opsi.label }}
              </button>
            </div>
          </UFormField>

          <!-- Kepekatan hanya berarti bila ada gambar; tanpa gambar hero memakai gradien -->
          <UFormField
            v-if="draft.backgroundUrl"
            label="Kepekatan lapisan"
            :hint="`${draft.theme.hero.overlay}%`"
            help="Makin pekat, makin terbaca teksnya di atas gambar."
          >
            <USlider v-model="draft.theme.hero.overlay" :min="0" :max="100" :step="2" />
          </UFormField>

          <div class="space-y-2 sm:col-span-2 xl:col-span-3">
            <p class="text-xs font-medium text-slate-500">
              Yang ditampilkan di hero
            </p>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <USwitch v-model="draft.theme.hero.ctaEnabled" label="Tombol ajakan" />
              <USwitch v-model="draft.theme.hero.showDate" label="Tanggal event" />
              <USwitch v-model="draft.theme.hero.showTime" label="Jam layanan" />
              <USwitch v-model="draft.theme.hero.showLocation" label="Lokasi" />
            </div>
            <UFormField v-if="draft.theme.hero.showLocation" label="Lokasi" class="max-w-md">
              <UInput v-model="draft.theme.hero.location" class="w-full" maxlength="190" placeholder="Gedung A, Lantai 2" />
            </UFormField>
          </div>
        </template>
      </div>

      <!-- 4. LAYANAN -->
      <div v-else-if="aktif === 'layanan'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul bagian">
          <UInput v-model="draft.theme.services.title" class="w-full" maxlength="120" placeholder="Pilih layanan" />
        </UFormField>

        <UFormField label="Subjudul bagian" hint="opsional">
          <UInput v-model="draft.theme.services.subtitle" class="w-full" maxlength="190" />
        </UFormField>

        <UFormField label="Jumlah kolom" help="Hanya di layar lebar; ponsel selalu satu kolom.">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.columns === n
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.columns === n"
              @click="draft.theme.services.columns = n"
            >
              {{ n }} kolom
            </button>
          </div>
        </UFormField>

        <UFormField label="Gaya kartu">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="opsi in GAYA_KARTU"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.cardStyle === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.cardStyle === opsi.value"
              @click="draft.theme.services.cardStyle = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <UFormField label="Gaya tombol kartu">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opsi in [{ value: 'button', label: 'Tombol' }, { value: 'link', label: 'Tautan' }] as const"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.services.ctaStyle === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.services.ctaStyle === opsi.value"
              @click="draft.theme.services.ctaStyle = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <div class="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 xl:col-span-3">
          <USwitch v-model="draft.theme.services.showIcon" label="Ikon layanan" />
          <USwitch v-model="draft.theme.services.showWaiting" label="Jumlah menunggu" />
          <USwitch v-model="draft.theme.services.showEstimate" label="Estimasi tunggu" />
        </div>
      </div>

      <!-- 5. INFORMASI -->
      <div v-else-if="aktif === 'informasi'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Judul bagian">
          <UInput v-model="draft.theme.info.title" class="w-full" maxlength="120" placeholder="Informasi layanan" />
        </UFormField>

        <UFormField label="Tampilan">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opsi in [{ value: 'cards', label: 'Kartu' }, { value: 'plain', label: 'Satu blok' }] as const"
              :key="opsi.value"
              type="button"
              class="rounded-lg border py-2 text-xs font-medium transition-colors"
              :class="draft.theme.info.style === opsi.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'"
              :aria-pressed="draft.theme.info.style === opsi.value"
              @click="draft.theme.info.style = opsi.value"
            >
              {{ opsi.label }}
            </button>
          </div>
        </UFormField>

        <UFormField
          label="Isi informasi"
          class="sm:col-span-2 xl:col-span-3"
          help="Satu baris = satu butir. Ditampilkan sebagai teks biasa; markup HTML tidak dirender."
        >
          <UTextarea
            v-model="draft.infoHtml"
            :rows="4"
            class="w-full"
            maxlength="5000"
            placeholder="Bawa fotokopi KTP&#10;Istirahat 12.00 – 13.00"
          />
        </UFormField>
      </div>

      <!-- 6. ANTREAN -->
      <div v-else-if="aktif === 'antrean'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Batas per IP per hari" help="0 = tanpa batas.">
          <UInputNumber v-model="draft.maxPerIpPerDay" :min="0" :max="1000" class="w-full" />
        </UFormField>

        <div>
          <UCheckbox
            v-model="draft.requireCaptcha"
            :disabled="!captchaConfigured"
            label="Wajib verifikasi Turnstile"
          />
          <p v-if="!captchaConfigured" class="mt-1 text-xs text-slate-400">
            Isi TURNSTILE_SITE_KEY dan TURNSTILE_SECRET_KEY pada .env untuk mengaktifkan.
          </p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
          <p class="font-medium">
            Formulir pengunjung & captcha geser
          </p>
          <p class="mt-1">
            Isian yang harus diisi pengunjung dan verifikasi geser diatur pada
            <NuxtLink to="/admin/forms" class="underline">Form Builder</NuxtLink> —
            keduanya mengikuti formulir aktif event ini.
          </p>
        </div>
      </div>

      <!-- 7. FOOTER -->
      <div v-else-if="aktif === 'footer'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Teks footer" hint="opsional">
          <UInput v-model="draft.theme.footerText" class="w-full" maxlength="190" placeholder="Dikelola oleh Bagian Pelayanan" />
        </UFormField>

        <div class="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          <USwitch v-model="draft.theme.footer.showLogo" label="Logo" />
          <USwitch v-model="draft.theme.footer.showOrganization" label="Nama instansi" />
          <USwitch v-model="draft.theme.footer.showPoweredBy" label='"Ditenagai ANTREAN"' />
        </div>
      </div>

      <!-- 8. LANJUTAN -->
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div class="sm:col-span-2">
          <p class="mb-1 text-xs font-medium text-slate-500">
            Tautan halaman
          </p>
          <div class="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
            <UIcon name="i-lucide-link" class="size-4 shrink-0 text-slate-400" />
            <code class="min-w-0 flex-1 truncate text-xs">{{ publicUrl }}</code>
            <UButton
              icon="i-lucide-copy"
              aria-label="Salin tautan halaman"
              title="Salin tautan halaman"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="emit('copyUrl')"
            />
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Kode publikasi: <b class="font-mono">{{ publishCode }}</b>
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton size="sm" icon="i-lucide-qr-code" variant="outline" color="neutral" label="QR Code" @click="emit('showQr')" />
            <UButton size="sm" icon="i-lucide-refresh-cw" variant="outline" color="neutral" label="Perbarui QR" @click="emit('regenerateQr')" />
          </div>
        </div>

        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p class="font-medium">
            Ganti tautan & QR
          </p>
          <p class="mt-1">
            Kode publikasi diganti; QR lama yang sudah tercetak tidak lagi berfungsi.
          </p>
          <UButton
            class="mt-2"
            size="xs"
            icon="i-lucide-shuffle"
            color="warning"
            variant="soft"
            label="Ganti tautan & QR"
            @click="emit('rotateCode')"
          />
          <div class="mt-4 border-t border-amber-200 pt-3 dark:border-amber-900/60">
            <UButton
              size="xs"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              label="Hapus halaman"
              @click="emit('remove')"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
