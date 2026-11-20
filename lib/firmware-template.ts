export function generateEsp8266FirmwareCode(params: {
  esp32Name: string;
  deviceToken: string;
  apiEndpoint: string;
}): string {
  return `/**
 * ============================================================================
 * ThermoSync IoT — Universal Smart AC Controller Firmware (ESP8266 Edition)
 * ============================================================================
 * Target Board : NodeMCU ESP8266 V3 (ESP-12E) / Wemos D1 Mini
 * Area / Unit  : ${params.esp32Name}
 * Mendukung    : 24 Merek AC (Daikin, Panasonic, Sharp, LG, Gree, Samsung,
 *                Mitsubishi, Toshiba, Polytron, Aqua, Haier, Midea, AUX,
 *                Changhong, TCL, Hisense, Hitachi, Fujitsu, Carrier, Akari,
 *                Denpoo, Sanken, Electrolux, York)
 *
 * Library Wajib (Install via Arduino IDE Library Manager):
 *   1. IRremoteESP8266 (by David Conran, Sebastien Warin) >= v2.8.6
 *   2. ArduinoJson (by Benoit Blanchon) >= v7.0.0
 *   3. DHT sensor library (by Adafruit) + Adafruit Unified Sensor
 *
 * Pinout Hardware Terverifikasi (ESP8266):
 *   - DHT22 Sensor Suhu       -> D7 (GPIO 13)
 *   - IR Receiver (VS1838B)   -> D6 (GPIO 12)
 *   - IR Transmitter (LED IR) -> D2 (GPIO 4)
 *   - LED Biru Bawaan Board   -> D4 (GPIO 2)  [Active LOW - Indikator Status]
 * ============================================================================
 */

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

// ======================= 1. DEFINISI PIN ESP8266 ============================
#define DHTPIN          13   // D7 = GPIO 13 (Sensor Suhu & Kelembapan DHT22)
#define DHTTYPE         DHT22
#define IR_RECV_PIN     12   // D6 = GPIO 12 (IR Receiver VS1838B)
#define IR_SEND_PIN     4    // D2 = GPIO 4  (IR Transmitter)
#define LED_BOARD       2    // D4 = GPIO 2  (LED Biru Bawaan ESP8266, Active LOW)

// ======================= 2. KREDENSIAL WIFI & API ===========================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";
const char* API_BASE_URL  = "${params.apiEndpoint}";
const char* DEVICE_TOKEN  = "${params.deviceToken}";

// ======================= 3. INISIALISASI OBJEK ==============================
DHT dht(DHTPIN, DHTTYPE);
IRac ac(IR_SEND_PIN);

const uint16_t kCaptureBufferSize = 1024;
const uint8_t kTimeout = 50; // 50ms cukup untuk frame panjang AC (hingga 280-bit)
IRrecv irrecv(IR_RECV_PIN, kCaptureBufferSize, kTimeout, true);
decode_results results;

unsigned long lastPollMs      = 0;
unsigned long lastHeartbeatMs = 0;
const unsigned long POLL_INTERVAL_MS      = 2000;  // Cek antrean perintah tiap 2 detik
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // Kirim telemetri DHT22 tiap 30 detik

// ======================= 4. INDIKATOR LED BOARD =============================
void kedipLED(int jumlah, int jedaMs) {
  for (int i = 0; i < jumlah; i++) {
    digitalWrite(LED_BOARD, LOW);  // Nyala (Active LOW)
    delay(jedaMs);
    digitalWrite(LED_BOARD, HIGH); // Mati
    delay(jedaMs);
  }
}

// ======================= 5. PEMETAAN 24 MEREK AC ============================

decode_type_t resolveAcProtocol(const char* protoStr) {
  // Pemetaan alias merek lokal ke protokol standar IRremoteESP8266
  if (strcmp(protoStr, "POLYTRON_AC") == 0 || strcmp(protoStr, "CHANGHONG_AC") == 0 ||
      strcmp(protoStr, "DENPOO_AC") == 0   || strcmp(protoStr, "YORK_AC") == 0) {
    return decode_type_t::GREE;
  }
  if (strcmp(protoStr, "AQUA_HAIER_AC") == 0) {
    return decode_type_t::HAIER_AC;
  }
  if (strcmp(protoStr, "AUX_AC") == 0 || strcmp(protoStr, "ELECTROLUX_AC") == 0) {
    return decode_type_t::ELECTRA_AC;
  }
  if (strcmp(protoStr, "AKARI_AC") == 0 || strcmp(protoStr, "SANKEN_AC") == 0) {
    return decode_type_t::MIDEA;
  }
  if (strcmp(protoStr, "HISENSE_AC") == 0) {
    return decode_type_t::KELVINATOR;
  }
  if (strcmp(protoStr, "SHARP_AC_STD") == 0) {
    return decode_type_t::SHARP_AC;
  }

  decode_type_t matched = strToDecodeType(protoStr);
  if (matched != decode_type_t::UNKNOWN) {
    return matched;
  }
  return decode_type_t::DAIKIN;
}

// ======================= 6. EKSEKUSI PANCARAN IR 38kHz (D2) =================
void executeFullStateIR(
  const char* protocolStr,
  bool power,
  float temp,
  const char* mode,
  const char* fan,
  bool swing
) {
  // Nonaktifkan sementara IR RX (D6) agar sinyal dari D2 tidak memantul masuk kembali
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

  Serial.printf("[IR TX - D2] Mengirim %s | Power:%s | %.0fC | Mode:%s | Fan:%s\\n",
                protocolStr, power ? "ON" : "OFF", temp, mode, fan);

  ac.sendAc();
  kedipLED(1, 80); // Indikator 1x kedip bahwa pulsa IR berhasil dipancarkan
  delay(60);

  // Aktifkan kembali IR RX (D6)
  irrecv.enableIRIn();
}

// ======================= 7. KOMUNIKASI BACKEND API ==========================
void sendScannedIrToBackend(const String& protoName, uint16_t bits, const String& hexFrame) {
  if (WiFi.status() != WL_CONNECTED) return;

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();
  HTTPClient https;

  if (https.begin(*client, String(API_BASE_URL))) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);

    JsonDocument doc;
    doc["action"]    = "scanner_capture";
    doc["protocol"]  = protoName;
    doc["bits"]      = bits;
    doc["sampleHex"] = hexFrame;

    String body;
    serializeJson(doc, body);
    int code = https.POST(body);
    Serial.printf("[SCANNER - D6] Protokol %s dikirim ke server (HTTP %d)\\n", protoName.c_str(), code);
    https.end();
  }
}

void syncWithBackend(bool includeTelemetry) {
  if (WiFi.status() != WL_CONNECTED) return;

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();
  HTTPClient https;

  if (https.begin(*client, String(API_BASE_URL))) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);

    JsonDocument reqDoc;
    reqDoc["action"]     = includeTelemetry ? "heartbeat" : "poll_commands";
    reqDoc["ipAddress"]  = WiFi.localIP().toString();
    reqDoc["macAddress"] = WiFi.macAddress();

    if (includeTelemetry) {
      float t = dht.readTemperature();
      float h = dht.readHumidity();
      if (!isnan(t) && !isnan(h) && t > 0 && h > 0) {
        reqDoc["temperature"] = t;
        reqDoc["humidity"]    = (int)round(h);
        Serial.printf("[DHT22 - D7] Suhu: %.1f C | Kelembapan: %.1f %%\\n", t, h);
      } else {
        Serial.println("[DHT22 - D7] Peringatan: Gagal membaca sensor DHT22!");
      }
    }

    String reqBody;
    serializeJson(reqDoc, reqBody);

    unsigned long tStart = millis();
    int httpCode = https.POST(reqBody);

    if (httpCode == HTTP_CODE_OK) {
      String payload = https.getString();
      JsonDocument resDoc;
      if (deserializeJson(resDoc, payload) == DeserializationError::Ok) {
        JsonArray pending = resDoc["pendingCommands"].as<JsonArray>();
        for (JsonObject cmd : pending) {
          const char* cmdId = cmd["id"] | "";
          JsonObject p      = cmd["payload"];
          executeFullStateIR(
            p["protocol"] | "DAIKIN",
            p["power"]    | true,
            p["temp"]     | 24.0,
            p["mode"]     | "cool",
            p["fan"]      | "auto",
            p["swing"]    | true
          );
          Serial.printf("[ACK] Perintah %s dieksekusi (%lu ms)\\n", cmdId, millis() - tStart);
        }
      }
    }
    https.end();
  }
}

// ======================= 8. SETUP & LOOP UTAMA ==============================
void setup() {
  Serial.begin(115200);
  pinMode(LED_BOARD, OUTPUT);
  digitalWrite(LED_BOARD, HIGH); // Pastikan LED mati di awal (Active LOW)

  delay(1000);
  Serial.println("\\n=======================================================");
  Serial.println("   THERMOSYNC IOT — SMART AC CONTROLLER (ESP8266)");
  Serial.println("=======================================================");
  Serial.println("Pinout Aktif:");
  Serial.println(" - DHT22 (Suhu/Kelembapan) : D7 (GPIO 13)");
  Serial.println(" - IR RX (VS1838B Scanner) : D6 (GPIO 12)");
  Serial.println(" - IR TX (LED IR Utama)    : D2 (GPIO 4)");
  Serial.println(" - LED Indikator Board     : D4 (GPIO 2 - Active LOW)");
  Serial.println("=======================================================");

  dht.begin();
  irrecv.enableIRIn();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menghubungkan ke Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_BOARD, LOW);
    delay(250);
    digitalWrite(LED_BOARD, HIGH);
    delay(250);
    Serial.print(".");
  }
  kedipLED(3, 100); // 3x kedip cepat tanda Wi-Fi terhubung
  Serial.println("\\nWi-Fi Terhubung! IP: " + WiFi.localIP().toString());
}

void loop() {
  unsigned long now = millis();

  // 1. CEK IR RECEIVER (VS1838B pada D6 / GPIO 12) - Real-time
  if (irrecv.decode(&results)) {
    if (results.decode_type != decode_type_t::UNKNOWN && results.bits >= 16) {
      kedipLED(2, 60); // 2x kedip cepat tanda sinyal remote tertangkap
      String protoName = typeToString(results.decode_type);
      String hexFrame  = resultToHexidecimal(&results);

      Serial.printf("[IR RX - D6] Terdeteksi: %s (%d-bit) | Frame: %s\\n",
                    protoName.c_str(), results.bits, hexFrame.c_str());
      sendScannedIrToBackend(protoName, results.bits, hexFrame);
    }
    irrecv.resume();
  }

  // 2. HEARTBEAT & TELEMETRI DHT22 (D7 / GPIO 13) tiap 30 detik
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    lastPollMs = now;
    syncWithBackend(true);
  }
  // 3. POLLING ANTREAN PERINTAH REMOTE WEB tiap 2 detik
  else if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    syncWithBackend(false);
  }
}`;
}

// Alias backward-compatibility
export const generateEsp32FirmwareCode = generateEsp8266FirmwareCode;

export const ESP8266_WIRING_GUIDE = `================================================================================
RANGKAIAN KABEL (WIRING DIAGRAM) — THERMOSYNC IOT (NODEMCU ESP8266 / WEMOS D1)
================================================================================

1. DAFTAR KOMPONEN (BILL OF MATERIALS)
--------------------------------------------------------------------------------
- 1x Board NodeMCU ESP8266 V3 (Lolin/Amica) atau Wemos D1 Mini
- 1x Sensor Suhu & Kelembaban DHT22 (AM2302) + Resistor Pull-up 10kΩ
- 1x Sensor Penerima IR VS1838B / TSOP38238 (Frekuensi Carrier 38kHz)
- 1x LED Inframerah (IR Emitter LED) 940nm 5mm High-Power (Utama di D2)
- 1x Transistor NPN 2N2222 / S8050 / BC547 (Penguat Arus Jarak Jauh 6-8m)
- 1x Resistor 220Ω (Ke kaki Base transistor)
- 1x Resistor 10Ω - 22Ω 1/2W (Pembatas arus anoda LED IR ke VIN / 5V)

================================================================================
2. TABEL PEMETAAN PIN TERVERIFIKASI (ESP8266)
================================================================================
+--------------------------+-------------------+-------------+-----------------+
| Komponen & Pin           | Pin NodeMCU       | GPIO ESP8266| Keterangan      |
+--------------------------+-------------------+-------------+-----------------+
| DHT22 - VCC (+)          | 3V3 / VIN         | 3.3V / 5V   | Daya Sensor     |
| DHT22 - DATA (OUT)       | D7                | GPIO 13     | + Pull-up 10kΩ  |
| DHT22 - GND (-)          | GND               | GND         | Ground          |
+--------------------------+-------------------+-------------+-----------------+
| VS1838B (IR RX) - OUT    | D6                | GPIO 12     | Input Sinyal IR |
| VS1838B (IR RX) - GND    | GND               | GND         | Kaki Tengah     |
| VS1838B (IR RX) - VCC    | 3V3               | 3.3V        | Kaki Kanan 3.3V |
+--------------------------+-------------------+-------------+-----------------+
| IR TX (LED IR 940nm)     | D2                | GPIO 4      | Via 220Ω -> NPN |
| Daya Anoda LED IR (+)    | VIN / VU (5V USB) | 5.0V        | Daya Kuat 5V    |
+--------------------------+-------------------+-------------+-----------------+
| LED Biru Bawaan Board    | D4 (Internal)     | GPIO 2      | Active LOW      |
+--------------------------+-------------------+-------------+-----------------+

================================================================================
3. SKEMA RANGKAIAN PENGUAT PEMANCAR IR (DRIVER TRANSISTOR NPN 2N2222 / S8050)
================================================================================

         Pin VIN / 5V (NodeMCU)
                 |
                [R] 10Ω - 22Ω
                 |
                 V  Anoda (+ / Kaki Panjang)
                --- LED Inframerah 940nm
                 |  Katoda (- / Kaki Pendek)
                 |
               |/  Kolektor (C)
Pin D2 (GPIO4) |
---[ 220Ω ]----|   Transistor NPN (2N2222 / S8050 / BC547)
               |\\  Emitor (E)
                 |
                === GND (NodeMCU)

================================================================================
4. SKEMA RANGKAIAN PENERIMA IR (VS1838B - D6) & SENSOR SUHU (DHT22 - D7)
================================================================================

  [Sensor VS1838B - Tampak Depan Tonjolan Lensa]
     _______
    |  ( )  |
    |_______|
     |  |  |
     |  |  +----> Kaki 3 (VCC)  ------> Pin 3V3 NodeMCU
     |  +-------> Kaki 2 (GND)  ------> Pin GND NodeMCU
     +----------> Kaki 1 (OUT)  ------> Pin D6 (GPIO 12) NodeMCU

  [Sensor Suhu & Kelembaban DHT22]
     VCC (+)  ------------------------> Pin 3V3 / VIN NodeMCU
     DATA     ----+-------------------> Pin D7 (GPIO 13) NodeMCU
                  +---[ 10kΩ ]--------> Pin 3V3 NodeMCU (Pull-up)
     GND (-)  ------------------------> Pin GND NodeMCU
`;

export const SUPABASE_SQL_SCHEMA = `-- Skema PostgreSQL & Row Level Security (RLS) — ThermoSync IoT
-- Mendukung Node ESP8266 & 24 Merek AC Universal

CREATE TABLE public.esp32_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_label TEXT NOT NULL,
  mac_address TEXT,
  ip_address TEXT,
  firmware_version TEXT DEFAULT 'v2.5.0-esp8266',
  token_hash TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature NUMERIC(4,1) DEFAULT 25.0,
  humidity INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ac_appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esp32_id UUID NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  protocol TEXT NOT NULL,
  protocol_bits INTEGER NOT NULL DEFAULT 216,
  ir_tx_pin SMALLINT NOT NULL DEFAULT 4,
  current_state JSONB NOT NULL DEFAULT '{"power":false,"temp":24,"mode":"cool","fan":"auto","swing":false}',
  last_source TEXT NOT NULL DEFAULT 'Web',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esp32_id UUID NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  appliance_id UUID NOT NULL REFERENCES public.ac_appliances(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('Web', 'Remote Fisik', 'Scanner')),
  action_summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'timeout')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

ALTER TABLE public.esp32_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ac_appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;`;
