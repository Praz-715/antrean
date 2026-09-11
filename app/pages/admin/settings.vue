<script setup lang="ts">
import { PERMISSIONS } from '../../../shared/constants/permissions'
import {
  SETTINGS_CATALOG,
  SETTING_GROUPS,
  type SettingDefinition,
  type SettingValue,
  type SettingsMap,
} from '../../../shared/constants/settings'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Pengaturan' })

const { can } = useMe()
const { call } = useApi()
const { values, pending, load } = useSettings()

const editable = computed(() => can(PERMISSIONS.SETTING_MANAGE))

/** Salinan kerja: perubahan baru menyentuh state bersama setelah tersimpan. */
const draft = reactive<Record<string, SettingValue>>({})

function resetDraft(source: SettingsMap) {
  for (const def of SETTINGS_CATALOG) draft[def.key] = source[def.key]
}

await load()
resetDraft(values.value)

const dirtyKeys = computed(() =>
  SETTINGS_CATALOG.filter(def => draft[def.key] !== values.value[def.key]).map(def => def.key))
const isDirty = computed(() => dirtyKeys.value.length > 0)

const saving = ref(false)
async function save() {
  if (!isDirty.value) return
  saving.value = true
  const payload = Object.fromEntries(dirtyKeys.value.map(key => [key, draft[key]!]))
  const res = await call<SettingsMap>(
    '/api/admin/settings',
    { method: 'PUT', body: { values: payload } },
    'Pengaturan disimpan',
  )
  saving.value = false
  if (res) {
    values.value = res
    resetDraft(res)
  }
}

function discard() {
  resetDraft(values.value)
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
            v-for="def in fieldsOf(group.key)"
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

            <div class="w-full sm:w-56">
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
            <span class="font-semibold">{{ dirtyKeys.length }}</span> pengaturan belum disimpan
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
