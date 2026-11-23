export function generateEsp8266FirmwareCode(params: {
  esp32Name: string;
  deviceToken: string;
  apiEndpoint?: string;
  nodeId?: string;
}): string {
  const safeNodeId = (params.nodeId || 'esp8266-utama').trim();
  const safeNodeName = (params.esp32Name || 'ESP8266 Utama').trim();
  const safeToken = (params.deviceToken || 'ts_live_esp8266_utama').trim();

  return `/**
 * ============================================================================
 * ThermoSync IoT — Universal Smart AC Controller Firmware (ESP8266 + Supabase)
 * ============================================================================
 * Target Board : NodeMCU ESP8266 V3 (ESP-12E) / Wemos D1 Mini
 * Node ID      : ${safeNodeId}
 * Area / Unit  : ${safeNodeName}
 * Mode Koneksi : Langsung ke Supabase REST API (Real-Time)
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
#include <time.h>

// ======================= 1. DEFINISI PIN ESP8266 ============================
#define DHTPIN          13   // D7 = GPIO 13 (Sensor Suhu & Kelembapan DHT22)
#define DHTTYPE         DHT22
#define IR_RECV_PIN     12   // D6 = GPIO 12 (IR Receiver VS1838B)
#define IR_SEND_PIN     4    // D2 = GPIO 4  (IR Transmitter LED IR)
#define LED_BOARD       2    // D4 = GPIO 2  (LED Biru Bawaan ESP8266, Active LOW)

// ======================= 2. KREDENSIAL WIFI & SUPABASE ======================
const char* WIFI_SSID     = "Selese_3";
const char* WIFI_PASSWORD = "Seleseselese";

const char* SUPABASE_URL  = "https://yxjouwqlhxyavkvacffm.supabase.co/rest/v1";
const char* SUPABASE_KEY  = "sb_publishable_5Seo0EalLnpxVHfGbpS_pQ_w5bS7AJj";

const char* NODE_ID       = "${safeNodeId}";
const char* NODE_NAME     = "${safeNodeName}";
const char* DEVICE_TOKEN  = "${safeToken}";
const char* FIRMWARE_VER  = "v2.6.0-esp8266-supabase";

// ======================= 3. INISIALISASI OBJEK ==============================
DHT dht(DHTPIN, DHTTYPE);
IRac ac(IR_SEND_PIN);

const uint16_t kCaptureBufferSize = 1024;
const uint8_t kTimeout = 50; // 50ms cukup untuk frame panjang AC (hingga 280-bit)
IRrecv irrecv(IR_RECV_PIN, kCaptureBufferSize, kTimeout, true);
decode_results results;

BearSSL::WiFiClientSecure secureClient;

struct TelemetryPoint {
  char timeLabel[8];
  float temp;
  int hum;
};

const int MAX_HISTORY = 12;
TelemetryPoint telemetryHistory[MAX_HISTORY];
int historyCount = 0;

unsigned long lastPollMs      = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastIrScanMs    = 0;
unsigned long lastWifiCheckMs = 0;

const unsigned long POLL_INTERVAL_MS      = 2000;  // Cek antrean perintah AC tiap 2 detik
const unsigned long TELEMETRY_INTERVAL_MS = 30000; // Kirim suhu & kelembapan DHT22 tiap 30 detik
const unsigned long IR_SCAN_DEBOUNCE_MS   = 700;   // Cegah duplikasi saat tombol remote ditahan

// ======================= 4. INDIKATOR LED & WAKTU WIB =======================
void kedipLED(int jumlah, int jedaMs) {
  for (int i = 0; i < jumlah; i++) {
    digitalWrite(LED_BOARD, LOW);  // Nyala (Active LOW)
    delay(jedaMs);
    digitalWrite(LED_BOARD, HIGH); // Mati
    delay(jedaMs);
  }
}

void getWibTimeLabel(char* outBuf, size_t bufSize) {
  time_t nowSec = time(nullptr);
  if (nowSec > 1700000000) {
    struct tm* tInfo = localtime(&nowSec);
    snprintf(outBuf, bufSize, "%02d:%02d", tInfo->tm_hour, tInfo->tm_min);
  } else {
    unsigned long mins = (millis() / 60000UL) % 60UL;
    unsigned long secs = (millis() / 1000UL) % 60UL;
    snprintf(outBuf, bufSize, "%02lu:%02lu", mins, secs);
  }
}

void pushTelemetryPoint(float temp, int hum) {
  TelemetryPoint pt;
  getWibTimeLabel(pt.timeLabel, sizeof(pt.timeLabel));
  pt.temp = roundf(temp * 10.0f) / 10.0f;
  pt.hum  = hum;

  if (historyCount < MAX_HISTORY) {
    telemetryHistory[historyCount++] = pt;
  } else {
    for (int i = 1; i < MAX_HISTORY; i++) {
      telemetryHistory[i - 1] = telemetryHistory[i];
    }
    telemetryHistory[MAX_HISTORY - 1] = pt;
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

// ======================= 7. HELPER HTTP SUPABASE ============================
void attachSupabaseHeaders(HTTPClient& https, bool preferMinimal) {
  https.addHeader("apikey", SUPABASE_KEY);
  https.addHeader("Content-Type", "application/json");
  if (preferMinimal) {
    https.addHeader("Prefer", "return=minimal");
  }
}

// 7A. Registrasi otomatis node ESP8266 saat pertama kali online
void registerNodeIfNeeded() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient https;
  https.setTimeout(8000);
  String checkUrl = String(SUPABASE_URL) + "/esp32_nodes?id=eq." + String(NODE_ID) + "&select=id";

  bool exists = false;
  if (https.begin(secureClient, checkUrl)) {
    https.addHeader("apikey", SUPABASE_KEY);
    int code = https.GET();
    if (code == HTTP_CODE_OK) {
      String res = https.getString();
      exists = (res.indexOf(NODE_ID) >= 0);
    } else {
      Serial.printf("[SUPABASE] Cek node gagal (HTTP %d)\\n", code);
    }
    https.end();
  }

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  bool dhtValid = (!isnan(t) && !isnan(h) && t > 0 && h > 0);
  float initTemp = dhtValid ? roundf(t * 10.0f) / 10.0f : 25.0f;
  int initHum    = dhtValid ? (int)round(h) : 60;

  if (dhtValid) {
    pushTelemetryPoint(initTemp, initHum);
  }

  if (!exists) {
    HTTPClient postHttp;
    postHttp.setTimeout(8000);
    String insertUrl = String(SUPABASE_URL) + "/esp32_nodes";
    if (postHttp.begin(secureClient, insertUrl)) {
      attachSupabaseHeaders(postHttp, true);

      JsonDocument doc;
      doc["id"]               = NODE_ID;
      doc["user_id"]          = "user-demo-1";
      doc["name"]             = NODE_NAME;
      doc["room_label"]       = "Ruangan Utama";
      doc["mac_address"]      = WiFi.macAddress();
      doc["ip_address"]       = WiFi.localIP().toString();
      doc["firmware_version"] = FIRMWARE_VER;
      doc["device_token"]     = DEVICE_TOKEN;
      doc["token_hash"]       = DEVICE_TOKEN;
      doc["last_seen"]        = "now";
      doc["temperature"]      = initTemp;
      doc["humidity"]         = initHum;
      JsonArray hist          = doc["telemetry_history"].to<JsonArray>();
      for (int i = 0; i < historyCount; i++) {
        JsonObject item = hist.add<JsonObject>();
        item["time"] = telemetryHistory[i].timeLabel;
        item["temp"] = telemetryHistory[i].temp;
        item["hum"]  = telemetryHistory[i].hum;
      }

      String body;
      serializeJson(doc, body);
      int code = postHttp.POST(body);
      Serial.printf("[SUPABASE] Node '%s' didaftarkan otomatis (HTTP %d)\\n", NODE_ID, code);
      postHttp.end();
    }
  } else {
    Serial.printf("[SUPABASE] Node '%s' sudah terdaftar, lanjut sinkronisasi live.\\n", NODE_ID);
  }
}

// 7B. Kirim telemetri DHT22 (D7) & status heartbeat tiap 30 detik
void sendTelemetryToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  bool dhtValid = (!isnan(t) && !isnan(h) && t > 0 && h > 0);

  JsonDocument doc;
  doc["ip_address"]       = WiFi.localIP().toString();
  doc["mac_address"]      = WiFi.macAddress();
  doc["firmware_version"] = FIRMWARE_VER;
  doc["last_seen"]        = "now";

  if (dhtValid) {
    float roundedTemp = roundf(t * 10.0f) / 10.0f;
    int roundedHum    = (int)round(h);
    pushTelemetryPoint(roundedTemp, roundedHum);

    doc["temperature"] = roundedTemp;
    doc["humidity"]    = roundedHum;

    JsonArray hist = doc["telemetry_history"].to<JsonArray>();
    for (int i = 0; i < historyCount; i++) {
      JsonObject item = hist.add<JsonObject>();
      item["time"] = telemetryHistory[i].timeLabel;
      item["temp"] = telemetryHistory[i].temp;
      item["hum"]  = telemetryHistory[i].hum;
    }

    Serial.printf("[DHT22 - D7] Suhu: %.1f C | Kelembapan: %d %%\\n", roundedTemp, roundedHum);
  } else {
    Serial.println("[DHT22 - D7] Peringatan: Gagal membaca DHT22, hanya kirim heartbeat.");
  }

  HTTPClient https;
  https.setTimeout(8000);
  String url = String(SUPABASE_URL) + "/esp32_nodes?id=eq." + String(NODE_ID);

  if (https.begin(secureClient, url)) {
    attachSupabaseHeaders(https, true);
    String body;
    serializeJson(doc, body);
    int code = https.PATCH(body);
    Serial.printf("[SUPABASE] Telemetri terkirim (HTTP %d)\\n", code);
    https.end();
  }
}

// 7C. Tandai perintah di device_commands sebagai 'executed'
void ackCommandInSupabase(const char* cmdId, unsigned long latencyMs) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient https;
  https.setTimeout(8000);
  String url = String(SUPABASE_URL) + "/device_commands?id=eq." + String(cmdId);

  if (https.begin(secureClient, url)) {
    attachSupabaseHeaders(https, true);
    JsonDocument doc;
    doc["status"]      = "executed";
    doc["latency_ms"]  = (int)latencyMs;
    doc["executed_at"] = "now";

    String body;
    serializeJson(doc, body);
    int code = https.PATCH(body);
    Serial.printf("[ACK] Perintah %s -> executed (%lu ms, HTTP %d)\\n", cmdId, latencyMs, code);
    https.end();
  }
}

// 7D. Polling antrean perintah AC dari dashboard web tiap 2 detik
void pollAndExecuteCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient https;
  https.setTimeout(8000);
  String url = String(SUPABASE_URL) +
               "/device_commands?esp32_id=eq." + String(NODE_ID) +
               "&status=eq.pending&order=created_at.asc&limit=5";

  if (https.begin(secureClient, url)) {
    https.addHeader("apikey", SUPABASE_KEY);
    unsigned long tStart = millis();
    int code = https.GET();

    if (code == HTTP_CODE_OK) {
      String payload = https.getString();
      https.end();

      if (payload.length() > 4 && payload != "[]") {
        JsonDocument resDoc;
        if (deserializeJson(resDoc, payload) == DeserializationError::Ok) {
          JsonArray pending = resDoc.as<JsonArray>();
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
            unsigned long elapsed = millis() - tStart;
            if (strlen(cmdId) > 0) {
              ackCommandInSupabase(cmdId, elapsed);
            }
          }
        }
      }
      return;
    }
    https.end();
  }
}

// 7E. Kirim hasil tangkapan IR Scanner (VS1838B D6) ke Supabase
void sendScannedIrToSupabase(const String& protoName, uint16_t bits, const String& hexFrame) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient https;
  https.setTimeout(8000);
  String url = String(SUPABASE_URL) + "/ir_scanner_events";

  if (https.begin(secureClient, url)) {
    attachSupabaseHeaders(https, true);

    JsonDocument doc;
    doc["esp32_id"]   = NODE_ID;
    doc["protocol"]   = protoName;
    doc["bits"]       = bits;
    doc["sample_hex"] = hexFrame;

    String body;
    serializeJson(doc, body);
    int code = https.POST(body);
    Serial.printf("[SCANNER - D6] Protokol %s (%d-bit) tersimpan di Supabase (HTTP %d)\\n",
                  protoName.c_str(), bits, code);
    https.end();
  }
}

// ======================= 8. KONEKSI WIFI ====================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("Menghubungkan ke Wi-Fi '%s'", WIFI_SSID);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    digitalWrite(LED_BOARD, LOW);
    delay(250);
    digitalWrite(LED_BOARD, HIGH);
    delay(250);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    kedipLED(3, 100); // 3x kedip cepat tanda Wi-Fi terhubung
    Serial.println("\\nWi-Fi Terhubung! IP: " + WiFi.localIP().toString());
    Serial.println("MAC Address: " + WiFi.macAddress());
  } else {
    Serial.println("\\n[WIFI] Gagal konek sementara, akan mencoba ulang otomatis...");
  }
}

// ======================= 9. SETUP & LOOP UTAMA ==============================
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
  Serial.printf(" - Node ID                 : %s\\n", NODE_ID);
  Serial.println("=======================================================");

  dht.begin();
  irrecv.enableIRIn();

  // Buffer TLS optimal untuk ESP8266 agar HTTPS ke Supabase stabil & hemat RAM
  secureClient.setInsecure();
  secureClient.setBufferSizes(4096, 1024);

  connectWiFi();

  // Sinkronisasi jam NTP (WIB / UTC+7) untuk label grafik suhu
  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");

  if (WiFi.status() == WL_CONNECTED) {
    delay(1500); // Beri jeda stabilisasi sensor DHT22
    registerNodeIfNeeded();
    sendTelemetryToSupabase();
  }
}

void loop() {
  unsigned long now = millis();

  // 0. Jaga koneksi Wi-Fi tetap hidup
  if (WiFi.status() != WL_CONNECTED && now - lastWifiCheckMs >= 10000) {
    lastWifiCheckMs = now;
    connectWiFi();
  }

  // 1. CEK IR RECEIVER (VS1838B pada D6 / GPIO 12) - Real-time
  if (irrecv.decode(&results)) {
    if (results.decode_type != decode_type_t::UNKNOWN &&
        results.bits >= 16 &&
        now - lastIrScanMs >= IR_SCAN_DEBOUNCE_MS) {
      lastIrScanMs = now;
      kedipLED(2, 60); // 2x kedip cepat tanda sinyal remote tertangkap
      String protoName = typeToString(results.decode_type);
      String hexFrame  = resultToHexidecimal(&results);

      Serial.printf("[IR RX - D6] Terdeteksi: %s (%d-bit) | Frame: %s\\n",
                    protoName.c_str(), results.bits, hexFrame.c_str());
      sendScannedIrToSupabase(protoName, results.bits, hexFrame);
    }
    irrecv.resume();
  }

  // 2. TELEMETRI DHT22 (D7 / GPIO 13) & HEARTBEAT tiap 30 detik
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    sendTelemetryToSupabase();
  }

  // 3. POLLING ANTREAN PERINTAH AC DARI SUPABASE tiap 2 detik
  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAndExecuteCommands();
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

export const SUPABASE_SQL_SCHEMA = `-- ============================================================================
-- ThermoSync IoT — Skema Database Lengkap untuk Supabase SQL Editor
-- Project Ref : yxjouwqlhxyavkvacffm
-- Kompatibel  : ESP8266 (DHT22 D7, IR RX D6, IR TX D2, LED D4) & 24 Merek AC
-- Cara Pakai  : Salin seluruh skrip ini -> Tempel di Supabase SQL Editor -> Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABEL UNIT HUB ESP8266, SENSOR DHT22 & MODUL LISTRIK PZEM-004T v4.0
CREATE TABLE IF NOT EXISTS public.esp32_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'user-demo-1',
  name TEXT NOT NULL,
  room_label TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  firmware_version TEXT NOT NULL DEFAULT 'v2.7.0-esp8266-pzem',
  device_token TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature NUMERIC(4,1) NOT NULL DEFAULT 25.0,
  humidity INTEGER NOT NULL DEFAULT 60,
  voltage NUMERIC(5,1),
  current NUMERIC(6,2),
  power NUMERIC(8,1),
  energy NUMERIC(10,3),
  frequency NUMERIC(4,1),
  pf NUMERIC(4,2),
  telemetry_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tambah kolom PZEM-004T v4.0 jika tabel sudah dibuat sebelumnya
ALTER TABLE public.esp32_nodes
  ADD COLUMN IF NOT EXISTS voltage NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS current NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS power NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS energy NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS pf NUMERIC(4,2);

-- 2. TABEL UNIT AC TERDAFTAR (24 MEREK UNIVERSAL)
CREATE TABLE IF NOT EXISTS public.ac_appliances (
  id TEXT PRIMARY KEY,
  esp32_id TEXT NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  protocol TEXT NOT NULL,
  protocol_bits INTEGER NOT NULL DEFAULT 216,
  ir_tx_pin SMALLINT NOT NULL DEFAULT 4,
  current_state JSONB NOT NULL DEFAULT '{"power":false,"temp":24,"mode":"cool","fan":"auto","swing":false}'::jsonb,
  last_source TEXT NOT NULL DEFAULT 'Web',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABEL ANTREAN PERINTAH & RIWAYAT KONTROL AC
CREATE TABLE IF NOT EXISTS public.device_commands (
  id TEXT PRIMARY KEY,
  esp32_id TEXT NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  esp32_name TEXT NOT NULL DEFAULT '',
  appliance_id TEXT REFERENCES public.ac_appliances(id) ON DELETE CASCADE,
  appliance_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'Web' CHECK (source IN ('Web', 'Remote Fisik', 'Scanner')),
  action_summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'timeout')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- 4. TABEL TANGKAPAN SCANNER IR (VS1838B D6 / GPIO 12)
CREATE TABLE IF NOT EXISTS public.ir_scanner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esp32_id TEXT NOT NULL REFERENCES public.esp32_nodes(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,
  bits INTEGER NOT NULL DEFAULT 0,
  sample_hex TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. INDEX PERFORMA QUERY & POLLING ESP8266
CREATE INDEX IF NOT EXISTS idx_esp32_nodes_user_id ON public.esp32_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_esp32_nodes_token_hash ON public.esp32_nodes(token_hash);
CREATE INDEX IF NOT EXISTS idx_ac_appliances_esp32_id ON public.ac_appliances(esp32_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_poll ON public.device_commands(esp32_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ir_scanner_events_node ON public.ir_scanner_events(esp32_id, created_at DESC);

-- 6. TRIGGER OTOMATIS UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esp32_nodes_updated_at ON public.esp32_nodes;
CREATE TRIGGER trg_esp32_nodes_updated_at
  BEFORE UPDATE ON public.esp32_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. ROW LEVEL SECURITY (RLS) & POLICY AKSES PUBLISHABLE KEY
ALTER TABLE public.esp32_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ac_appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ir_scanner_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "thermosync_nodes_access" ON public.esp32_nodes;
CREATE POLICY "thermosync_nodes_access"
  ON public.esp32_nodes FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "thermosync_appliances_access" ON public.ac_appliances;
CREATE POLICY "thermosync_appliances_access"
  ON public.ac_appliances FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "thermosync_commands_access" ON public.device_commands;
CREATE POLICY "thermosync_commands_access"
  ON public.device_commands FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "thermosync_scanner_access" ON public.ir_scanner_events;
CREATE POLICY "thermosync_scanner_access"
  ON public.ir_scanner_events FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 8. AKTIFKAN SUPABASE REALTIME (AMAN DIJALANKAN BERULANG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'esp32_nodes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.esp32_nodes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ac_appliances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ac_appliances;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'device_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_commands;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ir_scanner_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ir_scanner_events;
  END IF;
END $$;`;
