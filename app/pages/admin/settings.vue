<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { SYSTEM_TONES, systemToneUrl } from '#shared/constants/tones'
import { PERMISSIONS } from '#shared/constants/permissions'
import {
  SETTINGS_CATALOG,
  SETTING_GROUPS,
  type SettingDefinition,
  type SettingValue,
  type SettingsMap,
} from '#shared/constants/settings'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Pengaturan' })

const { can, load: loadMe } = useMe()
const { call } = useApi()
const { values, pending, load } = useSettings()

/**
 * Identitas organisasi disunting di halaman ini, tetapi TIDAK lewat tabel pengaturan.
 *
 * Namanya tetap tinggal di kolom `organizations.name` — di situlah header panel admin,
 * halaman publik, layar display, tiket cetak, dan kop laporan sudah membacanya.
 * Menyalinnya jadi pengaturan hanya akan melahirkan dua sumber kebenaran.
 */
interface OrganizationProfile {
  id: string
  name: string
  slug: string
  logoUrl: string | null
}

const organization = ref<OrganizationProfile | null>(null)
const orgDraft = reactive({ name: '' })

/**
 * Berkas Media Library untuk kolom bertipe `media` (mis. nada panggil).
 *
 * Yang tersimpan adalah id-nya, jadi daftarnya hanya dibutuhkan untuk menampilkan
 * nama dan memutar contohnya di halaman ini.
 */
const mediaFiles = ref<Array<{ id: string, name: string, url: string, type: string }>>([])
const SELECT_KOSONG = '__none__'

const editable = computed(() => can(PERMISSIONS.SETTING_MANAGE))

/** Salinan kerja: perubahan baru menyentuh state bersama setelah tersimpan. */
const draft = reactive<Record<string, SettingValue>>({})

function resetDraft(source: SettingsMap) {
  for (const def of SETTINGS_CATALOG) draft[def.key] = source[def.key]
}

/**
 * Keduanya dimulai bersamaan: `apiFetch` yang dipanggil setelah `await` di dalam
 * setup kehilangan konteks Nuxt dan menjatuhkan render server.
 */
const [, profile, media] = await Promise.all([
  load(),
  apiFetch<OrganizationProfile>('/api/admin/organization').catch(() => null),
  // Tanpa izin media.view daftarnya kosong — kolomnya tetap tampil, hanya tanpa pilihan.
  apiFetch<typeof mediaFiles.value>('/api/admin/media').catch(() => []),
])
organization.value = profile
mediaFiles.value = media ?? []
orgDraft.name = profile?.name ?? ''
resetDraft(values.value)

const dirtyKeys = computed(() =>
  SETTINGS_CATALOG.filter(def => draft[def.key] !== values.value[def.key]).map(def => def.key))

const orgDirty = computed(() =>
  !!organization.value && orgDraft.name.trim() !== organization.value.name)

/** Jumlah yang ditulis pada bilah simpan; identitas organisasi ikut dihitung. */
const dirtyCount = computed(() => dirtyKeys.value.length + (orgDirty.value ? 1 : 0))
const isDirty = computed(() => dirtyCount.value > 0)

const saving = ref(false)
async function save() {
  if (!isDirty.value) return
  saving.value = true

  /**
   * Dua tujuan berbeda, satu tombol.
   *
   * Nama organisasi disimpan lebih dulu; kalau ditolak (mis. terlalu pendek),
   * pengaturan sistem tidak ikut tersimpan setengah jalan tanpa penjelasan.
   */
  if (orgDirty.value) {
    const saved = await call<OrganizationProfile>(
      '/api/admin/organization',
      { method: 'PATCH', body: { name: orgDraft.name.trim() } },
      'Identitas organisasi disimpan',
    )
    if (!saved) { saving.value = false; return }
    organization.value = saved
    orgDraft.name = saved.name
    // Header panel admin membaca nama dari /api/me — muat ulang supaya ikut berubah.
    await loadMe(true)
  }

  if (dirtyKeys.value.length) {
    const payload = Object.fromEntries(dirtyKeys.value.map(key => [key, draft[key]!]))
    const res = await call<SettingsMap>(
      '/api/admin/settings',
      { method: 'PUT', body: { values: payload } },
      'Pengaturan disimpan',
    )
    if (res) {
      values.value = res
      resetDraft(res)
    }
  }

  saving.value = false
}

function discard() {
  resetDraft(values.value)
  orgDraft.name = organization.value?.name ?? ''
}

async function resetToDefault() {
  const res = await call<SettingsMap>('/api/admin/settings/reset', { method: 'POST' }, 'Pengaturan dikembalikan ke bawaan')
  if (res) {
    values.value = res
    resetDraft(res)
  }
  resetOpen.value = false
}
const resetOpen = ref(false)

function fieldsOf(groupKey: string): SettingDefinition[] {
  return SETTINGS_CATALOG.filter(def => def.group === groupKey)
}

function isChanged(key: string) {
  return draft[key] !== values.value[key as keyof SettingsMap]
}

/**
   * Pilihan untuk kolom bertipe `media`.
   *
   * Khusus audio, nada bawaan sistem ditawarkan lebih dulu: instalasi baru belum punya
   * berkas apa pun di Media Library, dan tidak masuk akal memaksa admin mengunggah MP3
   * hanya untuk membuat layar berbunyi.
   */
function mediaOptions(def: SettingDefinition) {
  return [
    { label: '— tanpa berkas —', value: SELECT_KOSONG },
    ...(def.mediaType === 'AUDIO' ? SYSTEM_TONES.map(t => ({ label: t.label, value: t.value })) : []),
    ...mediaFiles.value
      .filter(m => !def.mediaType || m.type === def.mediaType)
      .map(m => ({ label: m.name, value: m.id })),
  ]
}

function mediaUrlOf(id: unknown) {
  return systemToneUrl(id) ?? mediaFiles.value.find(m => m.id === String(id))?.url ?? null
}

/**
 * Kolom yang hanya relevan pada mode tertentu disembunyikan, bukan dinonaktifkan —
 * URL TTS tidak ada gunanya selama sumber suaranya masih peramban.
 */
function isVisible(def: SettingDefinition) {
  if (!def.showWhen) return true
  return draft[def.showWhen.key] === def.showWhen.equals
}
</script>

<template>
  <div>
    <UiPageHeading
      title="Pengaturan Sistem"
      icon="i-lucide-sliders-horizontal"
      description="Nilai bawaan dan aturan yang berlaku untuk seluruh event pada organisasi ini. Sebagian bisa ditimpa per event."
    >
      <template #actions>
        <UButton
          v-if="editable"
          variant="ghost"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          label="Kembalikan ke bawaan"
          @click="resetOpen = true"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending" class="space-y-4">
      <USkeleton v-for="i in 3" :key="i" class="h-56 w-full" />
    </div>

    <div v-else class="space-y-4 pb-24">
      <section
        v-if="organization"
        class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <header class="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div class="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            <UIcon name="i-lucide-building-2" class="size-5" />
          </div>
          <div>
            <h2 class="font-semibold">
              Identitas Organisasi
            </h2>
            <p class="text-sm text-slate-500">
              Nama yang tampil di header panel admin, halaman antrean pengunjung, layar display, tiket cetak, dan kop laporan.
            </p>
          </div>
        </header>

        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <div
            data-setting="organization.name"
            class="flex flex-wrap items-center gap-4 px-5 py-4"
            :class="orgDirty ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''"
          >
            <div class="min-w-56 flex-1">
              <p class="font-medium">
                Nama organisasi
              </p>
              <p class="mt-0.5 text-sm text-slate-500">
                Berlaku seketika di seluruh halaman. Tautan publik tetap memakai slug
                <code class="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">{{ organization.slug }}</code>, jadi QR yang sudah dicetak tidak berubah.
              </p>
            </div>
            <div class="w-full sm:w-56">
              <UInput
                v-model="orgDraft.name"
                :maxlength="150"
                aria-label="Nama organisasi"
                placeholder="mis. Kantor Wilayah Kuningan"
                :disabled="!editable"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        v-for="group in SETTING_GROUPS"
        :key="group.key"
        class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <header class="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div class="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            <UIcon :name="group.icon" class="size-5" />
          </div>
          <div>
            <h2 class="font-semibold">
              {{ group.label }}
            </h2>
            <p class="text-sm text-slate-500">
              {{ group.description }}
            </p>
          </div>
        </header>

        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <div
            v-for="def in fieldsOf(group.key).filter(isVisible)"
            :key="def.key"
            :data-setting="def.key"
            class="flex flex-wrap items-center gap-4 px-5 py-4"
            :class="isChanged(def.key) ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''"
          >
            <div class="min-w-56 flex-1">
              <p class="flex flex-wrap items-center gap-2 font-medium">
                {{ def.label }}
                <UBadge
                  v-if="def.eventOverride"
                  size="sm"
                  variant="subtle"
                  color="neutral"
                  label="bisa ditimpa per event"
                />
              </p>
              <p class="mt-0.5 text-sm text-slate-500">
                {{ def.help }}
              </p>
            </div>

            <!-- Kolom media & teks panjang butuh ruang lebih; sisanya cukup sempit -->
            <div :class="def.type === 'media' || def.type === 'text' ? 'w-full sm:w-80' : 'w-full sm:w-56'">
              <USwitch
                v-if="def.type === 'boolean'"
                :model-value="Boolean(draft[def.key])"
                :aria-label="def.label"
                :disabled="!editable"
                @update:model-value="(v: boolean) => (draft[def.key] = v)"
              />

              <div v-else-if="def.type === 'number'" class="flex items-center gap-2">
                <UInputNumber
                  :model-value="Number(draft[def.key])"
                  :min="def.min"
                  :max="def.max"
                  :aria-label="def.label"
                  :disabled="!editable"
                  class="w-full"
                  @update:model-value="(v: number) => (draft[def.key] = v ?? def.min ?? 0)"
                />
                <span v-if="def.unit" class="shrink-0 text-sm text-slate-500">{{ def.unit }}</span>
              </div>

              <USelect
                v-else-if="def.type === 'select'"
                :model-value="String(draft[def.key])"
                :items="def.options ?? []"
                :aria-label="def.label"
                :disabled="!editable"
                class="w-full"
                @update:model-value="(v: string) => (draft[def.key] = v)"
              />

              <div v-else-if="def.type === 'media'" class="space-y-2">
                <USelectMenu
                  :model-value="String(draft[def.key] || SELECT_KOSONG)"
                  :items="mediaOptions(def)"
                  value-key="value"
                  :search-input="{ placeholder: 'Cari berkas…' }"
                  :aria-label="def.label"
                  :disabled="!editable"
                  class="w-full"
                  @update:model-value="(v: string) => (draft[def.key] = v === SELECT_KOSONG ? '' : v)"
                />
                <!-- Nada panggil harus bisa didengar sebelum disimpan, bukan ditebak dari namanya -->
                <audio
                  v-if="mediaUrlOf(draft[def.key])"
                  :src="mediaUrlOf(draft[def.key])!"
                  class="w-full"
                  controls
                  preload="none"
                />
                <NuxtLink
                  v-else-if="def.mediaType !== 'AUDIO' && !mediaFiles.some(m => m.type === def.mediaType)"
                  to="/admin/media"
                  class="block text-xs text-slate-500 underline"
                >
                  Belum ada berkas {{ def.mediaType?.toLowerCase() }} di Media Library
                </NuxtLink>
              </div>

              <UInput
                v-else
                :model-value="String(draft[def.key])"
                :maxlength="def.maxLength"
                :aria-label="def.label"
                :disabled="!editable"
                class="w-full"
                @update:model-value="(v: string | number) => (draft[def.key] = String(v))"
              />
            </div>
          </div>
        </div>
      </section>

      <p class="px-1 text-xs text-slate-400">
        Perubahan berlaku untuk permintaan berikutnya — tidak perlu menyalakan ulang server.
      </p>
    </div>

    <!-- Bilah simpan mengambang: perubahan tidak boleh hilang hanya karena halaman digulir -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-4 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="isDirty && editable"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:pl-64"
      >
        <div class="mx-auto flex max-w-5xl items-center gap-3 px-2">
          <p class="flex-1 text-sm">
            <span class="font-semibold">{{ dirtyCount }}</span> pengaturan belum disimpan
          </p>
          <UButton variant="ghost" color="neutral" label="Batalkan" @click="discard" />
          <UButton icon="i-lucide-save" label="Simpan Perubahan" :loading="saving" @click="save" />
        </div>
      </div>
    </Transition>

    <UModal
      v-model:open="resetOpen"
      title="Kembalikan ke pengaturan bawaan?"
      description="Seluruh nilai yang pernah Anda simpan akan dihapus dan kembali ke bawaan katalog."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="resetOpen = false" />
          <UiActionButton color="error" icon="i-lucide-rotate-ccw" label="Kembalikan" :action="resetToDefault" />
        </div>
      </template>
    </UModal>
  </div>
</template>
