# Product Requirements Document (PRD)
## Sistem Kontrol & Monitoring AC Universal Berbasis IoT (ESP32 + Next.js + Supabase)

| Atribut | Detail |
| :--- | :--- |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 19 November 2026 |
| **Status** | Draft Final / Siap Pengembangan |
| **Tech Stack Utama** | Next.js (TypeScript), Supabase (PostgreSQL, Auth, Realtime), Vercel, ESP32 |

---

## 1. Ringkasan Eksekutif

### 1.1 Latar Belakang & Masalah
Sebagian besar perangkat pendingin ruangan (AC) dan kipas angin konvensional hanya menggunakan kontrol inframerah (IR) satu arah (*one-way*) tanpa konektivitas internet. Pengguna sering mengalami kendala seperti lupa mematikan AC saat bepergian, remote fisik hilang/rusak, atau tidak dapat memantau suhu ruangan secara *real-time*. Selain itu, perangkat *smart IR blaster* komersial sering kali memiliki proses *pairing* yang rumit dan terkunci pada ekosistem tertutup.

### 1.2 Solusi
Membangun sistem IoT *end-to-end* yang menghubungkan modul hardware **ESP32** (dilengkapi IR Receiver VS1838B, IR Transmitter 940nm, dan sensor suhu DHT22) dengan aplikasi web modern berbasis **Next.js** dan **Supabase**. Sistem ini menyediakan fitur **Automatic Device Scanner** multi-metode untuk mengenali protokol AC secara otomatis, **Universal AC Controller** berbasis web, serta **Dashboard Monitoring** suhu ruangan dan status perangkat secara *real-time*.

---

## 2. Tujuan & Metrik Keberhasilan (KPIs)

| Kategori | Metrik | Target Keberhasilan |
| :--- | :--- | :--- |
| **Latensi Kontrol** | Waktu dari klik tombol di web hingga IR ditembakkan ESP32 | $\le$ 2 detik |
| **Akurasi Scanner** | Tingkat keberhasilan identifikasi protokol AC (Tier 1 & Tier 2) | $\ge$ 95% merek AC umum (Daikin, Sharp, Panasonic, LG, Gree, Samsung) |
| **Reliabilitas Hardware** | Akurasi deteksi status Online/Offline ESP32 | Deteksi *offline* maksimal dalam 90 detik |
| **Efisiensi Database** | Pertumbuhan data log telemetri per perangkat per hari | $\le$ 288 baris/hari (interval pencatatan 5 menit) |
| **Jangkauan IR** | Jarak efektif pancaran IR LED 940nm ke unit AC | 5 – 8 meter (dengan rangkaian driver transistor NPN) |

---

## 3. Target Pengguna (User Personas)

1. **Pengguna Rumah Tangga / Kos:** Ingin mengontrol AC dari jarak jauh sebelum sampai di rumah, mematikan AC yang lupa dimatikan, dan memantau suhu ruangan.
2. **Pengelola Ruangan / Kantor Kecil:** Mengelola beberapa unit ESP32 di ruangan berbeda dalam satu dashboard terpusat untuk efisiensi energi.

---

## 4. Arsitektur Sistem & Spesifikasi Teknis

### 4.1 Tech Stack
| Lapisan | Teknologi | Fungsi Utama |
| :--- | :--- | :--- |
| **Frontend** | Next.js (App Router) + TypeScript + Tailwind CSS | Antarmuka dashboard, remote universal, dan wizard scanner |
| **Backend API** | Next.js API Routes (Serverless) | Validasi token perangkat, manajemen perintah, dan logika bisnis |
| **Hosting** | Vercel | Deployment aplikasi web dan API Routes |
| **Database** | Supabase PostgreSQL | Penyimpanan relasional perangkat, konfigurasi IR, dan riwayat |
| **Auth** | Supabase Auth | Autentikasi pengguna (Email/Password) |
| **Realtime** | Supabase Realtime | Sinkronisasi status perangkat, suhu, dan eksekusi perintah |
| **Hardware** | ESP32 DevKit | Pemrosesan logika lokal, RMT IR transceiver, dan koneksi Wi-Fi |
| **Sensor & Aktuator** | VS1838B (IR RX), IR LED 940nm + Transistor NPN (IR TX), DHT22 | Penerima sinyal remote, pemancar sinyal AC, sensor suhu/kelembapan |

### 4.2 Pemetaan Pin Hardware (ESP32 Safe Pinout)
Untuk menghindari konflik *strapping pins* dan gangguan saat Wi-Fi aktif, konfigurasi pin ditetapkan sebagai berikut:
* **DHT22 (Data):** `GPIO 21` (dengan resistor *pull-up* 10k$\Omega$ jika menggunakan sensor polos 4-pin).
* **VS1838B (IR Receiver OUT):** `GPIO 18` (VCC ke 3.3V, GND ke GND).
* **IR LED 940nm (IR Transmitter):** `GPIO 23` $\rightarrow$ Resistor 220$\Omega$–1k$\Omega$ $\rightarrow$ Base Transistor NPN (2N2222 / S8050) $\rightarrow$ Collector ke Katoda LED IR, Anoda LED IR ke 5V/VIN (melalui resistor pengaman 100$\Omega$), Emitter ke GND.

### 4.3 Pola Komunikasi (Asynchronous Command Queue)
Karena Vercel memiliki batas *timeout* eksekusi *serverless*, komunikasi antara web dan ESP32 **tidak boleh sinkron**:
1. Pengguna menekan tombol kontrol di Next.js $\rightarrow$ `INSERT` ke tabel `device_commands` (`status: 'pending'`).
2. ESP32 menerima perintah baru via Supabase Realtime / *short-polling* $\rightarrow$ mengeksekusi sinyal IR menggunakan *class* `IRac` (library `IRremoteESP8266`) $\rightarrow$ `UPDATE` status perintah menjadi `'executed'` atau `'failed'`.
3. UI Next.js mendengarkan perubahan via Supabase Realtime dan langsung memperbarui tampilan status AC.

---

## 5. Persyaratan Fungsional (Functional Requirements)

### Modul A: Autentikasi & Keamanan
* **FR-A1:** Pengguna dapat mendaftar, login, dan logout menggunakan Supabase Auth.
* **FR-A2:** Setiap pengguna hanya dapat melihat dan mengontrol perangkat ESP32 dan AC miliknya sendiri (diterapkan melalui *Row Level Security* di PostgreSQL).
* **FR-A3:** Setiap ESP32 memiliki `device_token` unik yang di-hash di database untuk autentikasi ke Next.js API Route (dilarang menanam `SUPABASE_SERVICE_ROLE_KEY` di firmware ESP32).

### Modul B: Dashboard Monitoring
* **FR-B1 (Status Online/Offline):** Menampilkan status koneksi setiap ESP32 berdasarkan mekanisme *heartbeat* (tiap 30–60 detik). Jika selisih waktu saat ini dengan `last_seen` $>$ 90 detik, status otomatis tampil **Offline**.
* **FR-B2 (Monitoring Suhu & Kelembapan):** Menampilkan suhu ($^\circ\text{C}$) dan kelembapan (%) ruangan secara *real-time* dari sensor DHT22 pada masing-masing ESP32.
* **FR-B3 (Ringkasan Perangkat):** Menampilkan daftar perangkat AC/Kipas yang terhubung pada tiap ESP32 beserta status daya terakhir (ON/OFF dan suhu target).
* **FR-B4 (Aktivitas Scanning & Riwayat Kontrol):** Menampilkan log aktivitas pemindaian terakhir serta riwayat perintah kontrol AC (waktu, perintah, sumber: Web/Remote Fisik, dan status eksekusi).

### Modul C: Automatic Device Scanner (3-Tier Identification)
* **FR-C1 (Tier 1 – IR Auto-Detect / Learning):** Pengguna mengarahkan remote fisik AC ke VS1838B dan menekan satu tombol. ESP32 men-decode protokol (misal: `DAIKIN`, `GREE`, `PANASONIC_AC`) dan mengirimkannya ke Supabase.
* **FR-C2 (Tier 2 – Smart Bruteforce Wizard):** Pengguna memilih merek AC di web. Sistem mengirim daftar kandidat protokol ke ESP32 satu per satu (interval 3 detik) untuk menembakkan sinyal *Power ON*. Pengguna menekan **"AC Merespons"** saat AC berbunyi "bip".
* **FR-C3 (Tier 3 – Wi-Fi / mDNS & OUI Lookup):** ESP32 memindai jaringan lokal (mDNS/ARP) untuk mendeteksi MAC Address (OUI) atau *hostname* Smart AC berbasis Wi-Fi guna merekomendasikan merek otomatis di Tier 2.

### Modul D: Universal AC Controller & Hybrid Sync
* **FR-D1 (Kontrol Penuh AC):** Power (ON/OFF), Temperature (16$^\circ\text{C}$–30$^\circ\text{C}$), Mode (Cool, Dry, Auto), Fan Speed (Auto, Low, Medium, High), dan Swing (ON/OFF).
* **FR-D2 (Full-State Payload):** Setiap perubahan satu parameter mengirimkan keseluruhan *state* AC dalam format JSON ke ESP32.
* **FR-D3 (Hybrid State Sync):** Saat AC dikontrol menggunakan remote fisik, VS1838B menangkap sinyal, men-decode *state* baru, dan memperbarui `current_state` di Supabase agar dashboard web tetap sinkron.

### Modul E: Device & Multi-ESP32 Management
* **FR-E1:** Pengguna dapat mendaftarkan banyak unit ESP32 dan mengelola beberapa perangkat (AC/Kipas) di bawah satu ESP32.
* **FR-E2:** Pengguna dapat menambah, mengubah nama, mengedit konfigurasi protokol IR, dan menghapus perangkat.

---

## 6. Roadmap Pengembangan (Milestones)

| Fase | Fokus Pekerjaan | Deliverable Utama |
| :--- | :--- | :--- |
| **Fase 1: Fondasi & Database** | Setup Next.js, Supabase Auth, skema SQL + RLS, dan setup hardware ESP32. | Skema DB aktif, Auth jalan, rangkaian ESP32 teruji lokal. |
| **Fase 2: Firmware & Komunikasi** | Firmware ESP32 (DHT22, *heartbeat*, RMT IR TX/RX) dan Next.js API Routes. | ESP32 mengirim suhu & menerima perintah IR dari Supabase. |
| **Fase 3: Core UI & Controller** | Dashboard Monitoring, Device Management, dan Universal AC Controller UI. | Kontrol AC penuh via web + status Online/Offline berfungsi. |
| **Fase 4: Automatic Scanner & Polish** | 3-Tier Device Scanner, Hybrid Sync, dan deployment ke Vercel. | Sistem lengkap siap digunakan di lingkungan produksi. |