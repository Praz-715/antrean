/**
 * Tanggal layanan untuk sisi klien.
 *
 * `new Date().toISOString().slice(0, 10)` memberi tanggal UTC — untuk WIB itu keliru
 * satu hari setiap pukul 17.00–24.00 WIB. Filter tanggal dan laporan harus mengikuti
 * zona waktu EVENT, sama seperti perhitungan `service_date` di server (§50).
 */
export function todayInTimezone(timezone = 'Asia/Jakarta'): string {
  // 'en-CA' menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Geser tanggal 'YYYY-MM-DD' sekian hari, tanpa terpengaruh zona waktu peramban. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
