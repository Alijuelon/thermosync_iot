import {
  type ACAppliance,
  type ACMode,
  type ACState,
  type CommandSource,
  type CommandStatus,
  type DeviceCommand,
  type ESP32Node,
  type FanSpeed,
  type FullStateIRPayload,
  type IrTxPin,
  type LearnedIrCode,
  type TelemetryPoint,
} from '@/lib/iot-engine';
import { getSupabaseServerClient } from '@/lib/supabase';

export interface DbEsp32NodeRow {
  id: string;
  user_id: string;
  name: string;
  room_label: string;
  mac_address: string;
  ip_address: string;
  firmware_version: string;
  device_token: string;
  token_hash: string;
  last_seen: string;
  temperature: number | string;
  humidity: number;
  voltage?: number | string | null;
  current?: number | string | null;
  power?: number | string | null;
  energy?: number | string | null;
  frequency?: number | string | null;
  pf?: number | string | null;
  telemetry_history: Array<TelemetryPoint & { hum?: number }> | null;
}

export interface DbDeviceNodeRow {
  node_id: string;
  name: string;
  device_token?: string | null;
  firmware_version?: string | null;
  ip_address?: string | null;
  wifi_ssid?: string | null;
  status?: string | null;
  last_seen?: string | null;
}

export interface DbTelemetryLogRow {
  id: number | string;
  node_id: string;
  temperature?: number | string | null;
  humidity?: number | string | null;
  voltage?: number | string | null;
  current?: number | string | null;
  power?: number | string | null;
  energy?: number | string | null;
  frequency?: number | string | null;
  power_factor?: number | string | null;
  ac_power?: boolean | null;
  ac_temp?: number | null;
  ac_mode?: string | null;
  ac_fan?: string | null;
  ac_protocol?: string | null;
  rssi?: number | null;
  created_at: string;
}

export interface DbAcApplianceRow {
  id: string;
  esp32_id: string;
  name: string;
  brand: string;
  protocol: string;
  protocol_bits: number;
  ir_tx_pin: number;
  current_state: ACState | null;
  last_source: CommandSource;
  last_updated: string;
}

export interface DbDeviceCommandRow {
  id: string;
  esp32_id?: string | null;
  node_id?: string | null;
  command?: string | null;
  esp32_name?: string | null;
  appliance_id?: string | null;
  appliance_name?: string | null;
  source?: CommandSource | null;
  action_summary?: string | null;
  payload: FullStateIRPayload;
  status: CommandStatus;
  latency_ms?: number | null;
  created_at: string;
  executed_at?: string | null;
}

export interface DbIrLearnedCodeRow {
  id: number | string;
  node_id: string;
  protocol: string;
  raw_hex?: string | null;
  bits?: number | null;
  created_at: string;
}

export function normalizeIrTxPin(pin: number | undefined | null): IrTxPin {
  if (pin === 23 || pin === 25 || pin === 26 || pin === 27) {
    return pin;
  }
  return 23;
}

function parseOptionalNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAcMode(raw?: string | null): ACMode {
  if (raw === 'cool' || raw === 'dry' || raw === 'fan' || raw === 'auto') {
    return raw;
  }
  return 'cool';
}

function normalizeFanSpeed(raw?: string | null): FanSpeed {
  if (raw === 'low' || raw === 'med' || raw === 'high' || raw === 'auto') {
    return raw;
  }
  if (raw === 'medium') return 'med';
  return 'auto';
}

export function formatIsoToWibHHMM(isoString: string): string {
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return '--:--';
  const wib = new Date(ts + 7 * 3600 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function mapDbNodeToDomain(row: DbEsp32NodeRow): ESP32Node {
  const history: TelemetryPoint[] = Array.isArray(row.telemetry_history)
    ? row.telemetry_history.map((pt) => ({
        time: String(pt.time || ''),
        temp: Number(pt.temp ?? 0),
        humidity: Number(pt.humidity ?? pt.hum ?? 0),
      }))
    : [];

  const voltage = parseOptionalNumber(row.voltage);
  const current = parseOptionalNumber(row.current);
  const power = parseOptionalNumber(row.power);
  const energy = parseOptionalNumber(row.energy);
  const frequency = parseOptionalNumber(row.frequency);
  const pf = parseOptionalNumber(row.pf);

  const hasAnyPzemField =
    voltage !== null ||
    current !== null ||
    power !== null ||
    energy !== null ||
    frequency !== null ||
    pf !== null;

  return {
    id: row.id,
    userId: row.user_id || 'user-demo-1',
    name: row.name,
    roomLabel: row.room_label || '',
    macAddress: row.mac_address || '',
    ipAddress: row.ip_address || '',
    firmwareVersion: row.firmware_version || 'v2.7.3-esp8266-led-d3',
    deviceToken: row.device_token,
    tokenHash: row.token_hash,
    lastSeen: row.last_seen,
    temperature: Number(row.temperature ?? 25.0),
    humidity: Number(row.humidity ?? 60),
    pzem: hasAnyPzemField
      ? { voltage, current, power, energy, frequency, pf }
      : undefined,
    telemetryHistory: history,
    pinout: {
      dht22: 'GPIO 21',
      irRx: 'GPIO 18',
      irTx: 'Multi-Channel 1–4',
    },
  };
}

/**
 * Merges live ESP8266 firmware tables (`device_nodes` + `telemetry_logs`) with
 * legacy `esp32_nodes` metadata so the dashboard reflects real-time DHT22,
 * PZEM-004T v4.0, Wi-Fi SSID/RSSI, and AC state seamlessly.
 */
export function mergeLiveDeviceData(params: {
  legacyNodes: DbEsp32NodeRow[];
  deviceNodes: DbDeviceNodeRow[];
  telemetryLogs: DbTelemetryLogRow[];
}): ESP32Node[] {
  const byId = new Map<string, ESP32Node>();

  for (const row of params.legacyNodes) {
    byId.set(row.id, mapDbNodeToDomain(row));
  }

  for (const dn of params.deviceNodes) {
    const existing = byId.get(dn.node_id);
    const dnLastSeen = dn.last_seen || new Date().toISOString();
    if (existing) {
      const existingTs = new Date(existing.lastSeen).getTime() || 0;
      const dnTs = new Date(dnLastSeen).getTime() || 0;
      byId.set(dn.node_id, {
        ...existing,
        name: dn.name || existing.name,
        ipAddress: dn.ip_address || existing.ipAddress,
        wifiSsid: dn.wifi_ssid || existing.wifiSsid,
        firmwareVersion: dn.firmware_version || existing.firmwareVersion,
        deviceToken: dn.device_token || existing.deviceToken,
        lastSeen: dnTs >= existingTs ? dnLastSeen : existing.lastSeen,
      });
    } else {
      byId.set(dn.node_id, {
        id: dn.node_id,
        userId: 'user-demo-1',
        name: dn.name || dn.node_id,
        roomLabel: 'Ruangan Utama',
        macAddress: '',
        ipAddress: dn.ip_address || '',
        wifiSsid: dn.wifi_ssid || undefined,
        firmwareVersion: dn.firmware_version || 'v2.7.3-esp8266-led-d3',
        deviceToken: dn.device_token || '',
        tokenHash: dn.device_token || '',
        lastSeen: dnLastSeen,
        temperature: 0,
        humidity: 0,
        telemetryHistory: [],
        pinout: {
          dht22: 'GPIO 21',
          irRx: 'GPIO 18',
          irTx: 'Multi-Channel 1–4',
        },
      });
    }
  }

  // Group telemetry_logs by node_id (newest first)
  const logsByNode = new Map<string, DbTelemetryLogRow[]>();
  for (const log of params.telemetryLogs) {
    if (!log.node_id) continue;
    const list = logsByNode.get(log.node_id) || [];
    list.push(log);
    logsByNode.set(log.node_id, list);
  }

  for (const [nodeId, rawLogs] of logsByNode.entries()) {
    const sortedDesc = [...rawLogs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sortedDesc[0];
    if (!latest) continue;

    const existing = byId.get(nodeId) || {
      id: nodeId,
      userId: 'user-demo-1',
      name: nodeId === 'esp8266-utama' ? 'ESP8266 Utama' : nodeId,
      roomLabel: 'Ruangan Utama',
      macAddress: '',
      ipAddress: '',
      firmwareVersion: 'v2.7.3-esp8266-led-d3',
      deviceToken: '',
      tokenHash: '',
      lastSeen: latest.created_at,
      temperature: 0,
      humidity: 0,
      telemetryHistory: [],
      pinout: {
        dht22: 'GPIO 21' as const,
        irRx: 'GPIO 18' as const,
        irTx: 'Multi-Channel 1–4' as const,
      },
    };

    const latestTemp = parseOptionalNumber(latest.temperature);
    const latestHum = parseOptionalNumber(latest.humidity);

    // Find newest log with valid PZEM reading (in case one cycle missed PZEM)
    const latestPzemLog =
      sortedDesc.find((l) => {
        const v = parseOptionalNumber(l.voltage);
        return v !== null && v > 0;
      }) || latest;

    const voltage = parseOptionalNumber(latestPzemLog.voltage);
    const current = parseOptionalNumber(latestPzemLog.current);
    const power = parseOptionalNumber(latestPzemLog.power);
    const energy = parseOptionalNumber(latestPzemLog.energy);
    const frequency = parseOptionalNumber(latestPzemLog.frequency);
    const pf = parseOptionalNumber(latestPzemLog.power_factor);

    const hasPzem =
      voltage !== null ||
      current !== null ||
      power !== null ||
      energy !== null ||
      frequency !== null ||
      pf !== null;

    // Build chronological temperature sparkline from telemetry_logs (up to 16 points)
    const logHistory: TelemetryPoint[] = sortedDesc
      .filter((l) => {
        const t = parseOptionalNumber(l.temperature);
        return t !== null && t > 0;
      })
      .slice(0, 16)
      .reverse()
      .map((l) => ({
        time: formatIsoToWibHHMM(l.created_at),
        temp: Number(l.temperature),
        humidity: Math.round(Number(l.humidity ?? 0)),
      }));

    const existingTs = new Date(existing.lastSeen).getTime() || 0;
    const latestTs = new Date(latest.created_at).getTime() || 0;

    byId.set(nodeId, {
      ...existing,
      lastSeen: latestTs >= existingTs ? latest.created_at : existing.lastSeen,
      temperature: latestTemp !== null && latestTemp > 0 ? latestTemp : existing.temperature,
      humidity: latestHum !== null && latestHum > 0 ? Math.round(latestHum) : existing.humidity,
      rssi: typeof latest.rssi === 'number' ? latest.rssi : existing.rssi,
      pzem: hasPzem
        ? { voltage, current, power, energy, frequency, pf }
        : existing.pzem,
      liveAcState:
        typeof latest.ac_power === 'boolean' || latest.ac_protocol
          ? {
              power: Boolean(latest.ac_power),
              temp: Number(latest.ac_temp ?? 24),
              mode: normalizeAcMode(latest.ac_mode),
              fan: normalizeFanSpeed(latest.ac_fan),
              protocol: latest.ac_protocol || 'DAIKIN',
            }
          : existing.liveAcState,
      telemetryHistory:
        logHistory.length >= 2
          ? logHistory
          : logHistory.length === 1 && existing.telemetryHistory.length < 2
          ? logHistory
          : existing.telemetryHistory,
    });
  }

  return Array.from(byId.values());
}

export function mapDomainNodeToDb(node: ESP32Node): DbEsp32NodeRow {
  const base: DbEsp32NodeRow = {
    id: node.id,
    user_id: node.userId,
    name: node.name,
    room_label: node.roomLabel,
    mac_address: node.macAddress,
    ip_address: node.ipAddress,
    firmware_version: node.firmwareVersion,
    device_token: node.deviceToken,
    token_hash: node.tokenHash,
    last_seen: node.lastSeen,
    temperature: Number(node.temperature.toFixed(1)),
    humidity: Math.round(node.humidity),
    telemetry_history: node.telemetryHistory,
  };

  if (node.pzem) {
    base.voltage = node.pzem.voltage;
    base.current = node.pzem.current;
    base.power = node.pzem.power;
    base.energy = node.pzem.energy;
    base.frequency = node.pzem.frequency;
    base.pf = node.pzem.pf;
  }

  return base;
}

export function mapDbApplianceToDomain(row: DbAcApplianceRow): ACAppliance {
  const defaultState: ACState = {
    power: false,
    temp: 24,
    mode: 'cool',
    fan: 'auto',
    swing: false,
  };

  return {
    id: row.id,
    esp32Id: row.esp32_id,
    name: row.name,
    brand: row.brand,
    protocol: row.protocol,
    protocolBits: Number(row.protocol_bits ?? 216),
    irTxPin: normalizeIrTxPin(row.ir_tx_pin),
    state: row.current_state ? { ...defaultState, ...row.current_state } : defaultState,
    lastUpdated: row.last_updated,
    lastSource: row.last_source || 'Web',
  };
}

export function mapDomainApplianceToDb(app: ACAppliance): DbAcApplianceRow {
  return {
    id: app.id,
    esp32_id: app.esp32Id,
    name: app.name,
    brand: app.brand,
    protocol: app.protocol,
    protocol_bits: app.protocolBits,
    ir_tx_pin: app.irTxPin,
    current_state: app.state,
    last_source: app.lastSource,
    last_updated: app.lastUpdated,
  };
}

export function mapDbCommandToDomain(row: DbDeviceCommandRow): DeviceCommand {
  return {
    id: row.id,
    esp32Id: row.esp32_id || row.node_id || '',
    esp32Name: row.esp32_name || row.node_id || '',
    applianceId: row.appliance_id || '',
    applianceName: row.appliance_name || row.command || '',
    source: row.source || 'Web',
    actionSummary: row.action_summary || row.command || 'Perintah AC',
    payload: row.payload,
    status: row.status,
    latencyMs: row.latency_ms ?? undefined,
    createdAt: row.created_at,
    executedAt: row.executed_at ?? undefined,
  };
}

export type FirmwareCommandAction =
  | 'set_ac'
  | 'power'
  | 'learn_ir'
  | 'test_ir'
  | 'reset_energy';

export function mapDomainCommandToDb(
  cmd: DeviceCommand,
  firmwareCommand: FirmwareCommandAction = 'set_ac'
): DbDeviceCommandRow {
  return {
    id: cmd.id,
    esp32_id: cmd.esp32Id,
    node_id: cmd.esp32Id,
    command: firmwareCommand,
    esp32_name: cmd.esp32Name,
    appliance_id: cmd.applianceId || null,
    appliance_name: cmd.applianceName,
    source: cmd.source,
    action_summary: cmd.actionSummary,
    payload: cmd.payload,
    status: cmd.status,
    latency_ms: cmd.latencyMs ?? null,
    created_at: cmd.createdAt,
    executed_at: cmd.executedAt ?? null,
  };
}

export function isTableMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (error.message?.includes('Could not find the table') ?? false)
  );
}

export interface SupabaseSnapshotResult {
  connected: boolean;
  schemaReady: boolean;
  errorMessage?: string;
  esp32Nodes?: ESP32Node[];
  appliances?: ACAppliance[];
  commands?: DeviceCommand[];
  learnedIrCodes?: LearnedIrCode[];
}

export async function fetchAllFromSupabase(): Promise<SupabaseSnapshotResult> {
  try {
    const supabase = getSupabaseServerClient();
    const [
      nodesRes,
      deviceNodesRes,
      telemetryLogsRes,
      appsRes,
      cmdsRes,
      learnedIrRes,
    ] = await Promise.all([
      supabase
        .from('esp32_nodes')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase.from('device_nodes').select('*'),
      supabase
        .from('telemetry_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('ac_appliances')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('device_commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('ir_learned_codes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const coreError = nodesRes.error && deviceNodesRes.error ? nodesRes.error : null;
    if (coreError) {
      if (isTableMissingError(coreError)) {
        return {
          connected: true,
          schemaReady: false,
          errorMessage: 'Tabel belum dibuat di Supabase SQL Editor.',
        };
      }
      return {
        connected: false,
        schemaReady: false,
        errorMessage: coreError.message,
      };
    }

    const mergedNodes = mergeLiveDeviceData({
      legacyNodes: (nodesRes.data || []) as DbEsp32NodeRow[],
      deviceNodes: (deviceNodesRes.data || []) as DbDeviceNodeRow[],
      telemetryLogs: (telemetryLogsRes.data || []) as DbTelemetryLogRow[],
    });

    const learnedIrCodes: LearnedIrCode[] = (
      (learnedIrRes.data || []) as DbIrLearnedCodeRow[]
    ).map((row) => ({
      id: String(row.id),
      nodeId: row.node_id,
      protocol: row.protocol || 'UNKNOWN',
      rawHex: row.raw_hex || '',
      bits: Number(row.bits ?? 0),
      createdAt: row.created_at,
    }));

    return {
      connected: true,
      schemaReady: true,
      esp32Nodes: mergedNodes,
      appliances: ((appsRes.data || []) as DbAcApplianceRow[]).map(
        mapDbApplianceToDomain
      ),
      commands: ((cmdsRes.data || []) as DbDeviceCommandRow[]).map(
        mapDbCommandToDomain
      ),
      learnedIrCodes,
    };
  } catch (err: unknown) {
    return {
      connected: false,
      schemaReady: false,
      errorMessage:
        err instanceof Error ? err.message : 'Supabase connection error',
    };
  }
}

export async function upsertNodeInSupabase(node: ESP32Node): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const dbPayload = mapDomainNodeToDb(node);
    const { error } = await supabase
      .from('esp32_nodes')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
      const isMissingColumn =
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message.includes('column');
      if (isMissingColumn && node.pzem) {
        const legacyPayload = { ...dbPayload };
        delete legacyPayload.voltage;
        delete legacyPayload.current;
        delete legacyPayload.power;
        delete legacyPayload.energy;
        delete legacyPayload.frequency;
        delete legacyPayload.pf;
        const retry = await supabase
          .from('esp32_nodes')
          .upsert(legacyPayload, { onConflict: 'id' });
        if (!retry.error) return { ok: true };
        return { ok: false, error: retry.error.message };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upsert node failed' };
  }
}

export async function deleteNodeInSupabase(nodeId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('esp32_nodes').delete().eq('id', nodeId);
    await supabase.from('device_nodes').delete().eq('node_id', nodeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete node failed' };
  }
}

export async function upsertApplianceInSupabase(app: ACAppliance): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from('ac_appliances')
      .upsert(mapDomainApplianceToDb(app), { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upsert appliance failed' };
  }
}

export async function deleteApplianceInSupabase(applianceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('ac_appliances').delete().eq('id', applianceId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete appliance failed' };
  }
}

export async function insertCommandInSupabase(
  cmd: DeviceCommand,
  firmwareCommand: FirmwareCommandAction = 'set_ac'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const dbRow = mapDomainCommandToDb(cmd, firmwareCommand);
    const { error } = await supabase
      .from('device_commands')
      .upsert(dbRow, { onConflict: 'id' });

    if (error) {
      const isMissingColumn =
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message.includes('column');
      if (isMissingColumn) {
        const legacyRow = { ...dbRow };
        delete legacyRow.node_id;
        delete legacyRow.command;
        const retry = await supabase
          .from('device_commands')
          .upsert(legacyRow, { onConflict: 'id' });
        if (!retry.error) return { ok: true };
        return { ok: false, error: retry.error.message };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Insert command failed' };
  }
}

export async function insertScannerEventInSupabase(params: {
  esp32Id: string;
  protocol: string;
  bits: number;
  sampleHex: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('ir_scanner_events').insert({
      esp32_id: params.esp32Id,
      protocol: params.protocol,
      bits: params.bits,
      sample_hex: params.sampleHex,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Insert scanner event failed' };
  }
}

export async function fetchPendingCommandsForNode(
  esp32Id: string
): Promise<{ ok: boolean; commands: DeviceCommand[]; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('device_commands')
      .select('*')
      .eq('esp32_id', esp32Id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);
    if (error) return { ok: false, commands: [], error: error.message };

    const commands = ((data || []) as DbDeviceCommandRow[]).map(mapDbCommandToDomain);

    if (commands.length > 0) {
      const ids = commands.map((c) => c.id);
      await supabase
        .from('device_commands')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          latency_ms: 280,
        })
        .in('id', ids);
    }

    return { ok: true, commands };
  } catch (err: unknown) {
    return {
      ok: false,
      commands: [],
      error: err instanceof Error ? err.message : 'Fetch pending commands failed',
    };
  }
}
