import { NextRequest, NextResponse } from 'next/server';
import {
  buildFullStatePayload,
  formatCommandSummary,
  hashDeviceToken,
  type ESP32Node,
  type ACAppliance,
  type DeviceCommand,
  type ACState,
} from '@/lib/iot-engine';
import {
  fetchAllFromSupabase,
  upsertNodeInSupabase,
  deleteNodeInSupabase,
  upsertApplianceInSupabase,
  deleteApplianceInSupabase,
  insertCommandInSupabase,
  insertScannerEventInSupabase,
  fetchPendingCommandsForNode,
} from '@/lib/supabase-iot-repo';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function extractBearerToken(req: NextRequest, fallbackToken?: string): string {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return fallbackToken || '';
}

export async function GET() {
  const dbSnapshot = await fetchAllFromSupabase();

  if (dbSnapshot.schemaReady) {
    return NextResponse.json({
      ok: true,
      source: 'supabase',
      supabase: {
        connected: true,
        schemaReady: true,
      },
      timestamp: new Date().toISOString(),
      esp32Nodes: dbSnapshot.esp32Nodes || [],
      appliances: dbSnapshot.appliances || [],
      commands: dbSnapshot.commands || [],
    });
  }

  return NextResponse.json({
    ok: false,
    source: 'unavailable',
    supabase: {
      connected: dbSnapshot.connected,
      schemaReady: false,
      message: dbSnapshot.errorMessage,
    },
    timestamp: new Date().toISOString(),
    esp32Nodes: [],
    appliances: [],
    commands: [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. Queue AC IR command into Supabase for real ESP8266 execution
    if (action === 'queue_command') {
      const {
        applianceId,
        applianceSnapshot,
        nodeSnapshot,
        nextState,
        source = 'Web',
      } = body as {
        applianceId: string;
        applianceSnapshot?: ACAppliance;
        nodeSnapshot?: ESP32Node;
        nextState: Partial<ACState>;
        source?: 'Web' | 'Remote Fisik' | 'Scanner';
      };

      const dbSnapshot = await fetchAllFromSupabase();
      const appliance =
        dbSnapshot.appliances?.find((a) => a.id === applianceId) ||
        applianceSnapshot;
      if (!appliance) {
        return NextResponse.json(
          { error: 'Perangkat AC tidak ditemukan' },
          { status: 404 }
        );
      }

      const esp32 =
        dbSnapshot.esp32Nodes?.find((e) => e.id === appliance.esp32Id) ||
        nodeSnapshot;
      if (!esp32) {
        return NextResponse.json(
          { error: 'Unit ESP8266 tidak ditemukan' },
          { status: 404 }
        );
      }

      const payload = buildFullStatePayload(appliance, nextState);
      const nowIso = new Date().toISOString();

      const command: DeviceCommand = {
        id: `cmd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        esp32Id: esp32.id,
        esp32Name: esp32.name,
        applianceId: appliance.id,
        applianceName: appliance.name,
        source,
        actionSummary:
          source === 'Remote Fisik'
            ? `Remote Fisik: ${formatCommandSummary(payload)}`
            : formatCommandSummary(payload),
        payload,
        status: 'pending',
        createdAt: nowIso,
      };

      const updatedAppliance: ACAppliance = {
        ...appliance,
        state: {
          power: payload.power,
          temp: payload.temp,
          mode: payload.mode,
          fan: payload.fan,
          swing: payload.swing,
        },
        lastUpdated: nowIso,
        lastSource: source,
      };

      const [cmdRes, appRes] = await Promise.all([
        insertCommandInSupabase(command, 'set_ac'),
        upsertApplianceInSupabase(updatedAppliance),
      ]);

      return NextResponse.json({
        ok: cmdRes.ok && appRes.ok,
        persisted: cmdRes.ok && appRes.ok,
        command,
        appliance: updatedAppliance,
      });
    }

    // 1B. Hardware Node Command (reset_energy / learn_ir) for final ESP8266 firmware
    if (action === 'hardware_command') {
      const { esp32Id, esp32Name, firmwareCommand } = body as {
        esp32Id: string;
        esp32Name?: string;
        firmwareCommand: 'reset_energy' | 'learn_ir';
      };

      if (!esp32Id || (firmwareCommand !== 'reset_energy' && firmwareCommand !== 'learn_ir')) {
        return NextResponse.json(
          { error: 'Perintah hardware tidak valid' },
          { status: 400 }
        );
      }

      const nowIso = new Date().toISOString();
      const command: DeviceCommand = {
        id: `cmd-hw-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        esp32Id,
        esp32Name: esp32Name || esp32Id,
        applianceId: '',
        applianceName:
          firmwareCommand === 'reset_energy' ? 'PZEM-004T v4.0' : 'IR Receiver D6',
        source: firmwareCommand === 'learn_ir' ? 'Scanner' : 'Web',
        actionSummary:
          firmwareCommand === 'reset_energy'
            ? 'Reset Energi Kumulatif (kWh -> 0)'
            : 'Aktifkan Mode Learning IR (D6)',
        payload: {
          power: false,
          temp: 24,
          mode: 'cool',
          fan: 'auto',
          swing: false,
          protocol: 'DAIKIN',
          protocolBits: 216,
          freqKhz: 38,
          gpioTx: 23,
          iracClass: 'IRac',
        },
        status: 'pending',
        createdAt: nowIso,
      };

      const cmdRes = await insertCommandInSupabase(command, firmwareCommand);
      return NextResponse.json({
        ok: cmdRes.ok,
        persisted: cmdRes.ok,
        error: cmdRes.error,
        command,
      });
    }

    // 2. Upsert ESP8266 Node
    if (action === 'upsert_node') {
      const { node } = body as { node: ESP32Node };
      if (!node?.id || !node?.name) {
        return NextResponse.json(
          { error: 'Data perangkat ESP8266 tidak lengkap' },
          { status: 400 }
        );
      }
      const dbRes = await upsertNodeInSupabase(node);
      return NextResponse.json({
        ok: dbRes.ok,
        persisted: dbRes.ok,
        error: dbRes.error,
        node,
      });
    }

    // 3. Delete ESP8266 Node
    if (action === 'delete_node') {
      const { esp32Id } = body as { esp32Id: string };
      const dbRes = await deleteNodeInSupabase(esp32Id);
      return NextResponse.json({
        ok: dbRes.ok,
        persisted: dbRes.ok,
        error: dbRes.error,
      });
    }

    // 4. Upsert AC Appliance (Add, Edit, or Scanner Save)
    if (action === 'upsert_appliance') {
      const { appliance, command } = body as {
        appliance: ACAppliance;
        command?: DeviceCommand;
      };
      if (!appliance?.id || !appliance?.esp32Id) {
        return NextResponse.json(
          { error: 'Data unit AC tidak lengkap' },
          { status: 400 }
        );
      }
      const appRes = await upsertApplianceInSupabase(appliance);
      if (command) {
        await insertCommandInSupabase(command);
      }
      return NextResponse.json({
        ok: appRes.ok,
        persisted: appRes.ok,
        error: appRes.error,
        appliance,
      });
    }

    // 5. Delete AC Appliance
    if (action === 'delete_appliance') {
      const { applianceId } = body as { applianceId: string };
      const dbRes = await deleteApplianceInSupabase(applianceId);
      return NextResponse.json({
        ok: dbRes.ok,
        persisted: dbRes.ok,
        error: dbRes.error,
      });
    }

    // 6. Clear command history for a user's nodes
    if (action === 'clear_history') {
      const { esp32Ids } = body as { esp32Ids?: string[] };
      const supabase = getSupabaseServerClient();
      if (Array.isArray(esp32Ids) && esp32Ids.length > 0) {
        const { error } = await supabase
          .from('device_commands')
          .delete()
          .in('esp32_id', esp32Ids);
        return NextResponse.json({ ok: !error, error: error?.message });
      }
      return NextResponse.json({ ok: true });
    }

    // 7. ESP8266 Heartbeat, DHT22 + PZEM-004T Telemetry, and Command Polling
    if (
      action === 'heartbeat' ||
      action === 'esp32_heartbeat' ||
      action === 'poll_commands'
    ) {
      const {
        esp32Id,
        deviceToken,
        temperature,
        humidity,
        voltage,
        current,
        power,
        energy,
        frequency,
        pf,
        ipAddress,
        macAddress,
      } = body;
      const bearerToken = extractBearerToken(req, deviceToken);

      const dbSnapshot = await fetchAllFromSupabase();
      const allNodes = dbSnapshot.esp32Nodes || [];

      const node = allNodes.find(
        (n) =>
          (esp32Id && n.id === esp32Id) ||
          (bearerToken &&
            (n.deviceToken === bearerToken ||
              n.tokenHash === hashDeviceToken(bearerToken)))
      );

      if (!node) {
        return NextResponse.json(
          { error: 'Device token atau ID perangkat tidak terdaftar di Supabase' },
          { status: 401 }
        );
      }

      const nowIso = new Date().toISOString();
      const nextNode: ESP32Node = {
        ...node,
        lastSeen: nowIso,
        ipAddress: ipAddress || node.ipAddress,
        macAddress: macAddress || node.macAddress,
      };

      if (typeof temperature === 'number' && !Number.isNaN(temperature) && temperature > 0) {
        nextNode.temperature = Number(temperature.toFixed(1));
      }
      if (typeof humidity === 'number' && !Number.isNaN(humidity) && humidity > 0) {
        nextNode.humidity = Math.round(humidity);
      }
      if (typeof voltage === 'number' && Number.isFinite(voltage) && voltage > 0) {
        nextNode.pzem = {
          voltage: Number(voltage.toFixed(1)),
          current: typeof current === 'number' && Number.isFinite(current) ? Number(current.toFixed(2)) : 0,
          power: typeof power === 'number' && Number.isFinite(power) ? Number(power.toFixed(1)) : 0,
          energy: typeof energy === 'number' && Number.isFinite(energy) ? Number(energy.toFixed(3)) : 0,
          frequency: typeof frequency === 'number' && Number.isFinite(frequency) ? Number(frequency.toFixed(1)) : 50.0,
          pf: typeof pf === 'number' && Number.isFinite(pf) ? Number(pf.toFixed(2)) : 0,
        };
      }
      if (
        action !== 'poll_commands' &&
        typeof temperature === 'number' &&
        temperature > 0 &&
        typeof humidity === 'number' &&
        humidity > 0
      ) {
        const d = new Date(Date.now() + 7 * 3600 * 1000);
        const timeLabel = `${String(d.getUTCHours()).padStart(2, '0')}:${String(
          d.getUTCMinutes()
        ).padStart(2, '0')}`;
        nextNode.telemetryHistory = [
          ...nextNode.telemetryHistory.slice(-11),
          {
            time: timeLabel,
            temp: nextNode.temperature,
            humidity: nextNode.humidity,
          },
        ];
      }

      await upsertNodeInSupabase(nextNode);
      const pendingRes = await fetchPendingCommandsForNode(nextNode.id);

      return NextResponse.json({
        ok: true,
        node: nextNode,
        pendingCommands: pendingRes.ok ? pendingRes.commands : [],
      });
    }

    // 8. ESP8266 IR Scanner Capture (VS1838B on D6 / GPIO 12)
    if (action === 'scanner_capture') {
      const { esp32Id, deviceToken, protocol, bits, sampleHex } = body;
      const bearerToken = extractBearerToken(req, deviceToken);
      const dbSnapshot = await fetchAllFromSupabase();
      const allNodes = dbSnapshot.esp32Nodes || [];

      const node = allNodes.find(
        (n) =>
          (esp32Id && n.id === esp32Id) ||
          (bearerToken &&
            (n.deviceToken === bearerToken ||
              n.tokenHash === hashDeviceToken(bearerToken)))
      );

      if (!node) {
        return NextResponse.json(
          { error: 'Device token tidak valid' },
          { status: 401 }
        );
      }

      const dbRes = await insertScannerEventInSupabase({
        esp32Id: node.id,
        protocol: String(protocol || 'UNKNOWN'),
        bits: Number(bits || 0),
        sampleHex: String(sampleHex || ''),
      });

      return NextResponse.json({
        ok: dbRes.ok,
        persisted: dbRes.ok,
        esp32Id: node.id,
        protocol,
        bits,
      });
    }

    return NextResponse.json({ error: 'Action tidak dikenali' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
