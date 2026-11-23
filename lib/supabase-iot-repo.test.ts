import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapDbNodeToDomain,
  mapDomainNodeToDb,
  mapDbApplianceToDomain,
  mapDomainApplianceToDb,
  mapDbCommandToDomain,
  mapDomainCommandToDb,
  isTableMissingError,
  normalizeIrTxPin,
} from './supabase-iot-repo';
import { createInitialSeedData, INITIAL_SEED_TIMESTAMP } from './iot-engine';
import { normalizeSupabaseProjectUrl } from './supabase';

test('normalizes Supabase URLs by stripping /rest/v1 suffix and trailing slashes', () => {
  assert.equal(
    normalizeSupabaseProjectUrl('https://yxjouwqlhxyavkvacffm.supabase.co/rest/v1/'),
    'https://yxjouwqlhxyavkvacffm.supabase.co'
  );
  assert.equal(
    normalizeSupabaseProjectUrl('https://yxjouwqlhxyavkvacffm.supabase.co/rest/v1'),
    'https://yxjouwqlhxyavkvacffm.supabase.co'
  );
  assert.equal(
    normalizeSupabaseProjectUrl('https://yxjouwqlhxyavkvacffm.supabase.co/'),
    'https://yxjouwqlhxyavkvacffm.supabase.co'
  );
  assert.equal(
    normalizeSupabaseProjectUrl(undefined),
    'https://yxjouwqlhxyavkvacffm.supabase.co'
  );
});

test('round-trips ESP32Node between domain and Supabase DB row', () => {
  const seed = createInitialSeedData(INITIAL_SEED_TIMESTAMP);
  const node = seed.esp32Nodes[0];

  const dbRow = mapDomainNodeToDb(node);
  assert.equal(dbRow.id, node.id);
  assert.equal(dbRow.user_id, node.userId);
  assert.equal(dbRow.temperature, 24.6);

  const restored = mapDbNodeToDomain(dbRow);
  assert.equal(restored.id, node.id);
  assert.equal(restored.name, node.name);
  assert.equal(restored.temperature, node.temperature);
  assert.equal(restored.humidity, node.humidity);
  assert.equal(restored.telemetryHistory.length, node.telemetryHistory.length);
});

test('round-trips ACAppliance between domain and Supabase DB row', () => {
  const seed = createInitialSeedData(INITIAL_SEED_TIMESTAMP);
  const app = seed.appliances[0];

  const dbRow = mapDomainApplianceToDb(app);
  assert.equal(dbRow.esp32_id, app.esp32Id);
  assert.equal(dbRow.protocol, 'DAIKIN');

  const restored = mapDbApplianceToDomain(dbRow);
  assert.equal(restored.id, app.id);
  assert.equal(restored.state.temp, app.state.temp);
  assert.equal(restored.state.power, app.state.power);
  assert.equal(restored.irTxPin, 23);
});

test('normalizes ESP8266 GPIO 4 pin gracefully into UI IrTxPin', () => {
  assert.equal(normalizeIrTxPin(4), 23);
  assert.equal(normalizeIrTxPin(25), 25);
  assert.equal(normalizeIrTxPin(undefined), 23);
});

test('round-trips DeviceCommand between domain and Supabase DB row', () => {
  const seed = createInitialSeedData(INITIAL_SEED_TIMESTAMP);
  const cmd = seed.commands[0];

  const dbRow = mapDomainCommandToDb(cmd);
  assert.equal(dbRow.esp32_id, cmd.esp32Id);
  assert.equal(dbRow.status, 'executed');

  const restored = mapDbCommandToDomain(dbRow);
  assert.equal(restored.id, cmd.id);
  assert.equal(restored.latencyMs, cmd.latencyMs);
  assert.equal(restored.payload.protocol, cmd.payload.protocol);
});

test('detects missing table errors from Supabase PostgREST', () => {
  assert.equal(isTableMissingError({ code: 'PGRST205', message: 'not found' }), true);
  assert.equal(isTableMissingError({ code: '42P01', message: 'relation missing' }), true);
  assert.equal(isTableMissingError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isTableMissingError(null), false);
});

test('maps PZEM-004T v4.0 6 electrical parameters and ESP8266 hum history key cleanly', async () => {
  const {
    hasPzemReading,
    formatPzemPower,
    evaluateVoltageStatus,
    evaluatePowerFactorStatus,
    evaluateFrequencyStatus,
  } = await import('./iot-engine');

  const dbRow = {
    id: 'esp8266-utama',
    user_id: 'user-demo-1',
    name: 'ESP8266 Utama',
    room_label: 'Ruangan Utama',
    mac_address: '8C:AA:B5:66:BD:8E',
    ip_address: '192.168.0.152',
    firmware_version: 'v2.7.0-esp8266-pzem',
    device_token: 'ts_live_esp8266_utama',
    token_hash: 'ts_live_esp8266_utama',
    last_seen: '2026-11-23T15:23:14Z',
    temperature: 26.4,
    humidity: 68,
    voltage: 221.4,
    current: 3.85,
    power: 825.5,
    energy: 14.325,
    frequency: 50.0,
    pf: 0.97,
    telemetry_history: [{ time: '22:22', temp: 26.4, hum: 68, humidity: undefined as unknown as number }],
  };

  const domain = mapDbNodeToDomain(dbRow);
  assert.equal(domain.telemetryHistory[0].humidity, 68);
  assert.equal(hasPzemReading(domain.pzem), true);
  assert.equal(domain.pzem?.voltage, 221.4);
  assert.equal(domain.pzem?.current, 3.85);
  assert.equal(domain.pzem?.power, 825.5);
  assert.equal(domain.pzem?.energy, 14.325);
  assert.equal(domain.pzem?.frequency, 50.0);
  assert.equal(domain.pzem?.pf, 0.97);

  const roundTripDb = mapDomainNodeToDb(domain);
  assert.equal(roundTripDb.voltage, 221.4);
  assert.equal(roundTripDb.pf, 0.97);

  assert.deepEqual(formatPzemPower(825.5), { value: '825.5', unit: 'W' });
  assert.deepEqual(formatPzemPower(1850), { value: '1.85', unit: 'kW' });
  assert.equal(evaluateVoltageStatus(221.4).tone, 'nominal');
  assert.equal(evaluatePowerFactorStatus(0.97, 825.5).tone, 'nominal');
  assert.equal(evaluatePowerFactorStatus(0.03, 0.8).label, 'Standby');
  assert.equal(evaluateFrequencyStatus(50.0).tone, 'nominal');
});

test('merges live device_nodes and telemetry_logs from final firmware v2.7.3', async () => {
  const { mergeLiveDeviceData } = await import('./supabase-iot-repo');

  const merged = mergeLiveDeviceData({
    legacyNodes: [],
    deviceNodes: [
      {
        node_id: 'esp8266-utama',
        name: 'ESP8266 Utama',
        device_token: 'ts_live_esp8266_utama',
        firmware_version: 'v2.7.3-esp8266-led-d3',
        ip_address: '192.168.1.27',
        wifi_ssid: 'Selese',
        status: 'online',
        last_seen: '2026-11-23T17:59:10+00:00',
      },
    ],
    telemetryLogs: [
      {
        id: 2,
        node_id: 'esp8266-utama',
        temperature: 30.0,
        humidity: 80.7,
        voltage: 204.0,
        current: 0.117,
        power: 0.9,
        energy: 557.546,
        frequency: 50.0,
        power_factor: 0.04,
        ac_power: false,
        ac_temp: 24,
        ac_mode: 'cool',
        ac_fan: 'auto',
        ac_protocol: 'DAIKIN',
        rssi: -57,
        created_at: '2026-11-23T17:58:39.92576+00:00',
      },
      {
        id: 3,
        node_id: 'esp8266-utama',
        temperature: 30.0,
        humidity: 79.3,
        voltage: 203.1,
        current: 0.116,
        power: 0.8,
        energy: 557.546,
        frequency: 50.0,
        power_factor: 0.03,
        ac_power: false,
        ac_temp: 24,
        ac_mode: 'cool',
        ac_fan: 'auto',
        ac_protocol: 'DAIKIN',
        rssi: -56,
        created_at: '2026-11-23T17:59:10.263902+00:00',
      },
    ],
  });

  assert.equal(merged.length, 1);
  const node = merged[0];
  assert.equal(node.id, 'esp8266-utama');
  assert.equal(node.wifiSsid, 'Selese');
  assert.equal(node.rssi, -56);
  assert.equal(node.temperature, 30.0);
  assert.equal(node.humidity, 79);
  assert.equal(node.pzem?.voltage, 203.1);
  assert.equal(node.pzem?.current, 0.116);
  assert.equal(node.pzem?.power, 0.8);
  assert.equal(node.pzem?.energy, 557.546);
  assert.equal(node.pzem?.frequency, 50.0);
  assert.equal(node.pzem?.pf, 0.03);
  assert.equal(node.telemetryHistory.length, 2);
  assert.equal(node.liveAcState?.protocol, 'DAIKIN');
});


