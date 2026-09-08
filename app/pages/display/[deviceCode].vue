<script setup lang="ts">
import { apiFetch } from '../../composables/useApi'
import { SOCKET_EVENTS } from '../../../shared/constants/socket'

definePageMeta({ layout: false })

const route = useRoute()
const deviceCode = route.params.deviceCode as string
const TOKEN_KEY = `antrean:display-token:${deviceCode}`

interface BoardEntry {
  queueType: { id: string, code: string, name: string, color: string, icon: string | null }
  current: { queueNumber: string, status: string, recallCount: number, lastCalledAt: string | null, counter: { code: string, name: string } | null } | null
  waitingCount: number
  nextNumbers: string[]
  lastCompleted: string | null
}

interface TemplateWidget {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isVisible: boolean
  animation: string | null
  config: Record<string, unknown> | null
  style: Record<string, unknown> | null
  mediaId: string | null
  playlistId: string | null
}

interface DisplayState {
  device: { id: string, deviceCode: string, name: string, type: string, queueType: { id: string, code: string, name: string, color: string } | null, isPaired: boolean }
  event: { id: string, name: string, timezone: string, status: string }
  organization: { name: string, logoUrl: string | null } | null
  branding: { primaryColor?: string, secondaryColor?: string } | null
  serviceDate: string
  settings: { voiceEnabled: boolean, voiceLanguage: string }
  openState: { isOpen: boolean, message: string, openTime: string | null, closeTime: string | null }
  board: BoardEntry[]
  announcements: Array<{ id: string, title: string | null, message: string, type: string }>
  template: { id: string, name: string, background: { color?: string, imageUrl?: string } | null, widgets: TemplateWidget[] } | null
  mediaById: Record<string, { url: string, type: string }>
  playlistById: Record<string, { items: Array<{ media: { url: string, type: string }, durationSeconds: number }> }>
}

const state = ref<DisplayState | null>(null)
const loadError = ref('')
const deviceToken = ref<string | null>(null)

async function loadState() {
  try {
    state.value = await apiFetch<DisplayState>(`/api/display/${deviceCode}/state`)
    loadError.value = ''
  }
  catch (e) {
    loadError.value = (e as Error).message
  }
}

await loadState()

useHead(() => ({ title: state.value?.device.name ?? 'Display' }))

/**
 * Pairing (§45) harus tuntas sebelum socket dibuka: begitu perangkat punya
 * device token, server menolak handshake yang tidak menyertakannya.
 */
async function ensurePaired() {
  deviceToken.value = localStorage.getItem(TOKEN_KEY)
  if (deviceToken.value || !state.value || state.value.device.isPaired) return

  try {
    const res = await apiFetch<{ deviceToken: string }>(`/api/display/${deviceCode}/pair`, { method: 'POST' })
    deviceToken.value = res.deviceToken
    localStorage.setItem(TOKEN_KEY, res.deviceToken)
  }
  catch { /* sudah dipasangkan di browser lain — tetap boleh menampilkan lewat polling */ }
}

// ---- jam ----
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { clockTimer = setInterval(() => { now.value = new Date() }, 1000) })
onBeforeUnmount(() => clearInterval(clockTimer))

const timeText = computed(() =>
  now.value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const dateText = computed(() =>
  now.value.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

// ---- realtime + suara ----
const speech = useSpeech({ language: 'id-ID', repeat: 2 })

/**
 * Suara diatur terpusat lewat pengaturan sistem (§49), bukan per layar: seorang
 * admin mematikan suara sekali dan seluruh perangkat mengikuti pada pembaruan
 * status berikutnya — tanpa perlu mendatangi tiap televisi.
 */
watchEffect(() => {
  if (!state.value?.settings) return
  speech.settings.enabled = state.value.settings.voiceEnabled
  speech.settings.language = state.value.settings.voiceLanguage
})
const highlighted = ref<string | null>(null)
const audioUnlocked = ref(false)

// auth dibaca sebagai fungsi supaya token terbaru ikut terkirim saat connect()
const { connected, rejected, lastError, lastMessageAt, on, emit, connect } = useSocket(
  () => ({
    role: 'display' as const,
    deviceCode,
    deviceToken: deviceToken.value ?? undefined,
  }),
  { manual: true },
)

interface CallPayload {
  queueNumber: string
  queueTypeId: string
  queueTypeName: string
  counterName: string | null
}

function onCalled(payload: CallPayload) {
  highlighted.value = payload.queueNumber
  speech.announceQueue({
    queueNumber: payload.queueNumber,
    queueTypeName: payload.queueTypeName,
    counterName: payload.counterName,
  })
  setTimeout(() => {
    if (highlighted.value === payload.queueNumber) highlighted.value = null
  }, 12_000)
  void loadState()
}

on<CallPayload>(SOCKET_EVENTS.QUEUE_CALLED, onCalled)
on<CallPayload>(SOCKET_EVENTS.QUEUE_RECALLED, onCalled)
on(SOCKET_EVENTS.QUEUE_CREATED, () => loadState())
on(SOCKET_EVENTS.QUEUE_COMPLETED, () => loadState())
on(SOCKET_EVENTS.QUEUE_SKIPPED, () => loadState())
on(SOCKET_EVENTS.EVENT_OPENED, () => loadState())
on(SOCKET_EVENTS.EVENT_CLOSED, () => loadState())
on(SOCKET_EVENTS.EVENT_PAUSED, () => loadState())
on(SOCKET_EVENTS.ANNOUNCEMENT_CREATED, () => loadState())
on(SOCKET_EVENTS.DISPLAY_UPDATED, () => loadState())
on(SOCKET_EVENTS.DISPLAY_RELOAD, () => window.location.reload())

// Fallback polling saat WebSocket terputus (§44), plus heartbeat saat tersambung.
let pollTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await ensurePaired()
  connect()

  pollTimer = setInterval(() => {
    if (connected.value) emit('display:ping')
    else void loadState()
  }, 10_000)
})
onBeforeUnmount(() => clearInterval(pollTimer))

/** Browser memblokir suara sampai ada interaksi pengguna — sediakan satu tombol. */
function unlockAudio() {
  speech.speak('Pengumuman suara aktif.', 1)
  audioUnlocked.value = true
}

/** Tombol buka-suara tidak ada gunanya bila suara memang dimatikan admin. */
const voiceEnabled = computed(() => state.value?.settings?.voiceEnabled !== false)

const primary = computed(() => state.value?.branding?.primaryColor ?? '#1b5cf5')

/** Template kustom mengambil alih seluruh layar; tanpa itu dipakai tata letak bawaan. */
const useTemplate = computed(() => (state.value?.template?.widgets?.length ?? 0) > 0)
const isSingle = computed(() => state.value?.board.length === 1)
const runningText = computed(() =>
  state.value?.announcements.map(a => a.message).join('   •   ') ?? '')

function lastUpdateText() {
  if (!lastMessageAt.value) return 'Menunggu pembaruan'
  return 'Pembaruan terakhir ' + lastMessageAt.value.toLocaleTimeString('id-ID')
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-950 text-white">
    <div v-if="loadError" class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-monitor-x" class="mx-auto size-16 text-slate-600" />
        <p class="mt-4 text-2xl font-bold">
          Display tidak ditemukan
        </p>
        <p class="mt-2 text-slate-400">
          {{ loadError }}
        </p>
      </div>
    </div>

    <!-- Tata letak dari Display Builder mengambil alih seluruh layar -->
    <template v-else-if="state && useTemplate">
      <DisplayRenderer
        class="flex-1"
        :widgets="state.template!.widgets as never"
        :background="state.template!.background"
        :board="state.board as never"
        :organization-name="state.organization?.name ?? state.event.name"
        :announcements="state.announcements"
        :media-by-id="state.mediaById"
        :playlist-by-id="state.playlistById"
        :highlighted="highlighted"
      />

      <!-- Baris status tetap ada supaya perangkat tetap bisa dipantau -->
      <footer class="flex items-center gap-4 border-t border-slate-800 bg-slate-900 px-6 py-2 text-xs text-slate-500">
        <span class="flex items-center gap-1.5">
          <span class="size-1.5 rounded-full" :class="connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'" />
          {{ connected ? 'ONLINE' : rejected ? 'PERLU PAIRING ULANG' : 'OFFLINE' }}
        </span>
        <span>{{ state.openState.isOpen ? 'BUKA' : 'TUTUP' }}</span>
        <button
          v-if="!audioUnlocked && voiceEnabled"
          type="button"
          class="rounded-full bg-white/10 px-3 py-1 font-medium text-white hover:bg-white/20"
          @click="unlockAudio"
        >
          Aktifkan Suara
        </button>
        <span class="ml-auto truncate">{{ state.device.name }} · {{ lastUpdateText() }}</span>
      </footer>
    </template>

    <template v-else-if="state">
      <!-- Header -->
      <header class="flex items-center gap-6 px-10 py-6" :style="{ backgroundColor: primary }">
        <img
          v-if="state.organization?.logoUrl"
          :src="state.organization.logoUrl"
          alt=""
          class="h-14 w-auto object-contain"
        >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
            Antrean
          </p>
          <h1 class="truncate text-3xl font-extrabold leading-tight">
            {{ state.organization?.name ?? state.event.name }}
          </h1>
        </div>

        <div class="text-right">
          <p class="text-4xl font-bold tabular-nums">
            {{ timeText }}
          </p>
          <p class="text-sm text-white/70">
            {{ dateText }}
          </p>
        </div>

        <div class="flex flex-col items-end gap-1">
          <span
            class="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            :class="connected ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'"
          >
            <span class="size-2 rounded-full" :class="connected ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'" />
            {{ connected ? 'ONLINE' : rejected ? 'PERLU PAIRING ULANG' : 'OFFLINE' }}
          </span>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="state.openState.isOpen ? 'bg-white/20' : 'bg-rose-500/30'"
          >
            {{ state.openState.isOpen ? 'BUKA' : 'TUTUP' }}
          </span>
        </div>
      </header>

      <!-- Papan antrean -->
      <main class="flex-1 p-8">
        <div
          class="grid h-full gap-6"
          :class="isSingle ? 'grid-cols-1' : state.board.length === 2 ? 'grid-cols-2' : 'grid-cols-3'"
        >
          <div
            v-for="entry in state.board"
            :key="entry.queueType.id"
            class="flex flex-col rounded-3xl border-2 bg-slate-900/80 p-8 transition-all duration-500"
            :class="highlighted && entry.current?.queueNumber === highlighted
              ? 'scale-[1.02] border-white shadow-[0_0_60px_rgba(255,255,255,0.25)]'
              : 'border-slate-800'"
          >
            <div class="mb-4 flex items-center gap-3">
              <span
                class="flex size-12 items-center justify-center rounded-xl text-xl font-extrabold"
                :style="{ backgroundColor: entry.queueType.color + '33', color: entry.queueType.color }"
              >
                {{ entry.queueType.code }}
              </span>
              <h2 class="truncate text-2xl font-bold uppercase tracking-wide">
                {{ entry.queueType.name }}
              </h2>
            </div>

            <div class="flex flex-1 flex-col items-center justify-center">
              <p class="text-sm uppercase tracking-[0.3em] text-slate-500">
                Nomor dilayani
              </p>
              <p
                class="queue-number leading-none"
                :class="[
                  isSingle ? 'text-[14rem]' : 'text-[8rem]',
                  highlighted === entry.current?.queueNumber ? 'animate-pulse' : '',
                ]"
                :style="{ color: entry.current ? entry.queueType.color : '#334155' }"
              >
                {{ entry.current?.queueNumber ?? '—' }}
              </p>

              <p v-if="entry.current?.counter" class="mt-4 text-center">
                <span class="block text-sm uppercase tracking-[0.3em] text-slate-500">Silakan ke</span>
                <span class="text-3xl font-bold">{{ entry.current.counter.name }}</span>
              </p>
              <p v-else class="mt-4 text-slate-500">
                Menunggu panggilan
              </p>
            </div>

            <div class="mt-6 border-t border-slate-800 pt-4">
              <div class="flex items-center justify-between text-sm text-slate-400">
                <span>Menunggu: <b class="text-slate-200">{{ entry.waitingCount }}</b></span>
                <span v-if="entry.nextNumbers.length" class="truncate">
                  Berikutnya: <b class="text-slate-200">{{ entry.nextNumbers.slice(0, 3).join(' · ') }}</b>
                </span>
              </div>
            </div>
          </div>

          <div v-if="!state.board.length" class="col-span-full flex items-center justify-center text-slate-500">
            Belum ada jenis antrean aktif pada event ini.
          </div>
        </div>
      </main>

      <!-- Running text -->
      <footer class="flex items-center gap-6 border-t border-slate-800 bg-slate-900 px-8 py-3 text-sm">
        <div v-if="runningText" class="relative flex-1 overflow-hidden">
          <div class="animate-[marquee_28s_linear_infinite] whitespace-nowrap text-slate-300">
            {{ runningText }}
          </div>
        </div>
        <div v-else class="flex-1 truncate text-slate-500">
          {{ state.openState.message }}
        </div>

        <button
          v-if="!audioUnlocked && voiceEnabled"
          type="button"
          class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 font-medium text-white hover:bg-white/20"
          @click="unlockAudio"
        >
          <UIcon name="i-lucide-volume-2" class="size-4" />
          Aktifkan Suara
        </button>

        <span class="whitespace-nowrap text-xs text-slate-500">
          {{ state.device.name }} · {{ lastUpdateText() }}
          <template v-if="rejected"> · {{ lastError }} — reset pairing dari panel admin</template>
        </span>
      </footer>
    </template>
  </div>
</template>

<style>
@keyframes marquee {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
</style>
