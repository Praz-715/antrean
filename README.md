# ANTREAN

> **Kelola Antrean. Layani Lebih Cepat.**

Queue Management System (QMS) yang generik dan dapat dikonfigurasi — dipakai untuk rumah sakit, instansi
pemerintahan, bank, mall, kampus, event, workshop, atau kebutuhan antrean apa pun. Jenis layanan, formulir
pengunjung, halaman publik, dan layar display semuanya dibuat oleh administrator, bukan di-hardcode.

Spesifikasi lengkap ada di [`baca.md`](baca.md); rencana & status pengerjaan ada di [`phase.md`](phase.md).

---

## Teknologi

| Lapisan | Pilihan |
|---|---|
| Framework | Nuxt 4 (Vue 3, TypeScript strict, Nitro) |
| UI | Nuxt UI v4 + Tailwind CSS v4 |
| Database | MySQL 8+ / innovation, Prisma 7 (driver adapter MariaDB) |
| Auth | Better Auth (email/password, sesi cookie) + RBAC tabel sendiri |
| Realtime | Socket.IO di dalam proses Nitro (WebSocket + fallback polling) |
| Validasi | Zod 4 (skema dipakai bersama server & klien) |
| Waktu | Day.js (UTC di database, tampilan mengikuti timezone event) |
| Test | Vitest (integrasi memakai database MySQL sungguhan) |

---

## Menjalankan

### 1. Prasyarat

- Node.js 22+
- MySQL 8+ (atau jalankan lewat Docker)

```bash
# opsional: MySQL lewat Docker
docker run -d --name antrean-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=antrean \
  -p 3306:3306 mysql:8
```

### 2. Instalasi

```bash
npm install
cp .env.example .env      # lalu sesuaikan DATABASE_URL dan secret
```

Isi minimal `.env`:

```env
DATABASE_URL="mysql://root:root123@127.0.0.1:3306/antrean"
BETTER_AUTH_SECRET=<hasil: openssl rand -base64 32>
APP_ENCRYPTION_KEY=<hasil: openssl rand -hex 32>
APP_URL=http://localhost:3000
```

### 3. Database

```bash
npm run db:migrate     # buat skema
npm run db:seed        # data contoh + akun demo
```

### 4. Jalankan

```bash
npm run dev            # http://localhost:3000
```

---

## Akun Demo

> ⚠️ Hanya untuk development. **Ganti seluruh password sebelum dipakai sungguhan.**

| Peran | Email | Password | Akses |
|---|---|---|---|
| Super Admin | `superadmin@antrean.local` | `password123` | Seluruh sistem |
| Operator 1 | `operator1@antrean.local` | `password123` | Pelayanan Umum · Loket 1 |
| Operator 2 | `operator2@antrean.local` | `password123` | Pelayanan Khusus · Loket 2 |

Halaman publik contoh: `http://localhost:3000/p/demo2026`

---

## Alur Coba Cepat

1. Masuk sebagai **superadmin** → `/admin/dashboard`.
2. Buka `/admin/displays`, buat display "Lobby Utama", lalu buka tautannya di tab/layar terpisah.
3. Buka `/p/demo2026` di ponsel atau tab lain → pilih layanan → isi form → dapat nomor `A001`.
4. Masuk sebagai **operator1** di jendela lain → `/operator` → tekan **Panggil Berikutnya**.
5. Layar display berubah seketika dan membacakan nomor; halaman pengunjung berganti jadi "Nomor Anda dipanggil".

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm run preview` | Build & pratinjau produksi |
| `npm run db:migrate` | Buat & terapkan migrasi (development) |
| `npm run db:deploy` | Terapkan migrasi (produksi) |
| `npm run db:seed` | Isi data contoh (idempoten) |
| `npm run db:seed:prod` | Seed minimal untuk instalasi baru (kata sandi acak, dicetak sekali) |
| `npm run db:studio` | Prisma Studio |
| `npm run test` | Seluruh test (unit + integrasi) |
| `npm run smoke:api` | Sapu 53 endpoint pada server yang sedang berjalan |
| `npm run smoke:browser` | Uji perilaku nyata di browser (Playwright) |
| `npm run smoke:phase5` | Uji media library, playlist, dan display builder |
| `npm run smoke:phase6` | Uji analytics, laporan, ekspor, dan audit log |
| `npm run smoke:phase7` | Uji pengaturan, rating, integrasi data source, dan autofill |
| `npm run smoke:phase8` | Uji penjadwal otomatis, header keamanan, rate limit, unggahan |
| `npm run load-test` | Uji beban ringan: 2.000 antrean + 200 display |
| `npm run typecheck` | Pemeriksaan tipe |
| `npm run lint` / `lint:fix` | ESLint |

---

## Struktur

```
app/        antarmuka (halaman, komponen, composable, layout)
server/     API Nitro, service, realtime, utilitas
shared/     tipe, skema Zod, konstanta — dipakai kedua sisi
prisma/     schema, migrasi, seed
tests/      unit & integrasi
docs/       dokumentasi API dan WebSocket
```

Arah ketergantungan satu arah, tidak boleh dilangkahi:

```
page/component → composable → server/api (handler tipis) → service → repository/prisma
```

Handler API hanya memvalidasi input, memanggil service, lalu membungkus hasil.
Tidak ada query Prisma di dalam handler, tidak ada business logic di dalam `.vue`.

---

## Rute

**Publik (tanpa login)**

| Rute | Fungsi |
|---|---|
| `/p/{publishCode}` | Ambil nomor antrean |
| `/queue/{token}` | Lacak status antrean (realtime) |
| `/display/{deviceCode}` | Layar antrean (realtime + suara) |

**Terproteksi**

| Rute | Fungsi |
|---|---|
| `/login` | Masuk |
| `/operator` | Dashboard operator |
| `/admin/dashboard` | Ringkasan harian |
| `/admin/events`, `/admin/queue-types`, `/admin/counters` | Konfigurasi layanan |
| `/admin/live-queue`, `/admin/queue-history` | Pemantauan antrean |
| `/admin/operators`, `/admin/assignments` | Pengguna & penugasan |
| `/admin/public-pages`, `/admin/forms` | Publikasi & form builder |
| `/admin/displays`, `/admin/announcements` | Perangkat display & teks berjalan |
| `/admin/media`, `/admin/display-builder` | Media library, playlist & penyusun tata letak layar |
| `/admin/analytics`, `/admin/reports`, `/admin/audit-logs` | Grafik, laporan harian, pusat ekspor & jejak audit |
| `/admin/visitors`, `/admin/feedback` | Data pengunjung & moderasi rating/testimoni |
| `/admin/integrations`, `/admin/settings`, `/admin/roles` | Sumber data eksternal, pengaturan sistem, role & izin |

---

## Dokumentasi Lain

- [docs/API.md](docs/API.md) — seluruh endpoint REST beserta contoh
- [docs/WEBSOCKET.md](docs/WEBSOCKET.md) — kanal realtime, payload, dan otentikasi
- [phase.md](phase.md) — rencana implementasi, ERD, dan status per phase
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — pemasangan di server, env produksi, reverse proxy, cadangan
- [docs/AUDIT.md](docs/AUDIT.md) — hasil audit fungsi beserta perbaikannya

---

## Catatan Penting

- **Waktu.** Database menyimpan UTC. Tanggal layanan (`service_date`) dihitung pada timezone *event*,
  bukan timezone server — sehingga reset nomor harian tetap benar walau server berada di zona lain.
  Pada raw SQL selalu gunakan `UTC_TIMESTAMP(3)`, jangan `NOW()`.
- **Nomor antrean.** Dihasilkan lewat `INSERT ... ON DUPLICATE KEY UPDATE` pada tabel `queue_counters`
  di dalam transaksi — tidak pernah `MAX(sequence)+1`. Unique constraint
  `(event, jenis, tanggal, urutan)` menjadi jaring pengaman terakhir.
- **Pemanggilan antrean.** `SELECT … FOR UPDATE SKIP LOCKED` + `UPDATE … WHERE status='WAITING'`
  memastikan dua operator tidak mungkin mendapat nomor yang sama.
- **Realtime.** Karena Socket.IO menempel pada proses Nitro, aplikasi harus dijalankan sebagai
  server Node (bukan serverless/edge). Untuk banyak instance, tambahkan Redis adapter.
- **Media.** Berkas divalidasi lewat magic byte, bukan nama atau Content-Type, lalu disimpan di
  `storage/uploads` dan disajikan pada `/media/**`. Ganti driver di `server/utils/storage.ts`
  bila nanti pindah ke S3/MinIO — pemanggilnya tidak perlu berubah.
- **Display builder.** Tata letak digambar pada kanvas 1920×1080 lalu diskalakan ke layar.
  Pratinjau builder dan layar sungguhan memakai komponen yang sama (`DisplayRenderer`), jadi
  yang dilihat admin memang yang akan tampil.
- **Tanggal di antarmuka.** Filter dan laporan memakai tanggal pada zona waktu *event*
  (`shared/utils/service-date.ts`), bukan UTC — kalau tidak, setiap pukul 17.00 WIB ke atas
  rentang tanggalnya meleset satu hari.
- **Ekspor.** Pekerjaan berjalan di latar belakang lewat tabel `export_jobs`; klien memantau
  statusnya lalu mengunduh. CSV ditulis dengan BOM UTF-8 agar Excel di Windows membacanya benar.
- **Pengaturan sistem.** Satu katalog di `shared/constants/settings.ts` dipakai server (validasi &
  nilai bawaan), antarmuka (formulir dirender otomatis), dan kode fitur. Sebagian kunci boleh
  ditimpa per event lewat `events.settings`, sehingga satu organisasi bisa punya aturan berbeda
  per layanan tanpa membuat organisasi baru.
- **Integrasi data source.** Kredensial disimpan terenkripsi AES-256-GCM dan tidak pernah
  dikembalikan ke klien. Permintaan keluar dijaga di `server/utils/ssrf.ts`: nama host diresolusi
  lalu ALAMATNYA yang diperiksa, alamat internal ditolak, redirect tidak diikuti, ada batas waktu
  dan batas ukuran respons. Pengunjung hanya menerima nilai yang dipetakan ke field formulir —
  respons mentah pihak ketiga tidak pernah diteruskan.
- **Penjadwal.** Status event diselaraskan dengan jadwalnya tiap menit
  (`server/plugins/scheduler.ts`). Berjalan di dalam proses, jadi bila nanti dijalankan lebih dari
  satu instance, nyalakan hanya pada salah satunya (`SCHEDULER_ENABLED=false` pada sisanya).
- **Header keamanan.** CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS
  (produksi) dipasang oleh `server/middleware/security-headers.ts` — ikut ke mana pun aplikasi
  dijalankan, termasuk saat dev.
