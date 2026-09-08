# API ANTREAN

Seluruh endpoint berada di bawah `/api`. Kecuali endpoint QR (yang mengembalikan berkas gambar),
semua respons memakai amplop yang sama.

## Format Respons

**Berhasil**

```json
{ "success": true, "message": "Antrean A001 dipanggil", "data": { } }
```

**Gagal**

```json
{
  "success": false,
  "message": "Antrean sudah dipanggil operator lain",
  "code": "QUEUE_ALREADY_CALLED",
  "data": null
}
```

**Gagal validasi** menambahkan rincian per-field:

```json
{
  "success": false,
  "message": "Data yang dikirim tidak valid",
  "code": "VALIDATION_ERROR",
  "data": null,
  "errors": { "phone": ["Nomor HP tidak valid"] }
}
```

### Kode Error

| Kode | HTTP | Arti |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input tidak lolos validasi |
| `UNAUTHENTICATED` | 401 | Belum login |
| `FORBIDDEN` | 403 | Tidak punya izin / bukan assignment-nya |
| `NOT_FOUND` | 404 | Data tidak ditemukan |
| `CONFLICT` | 409 | Bentrok status/data |
| `RATE_LIMITED` | 429 | Terlalu banyak permintaan |
| `EVENT_NOT_OPEN` / `EVENT_PAUSED` / `OUTSIDE_SERVICE_HOURS` | 400 | Event tidak menerima antrean baru |
| `PAGE_NOT_PUBLISHED` | 400 | Halaman publik tidak aktif |
| `QUEUE_TYPE_UNAVAILABLE` | 400 | Layanan tidak tersedia di halaman itu |
| `DAILY_LIMIT_REACHED` | 400 | Batas ambil per IP per hari tercapai |
| `QUEUE_LIMIT_REACHED` | 409 | Kuota antrean menunggu penuh |
| `QUEUE_EMPTY` | 400 | Tidak ada antrean menunggu |
| `QUEUE_ALREADY_CALLED` | 409 | Sudah ditangani operator lain |
| `QUEUE_INVALID_TRANSITION` | 409 | Perubahan status tidak diizinkan |
| `RECALL_LIMIT_REACHED` | 409 | Batas panggil ulang tercapai |
| `ACCOUNT_INACTIVE` | 400 | Akun dinonaktifkan |
| `REGISTRATION_DISABLED` | 400 | Pendaftaran mandiri dimatikan dari pengaturan sistem |
| `RATING_DISABLED` | 400 | Fitur penilaian sedang dimatikan |
| `DATA_SOURCE_UNREACHABLE` | 400 | Sumber data eksternal tidak dapat dihubungi |
| `DATA_SOURCE_INVALID_RESPONSE` | 400 | Respons sumber data bukan JSON yang valid |
| `DATA_SOURCE_DISABLED` | 400 | Integrasi tidak aktif / formulir tidak terhubung |
| `AUTOFILL_NOT_FOUND` | 400 | Data yang dicari tidak ditemukan di sistem eksternal |

---

## Autentikasi

Ditangani Better Auth pada `/api/auth/*`, memakai cookie sesi httpOnly.

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "operator1@antrean.local", "password": "password123" }
```

| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/sign-in/email` | Masuk |
| `POST /api/auth/sign-out` | Keluar |
| `GET /api/auth/get-session` | Sesi mentah Better Auth |
| `GET /api/me` | Profil + role + permission + assignment (dipakai UI) |

`GET /api/me` mengembalikan:

```json
{
  "user": { "id": "01M1…", "name": "Operator Satu", "email": "operator1@antrean.local" },
  "organization": { "id": "01M1…", "name": "Demo Organization", "timezone": "Asia/Jakarta" },
  "roles": ["OPERATOR"],
  "isSuperadmin": false,
  "permissions": ["queue.view", "queue.call", "queue.recall", "queue.skip", "queue.complete"],
  "assignments": [{ "queueType": { "code": "A", "name": "Pelayanan Umum" }, "counter": { "name": "Loket 1" } }]
}
```

> Role `SUPERADMIN` mengembalikan `permissions: []` karena ia melewati seluruh pemeriksaan izin
> (`isSuperadmin: true`). Klien wajib memeriksa flag tersebut, bukan hanya daftar permission.

---

## Publik (tanpa login)

### `GET /api/public/{publishCode}`

Konfigurasi halaman: branding, daftar layanan beserta jumlah yang menunggu, definisi formulir aktif,
dan status buka/tutup.

```json
{
  "page": { "title": "Demo Organization", "subtitle": "Silakan ambil nomor antrean", "theme": { "primaryColor": "#1b5cf5" } },
  "openState": { "isOpen": true, "acceptsNewQueue": true, "message": "Layanan sedang dibuka",
                 "openTime": "08:00", "closeTime": "16:00", "serviceDate": "2026-09-05" },
  "queueTypes": [{ "id": "01M1…", "code": "A", "name": "Pelayanan Umum", "waitingCount": 3, "estServiceSeconds": 480 }],
  "form": { "fields": [{ "key": "full_name", "label": "Nama Lengkap", "type": "TEXT", "isRequired": true }] }
}
```

### `POST /api/public/{publishCode}/queue`

Ambil nomor antrean. Rate limit bawaan 20 permintaan/menit per IP (`RATE_LIMIT_*`).

```json
{
  "queueTypeId": "01M1…",
  "values": { "full_name": "Budi Santoso", "phone": "081234567890", "purpose": "Konsultasi" }
}
```

Respons `201`:

```json
{
  "queueNumber": "A001",
  "token": "1yfNS66_VlZqie_4bbbWMBzfZJtYIdOFE9ZqIdOGtzA",
  "queueType": { "code": "A", "name": "Pelayanan Umum", "color": "#1b5cf5" },
  "serviceDate": "2026-09-05"
}
```

`values` divalidasi terhadap definisi formulir aktif milik event — field yang tidak dikenal dibuang.

### `GET /api/public/{publishCode}/status`

Papan ringkas: nomor yang sedang dipanggil per layanan, jumlah menunggu, dan nomor berikutnya.

### `GET /api/public/track/{token}`

Status satu antrean memakai token publik (bukan ID database).

```json
{
  "queueNumber": "A001",
  "status": "WAITING",
  "position": { "ahead": 3, "estimateSeconds": 1440 },
  "nowServing": { "queueNumber": "A019", "counterName": "Loket 1" },
  "queueType": { "name": "Pelayanan Umum", "color": "#1b5cf5" },
  "counter": null,
  "ratingEnabled": true,
  "testimonial": null
}
```

### `POST /api/public/track/{token}/testimonial`

Penilaian pengunjung setelah dilayani (§23). Hanya diterima bila antrean berstatus `COMPLETED`,
fitur rating menyala, dan antrean itu belum pernah dinilai.

```json
{ "rating": 5, "comment": "Pelayanan cepat dan ramah." }
```

| Kode | Sebab |
|---|---|
| `QUEUE_INVALID_TRANSITION` | Layanan belum selesai |
| `CONFLICT` | Antrean sudah pernah dinilai |
| `RATING_DISABLED` | Fitur penilaian dimatikan admin |

Testimoni baru berstatus menunggu moderasi, kecuali `feedback.autoApprove` dinyalakan.

### `POST /api/public/{publishCode}/autofill`

Isi otomatis formulir dari sumber data eksternal (§6).

```json
{ "lookup": "0012345" }
```

Balasannya **hanya** berisi pasangan kunci–nilai untuk field yang benar-benar ada di formulir aktif:

```json
{ "nama_lengkap": "Siti Aminah", "tanggal_lahir": "1990-04-17", "no_hp": "6281234567890" }
```

Respons mentah dari sistem eksternal tidak pernah diteruskan ke pengunjung. Field yang dikembalikan
sumber data tetapi tidak dipetakan — atau dipetakan ke kunci yang tidak ada di formulir — dibuang.

---

## Operator

Butuh sesi + permission `queue.*`. Operator hanya dapat menyentuh jenis antrean yang di-assign kepadanya.

| Endpoint | Fungsi |
|---|---|
| `GET /api/operator/workspace` | Daftar penugasan (layanan + loket + event) |
| `GET /api/operator/board?queueTypeId=` | Papan kerja: sedang dilayani, menunggu, dilewati, riwayat, statistik |
| `POST /api/operator/queue/next` | Panggil antrean berikutnya |
| `POST /api/operator/queue/{id}/call` | Panggil nomor tertentu (termasuk yang SKIPPED) |
| `POST /api/operator/queue/{id}/recall` | Panggil ulang |
| `POST /api/operator/queue/{id}/serving` | Tandai mulai dilayani |
| `POST /api/operator/queue/{id}/skip` | Lewati |
| `POST /api/operator/queue/{id}/complete` | Selesai |
| `POST /api/operator/queue/{id}/no-show` | Tidak hadir |
| `POST /api/operator/queue/{id}/cancel` | Batalkan (`{ "reason": "…" }`) |

**`POST /api/operator/queue/next`**

```json
{ "queueTypeId": "01M1…", "counterId": "01M1…" }
```

Menekan `next` juga menutup antrean yang sedang dilayani operator tersebut sebagai `COMPLETED`
(waktu layanan dicatat), lalu memanggil antrean menunggu berikutnya.

Transisi status yang sah:

```
WAITING  → CALLED, SERVING, SKIPPED, CANCELLED
CALLED   → SERVING, COMPLETED, SKIPPED, NO_SHOW, CANCELLED
SERVING  → COMPLETED, SKIPPED, CANCELLED
SKIPPED  → CALLED, SERVING, CANCELLED
COMPLETED / CANCELLED → (final)
```

---

## Admin

Butuh sesi + permission sesuai modul.

### Event

| Endpoint | Permission |
|---|---|
| `GET /api/admin/events` | `event.view` |
| `POST /api/admin/events` | `event.manage` |
| `GET /api/admin/events/{id}` | `event.view` |
| `PATCH /api/admin/events/{id}` | `event.manage` |
| `DELETE /api/admin/events/{id}` | `event.manage` |
| `POST /api/admin/events/{id}/status` | `event.control` |
| `PUT /api/admin/events/{id}/schedules` | `event.manage` |

`POST …/status` menerima `{ "status": "OPEN" | "PAUSED" | "CLOSED" | … }` dan menyiarkan
`event.opened` / `event.paused` / `event.closed`.

### Jenis Antrean & Loket

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/queue-types` | `queue_type.view` / `queue_type.manage` |
| `PATCH/DELETE /api/admin/queue-types/{id}` | `queue_type.manage` |
| `POST /api/admin/queue-types/reorder` | `queue_type.manage` |
| `GET/POST /api/admin/counters` | `queue_type.view` / `counter.manage` |
| `PATCH/DELETE /api/admin/counters/{id}` | `counter.manage` |

Format nomor mendukung placeholder `{prefix}` `{code}` `{seq}` `{yyyy}` `{mm}` `{dd}`,
mis. `{prefix}{seq}` → `A001`, `{code}-{seq}` → `UM-001`.

### Pengguna & Penugasan

| Endpoint | Permission |
|---|---|
| `GET /api/admin/users` | `user.view` |
| `POST /api/admin/users` | `user.manage` |
| `PATCH/DELETE /api/admin/users/{id}` | `user.manage` |
| `POST /api/admin/users/{id}/password` | `user.manage` |
| `GET /api/admin/assignments` | `assignment.manage` / `user.view` |
| `POST /api/admin/assignments` | `assignment.manage` |
| `DELETE /api/admin/assignments/{id}` | `assignment.manage` |

Reset kata sandi mencabut seluruh sesi aktif pengguna tersebut.

### Halaman Publik & QR

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/public-pages` | `public_page.view` / `public_page.manage` |
| `PATCH/DELETE /api/admin/public-pages/{id}` | `public_page.manage` |
| `POST /api/admin/public-pages/{id}/publish` | `public_page.publish` |
| `POST /api/admin/public-pages/{id}/qr` | `public_page.manage` |
| `GET /api/admin/public-pages/{id}/qr` | `public_page.view` |

`GET …/qr` mengembalikan **berkas gambar**, bukan JSON:

```
GET /api/admin/public-pages/{id}/qr?format=png&size=1200&download=true
GET /api/admin/public-pages/{id}/qr?format=svg
```

`POST …/qr` dengan `{ "rotateCode": true }` mengganti kode publikasi sekaligus — tautan lama mati,
versi QR bertambah, dan versi lama tetap tersimpan untuk audit.

### Formulir Dinamis

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/forms` | `form.view` / `form.manage` |
| `GET/DELETE /api/admin/forms/{id}` | `form.view` / `form.manage` |
| `PUT /api/admin/forms/{id}/fields` | `form.manage` |
| `POST /api/admin/forms/{id}/activate` | `form.manage` |

`PUT …/fields` menyimpan seluruh susunan sekaligus:

```json
{
  "fields": [
    { "key": "full_name", "label": "Nama Lengkap", "type": "TEXT", "isRequired": true },
    { "key": "layanan", "label": "Jenis Layanan", "type": "SELECT", "isRequired": true,
      "options": [{ "label": "Umum", "value": "umum" }] }
  ]
}
```

Tipe field: `TEXT TEXTAREA NUMBER PHONE EMAIL DATE DATETIME SELECT RADIO CHECKBOX FILE HIDDEN`.
Field yang dihapus melepas tautan dari jawaban lama (`formFieldId` menjadi `null`) sehingga riwayat
pengunjung tidak ikut hilang. Hanya satu formulir aktif per event.

### Antrean & Dashboard

| Endpoint | Fungsi |
|---|---|
| `GET /api/admin/queues?eventId=&date=&status=&queueTypeId=&search=&page=&perPage=` | Daftar antrean (live & riwayat) |
| `GET /api/admin/dashboard?eventId=&date=` | Ringkasan harian + volume per jam |

### Display

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/displays` | `display.view` / `display.manage` |
| `PATCH /api/admin/displays/{id}` | `display.manage` — ganti nama, template, atau jenis antrean |
| `DELETE /api/admin/displays/{id}` | `display.manage` |
| `POST /api/admin/displays/{id}/reset-pairing` | `display.manage` |
| `GET /api/display/{deviceCode}/state` | publik (dipakai layar) |
| `POST /api/display/{deviceCode}/pair` | publik, sekali per perangkat |

`GET /state` mengembalikan papan antrean, pengumuman aktif, template yang terpasang (bila ada),
serta peta `mediaById` dan `playlistById` berisi URL berkas yang dirujuk widget — sehingga layar
tidak perlu memanggil endpoint tambahan.

### Pengumuman

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/announcements` | `announcement.manage` |
| `PATCH/DELETE /api/admin/announcements/{id}` | `announcement.manage` |

Setiap perubahan menyiarkan `announcement.created` ke room event, jadi teks berjalan pada layar
langsung ikut berubah tanpa reload.

### Media Library

| Endpoint | Permission |
|---|---|
| `GET /api/admin/media` | `media.view` — filter `type` (IMAGE/VIDEO) & `search` |
| `POST /api/admin/media` | `media.manage` — `multipart/form-data` |
| `PATCH /api/admin/media/{id}` | `media.manage` — ubah nama |
| `DELETE /api/admin/media/{id}` | `media.manage` |
| `GET /media/**` | publik — berkas itu sendiri |

Unggahan memakai `multipart/form-data` dengan kolom:

| Kolom | Isi |
|---|---|
| `file` | berkas (wajib) |
| `name` | nama tampilan (opsional) |
| `durationSeconds` | durasi video, dibaca browser saat unggah (opsional) |

Tipe diperiksa dari **magic byte**, bukan nama berkas atau Content-Type: JPG, PNG, WEBP, MP4.
Batas bawaan 10 MB untuk gambar dan 200 MB untuk video (`MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_VIDEO_MB`).
Media yang masih dipakai widget atau playlist tidak bisa dihapus (`CONFLICT`).

### Playlist

| Endpoint | Permission |
|---|---|
| `GET/POST /api/admin/playlists` | `media.view` / `media.manage` |
| `PATCH/DELETE /api/admin/playlists/{id}` | `media.manage` |
| `PUT /api/admin/playlists/{id}/items` | `media.manage` — ganti seluruh isi sekaligus |

```json
{ "items": [{ "mediaId": "01M1…", "durationSeconds": 10 }] }
```

### Display Template (Display Builder)

| Endpoint | Permission |
|---|---|
| `GET /api/admin/display-templates` | `display.view` |
| `POST /api/admin/display-templates` | `display_template.manage` |
| `GET /api/admin/display-templates/{id}` | `display.view` |
| `PATCH/DELETE /api/admin/display-templates/{id}` | `display_template.manage` |
| `PUT /api/admin/display-templates/{id}/widgets` | `display_template.manage` |
| `POST /api/admin/display-templates/{id}/duplicate` | `display_template.manage` |

Kanvas acuan selalu 1920×1080; renderer menskalakannya ke ukuran layar sebenarnya.
`PUT …/widgets` menyimpan seluruh tata letak sekaligus dan menyuruh perangkat yang memakai template
tersebut memuat ulang:

```json
{
  "widgets": [
    {
      "type": "CURRENT_QUEUE", "x": 120, "y": 200, "width": 900, "height": 500, "zIndex": 1,
      "config": { "queueTypeId": "01M1…", "showCounter": true },
      "style": { "color": "#ffffff", "backgroundColor": "#0f172a", "fontSize": 180, "align": "center" },
      "isVisible": true
    }
  ]
}
```

Tipe widget: `CURRENT_QUEUE QUEUE_LIST CLOCK DATE LOGO IMAGE VIDEO TEXT RUNNING_TEXT ANNOUNCEMENT
ORG_NAME QRCODE PLAYLIST`. Widget bertipe media/playlist merujuk berkas lewat `mediaId` / `playlistId`.
Template yang masih dipakai perangkat tidak bisa dihapus (`CONFLICT`).

---

## Rate Limit

Berbasis IP, in-memory (ganti ke Redis saat multi-instance).

| Cakupan | Batas |
|---|---|
| Ambil antrean publik | `RATE_LIMIT_MAX` (default 20) / `RATE_LIMIT_WINDOW_MS` (default 60 dtk) |
| Baca halaman publik | 120 / menit |
| Lacak antrean | 240 / menit |
| State display | 300 / menit |
| Pairing display | 10 / menit |
| Kirim testimoni | 10 / menit |
| Autofill formulir | 15 / menit |
| Uji koneksi sumber data | 20 / menit (walau jalur admin — memicu permintaan keluar) |
| Endpoint auth | 30 / menit (bawaan Better Auth) |

Respons menyertakan `X-RateLimit-Limit` dan `X-RateLimit-Remaining`.

Selain rate limit, tiap halaman publik punya `maxPerIpPerDay` (batas jumlah antrean per perangkat per hari)
yang dapat diatur admin; `0` berarti tanpa batas.

### Analytics, Laporan & Ekspor

| Endpoint | Permission |
|---|---|
| `GET /api/admin/analytics?eventId=&from=&to=&queueTypeId=&operatorId=` | `analytics.view` / `report.view` |
| `GET /api/admin/reports/daily?eventId=&date=` | `report.view` |
| `GET/POST /api/admin/exports` | `report.export` |
| `GET /api/admin/exports/{id}/download` | `report.export` / `report.view` |
| `DELETE /api/admin/exports/{id}` | `report.export` |
| `GET /api/admin/audit-logs?action=&entity=&userId=&search=&page=` | `audit.view` |

Rentang bawaan analytics adalah 30 hari terakhir. Seluruh pengelompokan tanggal dan jam memakai
timezone **event** (`CONVERT_TZ`), bukan UTC — grafik per jam akan bergeser bila tidak.

`POST /api/admin/exports` mengantrekan pekerjaan dan langsung membalas `202`; pemrosesan berjalan di
latar belakang (§38), jadi rentang tanggal panjang tidak membuat permintaan HTTP menggantung.

```json
{ "type": "QUEUES", "format": "XLSX", "eventId": "01M1…", "from": "2026-08-01", "to": "2026-09-06" }
```

| Field | Nilai |
|---|---|
| `type` | `QUEUES` · `VISITORS` · `OPERATORS` |
| `format` | `CSV` (BOM UTF-8, ramah Excel) · `XLSX` |

Status pekerjaan: `QUEUED` → `PROCESSING` → `DONE` / `FAILED`. Setelah `DONE`, unduh lewat
`GET …/download` yang mengembalikan berkas, bukan amplop JSON.

Laporan harian tersedia sebagai halaman siap cetak di `/admin/reports` — cetak lewat peramban untuk
menghasilkan PDF; sisa antarmuka disembunyikan oleh aturan `@media print`.

### Pengunjung

| Endpoint | Permission |
|---|---|
| `GET /api/admin/visitors?eventId=&search=&queueTypeId=&from=&to=&page=` | `visitor.view` |
| `GET /api/admin/visitors/{id}` | `visitor.view` |

Pencarian menyapu nama, nomor HP, email, nomor identitas, sekaligus nomor antrean. Rinciannya memuat
jawaban formulir (diberi label dari definisi field yang masih ada) beserta seluruh riwayat antrean.

### Rating & Testimoni

| Endpoint | Permission |
|---|---|
| `GET /api/admin/testimonials?eventId=&status=&rating=&from=&to=&search=&page=` | `feedback.view` |
| `PATCH /api/admin/testimonials/{id}` | `feedback.moderate` |
| `DELETE /api/admin/testimonials/{id}` | `feedback.moderate` |

`status` menerima `all` · `approved` · `pending`. Respons daftar menyertakan `summary`:

```json
{ "total": 42, "pending": 3, "average": 4.6, "byRating": { "5": 30, "4": 8 }, "satisfactionRate": 90 }
```

Ekspor testimoni memakai pusat ekspor dengan `type: "TESTIMONIALS"`.

### Integrasi Sumber Data

| Endpoint | Permission |
|---|---|
| `GET /api/admin/data-sources` | `integration.view` |
| `POST /api/admin/data-sources` | `integration.manage` |
| `GET/PATCH/DELETE /api/admin/data-sources/{id}` | `integration.view` / `integration.manage` |
| `POST /api/admin/data-sources/{id}/test` | `integration.manage` |
| `PATCH /api/admin/forms/{id}` (menyambungkan `dataSourceId`) | `form.manage` |

```json
{
  "name": "SIMRS Pasien",
  "type": "REST",
  "baseUrl": "https://simrs.contoh.id/api/patient/{lookup}",
  "httpMethod": "GET",
  "authType": "API_KEY",
  "credentials": { "authType": "API_KEY", "in": "header", "name": "X-API-Key", "value": "…" },
  "queryTemplate": { "lookupFieldKey": "no_rm", "rootPath": "data", "query": {}, "body": {} },
  "timeoutMs": 5000,
  "mappings": [
    { "sourcePath": "patient.name", "targetFieldKey": "nama_lengkap", "transform": "capitalize" }
  ]
}
```

- `{lookup}` pada URL maupun parameter diganti nilai yang diketik pengunjung.
- `transform`: `none` · `trim` · `uppercase` · `lowercase` · `capitalize` · `digits` · `date`.
- **Kredensial tidak pernah dikembalikan.** Respons hanya memuat `hasCredentials: true`.
  Mengirim PATCH tanpa field `credentials` mempertahankan kredensial lama.
- Permintaan keluar dijaga: skema wajib http/https, alamat internal ditolak, redirect tidak diikuti,
  ada batas waktu, dan ukuran respons dipotong. Lihat `server/utils/ssrf.ts`.

### Pengaturan Sistem

| Endpoint | Permission |
|---|---|
| `GET /api/admin/settings` | `setting.view` |
| `PUT /api/admin/settings` | `setting.manage` |
| `POST /api/admin/settings/reset` | `setting.manage` |

Katalognya ada di `shared/constants/settings.ts` dan dipakai bersama server & antarmuka.
Kunci di luar katalog diabaikan; angka dijepit ke rentangnya.

```json
{ "values": { "queue.recallLimit": 3, "feedback.ratingEnabled": true } }
```

Sebagian kunci bisa ditimpa per event lewat `events.settings` (`recallLimit`, `maxWaitingPerType`,
`ratingEnabled`, `voiceEnabled`, `voiceLanguage`) — diatur dari halaman detail event.

### Role & Izin

| Endpoint | Permission |
|---|---|
| `GET /api/admin/roles` | `role.manage` / `user.view` |
| `POST /api/admin/roles` | `role.manage` |
| `PATCH /api/admin/roles/{id}` | `role.manage` |
| `DELETE /api/admin/roles/{id}` | `role.manage` |

Role bawaan tidak bisa dihapus atau diganti namanya; izinnya masih boleh disesuaikan kecuali
SUPERADMIN, yang memang melewati seluruh pemeriksaan izin. Role kustom hanya bisa dihapus bila tidak
ada pengguna yang memakainya. Perubahan izin membuang cache konteks auth sehingga langsung berlaku.

### Penjadwal

| Endpoint | Permission |
|---|---|
| `POST /api/admin/scheduler/run` | `event.control` |

Menjalankan satu putaran penyelarasan status event dengan jadwalnya (§10) sekarang juga. Penjadwal
sendiri berjalan tiap menit di dalam proses; endpoint ini untuk penyelarasan seketika dan pengujian.
Operasinya idempoten.
