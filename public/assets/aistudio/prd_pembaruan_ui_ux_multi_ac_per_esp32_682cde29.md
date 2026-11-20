# Product Requirements Document (PRD) — Pembaruan Desain UI/UX
## Dukungan Arsitektur 1 ESP32 ke Banyak AC (Multi-AC & Multi-Channel IR TX)

| Atribut | Detail |
| :--- | :--- |
| **Versi Dokumen** | 1.1 (Addendum Pembaruan dari `prd_ui_ux_smart_ac.md`) |
| **Tanggal** | 19 November 2026 |
| **Fokus Pembaruan** | Hierarki Hub ESP32 $\rightarrow$ Multi-AC, Pemilih Channel/Pin IR TX, Kontrol Massal, & UX Edge Case |

---

## 1. Perubahan Hierarki Informasi di Dashboard (`/dashboard`)

Sebelumnya, satu kartu ESP32 diasumsikan berpasangan erat dengan satu atau sedikit perangkat. Dengan arsitektur **1 ESP32 sebagai Hub untuk banyak AC**, tampilan Dashboard diperbarui menjadi pola **Hub-and-Spoke Container**:

* **Header Kartu Hub ESP32:**
  * Menampilkan nama lokasi/hub (misal: *"ESP32 Hub — Lantai 2"*), *badge* status (**Online/Offline**), dan ringkasan telemetri DHT22 (`25.4`$^\circ\text{C}$ | `62%`).
  * **Quick Bulk Action:** Tombol aksi cepat di pojok kanan header hub: **"Matikan Semua AC"** (*All OFF*) dengan dialog konfirmasi ringan untuk mematikan seluruh AC di bawah ESP32 tersebut secara berurutan.
* **Sub-Grid Kartu Perangkat (Appliances) di Dalam Hub:**
  * Di bawah header hub, tampilkan *responsive grid* (`1 kolom` di mobile, `2–3 kolom` di desktop) berisi kartu-kartu AC/Kipas yang terhubung.
  * Setiap sub-kartu menampilkan:
    * Nama AC (misal: *"AC Ruang Meeting"*) & Merek (`Daikin`).
    * *Badge* Channel kecil (misal: `CH 1 · GPIO 23` — hanya ditampilkan jika ESP32 memiliki $\ge 2$ channel aktif agar tampilan tetap bersih).
    * Status daya (*Quick Power Toggle*), suhu target saat ini, dan tombol masuk ke **Universal AC Controller**.
  * Tombol **"+ Tambah AC ke Hub Ini"** diletakkan sebagai kartu *dashed border* di akhir sub-grid.

---

## 2. Pembaruan Automatic Device Scanner (`/scanner`)

Agar proses *scanning* dan pengujian *bruteforce* tidak menembak ke arah AC yang salah saat memakai rangkaian *Multi-Channel IR TX*:

* **Step 1 — Pilih Hub ESP32 & IR Output Channel:**
  * Setelah memilih unit ESP32 yang *Online*, muncul pemilih **IR Output Channel** (*Segmented Control* atau *Dropdown*):
    * `Channel 1 (GPIO 23)` — *Default / Shared IR Blaster*
    * `Channel 2 (GPIO 25)` — *Dedicated Emitter*
    * `Channel 3 (GPIO 26)` — *Dedicated Emitter*
    * `Channel 4 (GPIO 27)` — *Dedicated Emitter*
  * Sertakan teks bantuan (*helper text*) ringkas: *"Biarkan di Channel 1 jika Anda menggunakan 1 IR Blaster bersama untuk merek AC yang berbeda. Pilih channel khusus jika menggunakan kabel emitter terpisah untuk AC bermerek sama."*
* **Step 2 & Step 3 (Pengujian & Simpan):**
  * Menampilkan indikator aktif selama proses pengujian, contoh: *"Menguji profil Daikin #3 melalui Channel 2 (GPIO 25)..."*.
  * Channel yang terpilih otomatis tersimpan ke konfigurasi perangkat AC pada tahap akhir.

---

## 3. Pembaruan Device Management (`/devices`)

* **Tampilan Nested / Accordion:**
  * Daftar perangkat dikelompokkan berdasarkan **ESP32 Hub** (dapat di-*expand*/*collapse*) sehingga pengguna langsung melihat jumlah total AC yang ditangani oleh tiap ESP32 (contoh: *"ESP32 Kantor — 4 Perangkat Terhubung"*).
* **Form Tambah / Edit Perangkat AC:**
  * Menambahkan input **IR Output Channel (`ir_tx_pin`)** agar pengguna bisa memindahkan atau memperbaiki alokasi pin IR tanpa harus menghapus perangkat.
  * Menampilkan indikator peringatan lembut (*non-blocking warning*) jika pengguna memilih **merek/protokol yang sama** pada **pin `ir_tx_pin` yang sama** di satu ESP32:
    > *"Peringatan: Sudah ada AC bermerek Daikin di GPIO 23. Mengontrol AC ini mungkin ikut memicu AC tersebut jika berada dalam satu jangkauan IR. Pertimbangkan menggunakan Channel/GPIO berbeda."*

---

## 4. Penanganan UX Edge Cases (Multi-AC)

* **Antrean Perintah Massal (Bulk Command Feedback):**
  * Saat pengguna menekan **"Matikan Semua AC"**, setiap kartu AC yang terdampak menampilkan animasi *loading* halus secara berurutan (*staggered status*) sesuai urutan eksekusi antrean oleh ESP32 agar pengguna tahu sistem sedang memproses satu per satu tanpa bentrok sinyal IR.
* **Status Hybrid Sync pada Merek Duplikat:**
  * Jika dalam 1 ESP32 terdapat $\ge 2$ AC dengan **protokol IR identik** (misal: 2 unit AC Panasonic di ruangan yang sama), tampilkan *info badge* kecil pada halaman Controller: *"Sinkronisasi Remote Fisik Dinonaktifkan (Protokol Ganda)"* dengan *tooltip* penjelasan bahwa sensor penerima VS1838B tidak dapat membedakan remote fisik mana yang ditekan jika protokolnya sama persis.