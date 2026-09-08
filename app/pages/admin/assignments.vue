<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { nullableValue, SELECT_NONE } from '../../../shared/constants/ui'
import { PERMISSIONS } from '../../../shared/constants/permissions'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Penugasan Operator' })

interface Assignment {
  id: string
  isDefault: boolean
  user: { id: string, name: string, email: string, isActive: boolean }
  queueType: { id: string, code: string, name: string, color: string }
  counter: { id: string, code: string, name: string } | null
  event: { id: string, name: string }
}

const { can } = useMe()
const { call } = useApi()
const { currentId, loadEvents } = useCurrentEvent()
await loadEvents()

const assignments = ref<Assignment[]>([])
const users = ref<Array<{ id: string, name: string, email: string, roles: Array<{ key: string }> }>>([])
const queueTypes = ref<Array<{ id: string, code: string, name: string, color: string }>>([])
const counters = ref<Array<{ id: string, code: string, name: string }>>([])
const pending = ref(false)

async function load() {
  if (!currentId.value) return
  pending.value = true
  try {
    const [list, userData, types, counterList] = await Promise.all([
      apiFetch<Assignment[]>('/api/admin/assignments', { query: { eventId: currentId.value } }),
      apiFetch<{ users: typeof users.value }>('/api/admin/users'),
      apiFetch<typeof queueTypes.value>('/api/admin/queue-types', { query: { eventId: currentId.value } }),
      apiFetch<typeof counters.value>('/api/admin/counters', { query: { eventId: currentId.value } }),
    ])
    assignments.value = list
    users.value = userData.users
    queueTypes.value = types
    counters.value = counterList
  }
  finally { pending.value = false }
}
watch(currentId, load, { immediate: true })

const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ userId: '', queueTypeId: '', counterId: SELECT_NONE, isDefault: true })

function openCreate() {
  Object.assign(form, { userId: '', queueTypeId: queueTypes.value[0]?.id ?? '', counterId: SELECT_NONE, isDefault: true })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  const res = await call(
    '/api/admin/assignments',
    {
      method: 'POST',
      body: {
        userId: form.userId,
        eventId: currentId.value,
        queueTypeId: form.queueTypeId,
        counterId: nullableValue(form.counterId),
        isDefault: form.isDefault,
      },
    },
    'Penugasan disimpan',
  )
  saving.value = false
  if (res) { modalOpen.value = false; await load() }
}

const deleteTarget = ref<Assignment | null>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const res = await call(`/api/admin/assignments/${deleteTarget.value.id}`, { method: 'DELETE' }, 'Penugasan dihapus')
  if (res) { deleteTarget.value = null; await load() }
}

const userOptions = computed(() =>
  users.value.map(u => ({ label: `${u.name} — ${u.email}`, value: u.id })))
const typeOptions = computed(() =>
  queueTypes.value.map(t => ({ label: `${t.code} · ${t.name}`, value: t.id })))
const counterOptions = computed(() =>
  [{ label: 'Tanpa loket', value: SELECT_NONE }, ...counters.value.map(c => ({ label: c.name, value: c.id }))])

/** Kelompokkan per layanan supaya mudah dilihat siapa memegang apa. */
const grouped = computed(() => {
  const map = new Map<string, { queueType: Assignment['queueType'], rows: Assignment[] }>()
  for (const type of queueTypes.value) map.set(type.id, { queueType: type, rows: [] })
  for (const a of assignments.value) {
    const bucket = map.get(a.queueType.id)
    if (bucket) bucket.rows.push(a)
    else map.set(a.queueType.id, { queueType: a.queueType, rows: [a] })
  }
  return [...map.values()]
})
</script>

<template>
  <div>
    <UiPageHeading
      title="Penugasan Operator"
      icon="i-lucide-link"
      description="Tentukan operator mana melayani jenis antrean apa, dan di loket mana ia duduk."
    >
      <template #actions>
        <UiEventPicker />
        <UButton
          v-if="can(PERMISSIONS.ASSIGNMENT_MANAGE)"
          icon="i-lucide-plus"
          label="Tugaskan"
          :disabled="!currentId || !queueTypes.length"
          @click="openCreate"
        />
      </template>
    </UiPageHeading>

    <div v-if="pending && !assignments.length" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <div v-else-if="!queueTypes.length" class="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <UIcon name="i-lucide-tags" class="mx-auto size-10 text-slate-400" />
      <p class="mt-3 font-medium">
        Belum ada jenis antrean
      </p>
      <p class="mt-1 text-sm text-slate-500">
        Buat jenis antrean dulu sebelum menugaskan operator.
      </p>
      <UButton class="mt-4" variant="outline" color="neutral" to="/admin/queue-types" label="Ke Jenis Antrean" />
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="group in grouped"
        :key="group.queueType.id"
        class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="mb-3 flex items-center gap-3">
          <span
            class="flex size-9 items-center justify-center rounded-lg text-sm font-bold"
            :style="{ backgroundColor: group.queueType.color + '1a', color: group.queueType.color }"
          >
            {{ group.queueType.code }}
          </span>
          <div>
            <p class="font-semibold">
              {{ group.queueType.name }}
            </p>
            <p class="text-xs text-slate-500">
              {{ group.rows.length }} operator ditugaskan
            </p>
          </div>
        </div>

        <div v-if="!group.rows.length" class="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
          Belum ada operator untuk layanan ini.
        </div>

        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="row in group.rows" :key="row.id" class="flex flex-wrap items-center gap-3 py-2">
            <UAvatar :alt="row.user.name" size="xs" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ row.user.name }}
                <UBadge v-if="!row.user.isActive" size="sm" color="neutral" variant="subtle" label="Nonaktif" class="ml-1" />
              </p>
              <p class="truncate text-xs text-slate-500">
                {{ row.user.email }}
              </p>
            </div>

            <UBadge
              v-if="row.counter"
              size="sm"
              variant="subtle"
              color="info"
              :label="row.counter.name"
            />
            <span v-else class="text-xs text-slate-400">Tanpa loket</span>

            <UButton
              v-if="can(PERMISSIONS.ASSIGNMENT_MANAGE)"
              icon="i-lucide-x"
              variant="ghost"
              color="error"
              size="xs"
              @click="deleteTarget = row"
            />
          </li>
        </ul>
      </div>
    </div>

    <UModal v-model:open="modalOpen" title="Tugaskan Operator" description="Satu operator boleh memegang lebih dari satu jenis antrean.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Operator" required>
            <USelectMenu
              v-model="form.userId"
              :items="userOptions"
              value-key="value"
              :search-input="{ placeholder: 'Cari nama…' }"
              placeholder="Pilih pengguna"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Jenis Antrean" required>
            <USelect v-model="form.queueTypeId" :items="typeOptions" class="w-full" />
          </UFormField>

          <UFormField label="Loket" help="Nama loket dibacakan saat pengumuman suara.">
            <USelect v-model="form.counterId" :items="counterOptions" class="w-full" />
          </UFormField>

          <UCheckbox v-model="form.isDefault" label="Jadikan layanan utama operator ini" />
        </div>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="close" />
          <UButton :loading="saving" :disabled="!form.userId || !form.queueTypeId" icon="i-lucide-save" label="Simpan" @click="save" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!deleteTarget"
      title="Hapus penugasan?"
      :description="`${deleteTarget?.user.name} tidak akan lagi melihat antrean ${deleteTarget?.queueType.name}.`"
      @update:open="(v) => { if (!v) deleteTarget = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Batal" @click="deleteTarget = null" />
          <UiActionButton color="error" icon="i-lucide-trash-2" label="Hapus" :action="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
