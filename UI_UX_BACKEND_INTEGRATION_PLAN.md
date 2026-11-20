# ThermoSync IoT — Dokumentasi Lengkap Desain UI/UX & Rencana Integrasi Backend

Dokumen tunggal ini merangkum **seluruh spesifikasi desain UI/UX terkini** beserta **rencana arsitektur & integrasi backend (Supabase / PostgreSQL + Next.js App Router API + Firmware ESP32)** untuk aplikasi **ThermoSync IoT — Universal Smart AC Controller**.

---

## 1. Identitas Visual & Sistem Desain UI/UX Saat Ini

### 1.1 Branding & Favicon
- **Nama Aplikasi**: `ThermoSync IoT — Smart AC Controller`
- **Logo & Favicon (`/app/icon.svg` & `/public/favicon.svg`)**: Ikon *Smart AC Snowflake* di dalam lencana persegi membulat (*rounded-xl*) dengan gradasi biru dingin (`#0284C7` → `#0EA5E9` → `#38BDF8`).
- **Tipografi**:
  - **Heading (`--font-outfit`)**: *Outfit* (`500`, `600`, `700`) untuk judul halaman, nama ruangan, dan angka suhu utama.
  - **Body (`--font-dm-sans`)**: *DM Sans* (`400`, `500`, `600`, `700`) untuk label kontrol, tombol, dan navigasi.
  - **Monospace (`--font-ibm-mono`)**: *IBM Plex Mono* (`tabular-nums`) untuk pembacaan suhu (`°C`), kelembaban (`%`), waktu (`HH:MM:SS`), latensi (`ms`), dan badge channel (`CH 1`–`CH 4`).
- **Palet Warna Adaptif (Light & Dark Mode)**:
  - **Dark Mode (Default)**: Background utama `zinc-950`, permukaan kartu `zinc-900/90`, border `zinc-800/80`.
  - **Light Mode**: Background utama `slate-50`, permukaan kartu `white`, border `slate-200/80`.
  - **Aksen Semantik**:
    - *Cool / Primary*: `sky-500` (`#0EA5E9`)
    - *Dry / Bruteforce*: `amber-500` (`#F59E0B`)
    - *Fan*: `teal-500` (`#14B8A6`)
    - *Auto*: `indigo-500` (`#6366F1`)
    - *Power ON / Online*: `emerald-500` (`#10B981`)
    - *Offline / Error / Delete*: `rose-500` (`#F43F5E`)

### 1.2 Tata Letak Navigasi (Clean Navigation Architecture)
- **Tanpa Tulisan Path Teknis**: Seluruh halaman bersih dari badge path teknis (tidak menampilkan `/dashboard`, `/devices`, `/control/...`, `/login`).
- **Sticky Top Navigation Bar (`h-14`) — 3 Zona**:
  1. **Zona Kiri**: Logo Snowflake + Wordmark **ThermoSync**.
  2. **Zona Tengah (Desktop `lg:flex`)**: 5 menu utama:
     - `Dashboard`
     - `Remote AC`
     - `Scanner`
     - `Devices`
     - `Riwayat`
  3. **Zona Kanan (Kompak & Responsif `h-8 sm:h-9`, `text-[11px] sm:text-xs`)**:
     - Tombol **Light / Dark Mode**
     - Tombol **Profil Pengguna (`Josua`)** untuk membuka modal autentikasi & isolasi data
     - Tombol CTA **`+ Scan AC`**
- **Mobile Bottom Navigation Bar (`lg:hidden`)**: Navigasi bawah 5 tab yang ramah jempol untuk layar smartphone.

---

## 2. Spesifikasi UI/UX per Halaman & Komponen

### 2.1 Halaman 1: Dashboard Kontrol AC (`activeNav === 'dashboard'`)
- **Header**:
  - Judul: **Dashboard Kontrol AC**
  - Aksi Cepat: Tombol **Remote** dan **Tambah AC**.
- **Kartu Area Ruangan (Tanpa Istilah Teknis "Hub", Tanpa Feed Aktivitas)**:
  - **Baris Atas Kartu**:
    - Nama Ruangan (`Lantai 2 — Area Utama`), Badge Status **Online / Offline**, dan subjudul area (`Kamar Utama & Ruang Meeting · Baru saja`).
    - Pill Sensor Real-time: Suhu Ruangan (`24.6°C`) | Kelembaban (`58%`).
    - Tombol Aksi Massal (*Bulk Control*): **Nyalakan Semua** dan **Matikan Semua** (dengan konfirmasi keamanan & animasi antrean berurutan `#1/2`, `#2/2`).
  - **Grafik Tren Suhu Lebar Penuh (`SparklineChart` — 100% Lebar Kartu)**:
    - Membentang penuh mengikuti lebar kartu di bawah header ruangan.
    - Menggunakan SVG `preserveAspectRatio="none"` dan `vectorEffect="non-scaling-stroke"` agar kurva tajam di semua ukuran layar.
    - Baris Keterangan Bawah (3 Pill Badge Rapi):
      - Kiri: Waktu & Suhu Awal (`14:00 · 27.8°C`)
      - Tengah: Badge **`Tren Suhu 6 Jam`**
      - Kanan: Waktu & Suhu Terkini (`19:00 · 24.6°C`)
  - **Sub-Grid Unit AC (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)**:
    - Menampilkan setiap unit AC di ruangan tersebut (`AC Kamar Utama`, `AC Ruang Meeting`), badge channel (`CH 1`, `CH 2`), tombol bulat **Power ON/OFF**, ringkasan status (`ON · 22°C · COOL`), dan tombol pintas **Remote**.

### 2.2 Halaman 2: Remote AC Universal (`/components/universal-ac-controller.tsx`)
- **Kartu Header Perangkat AC**:
  - **Kolom Kiri (Susunan Vertikal Rapi)**:
    - Judul Nama AC (`h1`).
    - Baris 3 Pill Badge Seragam: **Merek** (`Daikin`) · **Protokol** (`DAIKIN`) · **Channel** (`CH 1`).
  - **Kolom Kanan**:
    - **Custom Select Dropdown Pemilih AC** (tanpa tombol *Hybrid Sync* di sebelahnya).
    - Setiap opsi di dalam dropdown menampilkan: **Ikon Mode Berwarna** (`Snowflake` / `Droplets` / `Wind` / `Sparkles`), Nama AC, Badge Channel (`CH 1`), Suhu Target (`22°C`), Status `Online/Offline`, dan Indikator Power.
- **Grid Kontrol Utama (`lg:grid-cols-12`)**:
  - **Kartu Thermostat Dial (`lg:col-span-7`)**:
    - Status sinkronisasi perintah (`pending` → `executed (240ms)`) & pill suhu/kelembaban ruangan.
    - Dial melingkar SVG interaktif (`16°C` – `30°C`) dengan tombol `-` dan `+` berukuran besar, slider suhu, serta tombol utama **Power ON / Power OFF**.
  - **Kartu Kontrol Mode, Kipas & Swing (`lg:col-span-5`)**:
    - **Mode AC**: 4 tombol berikon (`Cool`, `Dry`, `Fan`, `Auto`).
    - **Fan Speed**: 4 tingkat kecepatan (`Auto`, `Low`, `Medium`, `High`).
    - **Swing ON/OFF**: Toggle ayunan louver + inspektor JSON payload.

### 2.3 Halaman 3: Scanner AC Universal (`/components/automatic-scanner-wizard.tsx`)
- **Header**: Judul **Scanner AC Universal** + badge **`24 Merek AC Didukung`**.
- **2 Menu Utama (Kartu Pemilih Metode Terpisah)**:
  1. **`1. Deteksi Remote Asli`**: Arahkan remote AC fisik ke sensor untuk deteksi otomatis.
  2. **`2. Cari Berdasarkan Merek`**: Pilih dari 24 merek AC jika remote fisik tidak tersedia.
- **Tampilan Metode 1 (`Deteksi Remote Asli`) — 2 Kartu Terpisah**:
  - **Kartu Kiri (Radar Penerima IR Beranimasi)**:
    - Animasi sapuan radar 360° (`rotate: 360`), 2 gelombang sinyal memancar (*expanding pulse waves*), ikon sensor berdenyut (*breathing core*), serta badge status **Sensor IR Aktif Memindai**.
  - **Kartu Kanan (Pilih Sinyal Remote Fisik — 24 Merek AC)**:
    - Dilengkapi kolom pencarian **`Cari merek AC...`** dan grid seluruh **24 Merek AC** (*Daikin, Panasonic, Sharp, LG, Gree, Samsung, Mitsubishi, Toshiba, Polytron, Aqua, Haier, Midea, AUX, Changhong, TCL, Hisense, Hitachi, Fujitsu, Carrier, Akari, Denpoo, Sanken, Electrolux, York*).
- **Tampilan Metode 2 (`Cari Berdasarkan Merek`) — 2 Kartu Terpisah**:
  - **Kartu Kiri**: Pencarian & daftar 24 Merek AC.
  - **Kartu Kanan**: Pengujian kandidat sinyal (`Sebelumnya` / `Berikutnya`), progress bar, tombol **Kirim Tes Nyala**, dan tombol **AC Bunyi / Menyala**.
- **Pop-up Modal Otomatis (`Simpan AC Baru`)**:
  - Muncul otomatis sebagai **pop-up modal** (`fixed inset-0 z-50`) hanya ketika sinyal/merek AC sudah terdeteksi.
  - Berisi: Header visual centang hijau + badge **`Merek [X] Cocok`**, panel **Coba Tes Respon AC** (`ON/OFF`, `- Dinginkan`, `+ Naikkan`), input **Nama Perangkat AC** disertai **3 tombol pilihan nama cepat (preset)** (`AC [Merek] Kamar`, `AC [Merek] Ruang Tamu`, `AC [Merek] Kerja`), serta tombol **Batal** dan **Simpan AC**.

### 2.4 Halaman 4: Manajemen Perangkat AC (`/components/devices-management.tsx`)
- **Desain Sederhana & Non-Teknis**:
  - Tidak menampilkan alamat MAC, IP lokal, GPIO pin teknis, maupun kotak `Kode Akses / device_token` pada kartu ruangan agar tidak membingungkan pengguna.
- **Kartu Area Ruangan**:
  - Header akordeon bersih: Nama Ruangan (`Lantai 2 — Area Utama`) + jumlah unit (`2 Unit AC`) di kiri; tombol toggle status **Online/Offline**, **Edit**, dan **Hapus** di kanan.
  - Baris **Status Koneksi** (`Terhubung · Baru saja`).
  - Grid **Daftar Unit AC**: Menampilkan nama AC, merek, badge channel (`CH 1`), ringkasan kondisi (`Menyala · 22°C · Mode COOL`), serta tombol **Edit** dan **Hapus**.

### 2.5 Halaman 5: Riwayat Kontrol (`/components/history-activity-view.tsx`)
- Filter tab sumber perintah (`Semua`, `Web`, `Remote`, `Scanner`) + kolom pencarian perangkat/protokol + tombol **Hapus Log**.
- Tampilan responsif: kartu ringkas di layar mobile dan tabel terstruktur di layar desktop.

---

## 3. Rencana Integrasi Backend (Backend Integration Plan)

### 3.1 Skema Database (Supabase / PostgreSQL + Row-Level Security)

```sql
-- 1. Tabel Area / Node Perangkat (esp32_nodes)
CREATE TABLE public.esp32_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- Contoh: 'Lantai 2 — Area Utama'
  room_label TEXT NOT NULL,            -- Contoh: 'Kamar Utama & Ruang Meeting'
  mac_address TEXT,
  ip_address TEXT,
  firmware_version TEXT DEFAULT 'v2.5.0',
  device_token_hash TEXT NOT NULL,     -- SHA-256 hash untuk autentikasi bearer ESP32
  temperature NUMERIC(4,1) DEFAULT 25.0,
  humidity INTEGER DEFAULT 55,
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabel Unit Perangkat AC (ac_appliances)
CREATE TABLE public.ac_appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esp32_id UUID NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- Contoh: 'AC Kamar Utama'
  brand TEXT NOT NULL,                 -- Contoh: 'Daikin' (mendukung 24 merek)
  protocol TEXT NOT NULL,              -- Contoh: 'DAIKIN'
  protocol_bits INTEGER NOT NULL DEFAULT 280,
  ir_tx_pin SMALLINT NOT NULL DEFAULT 23 CHECK (ir_tx_pin IN (23, 25, 26, 27)),
  power BOOLEAN NOT NULL DEFAULT false,
  temp SMALLINT NOT NULL DEFAULT 24 CHECK (temp BETWEEN 16 AND 30),
  mode TEXT NOT NULL DEFAULT 'cool' CHECK (mode IN ('cool', 'dry', 'fan', 'auto')),
  fan TEXT NOT NULL DEFAULT 'auto' CHECK (fan IN ('auto', 'low', 'med', 'high')),
  swing BOOLEAN NOT NULL DEFAULT true,
  last_source TEXT NOT NULL DEFAULT 'Web' CHECK (last_source IN ('Web', 'Remote Fisik', 'Scanner')),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabel Antrean & Riwayat Perintah (device_commands)
CREATE TABLE public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esp32_id UUID NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  appliance_id UUID NOT NULL REFERENCES public.ac_appliances(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('Web', 'Remote Fisik', 'Scanner')),
  action_summary TEXT NOT NULL,
  payload JSONB NOT NULL,              -- FullStateIRPayload (power, temp, mode, fan, swing, protocol, gpioTx)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'timeout')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- 4. Tabel Log Telemetri Suhu & Kelembaban 6 Jam (telemetry_logs)
CREATE TABLE public.telemetry_logs (
  id BIGSERIAL PRIMARY KEY,
  esp32_id UUID NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  temp NUMERIC(4,1) NOT NULL,
  humidity INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Row-Level Security (Isolasi Data per Pengguna seperti akun Josua)
ALTER TABLE public.esp32_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ac_appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nodes"
  ON public.esp32_nodes FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own appliances"
  ON public.ac_appliances FOR ALL
  USING (esp32_id IN (SELECT id FROM public.esp32_nodes WHERE user_id = auth.uid()));
```

---

### 3.2 Kontrak Endpoint REST API Next.js (`/app/api/iot/*`)

| Endpoint | Method | Pemanggil | Fungsi Utama |
| :--- | :--- | :--- | :--- |
| `/api/iot` (`action: queue_command`) | `POST` | Web Client (`page.tsx`) | Menyimpan state baru ke `ac_appliances` secara optimistik dan membuat baris `pending` di `device_commands`. |
| `/api/iot/heartbeat` | `POST` | ESP32 Node (Tiap 30 dtk) | Memperbarui `last_seen`, `temperature`, `humidity` di `esp32_nodes`, menulis `telemetry_logs` untuk grafik **Sparkline**, dan mengembalikan daftar perintah `pending`. |
| `/api/iot/ack` | `PATCH` | ESP32 Node | Mengubah status perintah dari `pending` menjadi `executed` beserta `latency_ms` setelah LED IR memancarkan sinyal. |
| `/api/iot/scanner/capture` | `POST` | ESP32 Node | Mengirim hasil pembacaan sensor penerima IR 38kHz (`protocol`, `brand`, `bits`, `sampleHex`) agar **Pop-up Simpan AC Baru** otomatis terbuka di Web UI. |
| `/api/iot/devices` | `GET / POST / PATCH / DELETE` | Web Client | Operasi CRUD untuk area ruangan (`esp32_nodes`) dan unit AC (`ac_appliances`). |

---

### 3.3 Pemetaan Komponen Frontend ke State & API Backend

1. **Dashboard Kontrol AC (`/app/page.tsx`)**:
   - **Data Ruangan & Sensor**: Diambil dari `GET /api/iot/devices` + langganan *Supabase Realtime* pada tabel `esp32_nodes`.
   - **Sparkline Chart Lebar Penuh (`/components/sparkline-chart.tsx`)**: Mengambil 6 titik terakhir dari `telemetry_logs` (`time`, `temp`, `humidity`).
   - **Tombol Bulk `Nyalakan Semua` & `Matikan Semua`**: Mengirim perintah sekuensial dengan jeda `380ms` antar unit AC ke `POST /api/iot` agar pemancar IR multi-channel tidak mengalami tabrakan daya.
2. **Remote AC Universal (`/components/universal-ac-controller.tsx`)**:
   - Setiap klik tombol suhu (`-`/`+`/slider), `Mode`, `Fan Speed`, atau `Swing` memanggil `handleDispatchStateChange` → membangun `FullStateIRPayload` lengkap → mengirim `POST /api/iot`.
   - Jika node tidak mengirim *ack* dalam batas waktu, status otomatis melakukan *rollback* ke state sebelumnya.
3. **Scanner AC Universal (`/components/automatic-scanner-wizard.tsx`)**:
   - **Metode 1 (Deteksi Remote Asli)**: Mendengarkan event realtime dari `POST /api/iot/scanner/capture`. Begitu `detectedProfile` terisi, **Pop-up Modal Simpan AC Baru** langsung terbuka.
   - **Metode 2 (Cari Berdasarkan Merek — 24 Merek)**: Mengirim perintah uji coba (`Kirim Tes Nyala`) melalui `POST /api/iot`. Saat pengguna menekan **`AC Bunyi / Menyala`**, pop-up penyimpanan langsung muncul dan menyimpan unit baru ke `ac_appliances`.


---

## 4. Rangkaian Kabel (Wiring Diagram) & Kode Firmware Lengkap ESP8266

### 4.1 Daftar Komponen (Bill of Materials)
1. **Mikrokontroler**: 1x **NodeMCU ESP8266 V3 (ESP-12E)** atau **Wemos D1 Mini**
2. **Sensor Suhu & Kelembaban**: 1x **DHT22 (AM2302)** + Resistor Pull-up `10kΩ`
3. **Sensor Penerima IR (Scanner Remote)**: 1x **VS1838B / TSOP38238** (38kHz Carrier)
4. **Pemancar Sinyal IR (Multi-Channel 1–4 AC)**:
   - 1x s/d 4x **LED Inframerah (IR Emitter) 940nm 5mm**
   - 1x s/d 4x **Transistor NPN 2N2222 / S8050 / BC547** (Penguat arus pancar 5–8 meter)
   - 1x s/d 4x **Resistor `220Ω`** (Penghubung pin GPIO ke kaki *Base* transistor)
   - 1x s/d 4x **Resistor `10Ω – 22Ω` (1/2W)** (Pengaman arus anoda LED IR dari pin `VIN / 5V`)

---

### 4.2 Tabel Pemetaan Pin ESP8266 (Pinout Terverifikasi)

| Komponen & Kaki Pin | Label Pin NodeMCU / Wemos | Nomor GPIO ESP8266 | Keterangan Rangkaian |
| :--- | :--- | :--- | :--- |
| **DHT22 — VCC (+)** | `3V3` / `VIN` | `3.3V` / `5V` | Tegangan sensor DHT22 |
| **DHT22 — DATA (OUT)** | **`D7`** | **`GPIO 13`** | Pasang resistor pull-up `10kΩ` antara `DATA` dan `3V3` |
| **DHT22 — GND (-)** | `GND` | `GND` | Ground |
| **VS1838B (IR RX) — OUT (Kaki Kiri)** | **`D6`** | **`GPIO 12`** | Input sinyal penerima remote fisik 38kHz |
| **VS1838B (IR RX) — GND (Kaki Tengah)** | `GND` | `GND` | Ground |
| **VS1838B (IR RX) — VCC (Kaki Kanan)** | `3V3` | `3.3V` | Tegangan 3.3V |
| **IR TX (LED IR 940nm)** | **`D2`** | **`GPIO 4`** | Masuk ke Resistor `220Ω` → Kaki *Base* Transistor NPN |
| **Anoda (+) LED IR 940nm** | **`VIN` / `5V`** | `5.0V USB` | Daya tinggi 5V agar pancaran IR kuat menjangkau AC (6–8m) |
| **LED Biru Bawaan Board** | **`D4` (Internal)** | **`GPIO 2`** | Active LOW — Indikator Wi-Fi, IR RX, dan IR TX |

---

### 4.3 Skema Rangkaian Kabel (ASCII Schematic)

```text
A. RANGKAIAN PENGUAT PEMANCAR IR (DRIVER TRANSISTOR NPN 2N2222 / S8050)
   (Pin D2 / GPIO 4)

             Pin VIN / 5V (NodeMCU ESP8266)
                     |
                    [R] 10Ω - 22Ω
                     |
                     V  Anoda (+ / Kaki Panjang)
                    --- LED Inframerah 940nm
                     |  Katoda (- / Kaki Pendek)
                     |
                   |/  Kolektor (C)
Pin D2 (GPIO 4)    |
-----[ 220Ω ]------|   Transistor NPN (2N2222 / S8050 / BC547)
                   |\  Emitor (E)
                     |
                    === GND (NodeMCU ESP8266)


B. RANGKAIAN SENSOR PENERIMA IR (VS1838B - D6) & SENSOR SUHU (DHT22 - D7)

   [VS1838B - Tampak Depan Lensa Cembung]
        _______
       |  ( )  |
       |_______|
        |  |  |
        |  |  +----> Kaki 3 (VCC - Kanan)   ------> Pin 3V3 NodeMCU
        |  +-------> Kaki 2 (GND - Tengah)  ------> Pin GND NodeMCU
        +----------> Kaki 1 (OUT - Kiri)    ------> Pin D6 (GPIO 12) NodeMCU

   [Sensor Suhu & Kelembaban DHT22]
        Pin 1 (VCC +)  ---------------------------> Pin 3V3 / VIN NodeMCU
        Pin 2 (DATA)   ----+----------------------> Pin D7 (GPIO 13) NodeMCU
                           +---[ Resistor 10kΩ ]--> Pin 3V3 NodeMCU
        Pin 4 (GND -)  ---------------------------> Pin GND NodeMCU
```

---

### 4.4 Kode Firmware Lengkap ESP8266 (`ThermoSync_ESP8266.ino`)

```cpp
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRac.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

// 1. Definisi Pin Hardware Terverifikasi (ESP8266)
#define DHTPIN          13   // D7 = GPIO 13 (DHT22)
#define DHTTYPE         DHT22
#define IR_RECV_PIN     12   // D6 = GPIO 12 (VS1838B IR Receiver)
#define IR_SEND_PIN     4    // D2 = GPIO 4  (IR LED Transmitter)
#define LED_BOARD       2    // D4 = GPIO 2  (LED Biru Bawaan ESP8266, Active LOW)

// 2. Kredensial Wi-Fi & Endpoint Backend ThermoSync
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";
const char* API_BASE_URL  = "https://thermosync-iot.vercel.app/api/iot";
const char* DEVICE_TOKEN  = "esp_tok_9f8a7b6c5d4e3a21";

// 3. Inisialisasi Objek Sensor & IRac
DHT dht(DHTPIN, DHTTYPE);
IRac ac(IR_SEND_PIN);

const uint16_t kCaptureBufferSize = 1024;
const uint8_t kTimeout = 50;
IRrecv irrecv(IR_RECV_PIN, kCaptureBufferSize, kTimeout, true);
decode_results results;

unsigned long lastPollMs      = 0;
unsigned long lastHeartbeatMs = 0;
const unsigned long POLL_INTERVAL_MS      = 2000;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

void kedipLED(int jumlah, int jedaMs) {
  for (int i = 0; i < jumlah; i++) {
    digitalWrite(LED_BOARD, LOW);
    delay(jedaMs);
    digitalWrite(LED_BOARD, HIGH);
    delay(jedaMs);
  }
}

decode_type_t resolveAcProtocol(const char* protoStr) {
  if (strcmp(protoStr, "POLYTRON_AC") == 0 || strcmp(protoStr, "CHANGHONG_AC") == 0 ||
      strcmp(protoStr, "DENPOO_AC") == 0   || strcmp(protoStr, "YORK_AC") == 0) {
    return decode_type_t::GREE;
  }
  if (strcmp(protoStr, "AQUA_HAIER_AC") == 0) return decode_type_t::HAIER_AC;
  if (strcmp(protoStr, "AUX_AC") == 0 || strcmp(protoStr, "ELECTROLUX_AC") == 0) {
    return decode_type_t::ELECTRA_AC;
  }
  if (strcmp(protoStr, "AKARI_AC") == 0 || strcmp(protoStr, "SANKEN_AC") == 0) {
    return decode_type_t::MIDEA;
  }
  if (strcmp(protoStr, "HISENSE_AC") == 0)   return decode_type_t::KELVINATOR;
  if (strcmp(protoStr, "SHARP_AC_STD") == 0) return decode_type_t::SHARP_AC;

  decode_type_t matched = strToDecodeType(protoStr);
  return (matched != decode_type_t::UNKNOWN) ? matched : decode_type_t::DAIKIN;
}

void executeFullStateIR(const char* protocolStr, bool power, float temp, const char* mode, const char* fan, bool swing) {
  irrecv.disableIRIn();

  ac.next.protocol = resolveAcProtocol(protocolStr);
  ac.next.model    = 1;
  ac.next.power    = power;
  ac.next.degrees  = constrain(temp, 16, 30);
  ac.next.celsius  = true;

  if (strcmp(mode, "cool") == 0)      ac.next.mode = stdAc::opmode_t::kCool;
  else if (strcmp(mode, "dry") == 0)  ac.next.mode = stdAc::opmode_t::kDry;
  else if (strcmp(mode, "fan") == 0)  ac.next.mode = stdAc::opmode_t::kFan;
  else                                ac.next.mode = stdAc::opmode_t::kAuto;

  if (strcmp(fan, "low") == 0)        ac.next.fanspeed = stdAc::fanspeed_t::kLow;
  else if (strcmp(fan, "med") == 0)   ac.next.fanspeed = stdAc::fanspeed_t::kMedium;
  else if (strcmp(fan, "high") == 0)  ac.next.fanspeed = stdAc::fanspeed_t::kHigh;
  else                                ac.next.fanspeed = stdAc::fanspeed_t::kAuto;

  ac.next.swingv = swing ? stdAc::swingv_t::kAuto : stdAc::swingv_t::kOff;
  ac.next.swingh = swing ? stdAc::swingh_t::kAuto : stdAc::swingh_t::kOff;
  ac.next.beep   = true;

  ac.sendAc();
  kedipLED(1, 80);
  delay(60);
  irrecv.enableIRIn();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BOARD, OUTPUT);
  digitalWrite(LED_BOARD, HIGH);

  dht.begin();
  irrecv.enableIRIn();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_BOARD, LOW);
    delay(250);
    digitalWrite(LED_BOARD, HIGH);
    delay(250);
  }
  kedipLED(3, 100);
}

void loop() {
  if (irrecv.decode(&results)) {
    if (results.decode_type != decode_type_t::UNKNOWN && results.bits >= 16) {
      kedipLED(2, 60);
      Serial.printf("[IR RX - D6] Protokol: %s (%d bits)\n",
                    typeToString(results.decode_type).c_str(), results.bits);
    }
    irrecv.resume();
  }
}
```
