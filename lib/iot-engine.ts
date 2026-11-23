export type ACMode = 'cool' | 'dry' | 'fan' | 'auto';
export type FanSpeed = 'auto' | 'low' | 'med' | 'high';
export type CommandStatus = 'pending' | 'executed' | 'failed' | 'timeout';
export type CommandSource = 'Web' | 'Remote Fisik' | 'Scanner';
export type IrTxPin = 23 | 25 | 26 | 27;

export interface IrChannelOption {
  channelNumber: 1 | 2 | 3 | 4;
  gpioPin: IrTxPin;
  label: string;
  shortBadge: string;
  role: string;
}

export const IR_OUTPUT_CHANNELS: IrChannelOption[] = [
  {
    channelNumber: 1,
    gpioPin: 23,
    label: 'Channel 1 (Pin 23)',
    shortBadge: 'CH 1',
    role: 'Pemancar IR Utama / Bersama',
  },
  {
    channelNumber: 2,
    gpioPin: 25,
    label: 'Channel 2 (Pin 25)',
    shortBadge: 'CH 2',
    role: 'Emitter Khusus Jalur A',
  },
  {
    channelNumber: 3,
    gpioPin: 26,
    label: 'Channel 3 (Pin 26)',
    shortBadge: 'CH 3',
    role: 'Emitter Khusus Jalur B',
  },
  {
    channelNumber: 4,
    gpioPin: 27,
    label: 'Channel 4 (Pin 27)',
    shortBadge: 'CH 4',
    role: 'Emitter Khusus Jalur C',
  },
];

export interface ACState {
  power: boolean;
  temp: number; // 16 - 30 °C
  mode: ACMode;
  fan: FanSpeed;
  swing: boolean;
}

export interface TelemetryPoint {
  time: string;
  temp: number;
  humidity: number;
}

export interface PzemTelemetry {
  voltage: number | null; // 80 – 260 VAC
  current: number | null; // 0 – 100 A (CT eksternal)
  power: number | null; // 0 – 23,000 W (~23 kW)
  energy: number | null; // 0 – 9999 kWh
  frequency: number | null; // 45 – 65 Hz
  pf: number | null; // 0.00 – 1.00
}

export interface LiveAcTelemetryState {
  power: boolean;
  temp: number;
  mode: ACMode;
  fan: FanSpeed;
  protocol: string;
}

export interface ESP32Node {
  id: string;
  userId: string;
  name: string;
  roomLabel: string;
  macAddress: string;
  ipAddress: string;
  wifiSsid?: string;
  rssi?: number | null;
  firmwareVersion: string;
  deviceToken: string;
  tokenHash: string;
  lastSeen: string; // ISO string
  temperature: number; // °C
  humidity: number; // %
  pzem?: PzemTelemetry;
  liveAcState?: LiveAcTelemetryState;
  telemetryHistory: TelemetryPoint[];
  pinout: {
    dht22: 'GPIO 21';
    irRx: 'GPIO 18';
    irTx: 'Multi-Channel 1–4';
  };
}

export interface ACAppliance {
  id: string;
  esp32Id: string;
  name: string;
  brand: string;
  protocol: string;
  protocolBits: number;
  irTxPin: IrTxPin;
  state: ACState;
  lastUpdated: string;
  lastSource: CommandSource;
}

export interface FullStateIRPayload extends ACState {
  protocol: string;
  protocolBits: number;
  freqKhz: 38;
  gpioTx: IrTxPin;
  iracClass: 'IRac';
}

export interface DeviceCommand {
  id: string;
  esp32Id: string;
  esp32Name: string;
  applianceId: string;
  applianceName: string;
  source: CommandSource;
  actionSummary: string;
  payload: FullStateIRPayload;
  status: CommandStatus;
  latencyMs?: number;
  createdAt: string;
  executedAt?: string;
}

export interface IRProtocolProfile {
  id: string;
  brand: string;
  protocol: string;
  modelSeries: string;
  bits: number;
  sampleHex: string;
  notes: string;
}

export interface MDNSDiscoveredDevice {
  id: string;
  ipAddress: string;
  macAddress: string;
  ouiPrefix: string;
  hostname: string;
  ouiVendor: string;
  recommendedBrand: string;
  recommendedProtocol: string;
  rssiDbm: number;
}

export const OFFLINE_THRESHOLD_SECONDS = 90;
export const MIN_AC_TEMP = 16;
export const MAX_AC_TEMP = 30;
export const INITIAL_SEED_TIMESTAMP = 1795089600000; // Deterministic baseline for SSR/CSR parity

/**
 * Returns IR channel metadata for a given channel pin (defaults to Channel 1).
 */
export function getIrChannelInfo(gpioPin?: number): IrChannelOption {
  return (
    IR_OUTPUT_CHANNELS.find((ch) => ch.gpioPin === gpioPin) ||
    IR_OUTPUT_CHANNELS[0]
  );
}

/**
 * Returns unique active IR TX channels used by a Smart Hub.
 */
export function getActiveChannelsForHub(
  appliances: Pick<ACAppliance, 'esp32Id' | 'irTxPin'>[],
  esp32Id: string
): IrTxPin[] {
  const pins = new Set<IrTxPin>();
  for (const app of appliances) {
    if (app.esp32Id === esp32Id) {
      pins.add(app.irTxPin || 23);
    }
  }
  return Array.from(pins).sort((a, b) => a - b) as IrTxPin[];
}

/**
 * Channel badge on Dashboard sub-cards is shown only if the Smart Hub has >= 2 active channels.
 */
export function hasMultipleActiveChannels(
  appliances: Pick<ACAppliance, 'esp32Id' | 'irTxPin'>[],
  esp32Id: string
): boolean {
  return getActiveChannelsForHub(appliances, esp32Id).length >= 2;
}

/**
 * Detects if another AC on the same Smart Hub and same IR output channel uses the same brand or protocol.
 */
export function detectSamePinBrandCollision(
  appliances: ACAppliance[],
  params: {
    esp32Id: string;
    brand: string;
    protocol: string;
    irTxPin: IrTxPin;
    excludeApplianceId?: string;
  }
): ACAppliance | null {
  const targetBrand = params.brand.trim().toLowerCase();
  const targetProto = params.protocol.trim().toUpperCase();

  for (const app of appliances) {
    if (params.excludeApplianceId && app.id === params.excludeApplianceId) {
      continue;
    }
    if (app.esp32Id !== params.esp32Id) continue;
    if ((app.irTxPin || 23) !== params.irTxPin) continue;

    if (
      app.brand.trim().toLowerCase() === targetBrand ||
      app.protocol.trim().toUpperCase() === targetProto
    ) {
      return app;
    }
  }
  return null;
}

/**
 * Checks if a Smart Hub has >= 2 ACs with the exact same IR protocol,
 * which disables Physical Remote Hybrid Sync.
 */
export function hasDuplicateProtocolInHub(
  appliances: Pick<ACAppliance, 'esp32Id' | 'protocol'>[],
  esp32Id: string,
  protocol: string
): boolean {
  const targetProto = protocol.trim().toUpperCase();
  let count = 0;
  for (const app of appliances) {
    if (
      app.esp32Id === esp32Id &&
      app.protocol.trim().toUpperCase() === targetProto
    ) {
      count += 1;
      if (count >= 2) return true;
    }
  }
  return false;
}

/**
 * Formats an ISO timestamp into deterministic HH:MM:SS (UTC+7 WIB) without locale hydration mismatch.
 */
export function formatTimeHHMMSS(isoString: string): string {
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return '00:00:00';
  const d = new Date(ms + 7 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const AC_BRANDS = [
  'Daikin',
  'Panasonic',
  'Sharp',
  'LG',
  'Gree',
  'Samsung',
  'Mitsubishi',
  'Toshiba',
  'Polytron',
  'Aqua',
  'Haier',
  'Midea',
  'AUX',
  'Changhong',
  'TCL',
  'Hisense',
  'Hitachi',
  'Fujitsu',
  'Carrier',
  'Akari',
  'Denpoo',
  'Sanken',
  'Electrolux',
  'York',
] as const;

export const IR_PROTOCOL_CATALOG: IRProtocolProfile[] = [
  {
    id: 'prof-daikin-1',
    brand: 'Daikin',
    protocol: 'DAIKIN',
    modelSeries: 'FTKC / FTKQ Smile Inverter Series',
    bits: 280,
    sampleHex: '0x11DA2700C50000D711DA27004200005411DA270000492C00AF000006600000C100007B',
    notes: 'Protokol standar Daikin 35-byte frame (ARC433 / ARC480)',
  },
  {
    id: 'prof-daikin-2',
    brand: 'Daikin',
    protocol: 'DAIKIN216',
    modelSeries: 'FTC Standard Non-Inverter',
    bits: 216,
    sampleHex: '0x11DA27000000002811DA270000492C00AF000006600000C100008E',
    notes: 'Protokol Daikin 27-byte frame untuk seri FTC',
  },
  {
    id: 'prof-daikin-3',
    brand: 'Daikin',
    protocol: 'DAIKIN152',
    modelSeries: 'Multi-Split Compact VRV Series',
    bits: 152,
    sampleHex: '0x11DA270000492C00AF000006600000C100005A',
    notes: 'Protokol Daikin 19-byte frame',
  },
  {
    id: 'prof-panasonic-1',
    brand: 'Panasonic',
    protocol: 'PANASONIC_AC',
    modelSeries: 'CS-PU / CS-XU Nanoe-X Inverter',
    bits: 216,
    sampleHex: '0x0220E004000000060220E00400492C80AF00000EE000008900009D',
    notes: 'Protokol utama Panasonic AC 27-byte Kaseikyo',
  },
  {
    id: 'prof-panasonic-2',
    brand: 'Panasonic',
    protocol: 'PANASONIC_AC32',
    modelSeries: 'CS-YN Standard Low Watt Series',
    bits: 32,
    sampleHex: '0x354A902C',
    notes: 'Protokol ringkas 32-bit untuk seri ekonomis',
  },
  {
    id: 'prof-sharp-1',
    brand: 'Sharp',
    protocol: 'SHARP_AC',
    modelSeries: 'AH-X / AH-A Plasmacluster J-Tech Inverter',
    bits: 104,
    sampleHex: '0xAA5ACF10F6213200088000F451',
    notes: 'Protokol Sharp 13-byte A907 / CRMC-A903JBEZ',
  },
  {
    id: 'prof-sharp-2',
    brand: 'Sharp',
    protocol: 'SHARP_AC_STD',
    modelSeries: 'AH-AP Sayonara Panas Standard',
    bits: 104,
    sampleHex: '0xAA5ACF10F5212200088000E441',
    notes: 'Protokol Sharp Standard Series',
  },
  {
    id: 'prof-lg-1',
    brand: 'LG',
    protocol: 'LG2',
    modelSeries: 'DualCool ThinQ Watt Control Inverter',
    bits: 28,
    sampleHex: '0x880094D',
    notes: 'Protokol LG2 28-bit AKB74955603',
  },
  {
    id: 'prof-lg-2',
    brand: 'LG',
    protocol: 'LG',
    modelSeries: 'Hercules / Standard Split Series',
    bits: 28,
    sampleHex: '0x880084C',
    notes: 'Protokol LG klasik 28-bit 6711A20083V',
  },
  {
    id: 'prof-gree-1',
    brand: 'Gree',
    protocol: 'GREE',
    modelSeries: 'GWC-MOO5S / F1S / C3ES Series',
    bits: 64,
    sampleHex: '0x29092050002000F0',
    notes: 'Protokol Gree YAW1F / YAN1F1 64-bit',
  },
  {
    id: 'prof-gree-2',
    brand: 'Gree',
    protocol: 'KELVINATOR',
    modelSeries: 'Gree OEM / Deluxe Commercial Split',
    bits: 128,
    sampleHex: '0x19900450002000E019900470002000B0',
    notes: 'Protokol Gree/Kelvinator 16-byte extended',
  },
  {
    id: 'prof-samsung-1',
    brand: 'Samsung',
    protocol: 'SAMSUNG_AC',
    modelSeries: 'WindFree Digital Inverter AR10/AR12',
    bits: 168,
    sampleHex: '0x02920F000000F001D2FE716019F00102FE718015F0',
    notes: 'Protokol Samsung AC 21-byte extended packet',
  },
  {
    id: 'prof-samsung-2',
    brand: 'Samsung',
    protocol: 'SAMSUNG_AC112',
    modelSeries: 'AR05 / AR09 Fast Cooling Standard',
    bits: 112,
    sampleHex: '0x02920F000000F001D2FE716019F0',
    notes: 'Protokol Samsung 14-byte standard packet',
  },
  {
    id: 'prof-mitsubishi-1',
    brand: 'Mitsubishi',
    protocol: 'MITSUBISHI_AC',
    modelSeries: 'MSY-JP / MS-JS Mr. Slim Series',
    bits: 144,
    sampleHex: '0x23CB260100200807304500000000000000A8',
    notes: 'Protokol Mitsubishi Electric 18-byte frame',
  },
  {
    id: 'prof-mitsubishi-2',
    brand: 'Mitsubishi',
    protocol: 'MITSUBISHI_HEAVY_152',
    modelSeries: 'SRK-ZMP / Heavy Industries JetFlow',
    bits: 152,
    sampleHex: '0x52AEBF40BF4000F00F00FF00FF00FF00FF009A',
    notes: 'Protokol Mitsubishi Heavy Industries 19-byte frame',
  },
  {
    id: 'prof-toshiba-1',
    brand: 'Toshiba',
    protocol: 'TOSHIBA_AC',
    modelSeries: 'RAS-B / DaiSeikai Inverter Series',
    bits: 72,
    sampleHex: '0xF20D03FC0150000054',
    notes: 'Protokol Toshiba 9-byte WH-TA04NE',
  },
  {
    id: 'prof-polytron-1',
    brand: 'Polytron',
    protocol: 'POLYTRON_AC',
    modelSeries: 'Neuva Ice / Smart Neuva Pro PAC Series',
    bits: 64,
    sampleHex: '0x29092050002000F2',
    notes: 'Protokol Polytron PAC Series 64-bit',
  },
  {
    id: 'prof-aqua-1',
    brand: 'Aqua',
    protocol: 'AQUA_HAIER_AC',
    modelSeries: 'AQA-KCR / Triple Airflow Series',
    bits: 104,
    sampleHex: '0xA6520000404000200000000058',
    notes: 'Protokol Aqua Japan (Haier Group) 13-byte frame',
  },
  {
    id: 'prof-haier-1',
    brand: 'Haier',
    protocol: 'HAIER_AC176',
    modelSeries: 'HSU-CleanCool / PuriCool Inverter',
    bits: 176,
    sampleHex: '0xA6520000404000200000000058000000000000000058',
    notes: 'Protokol Haier YRW02 22-byte frame',
  },
  {
    id: 'prof-midea-1',
    brand: 'Midea',
    protocol: 'MIDEA',
    modelSeries: 'MSFC /Blanc / Breezeless Inverter',
    bits: 48,
    sampleHex: '0xA1826FFFFF6C',
    notes: 'Protokol Midea R51M/E & RG57 48-bit',
  },
  {
    id: 'prof-midea-2',
    brand: 'Midea',
    protocol: 'COOLIX',
    modelSeries: 'Midea Forest / OEM Split Series',
    bits: 24,
    sampleHex: '0xB2BF40',
    notes: 'Protokol Coolix/Midea 24-bit',
  },
  {
    id: 'prof-aux-1',
    brand: 'AUX',
    protocol: 'AUX_AC',
    modelSeries: 'ASW-F Series / J-Smart Inverter',
    bits: 104,
    sampleHex: '0xC3002000002000000000000508',
    notes: 'Protokol AUX YKR-P/002E 13-byte frame',
  },
  {
    id: 'prof-changhong-1',
    brand: 'Changhong',
    protocol: 'CHANGHONG_AC',
    modelSeries: 'CSC / CHOL Double Gold Fin Series',
    bits: 64,
    sampleHex: '0x29092050002000E8',
    notes: 'Protokol Changhong KK22B 64-bit',
  },
  {
    id: 'prof-tcl-1',
    brand: 'TCL',
    protocol: 'TCL112AC',
    modelSeries: 'TAC-05CSD / GentleCool Inverter',
    bits: 112,
    sampleHex: '0x23CB260100240307000000000083',
    notes: 'Protokol TCL GYKQ-52 14-byte frame',
  },
  {
    id: 'prof-hisense-1',
    brand: 'Hisense',
    protocol: 'HISENSE_AC',
    modelSeries: 'AN05CEG / Quiet Cool Series',
    bits: 112,
    sampleHex: '0x87000020002000000000000000C7',
    notes: 'Protokol Hisense RCH-R0Y 14-byte frame',
  },
  {
    id: 'prof-hitachi-1',
    brand: 'Hitachi',
    protocol: 'HITACHI_AC',
    modelSeries: 'RAS-XJ / FrostWash Inverter',
    bits: 224,
    sampleHex: '0x80080002FDFF0033CC56A9986700FF00FF00FF00FF00FF00FF00FF12ED',
    notes: 'Protokol Hitachi 28-byte RAR-5E1',
  },
  {
    id: 'prof-fujitsu-1',
    brand: 'Fujitsu',
    protocol: 'FUJITSU_AC',
    modelSeries: 'ASYA / Nocria General Split Series',
    bits: 128,
    sampleHex: '0x1463001010FE0930800100000000202B',
    notes: 'Protokol Fujitsu General AR-RAH2E 16-byte frame',
  },
  {
    id: 'prof-carrier-1',
    brand: 'Carrier',
    protocol: 'CARRIER_AC64',
    modelSeries: 'XPower Gold / Crystal Inverter',
    bits: 64,
    sampleHex: '0x72100020002000A2',
    notes: 'Protokol Carrier 64-bit RG57A4',
  },
  {
    id: 'prof-akari-1',
    brand: 'Akari',
    protocol: 'AKARI_AC',
    modelSeries: 'A-05D3LW / Turbo Cool Low Watt',
    bits: 48,
    sampleHex: '0xA1826FFFFF74',
    notes: 'Protokol Akari Universal 48-bit',
  },
  {
    id: 'prof-denpoo-1',
    brand: 'Denpoo',
    protocol: 'DENPOO_AC',
    modelSeries: 'DDS-05 / Super Cool Eco Series',
    bits: 64,
    sampleHex: '0x29092050002000D4',
    notes: 'Protokol Denpoo 64-bit Split AC',
  },
  {
    id: 'prof-sanken-1',
    brand: 'Sanken',
    protocol: 'SANKEN_AC',
    modelSeries: 'EL-05 / Vitamin C Filter Series',
    bits: 48,
    sampleHex: '0xA1826FFFFF6A',
    notes: 'Protokol Sanken 48-bit',
  },
  {
    id: 'prof-electrolux-1',
    brand: 'Electrolux',
    protocol: 'ELECTROLUX_AC',
    modelSeries: 'ESM-05 / VitaShield Inverter',
    bits: 104,
    sampleHex: '0xC3002000002000000000000514',
    notes: 'Protokol Electrolux 13-byte frame',
  },
  {
    id: 'prof-york-1',
    brand: 'York',
    protocol: 'YORK_AC',
    modelSeries: 'YWM / Commercial & Residential Split',
    bits: 64,
    sampleHex: '0x29092050002000C1',
    notes: 'Protokol York Johnson Controls 64-bit',
  },
];

export const MDNS_DISCOVERY_CATALOG: MDNSDiscoveredDevice[] = [
  {
    id: 'mdns-1',
    ipAddress: '192.168.1.44',
    macAddress: '60:F1:89:4A:21:0C',
    ouiPrefix: '60:F1:89',
    hostname: 'Daikin-AP41028._daikin._tcp.local',
    ouiVendor: 'Daikin Industries, Ltd.',
    recommendedBrand: 'Daikin',
    recommendedProtocol: 'DAIKIN',
    rssiDbm: -48,
  },
  {
    id: 'mdns-2',
    ipAddress: '192.168.1.57',
    macAddress: 'AC:E4:B5:19:82:F0',
    ouiPrefix: 'AC:E4:B5',
    hostname: 'LG_Smart_AC2_82F0._lge._tcp.local',
    ouiVendor: 'LG Electronics Inc.',
    recommendedBrand: 'LG',
    recommendedProtocol: 'LG2',
    rssiDbm: -56,
  },
  {
    id: 'mdns-3',
    ipAddress: '192.168.1.63',
    macAddress: '50:2B:73:9D:11:4E',
    ouiPrefix: '50:2B:73',
    hostname: 'Gree-EWPE-Smart-114E.local',
    ouiVendor: 'Gree Electric Appliances Inc. of Zhuhai',
    recommendedBrand: 'Gree',
    recommendedProtocol: 'GREE',
    rssiDbm: -61,
  },
];

/**
 * Checks whether a Smart Hub is online based on a 90-second heartbeat window.
 */
export function isEsp32Online(lastSeenIso: string, nowMs: number = Date.now()): boolean {
  const parsed = Date.parse(lastSeenIso);
  if (Number.isNaN(parsed)) return false;
  const diffSeconds = (nowMs - parsed) / 1000;
  return diffSeconds <= OFFLINE_THRESHOLD_SECONDS;
}

/**
 * Returns elapsed seconds since the Smart Hub last sent a heartbeat.
 */
export function getSecondsSinceLastSeen(lastSeenIso: string, nowMs: number = Date.now()): number {
  const parsed = Date.parse(lastSeenIso);
  if (Number.isNaN(parsed)) return Infinity;
  return Math.max(0, Math.round((nowMs - parsed) / 1000));
}

/**
 * Formats last_seen timestamp into human-readable Indonesian relative time.
 */
export function formatLastSeenLabel(lastSeenIso: string, nowMs: number = Date.now()): string {
  const seconds = getSecondsSinceLastSeen(lastSeenIso, nowMs);
  if (!Number.isFinite(seconds)) return 'Tidak diketahui';
  if (seconds < 10) return 'Baru saja';
  if (seconds < 60) return `${seconds} dtk lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

/**
 * Clamps target AC temperature strictly between 16°C and 30°C.
 */
export function clampTemperature(temp: number): number {
  if (!Number.isFinite(temp)) return 24;
  const rounded = Math.round(temp);
  return Math.min(MAX_AC_TEMP, Math.max(MIN_AC_TEMP, rounded));
}

/**
 * Constructs a complete full-state JSON payload for IR execution,
 * routing to the appliance's assigned IR TX channel.
 */
export function buildFullStatePayload(
  appliance: Pick<ACAppliance, 'protocol' | 'protocolBits' | 'state'> & {
    irTxPin?: IrTxPin;
  },
  nextPartial: Partial<ACState>
): FullStateIRPayload {
  const merged: ACState = {
    power: nextPartial.power ?? appliance.state.power,
    temp: clampTemperature(nextPartial.temp ?? appliance.state.temp),
    mode: nextPartial.mode ?? appliance.state.mode,
    fan: nextPartial.fan ?? appliance.state.fan,
    swing: nextPartial.swing ?? appliance.state.swing,
  };

  return {
    ...merged,
    protocol: appliance.protocol,
    protocolBits: appliance.protocolBits,
    freqKhz: 38,
    gpioTx: appliance.irTxPin || 23,
    iracClass: 'IRac',
  };
}

/**
 * Builds a clean Indonesian summary string describing an AC state change.
 */
export function formatCommandSummary(next: ACState): string {
  if (!next.power) {
    return `Power OFF (Standby • ${next.temp}°C)`;
  }
  const modeLabel =
    next.mode === 'cool'
      ? 'Cool'
      : next.mode === 'dry'
      ? 'Dry'
      : next.mode === 'fan'
      ? 'Fan'
      : 'Auto';
  const fanLabel =
    next.fan === 'auto'
      ? 'Auto'
      : next.fan === 'low'
      ? 'Low'
      : next.fan === 'med'
      ? 'Medium'
      : 'High';
  const swingLabel = next.swing ? 'Swing ON' : 'Swing OFF';
  return `Power ON • ${next.temp}°C • Mode ${modeLabel} • Fan ${fanLabel} • ${swingLabel}`;
}

/**
 * Masks device_token into `esp_tok_••••••••` + last 4 characters.
 */
export function maskDeviceToken(token: string): string {
  if (!token || token.length < 12) return 'esp_tok_••••••••';
  const suffix = token.slice(-4);
  return `esp_tok_••••••••${suffix}`;
}

/**
 * Deterministic lightweight hash representation for device_token storage.
 */
export function hashDeviceToken(token: string): string {
  let h1 = 0xdeadbeef ^ token.length;
  let h2 = 0x41c6ce57 ^ token.length;
  for (let i = 0; i < token.length; i++) {
    const ch = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    'sha256_' +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

/**
 * Generates a fresh Smart Hub token and its hash.
 */
export function generateDeviceToken(seedSuffix?: string): {
  token: string;
  tokenHash: string;
} {
  const randomPart =
    seedSuffix ||
    Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  const token = `esp_tok_${randomPart}`;
  return {
    token,
    tokenHash: hashDeviceToken(token),
  };
}

/**
 * Returns candidate IR protocols for a given AC brand.
 */
export function getProtocolsByBrand(brand: string): IRProtocolProfile[] {
  const normalized = brand.trim().toLowerCase();
  return IR_PROTOCOL_CATALOG.filter(
    (p) => p.brand.toLowerCase() === normalized
  );
}

/**
 * Matches an mDNS hostname or MAC OUI prefix to a recommended AC brand & protocol.
 */
export function matchMdnsOuiToBrand(input: string): {
  brand: string;
  protocol: string;
} | null {
  const normalized = input.trim().toUpperCase();
  for (const item of MDNS_DISCOVERY_CATALOG) {
    if (
      normalized.includes(item.ouiPrefix.toUpperCase()) ||
      normalized.includes(item.recommendedBrand.toUpperCase()) ||
      normalized.includes(item.hostname.toUpperCase())
    ) {
      return {
        brand: item.recommendedBrand,
        protocol: item.recommendedProtocol,
      };
    }
  }
  return null;
}

/**
 * Calculates daily telemetry rows per device given a logging interval in minutes.
 */
export function calculateDailyTelemetryRows(intervalMinutes: number): number {
  if (intervalMinutes <= 0) throw new Error('Interval must be positive');
  return Math.floor((24 * 60) / intervalMinutes);
}

/**
 * Initial deterministic seed data demonstrating Hub-and-Spoke Multi-AC & Multi-Channel IR architecture.
 */
export function createInitialSeedData(nowMs: number = Date.now()): {
  esp32Nodes: ESP32Node[];
  appliances: ACAppliance[];
  commands: DeviceCommand[];
} {
  const tok1 = generateDeviceToken('9f8a7b6c5d4e3a21');

  const esp32Nodes: ESP32Node[] = [
    {
      id: 'esp32-kamar-utama',
      userId: 'user-demo-1',
      name: 'Lantai 2 — Area Utama',
      roomLabel: 'Kamar Utama & Ruang Meeting',
      macAddress: '24:6F:28:1A:9C:04',
      ipAddress: '192.168.1.101',
      firmwareVersion: 'v2.5.0',
      deviceToken: tok1.token,
      tokenHash: tok1.tokenHash,
      lastSeen: new Date(nowMs - 14 * 1000).toISOString(), // 14s ago -> ONLINE
      temperature: 24.6,
      humidity: 58,
      pinout: {
        dht22: 'GPIO 21',
        irRx: 'GPIO 18',
        irTx: 'Multi-Channel 1–4',
      },
      telemetryHistory: [
        { time: '14:00', temp: 27.8, humidity: 66 },
        { time: '15:00', temp: 27.1, humidity: 64 },
        { time: '16:00', temp: 26.2, humidity: 62 },
        { time: '17:00', temp: 25.5, humidity: 60 },
        { time: '18:00', temp: 25.0, humidity: 59 },
        { time: '19:00', temp: 24.6, humidity: 58 },
      ],
    },
  ];

  const appliances: ACAppliance[] = [
    {
      id: 'ac-daikin-kamar',
      esp32Id: 'esp32-kamar-utama',
      name: 'AC Kamar Utama',
      brand: 'Daikin',
      protocol: 'DAIKIN',
      protocolBits: 280,
      irTxPin: 23, // Channel 1
      state: {
        power: true,
        temp: 22,
        mode: 'cool',
        fan: 'auto',
        swing: true,
      },
      lastUpdated: new Date(nowMs - 2 * 60 * 1000).toISOString(),
      lastSource: 'Web',
    },
    {
      id: 'ac-daikin-meeting',
      esp32Id: 'esp32-kamar-utama',
      name: 'AC Ruang Meeting',
      brand: 'Daikin',
      protocol: 'DAIKIN',
      protocolBits: 280,
      irTxPin: 25, // Channel 2
      state: {
        power: true,
        temp: 23,
        mode: 'cool',
        fan: 'med',
        swing: false,
      },
      lastUpdated: new Date(nowMs - 3 * 60 * 1000).toISOString(),
      lastSource: 'Web',
    },
  ];

  const commands: DeviceCommand[] = [
    {
      id: 'cmd-101',
      esp32Id: 'esp32-kamar-utama',
      esp32Name: 'Lantai 2 — Area Utama',
      applianceId: 'ac-daikin-kamar',
      applianceName: 'AC Kamar Utama',
      source: 'Web',
      actionSummary: '[CH 1] Power ON • 22°C • Mode Cool • Fan Auto • Swing ON',
      payload: buildFullStatePayload(appliances[0], {}),
      status: 'executed',
      latencyMs: 310,
      createdAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
      executedAt: new Date(nowMs - 2 * 60 * 1000 + 310).toISOString(),
    },
    {
      id: 'cmd-102',
      esp32Id: 'esp32-kamar-utama',
      esp32Name: 'Lantai 2 — Area Utama',
      applianceId: 'ac-daikin-meeting',
      applianceName: 'AC Ruang Meeting',
      source: 'Web',
      actionSummary: '[CH 2] Power ON • 23°C • Mode Cool • Fan Medium • Swing OFF',
      payload: buildFullStatePayload(appliances[1], {}),
      status: 'executed',
      latencyMs: 280,
      createdAt: new Date(nowMs - 3 * 60 * 1000).toISOString(),
      executedAt: new Date(nowMs - 3 * 60 * 1000 + 280).toISOString(),
    },
    {
      id: 'cmd-103',
      esp32Id: 'esp32-kamar-utama',
      esp32Name: 'Lantai 2 — Area Utama',
      applianceId: 'ac-daikin-kamar',
      applianceName: 'AC Kamar Utama',
      source: 'Remote Fisik',
      actionSummary: 'Hybrid Sync: Power ON • 22°C • Mode Cool • Fan Auto',
      payload: buildFullStatePayload(appliances[0], {}),
      status: 'executed',
      latencyMs: 120,
      createdAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
      executedAt: new Date(nowMs - 5 * 60 * 1000 + 120).toISOString(),
    },
    {
      id: 'cmd-105',
      esp32Id: 'esp32-kamar-utama',
      esp32Name: 'Lantai 2 — Area Utama',
      applianceId: 'ac-daikin-meeting',
      applianceName: 'AC Ruang Meeting',
      source: 'Scanner',
      actionSummary: 'Smart Bruteforce (CH 2): Protokol DAIKIN (280-bit) tersimpan',
      payload: buildFullStatePayload(appliances[1], {}),
      status: 'executed',
      latencyMs: 360,
      createdAt: new Date(nowMs - 32 * 60 * 1000).toISOString(),
      executedAt: new Date(nowMs - 32 * 60 * 1000 + 360).toISOString(),
    },
  ];

  return { esp32Nodes, appliances, commands };
}

export type PzemStatusTone = 'nominal' | 'warning' | 'alert' | 'idle';

export function hasPzemReading(pzem?: PzemTelemetry | null): boolean {
  if (!pzem) return false;
  return (
    typeof pzem.voltage === 'number' &&
    Number.isFinite(pzem.voltage) &&
    pzem.voltage > 0
  );
}

export function formatPzemPower(watts: number | null | undefined): {
  value: string;
  unit: 'W' | 'kW';
} {
  if (typeof watts !== 'number' || !Number.isFinite(watts) || watts < 0) {
    return { value: '--', unit: 'W' };
  }
  if (watts >= 1000) {
    return { value: (watts / 1000).toFixed(2), unit: 'kW' };
  }
  return { value: watts.toFixed(1), unit: 'W' };
}

export function evaluateVoltageStatus(
  voltage: number | null | undefined
): { label: string; tone: PzemStatusTone } {
  if (typeof voltage !== 'number' || !Number.isFinite(voltage) || voltage <= 0) {
    return { label: 'Menunggu', tone: 'idle' };
  }
  if (voltage >= 200 && voltage <= 240) {
    return { label: 'Nominal', tone: 'nominal' };
  }
  if ((voltage >= 180 && voltage < 200) || (voltage > 240 && voltage <= 250)) {
    return { label: 'Fluktuasi', tone: 'warning' };
  }
  return { label: 'Di Luar Rentang', tone: 'alert' };
}

export function evaluatePowerFactorStatus(
  pf: number | null | undefined,
  powerWatts?: number | null
): { label: string; tone: PzemStatusTone } {
  if (typeof pf !== 'number' || !Number.isFinite(pf)) {
    return { label: 'Menunggu', tone: 'idle' };
  }
  // When AC is OFF or idle standby (< 10 W), CT phase noise naturally yields low PF
  if (typeof powerWatts === 'number' && Number.isFinite(powerWatts) && powerWatts < 10) {
    return { label: 'Standby', tone: 'idle' };
  }
  if (pf >= 0.85) {
    return { label: 'Efisien', tone: 'nominal' };
  }
  if (pf >= 0.65) {
    return { label: 'Cukup', tone: 'warning' };
  }
  return { label: 'Rendah', tone: 'alert' };
}

export function evaluateRssiStatus(
  rssi: number | null | undefined
): { label: string; tone: PzemStatusTone } {
  if (typeof rssi !== 'number' || !Number.isFinite(rssi) || rssi === 0) {
    return { label: '-', tone: 'idle' };
  }
  if (rssi >= -65) return { label: 'Kuat', tone: 'nominal' };
  if (rssi >= -78) return { label: 'Sedang', tone: 'warning' };
  return { label: 'Lemah', tone: 'alert' };
}

export function evaluateFrequencyStatus(
  frequency: number | null | undefined
): { label: string; tone: PzemStatusTone } {
  if (
    typeof frequency !== 'number' ||
    !Number.isFinite(frequency) ||
    frequency <= 0
  ) {
    return { label: 'Menunggu', tone: 'idle' };
  }
  if (frequency >= 49.0 && frequency <= 51.0) {
    return { label: 'Stabil 50Hz', tone: 'nominal' };
  }
  if (frequency >= 59.0 && frequency <= 61.0) {
    return { label: 'Stabil 60Hz', tone: 'nominal' };
  }
  if (frequency >= 45.0 && frequency <= 65.0) {
    return { label: 'Dalam Rentang', tone: 'warning' };
  }
  return { label: 'Anomali', tone: 'alert' };
}


