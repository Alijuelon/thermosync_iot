import { NextRequest, NextResponse } from 'next/server';
import {
  createInitialSeedData,
  buildFullStatePayload,
  formatCommandSummary,
  hashDeviceToken,
  isEsp32Online,
  type ESP32Node,
  type ACAppliance,
  type DeviceCommand,
  type ACState,
} from '@/lib/iot-engine';

declare global {
  var _iotMemoryStore:
    | {
        esp32Nodes: ESP32Node[];
        appliances: ACAppliance[];
        commands: DeviceCommand[];
      }
    | undefined;
}

function getStore() {
  if (!global._iotMemoryStore) {
    global._iotMemoryStore = createInitialSeedData(Date.now());
  }
  return global._iotMemoryStore;
}

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    esp32Nodes: store.esp32Nodes,
    appliances: store.appliances,
    commands: store.commands,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const store = getStore();
    const { action } = body;

    // 1. Asynchronous Command Queue insertion (Section 4.3)
    if (action === 'queue_command') {
      const { applianceId, nextState, source = 'Web', simulateTimeout = false } = body as {
        applianceId: string;
        nextState: Partial<ACState>;
        source?: 'Web' | 'Remote Fisik' | 'Scanner';
        simulateTimeout?: boolean;
      };

      const appliance = store.appliances.find((a) => a.id === applianceId);
      if (!appliance) {
        return NextResponse.json({ error: 'Perangkat AC tidak ditemukan' }, { status: 404 });
      }
      const esp32 = store.esp32Nodes.find((e) => e.id === appliance.esp32Id);
      if (!esp32) {
        return NextResponse.json({ error: 'Unit ESP32 tidak ditemukan' }, { status: 404 });
      }

      const online = isEsp32Online(esp32.lastSeen);
      const payload = buildFullStatePayload(appliance, nextState);
      const nowIso = new Date().toISOString();

      const command: DeviceCommand = {
        id: `cmd-${Date.now()}`,
        esp32Id: esp32.id,
        esp32Name: esp32.name,
        applianceId: appliance.id,
        applianceName: appliance.name,
        source,
        actionSummary:
          source === 'Remote Fisik'
            ? `Hybrid Sync (VS1838B GPIO 18): ${formatCommandSummary(payload)}`
            : formatCommandSummary(payload),
        payload,
        status: !online || simulateTimeout ? 'pending' : 'executed',
        latencyMs: !online || simulateTimeout ? undefined : Math.floor(240 + Math.random() * 320),
        createdAt: nowIso,
        executedAt: !online || simulateTimeout ? undefined : new Date(Date.now() + 310).toISOString(),
      };

      store.commands = [command, ...store.commands.slice(0, 49)];

      if (online && !simulateTimeout) {
        appliance.state = {
          power: payload.power,
          temp: payload.temp,
          mode: payload.mode,
          fan: payload.fan,
          swing: payload.swing,
        };
        appliance.lastUpdated = nowIso;
        appliance.lastSource = source;
      }

      return NextResponse.json({
        ok: true,
        command,
        appliance,
      });
    }

    // 2. ESP32 Heartbeat & DHT22 Telemetry endpoint (FR-A3, FR-B1, FR-B2)
    if (action === 'esp32_heartbeat') {
      const { esp32Id, deviceToken, temperature, humidity } = body;
      const node = store.esp32Nodes.find((n) => n.id === esp32Id);
      if (!node) {
        return NextResponse.json({ error: 'ESP32 ID tidak terdaftar' }, { status: 404 });
      }
      if (deviceToken && hashDeviceToken(deviceToken) !== node.tokenHash) {
        return NextResponse.json({ error: 'Invalid device_token hash' }, { status: 401 });
      }
      node.lastSeen = new Date().toISOString();
      if (typeof temperature === 'number') node.temperature = Number(temperature.toFixed(1));
      if (typeof humidity === 'number') node.humidity = Math.round(humidity);

      return NextResponse.json({
        ok: true,
        node,
      });
    }

    return NextResponse.json({ error: 'Action tidak dikenali' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
