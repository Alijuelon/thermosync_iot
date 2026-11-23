import {
  type ACAppliance,
  type ACState,
  type CommandSource,
  type CommandStatus,
  type DeviceCommand,
  type ESP32Node,
  type FullStateIRPayload,
  type IrTxPin,
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
  esp32_id: string;
  esp32_name: string;
  appliance_id: string | null;
  appliance_name: string;
  source: CommandSource;
  action_summary: string;
  payload: FullStateIRPayload;
  status: CommandStatus;
  latency_ms: number | null;
  created_at: string;
  executed_at: string | null;
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
    firmwareVersion: row.firmware_version || 'v2.7.0-esp8266-pzem',
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
    esp32Id: row.esp32_id,
    esp32Name: row.esp32_name || '',
    applianceId: row.appliance_id || '',
    applianceName: row.appliance_name || '',
    source: row.source,
    actionSummary: row.action_summary,
    payload: row.payload,
    status: row.status,
    latencyMs: row.latency_ms ?? undefined,
    createdAt: row.created_at,
    executedAt: row.executed_at ?? undefined,
  };
}

export function mapDomainCommandToDb(cmd: DeviceCommand): DbDeviceCommandRow {
  return {
    id: cmd.id,
    esp32_id: cmd.esp32Id,
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
}

export async function fetchAllFromSupabase(): Promise<SupabaseSnapshotResult> {
  try {
    const supabase = getSupabaseServerClient();
    const [nodesRes, appsRes, cmdsRes] = await Promise.all([
      supabase
        .from('esp32_nodes')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('ac_appliances')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('device_commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const firstError = nodesRes.error || appsRes.error || cmdsRes.error;
    if (firstError) {
      if (isTableMissingError(firstError)) {
        return {
          connected: true,
          schemaReady: false,
          errorMessage: 'Tabel belum dibuat di Supabase SQL Editor.',
        };
      }
      return {
        connected: false,
        schemaReady: false,
        errorMessage: firstError.message,
      };
    }

    return {
      connected: true,
      schemaReady: true,
      esp32Nodes: ((nodesRes.data || []) as DbEsp32NodeRow[]).map(mapDbNodeToDomain),
      appliances: ((appsRes.data || []) as DbAcApplianceRow[]).map(mapDbApplianceToDomain),
      commands: ((cmdsRes.data || []) as DbDeviceCommandRow[]).map(mapDbCommandToDomain),
    };
  } catch (err: unknown) {
    return {
      connected: false,
      schemaReady: false,
      errorMessage: err instanceof Error ? err.message : 'Supabase connection error',
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
      // Graceful fallback if PZEM columns haven't been altered into Supabase yet
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

export async function insertCommandInSupabase(cmd: DeviceCommand): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from('device_commands')
      .upsert(mapDomainCommandToDb(cmd), { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };
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

    // Mark returned commands as executed
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
