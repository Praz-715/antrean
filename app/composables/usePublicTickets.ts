/**
 * Nomor antrean yang sudah diambil pengunjung dari perangkat ini (§17, §43).
 *
 * Pengunjung publik tidak punya akun, jadi satu-satunya "ingatan" yang tersedia ada di
 * perambannya sendiri. Yang disimpan hanya token publik antreannya — token itu memang
 * sudah menjadi kunci halaman pelacakan `/queue/{token}`, jadi tidak ada data pribadi
 * tambahan yang ikut mengendap di perangkat.
 *
 * Disimpan per halaman publik (bukan global) supaya satu perangkat yang dipakai di dua
 * kantor berbeda tidak saling menimpa ingatannya.
 */
export interface RememberedTicket {
  token: string
  queueTypeId: string
}

export function usePublicTickets(publishCode: string) {
  const KEY = `antrean:tiket:${publishCode}`

  /**
   * Semua pembacaan dibungkus try/catch: mode penyamaran dan peramban yang memblokir
   * penyimpanan situs melempar galat di sini, dan halaman antrean tidak boleh gagal
   * hanya karena ingatannya tidak bisa dibaca.
   */
  function read(): Record<string, string> {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
    }
    catch {
      return {}
    }
  }

  function write(map: Record<string, string>) {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(map))
    }
    catch {
      // Diabaikan: pengunjung tetap bisa mengambil nomor, hanya tidak diingat.
    }
  }

  function remember(queueTypeId: string, token: string) {
    write({ ...read(), [queueTypeId]: token })
  }

  /** Dipakai saat antreannya sudah tidak berlaku lagi (selesai, batal, atau hari lain). */
  function forget(queueTypeId: string) {
    const sisa = Object.fromEntries(
      Object.entries(read()).filter(([key]) => key !== queueTypeId),
    )
    write(sisa)
  }

  return { read, remember, forget }
}
