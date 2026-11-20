# Product Requirements Document (PRD) — Desain UI/UX
## Sistem Kontrol & Monitoring AC Universal Berbasis IoT

| Atribut | Detail |
| :--- | :--- |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 19 November 2026 |
| **Gaya Desain** | Clean, Modern, Minimalis, Interaktif (*Micro-interactions*), Profesional |
| **Rekomendasi UI Stack** | Tailwind CSS, shadcn/ui (Radix Primitives), Framer Motion (Animasi), Lucide React (Ikon) |

---

## 1. Filosofi & Prinsip Desain

1. **Tactile & Instant Feedback (Optimistic UI):** Karena perintah ke ESP32 bersifat *asynchronous* (antrean Supabase), antarmuka harus langsung merespons klik pengguna secara visual (*optimistic update*) sambil menampilkan indikator halus (*sending/pending*) hingga ESP32 mengonfirmasi eksekusi (`executed`).
2. **Clarity Over Clutter:** Fokus pada informasi paling krusial—suhu ruangan saat ini, status koneksi ESP32, dan kontrol utama AC—dengan ruang kosong (*whitespace*) yang lega.
3. **Mobile-First, Desktop-Ready:** Pengalaman di *smartphone* harus terasa seperti aplikasi *smart home* native (nyaman dioperasikan dengan satu ibu jari), sementara di desktop menampilkan visibilitas multi-ruangan dan riwayat secara bersamaan.
4. **Purposeful Motion:** Animasi menggunakan *spring physics* yang halus untuk memberi konteks perubahan status (misal: transisi suhu, gelombang radar saat *scanning* IR, dan perubahan warna tema saat mode AC berubah), bukan sekadar hiasan.

---

## 2. Design System (Identitas Visual)

### 2.1 Palet Warna (Mendukung Light & Dark Mode)
Menggunakan warna dasar netral yang bersih dengan aksen dinamis yang merepresentasikan kondisi termal dan mode AC.

| Peran Warna | Light Mode | Dark Mode (Default Rekomendasi IoT) | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Background Utama** | `#F8FAFC` (Slate 50) | `#09090B` (Zinc 950) | Latar belakang kanvas halaman |
| **Surface / Card** | `#FFFFFF` (Pure White) | `#18181B` (Zinc 900) | Kartu perangkat, panel kontrol, modal |
| **Border / Divider** | `#E2E8F0` (Slate 200) | `#27272A` (Zinc 800) | Garis pemisah tipis (`1px`) |
| **Teks Utama** | `#0F172A` (Slate 900) | `#FAFAFA` (Zinc 50) | Judul, angka suhu, label utama |
| **Teks Sekunder** | `#64748B` (Slate 500) | `#A1A1AA` (Zinc 400) | Timestamp, subjudul, metadata |
| **Status: Online** | `#10B981` (Emerald 500) | `#34D399` (Emerald 400) | Indikator ESP32 aktif |
| **Status: Offline** | `#EF4444` (Rose 500) | `#F87171` (Rose 400) | Indikator ESP32 terputus |
| **Mode: Cool** | `#0EA5E9` (Sky 500) | `#38BDF8` (Sky 400) | Aksen tombol & *glow* saat mode Cool |
| **Mode: Dry** | `#F59E0B` (Amber 500) | `#FBBF24` (Amber 400) | Aksen saat mode Dry |
| **Mode: Auto** | `#6366F1` (Indigo 500) | `#818CF8` (Indigo 400) | Aksen saat mode Auto |

### 2.2 Tipografi
* **Font UI Utama:** `Plus Jakarta Sans` atau `Inter` — bersih, geometris, dan sangat terbaca di layar kecil.
* **Font Angka / Telemetri:** Wajib mengaktifkan `tabular-nums` (`font-variant-numeric: tabular-nums`) pada seluruh angka suhu (°C), kelembapan (%), dan jam agar angka tidak bergeser (*jitter*) saat nilai berubah secara *real-time*.

### 2.3 Elevasi & Bentuk
* **Border Radius:** `16px` (`rounded-2xl`) untuk kartu utama, `12px` (`rounded-xl`) untuk tombol/input, dan `9999px` (`rounded-full`) untuk *pill badges* dan tombol daya.
* **Glassmorphism Halus:** Digunakan pada *navigation bar* dan *modal overlay* (`backdrop-blur-md bg-white/80 dark:bg-zinc-900/80`).

---

## 3. Arsitektur Informasi & Navigasi

* **Desktop ($\ge$ 1024px):** *Top Navigation Bar* yang ramping dan bersih (Logo di kiri; menu `Dashboard`, `Devices`, `Scanner`, `History` di tengah; Toggle Light/Dark Mode & Profil User di kanan) agar area konten memiliki lebar penuh tanpa *sidebar* yang memakan ruang.
* **Mobile ($<$ 1024px):** *Floating Bottom Navigation Bar* dengan 4 ikon utama (`Dashboard`, `Control`, `Scanner`, `Devices`) untuk akses cepat satu tangan.

---

## 4. Spesifikasi UI/UX Per Halaman

### A. Halaman Autentikasi (Login & Register)
* **Layout:** Kartu terpusat (*centered card*) dengan latar belakang *subtle radial gradient* yang bergerak sangat lambat.
* **Elemen:** Input Email & Password dengan validasi *inline*, tombol *submit* dengan *loading spinner*, serta pesan *error* yang ramah jika kredensial salah.

### B. Dashboard Monitoring (`/dashboard`)
* **Header Ringkasan:** Sapaan singkat + tombol aksi cepat **"+ Tambah Perangkat / Scan"**.
* **Grid Kartu Ruangan / ESP32:** Setiap unit ESP32 ditampilkan sebagai kartu modern berisi:
  * Nama lokasi (misal: "Kamar Utama") dan *badge* status (**Online** dengan titik hijau berdenyut / **Offline** abu-abu/merah).
  * **Telemetri DHT22:** Angka suhu ruangan besar (misal `25.4°C`) dan kelembapan (`62%`) dilengkapi *mini sparkline chart* tren suhu 6 jam terakhir.
  * **Quick Toggle AC:** Daftar mini AC yang terhubung ke ESP32 tersebut dengan tombol *Power ON/OFF* langsung dan suhu target. Klik kartu untuk masuk ke halaman **Universal AC Controller**.
* **Panel Aktivitas Terbaru (Feed):** Daftar kronologis 5–10 aktivitas terakhir (kontrol dari Web, sinkronisasi dari Remote Fisik dengan ikon khusus, atau hasil *scanning*).

### C. Universal AC Controller (`/control/[applianceId]`)
Halaman inti yang dirancang menyerupai termostat pintar kelas premium:
* **Dynamic Ambient Glow:** Latar belakang di balik dial suhu memancarkan gradasi cahaya lembut yang berubah warna sesuai mode aktif (Biru untuk *Cool*, Kuning/Amber untuk *Dry*, Ungu untuk *Auto*, dan redup saat *OFF*).
* **Kontrol Suhu Utama:** *Circular Temperature Dial* (bisa digeser/drag) dipadukan dengan tombol besar **`-`** dan **`+`** di sisi kiri/kanan untuk presisi cepat (rentang `16°C – 30°C`).
* **Tombol Power Utama:** Tombol melingkar tegas dengan efek *inner shadow* saat mati dan *outer glow* saat menyala.
* **Grid Kontrol Parameter:**
  * **Mode Selector:** *Segmented Pill Control* (`Cool`, `Dry`, `Auto`) dengan indikator latar belakang yang bergeser mulus (*sliding tab*).
  * **Fan Speed:** 4 tingkat (`Auto`, `Low`, `Med`, `High`) dengan ikon kipas yang kecepatan putarannya menyesuaikan level.
  * **Swing:** Tombol *toggle* interaktif dengan animasi sirip ayun.
* **Status Sinkronisasi Realtime:** *Pill* status kecil di bagian atas (misal: *"Mengirim ke ESP32..."* $\rightarrow$ *"Terkonfirmasi • Baru saja"* atau *"Diubah via Remote Fisik"*).

### D. Automatic Device Scanner (`/scanner`)
Menggunakan antarmuka **Step-by-Step Wizard** yang bersih agar pengguna tidak bingung:
* **Step 1 — Pilih ESP32 Target:** Memilih unit ESP32 yang sedang *Online* di ruangan tersebut.
* **Step 2 — Pilih Metode Identifikasi (3-Tier Tabs):**
  * **Tab 1: Auto-Detect Remote (Disarankan):** Menampilkan animasi gelombang radar/sinyal IR yang sedang mendengarkan. Instruksi jelas: *"Arahkan remote asli AC ke sensor ESP32 dan tekan tombol apa saja."* Begitu terdeteksi, muncul animasi *check-mark* beserta nama protokol (misal: `DAIKIN`).
  * **Tab 2: Smart Bruteforce (Tanpa Remote):** Pengguna memilih merek AC dari grid logo/nama merek. Sistem menampilkan *progress bar* pengujian (`Menguji profil 3 dari 12...`) dan satu tombol besar berwarna hijau mencolok: **"AC Berbunyi 'Bip'! Simpan Profil Ini"**.
  * **Tab 3: Scan Wi-Fi Lokal (mDNS/OUI):** Animasi pemindaian jaringan lokal yang menampilkan daftar perangkat Smart AC yang ditemukan (jika ada) untuk otomatis merekomendasikan merek di Tab 2.
* **Step 3 — Uji Coba & Simpan:** Mini-panel uji coba tombol Power & Suhu untuk memastikan AC merespons dengan benar, lalu input nama perangkat (misal: "AC Ruang Kerja") dan simpan.

### E. Device & Multi-ESP32 Management (`/devices`)
* **Daftar ESP32:** Menampilkan tabel/kartu manajemen hardware lengkap dengan MAC Address, waktu `last_seen`, dan jumlah perangkat terhubung.
* **Manajemen Token:** Fitur *masked token* (`esp_tok_••••••••`) dengan tombol *Copy* dan opsi *Regenerate Token* (dilengkapi dialog konfirmasi).
* **CRUD Perangkat:** Modal *slide-over* atau dialog untuk mengubah nama perangkat, memindahkan perangkat ke ESP32 lain, atau menghapus perangkat (*Danger Zone*).

---

## 5. Spesifikasi Animasi & Micro-interactions (Framer Motion)

| Elemen / Interaksi | Jenis Animasi | Durasi & Easing | Tujuan UX |
| :--- | :--- | :--- | :--- |
| **Perubahan Angka Suhu** | *Vertical Slide & Fade* (seperti *odometer*) | `200ms`, *Spring* (`stiffness: 300, damping: 25`) | Memberi kesan mekanis yang responsif saat menaikkan/menurunkan suhu. |
| **Perpindahan Tab / Mode** | `layoutId` *Shared Element Transition* | `250ms`, *Spring* | Latar belakang *pill* bergeser mulus antar pilihan mode AC. |
| **Status ESP32 Online** | *Continuous Ping / Pulse* | `2s`, *Ease-in-out*, *Infinite* | Menegaskan koneksi *real-time* sedang aktif secara visual. |
| **IR Learning / Wi-Fi Scan** | *Concentric Radar Ripple* | `1.8s`, *Ease-out*, *Infinite* | Memberi umpan balik bahwa hardware sedang aktif mendengarkan sinyal. |
| **Tombol ditekan (Tactile)** | `whileTap={{ scale: 0.96 }}` | `100ms` | Memberikan sensasi tombol fisik remote. |
| **Transisi Halaman / Modal** | *Fade + Subtle Y-Offset* (`y: 8 -> 0`) | `220ms`, `easeOut` | Transisi antar halaman terasa ringan dan tidak kaku. |

---

## 6. Penanganan Edge Cases & UX States

* **ESP32 Offline:** Seluruh tombol kontrol AC pada ESP32 tersebut otomatis masuk ke mode *disabled* (opacity 50%) dengan *banner* peringatan halus di atas panel: *"ESP32 sedang Offline (Terakhir aktif 5 menit lalu). Kontrol dinonaktifkan."*
* **Command Timeout ($>$ 5 detik):** Jika status perintah di Supabase masih `pending` lebih dari 5 detik, tampilkan *toast notification* peringatan (*"ESP32 tidak merespons, periksa koneksi Wi-Fi perangkat"*) dan kembalikan tampilan UI ke *state* sebelumnya (*rollback*).
* **Empty State:** Jika pengguna baru belum mendaftarkan ESP32 atau AC, tampilkan ilustrasi minimalis yang bersih dengan satu tombol CTA utama menuju *Setup Wizard*.
* **Skeleton Loading:** Gunakan *shimmer skeleton* yang presisi mengikuti bentuk kartu dashboard saat data awal dimuat dari Supabase agar tidak terjadi *layout shift* (CLS).