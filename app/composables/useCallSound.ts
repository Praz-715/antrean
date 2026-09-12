/**
 * Pemutar berkas audio untuk layar antrean: nada panggil dan suara TTS eksternal.
 *
 * Terpisah dari `useSpeech()` karena mesinnya memang berbeda — yang satu merangkai
 * ucapan lewat Web Speech API, yang ini memutar berkas. Satu elemen `<audio>` dipakai
 * ulang untuk semuanya supaya "izin bunyi" yang didapat dari satu ketukan pengguna
 * tetap berlaku untuk pemutaran berikutnya.
 */
export function useCallSound() {
  let element: HTMLAudioElement | null = null

  function audio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null
    if (!element) {
      element = new Audio()
      element.preload = 'auto'
    }
    return element
  }

  /**
   * Putar satu berkas sampai selesai.
   *
   * Selalu ada batas waktu: berkas yang macet di tengah jaringan tidak boleh
   * menggantung panggilan berikutnya. Mengembalikan `false` bila gagal — pemanggil
   * yang memutuskan apakah perlu jatuh ke cara lain.
   */
  function play(url: string, options: { volume?: number, timeoutMs?: number } = {}): Promise<boolean> {
    const el = audio()
    if (!el) return Promise.resolve(false)

    const timeoutMs = options.timeoutMs ?? 15_000

    return new Promise<boolean>((resolve) => {
      let selesai = false
      const beres = (ok: boolean) => {
        if (selesai) return
        selesai = true
        clearTimeout(timer)
        el.onended = null
        el.onerror = null
        resolve(ok)
      }

      const timer = setTimeout(() => beres(false), timeoutMs)

      el.onended = () => beres(true)
      el.onerror = () => beres(false)
      el.volume = options.volume ?? 1
      el.src = url
      el.currentTime = 0
      el.play().catch(() => beres(false))
    })
  }

  /**
   * Dapatkan izin bunyi dari ketukan pengguna.
   *
   * Peramban menolak `play()` yang tidak berasal dari interaksi. Dipanggil dari
   * tombol "Aktifkan Suara": berkasnya diputar tanpa volume lalu langsung dihentikan,
   * cukup untuk membuat elemen ini dianggap sudah diizinkan berbunyi.
   */
  async function unlock(url?: string | null) {
    const el = audio()
    if (!el || !url) return
    el.volume = 0
    el.src = url
    try {
      await el.play()
      el.pause()
      el.currentTime = 0
    }
    catch {
      // Diabaikan: kalau pun gagal, pemutaran berikutnya hanya akan kehilangan bunyi,
      // bukan mengganggu tampilan layar.
    }
    finally {
      el.volume = 1
    }
  }

  function stop() {
    if (!element) return
    element.pause()
    element.currentTime = 0
  }

  return { play, unlock, stop }
}
