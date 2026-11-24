import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEsp32Online,
  clampTemperature,
  buildFullStatePayload,
  formatCommandSummary,
  maskDeviceToken,
  generateDeviceToken,
  getProtocolsByBrand,
  matchMdnsOuiToBrand,
  calculateDailyTelemetryRows,
  createInitialSeedData,
  getIrChannelInfo,
  getActiveChannelsForHub,
  hasMultipleActiveChannels,
  detectSamePinBrandCollision,
  AC_BRANDS,
  matchCapturedProtocolToProfile,
  hasDuplicateProtocolInHub,
} from './iot-engine';

test('FR-B1: isEsp32Online detects online within 90 seconds and offline after 90 seconds', () => {
  const now = 1_700_000_000_000;
  const seen30sAgo = new Date(now - 30_000).toISOString();
  const seen90sAgo = new Date(now - 90_000).toISOString();
  const seen91sAgo = new Date(now - 91_000).toISOString();

  assert.equal(isEsp32Online(seen30sAgo, now), true);
  assert.equal(isEsp32Online(seen90sAgo, now), true);
  assert.equal(isEsp32Online(seen91sAgo, now), false);
});

test('FR-D1: clampTemperature enforces 16°C to 30°C boundaries', () => {
  assert.equal(clampTemperature(14), 16);
  assert.equal(clampTemperature(16), 16);
  assert.equal(clampTemperature(22.4), 22);
  assert.equal(clampTemperature(30), 30);
  assert.equal(clampTemperature(35), 30);
});

test('FR-D2 & PRD v1.1: buildFullStatePayload sends complete state JSON with assigned GPIO TX pin & 38kHz IRac metadata', () => {
  const mockAppliance = {
    protocol: 'DAIKIN',
    protocolBits: 280,
    irTxPin: 25 as const,
    state: {
      power: true,
      temp: 24,
      mode: 'cool' as const,
      fan: 'auto' as const,
      swing: false,
    },
  };

  const payload = buildFullStatePayload(mockAppliance, { temp: 19, swing: true });
  assert.equal(payload.power, true);
  assert.equal(payload.temp, 19);
  assert.equal(payload.mode, 'cool');
  assert.equal(payload.fan, 'auto');
  assert.equal(payload.swing, true);
  assert.equal(payload.protocol, 'DAIKIN');
  assert.equal(payload.freqKhz, 38);
  assert.equal(payload.gpioTx, 25);
  assert.equal(payload.iracClass, 'IRac');
});

test('FR-A3 & UI 4.E: generateDeviceToken and maskDeviceToken format and hash tokens securely', () => {
  const { token, tokenHash } = generateDeviceToken('1234567890abcdef');
  assert.equal(token, 'esp_tok_1234567890abcdef');
  assert.equal(maskDeviceToken(token), 'esp_tok_••••••••cdef');
  assert.equal(tokenHash.startsWith('sha256_'), true);
});

test('FR-C2 & FR-C3: 3-tier scanner brand lookup and mDNS OUI matching work accurately', () => {
  const daikinProfiles = getProtocolsByBrand('Daikin');
  assert.equal(daikinProfiles.length >= 2, true);
  assert.equal(daikinProfiles[0].protocol, 'DAIKIN');

  const mdnsMatch = matchMdnsOuiToBrand('60:F1:89:4A:21:0C');
  assert.deepEqual(mdnsMatch, { brand: 'Daikin', protocol: 'DAIKIN' });

  const lgMatch = matchMdnsOuiToBrand('LG_Smart_AC2_82F0._lge._tcp.local');
  assert.deepEqual(lgMatch, { brand: 'LG', protocol: 'LG2' });
});

test('KPI Section 2: calculateDailyTelemetryRows satisfies <= 288 rows/day at 5-minute interval', () => {
  assert.equal(calculateDailyTelemetryRows(5), 288);
  assert.equal(
    formatCommandSummary({
      power: false,
      temp: 23,
      mode: 'cool',
      fan: 'auto',
      swing: false,
    }),
    'Power OFF (Standby • 23°C)'
  );
});

test('PRD v1.1: Multi-AC & Multi-Channel IR TX helpers detect active channels, brand collisions, and duplicate protocols', () => {
  const now = 1_700_000_000_000;
  const seed = createInitialSeedData(now);

  assert.equal(seed.esp32Nodes.length, 1);
  assert.equal(seed.appliances.length, 2);

  // Hub 1 (esp32-kamar-utama) has 2 ACs on GPIO 23 and GPIO 25 -> >= 2 active channels
  assert.deepEqual(
    getActiveChannelsForHub(seed.appliances, 'esp32-kamar-utama'),
    [23, 25]
  );
  assert.equal(
    hasMultipleActiveChannels(seed.appliances, 'esp32-kamar-utama'),
    true
  );

  // Single-channel hub fixture -> 1 active channel
  const singleChannelFixtures = [
    { esp32Id: 'esp32-ruang-kerja', irTxPin: 23 as const, protocol: 'PANASONIC_AC' },
    { esp32Id: 'esp32-ruang-kerja', irTxPin: 23 as const, protocol: 'GREE' },
  ];
  assert.deepEqual(
    getActiveChannelsForHub(singleChannelFixtures, 'esp32-ruang-kerja'),
    [23]
  );
  assert.equal(
    hasMultipleActiveChannels(singleChannelFixtures, 'esp32-ruang-kerja'),
    false
  );

  // Channel info lookup
  assert.equal(getIrChannelInfo(25).shortBadge, 'CH 2');

  // Duplicate protocol detection in Hub 1 (2 Daikin units with DAIKIN protocol)
  assert.equal(
    hasDuplicateProtocolInHub(seed.appliances, 'esp32-kamar-utama', 'DAIKIN'),
    true
  );
  assert.equal(
    hasDuplicateProtocolInHub(
      singleChannelFixtures,
      'esp32-ruang-kerja',
      'PANASONIC_AC'
    ),
    false
  );

  // Same-pin brand collision detection (PRD Section 3)
  const collision = detectSamePinBrandCollision(seed.appliances, {
    esp32Id: 'esp32-kamar-utama',
    brand: 'Daikin',
    protocol: 'DAIKIN',
    irTxPin: 23,
  });
  assert.equal(collision?.id, 'ac-daikin-kamar');

  // Choosing GPIO 26 on esp32-kamar-utama has no collision
  const noCollision = detectSamePinBrandCollision(seed.appliances, {
    esp32Id: 'esp32-kamar-utama',
    brand: 'Daikin',
    protocol: 'DAIKIN',
    irTxPin: 26,
  });
  assert.equal(noCollision, null);
});

test('AC brand catalog includes Midea (SKEM) with COOLIX 24-bit primary and MIDEA 48-bit secondary profiles', () => {
  assert.ok(AC_BRANDS.includes('Midea (SKEM)'));
  const skemProfiles = getProtocolsByBrand('Midea (SKEM)');
  assert.equal(skemProfiles.length, 2);
  assert.equal(skemProfiles[0].protocol, 'COOLIX');
  assert.equal(skemProfiles[0].bits, 24);
  assert.equal(skemProfiles[1].protocol, 'MIDEA');
  assert.equal(skemProfiles[1].bits, 48);

  const capturedMidea = matchCapturedProtocolToProfile('MIDEA', 48, '0xA1826FFFFF6C');
  assert.equal(capturedMidea.brand, 'Midea (SKEM)');
  assert.equal(capturedMidea.protocol, 'MIDEA');

  const capturedCoolix = matchCapturedProtocolToProfile('COOLIX', 24, '0xB2BF40');
  assert.equal(capturedCoolix.brand, 'Midea (SKEM)');
  assert.equal(capturedCoolix.protocol, 'COOLIX');
  assert.equal(capturedCoolix.bits, 24);
});

