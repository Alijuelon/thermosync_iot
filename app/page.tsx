'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Sliders,
  Scan,
  Cpu,
  History,
  Sun,
  Moon,
  Power,
  Thermometer,
  Droplets,
  Radio,
  Globe,
  ArrowUpRight,
  User,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Loader2,
  PowerOff,
  Snowflake,
  Sparkles,
  Wind,
  Shield,
  Zap,
} from 'lucide-react';
import {
  INITIAL_SEED_TIMESTAMP,
  formatTimeHHMMSS,
  isEsp32Online,
  formatLastSeenLabel,
  buildFullStatePayload,
  formatCommandSummary,
  generateDeviceToken,
  getIrChannelInfo,
  hasMultipleActiveChannels,
  hasPzemReading,
  formatPzemPower,
  evaluateRssiStatus,
  IR_PROTOCOL_CATALOG,
  type ESP32Node,
  type ACAppliance,
  type DeviceCommand,
  type ACState,
  type CommandSource,
  type IrTxPin,
  type LearnedIrCode,
} from '@/lib/iot-engine';
import { SparklineChart } from '@/components/sparkline-chart';
import { PzemTelemetryPanel } from '@/components/pzem-telemetry-panel';
import { UniversalACController } from '@/components/universal-ac-controller';
import { AutomaticScannerWizard } from '@/components/automatic-scanner-wizard';
import { DevicesManagement } from '@/components/devices-management';
import { HistoryActivityView } from '@/components/history-activity-view';
import { AuthModal, type UserSession } from '@/components/auth-modal';
import { getSupabaseClient } from '@/lib/supabase';

type NavSection = 'dashboard' | 'controller' | 'scanner' | 'devices' | 'history';

export default function ThermoSyncApp() {
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(INITIAL_SEED_TIMESTAMP);

  const [esp32Nodes, setEsp32Nodes] = useState<ESP32Node[]>([]);
  const [appliances, setAppliances] = useState<ACAppliance[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [learnedIrCodes, setLearnedIrCodes] = useState<LearnedIrCode[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  const [selectedApplianceId, setSelectedApplianceId] = useState<string>('');
  const [scannerTargetEsp32Id, setScannerTargetEsp32Id] = useState<
    string | undefined
  >(undefined);

  // Bulk "Nyalakan Semua" & "Matikan Semua" staggered queue feedback
  const [confirmBulkOffHubId, setConfirmBulkOffHubId] = useState<string | null>(
    null
  );
  const [bulkQueueStatus, setBulkQueueStatus] = useState<
    Record<string, { step: number; total: number }>
  >({});
  const [resettingEnergyNodeId, setResettingEnergyNodeId] = useState<string | null>(
    null
  );

  const [syncState, setSyncState] = useState<{
    status: 'idle' | 'sending' | 'confirmed' | 'remote_synced' | 'timeout_error';
    message: string;
    latencyMs?: number;
  }>({
    status: 'idle',
    message: 'Siap',
  });

  const [toastBanner, setToastBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const [currentUser, setCurrentUser] = useState<UserSession | null>({
    id: 'user-demo-1',
    email: 'alijuelonsinaga01@gmail.com',
    name: 'Josua',
    role: 'Pemilik Utama',
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // RLS Data Isolation: Only display Hubs, ACs, and Command History owned by currentUser
  const activeUserId = currentUser?.id || 'user-demo-1';
  const userEsp32Nodes = esp32Nodes.filter((n) => n.userId === activeUserId);
  const userHubIds = new Set(userEsp32Nodes.map((n) => n.id));
  const userAppliances = appliances.filter((a) => userHubIds.has(a.esp32Id));
  const userCommands = commands.filter((c) => userHubIds.has(c.esp32Id));

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Hydrate live actual data from Supabase via /api/iot and subscribe to Realtime changes
  useEffect(() => {
    let isCancelled = false;
    let realtimeCleanup: (() => void) | null = null;

    const loadFromBackend = async () => {
      try {
        const res = await fetch('/api/iot', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (isCancelled || data?.source !== 'supabase') return;

        if (Array.isArray(data.esp32Nodes)) {
          setEsp32Nodes(data.esp32Nodes);
        }
        if (Array.isArray(data.appliances)) {
          setAppliances(data.appliances);
          setSelectedApplianceId((prev) =>
            data.appliances.some((a: ACAppliance) => a.id === prev)
              ? prev
              : data.appliances[0]?.id || ''
          );
        }
        if (Array.isArray(data.commands)) {
          setCommands(data.commands);
        }
        if (Array.isArray(data.learnedIrCodes)) {
          setLearnedIrCodes(data.learnedIrCodes);
        }
        setNowMs(Date.now());

        if (!realtimeCleanup) {
          const supabase = getSupabaseClient();
          const channel = supabase
            .channel('thermosync-realtime-sync')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'esp32_nodes' },
              () => {
                void loadFromBackend();
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'device_nodes' },
              () => {
                void loadFromBackend();
              }
            )
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'telemetry_logs' },
              () => {
                void loadFromBackend();
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'ac_appliances' },
              () => {
                void loadFromBackend();
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'device_commands' },
              () => {
                void loadFromBackend();
              }
            )
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'ir_learned_codes' },
              () => {
                void loadFromBackend();
              }
            )
            .subscribe();

          realtimeCleanup = () => {
            void supabase.removeChannel(channel);
          };
        }
      } catch {
        // Keep current state if network temporarily unavailable
      } finally {
        if (!isCancelled) {
          setIsLoadingData(false);
        }
      }
    };

    void loadFromBackend();
    const tickTimer = setInterval(() => {
      if (!isCancelled) setNowMs(Date.now());
    }, 15000);

    return () => {
      isCancelled = true;
      clearInterval(tickTimer);
      if (realtimeCleanup) realtimeCleanup();
    };
  }, []);

  const persistIotMutation = (payload: Record<string, unknown>) => {
    void fetch('/api/iot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Non-blocking fallback when offline
    });
  };

  const showToast = (
    type: 'success' | 'warning' | 'error',
    text: string
  ) => {
    setToastBanner({ type, text });
    setTimeout(() => {
      setToastBanner((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const handleDispatchStateChange = async (
    applianceId: string,
    nextPartial: Partial<ACState>,
    source: CommandSource = 'Web',
    options?: { simulateTimeout?: boolean }
  ) => {
    const targetApp = appliances.find((a) => a.id === applianceId);
    if (!targetApp) return;

    const parentNode = esp32Nodes.find((n) => n.id === targetApp.esp32Id);
    if (!parentNode || !isEsp32Online(parentNode.lastSeen, nowMs)) {
      showToast('error', `${parentNode?.name || 'Smart Hub'} sedang Offline.`);
      return;
    }

    const previousState: ACState = { ...targetApp.state };
    const fullPayload = buildFullStatePayload(targetApp, nextPartial);
    const optimisticState: ACState = {
      power: fullPayload.power,
      temp: fullPayload.temp,
      mode: fullPayload.mode,
      fan: fullPayload.fan,
      swing: fullPayload.swing,
    };

    const currentTs = nowMs + 1000;
    setNowMs(currentTs);
    const pendingCmdId = `cmd-${currentTs}-${applianceId}`;
    const nowIso = new Date(currentTs).toISOString();
    const chBadge = getIrChannelInfo(targetApp.irTxPin).shortBadge;

    setAppliances((prev) =>
      prev.map((app) =>
        app.id === applianceId
          ? {
              ...app,
              state: optimisticState,
              lastUpdated: nowIso,
              lastSource: source,
            }
          : app
      )
    );

    const pendingCommand: DeviceCommand = {
      id: pendingCmdId,
      esp32Id: parentNode.id,
      esp32Name: parentNode.name,
      applianceId: targetApp.id,
      applianceName: targetApp.name,
      source,
      actionSummary:
        source === 'Remote Fisik'
          ? `Remote: ${formatCommandSummary(optimisticState)}`
          : `[${chBadge}] ${formatCommandSummary(optimisticState)}`,
      payload: fullPayload,
      status: 'pending',
      createdAt: nowIso,
    };

    setCommands((prev) => [pendingCommand, ...prev]);
    setSyncState({
      status: 'sending',
      message: 'Mengirim...',
    });

    if (options?.simulateTimeout) {
      setTimeout(() => {
        setAppliances((prev) =>
          prev.map((app) =>
            app.id === applianceId ? { ...app, state: previousState } : app
          )
        );
        setCommands((prev) =>
          prev.map((c) =>
            c.id === pendingCmdId ? { ...c, status: 'timeout' } : c
          )
        );
        setSyncState({
          status: 'timeout_error',
          message: 'Timeout · Rollback',
        });
        showToast('warning', 'Smart Hub tidak merespons. State dikembalikan.');
      }, 600);
      return;
    }

    let latencyMs = 240;
    try {
      const res = await fetch('/api/iot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue_command',
          applianceId,
          applianceSnapshot: targetApp,
          nodeSnapshot: parentNode,
          nextState: nextPartial,
          source,
        }),
      });
      const json = await res.json();
      if (typeof json?.command?.latencyMs === 'number') {
        latencyMs = json.command.latencyMs;
      }
    } catch {
      // Fallback
    }
    setTimeout(() => {
      setCommands((prev) =>
        prev.map((c) =>
          c.id === pendingCmdId
            ? {
                ...c,
                status: 'executed',
                latencyMs,
                executedAt: new Date(currentTs + latencyMs).toISOString(),
              }
            : c
        )
      );

      setSyncState({
        status: source === 'Remote Fisik' ? 'remote_synced' : 'confirmed',
        message:
          source === 'Remote Fisik' ? 'Sinkronisasi Remote' : 'Tersinkronisasi',
        latencyMs,
      });
    }, 250);
  };

  // Sequential Bulk Power Control (ON or OFF) with Staggered Queue Animation
  const handleBulkPowerHub = (esp32Id: string, targetPower: boolean) => {
    const hub = esp32Nodes.find((n) => n.id === esp32Id);
    if (!hub || !isEsp32Online(hub.lastSeen, nowMs)) return;

    const targetAppliances = appliances.filter(
      (a) => a.esp32Id === esp32Id && a.state.power !== targetPower
    );
    setConfirmBulkOffHubId(null);

    if (targetAppliances.length === 0) {
      showToast(
        'warning',
        `Semua AC di ${hub.name} sudah ${targetPower ? 'ON' : 'OFF'}.`
      );
      return;
    }

    const initialQueue: Record<string, { step: number; total: number }> = {};
    targetAppliances.forEach((ac, idx) => {
      initialQueue[ac.id] = {
        step: idx + 1,
        total: targetAppliances.length,
      };
    });
    setBulkQueueStatus((prev) => ({ ...prev, ...initialQueue }));

    targetAppliances.forEach((ac, idx) => {
      setTimeout(() => {
        handleDispatchStateChange(ac.id, { power: targetPower }, 'Web');
        setBulkQueueStatus((prev) => {
          const next = { ...prev };
          delete next[ac.id];
          return next;
        });
        if (idx === targetAppliances.length - 1) {
          showToast(
            'success',
            `${targetAppliances.length} AC di ${hub.name} berhasil ${
              targetPower ? 'dinyalakan' : 'dimatikan'
            } secara bersamaan.`
          );
        }
      }, (idx + 1) * 380);
    });
  };

  const handleSimulateHeartbeat = (esp32Id: string) => {
    const nextTs = nowMs + 1000;
    const nowIso = new Date(nextTs).toISOString();
    setNowMs(nextTs);
    setEsp32Nodes((prev) =>
      prev.map((node) => {
        if (node.id !== esp32Id) return node;
        const updated = { ...node, lastSeen: nowIso };
        persistIotMutation({ action: 'upsert_node', node: updated });
        return updated;
      })
    );
    showToast('success', 'Smart Hub kembali Online.');
  };

  const handleResetEnergyNode = async (node: ESP32Node) => {
    setResettingEnergyNodeId(node.id);
    try {
      const res = await fetch('/api/iot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hardware_command',
          esp32Id: node.id,
          esp32Name: node.name,
          firmwareCommand: 'reset_energy',
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        if (json.command) {
          setCommands((prev) => [json.command, ...prev]);
        }
        showToast(
          'success',
          `Perintah Reset kWh dikirim ke ${node.name}. Menunggu eksekusi ESP8266.`
        );
      } else {
        showToast(
          'error',
          json?.error || 'Gagal mengirim perintah Reset kWh ke Supabase.'
        );
      }
    } catch {
      showToast('error', 'Koneksi terputus saat mengirim Reset kWh.');
    } finally {
      setResettingEnergyNodeId(null);
    }
  };

  const handleTriggerLearnIr = async (esp32Id: string) => {
    const node = esp32Nodes.find((n) => n.id === esp32Id);
    try {
      const res = await fetch('/api/iot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hardware_command',
          esp32Id,
          esp32Name: node?.name || esp32Id,
          firmwareCommand: 'learn_ir',
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        if (json.command) {
          setCommands((prev) => [json.command, ...prev]);
        }
        showToast(
          'success',
          'Mode Scan Remote D6 diaktifkan. Arahkan remote AC ke sensor VS1838B.'
        );
      } else {
        showToast('error', json?.error || 'Gagal mengaktifkan mode scan IR.');
      }
    } catch {
      showToast('error', 'Koneksi gagal saat mengirim perintah scan IR.');
    }
  };

  const handleSendTestIrSignal = async (params: {
    esp32Id: string;
    brand: string;
    protocol: string;
    bits: number;
    power: boolean;
    temp: number;
    label: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    const node = esp32Nodes.find((n) => n.id === params.esp32Id);
    try {
      const res = await fetch('/api/iot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_ir_signal',
          esp32Id: params.esp32Id,
          esp32Name: node?.name || params.esp32Id,
          brand: params.brand,
          protocol: params.protocol,
          bits: params.bits,
          power: params.power,
          temp: params.temp,
          label: params.label,
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        if (json.command) {
          setCommands((prev) => [json.command, ...prev]);
        }
        showToast(
          'success',
          `Sinyal tes ${params.protocol} dikirim ke ${node?.name || params.esp32Id}.`
        );
        return { ok: true };
      }
      return { ok: false, error: json?.error || 'Gagal mengirim sinyal IR.' };
    } catch {
      return { ok: false, error: 'Koneksi gagal saat mengirim sinyal IR.' };
    }
  };

  const handleToggleEsp32OnlineStatus = (esp32Id: string) => {
    const nextTs = nowMs + 1000;
    setNowMs(nextTs);
    setEsp32Nodes((prev) =>
      prev.map((node) => {
        if (node.id !== esp32Id) return node;
        const currentlyOnline = isEsp32Online(node.lastSeen, nowMs);
        const nextLastSeen = currentlyOnline
          ? new Date(nextTs - 5 * 60 * 1000).toISOString()
          : new Date(nextTs).toISOString();
        const updated = { ...node, lastSeen: nextLastSeen };
        persistIotMutation({ action: 'upsert_node', node: updated });
        showToast(
          currentlyOnline ? 'warning' : 'success',
          `${node.name}: ${currentlyOnline ? 'Offline' : 'Online'}`
        );
        return updated;
      })
    );
  };

  const handleSaveScannedAppliance = (params: {
    esp32Id: string;
    name: string;
    brand: string;
    protocol: string;
    protocolBits: number;
    irTxPin: IrTxPin;
    tierMethod: string;
  }) => {
    const currentTs = nowMs + 1000;
    setNowMs(currentTs);
    const newId = `ac-${currentTs}`;
    const nowIso = new Date(currentTs).toISOString();
    const newAppliance: ACAppliance = {
      id: newId,
      esp32Id: params.esp32Id,
      name: params.name,
      brand: params.brand,
      protocol: params.protocol,
      protocolBits: params.protocolBits,
      irTxPin: params.irTxPin,
      state: {
        power: true,
        temp: 23,
        mode: 'cool',
        fan: 'auto',
        swing: true,
      },
      lastUpdated: nowIso,
      lastSource: 'Scanner',
    };

    const parentHub = esp32Nodes.find((e) => e.id === params.esp32Id);
    const scanCommand: DeviceCommand = {
      id: `cmd-scan-${currentTs}`,
      esp32Id: params.esp32Id,
      esp32Name: parentHub?.name || 'Smart Hub',
      applianceId: newId,
      applianceName: params.name,
      source: 'Scanner',
      actionSummary: `${params.tierMethod}: ${params.protocol} (${params.protocolBits}-bit)`,
      payload: buildFullStatePayload(newAppliance, {}),
      status: 'executed',
      latencyMs: 290,
      createdAt: nowIso,
      executedAt: nowIso,
    };

    setAppliances((prev) => [newAppliance, ...prev]);
    setCommands((prev) => [scanCommand, ...prev]);
    persistIotMutation({
      action: 'upsert_appliance',
      appliance: newAppliance,
      command: scanCommand,
    });
    setSelectedApplianceId(newId);
    setActiveNav('controller');
    showToast('success', `${params.name} berhasil disimpan.`);
  };

  const handleRegenerateToken = (esp32Id: string) => {
    const fresh = generateDeviceToken();
    setEsp32Nodes((prev) =>
      prev.map((node) => {
        if (node.id !== esp32Id) return node;
        const updated = {
          ...node,
          deviceToken: fresh.token,
          tokenHash: fresh.tokenHash,
        };
        persistIotMutation({ action: 'upsert_node', node: updated });
        return updated;
      })
    );
    showToast('success', 'device_token berhasil diperbarui (regenerated).');
  };

  const handleAddEsp32Node = (params: {
    name: string;
    roomLabel: string;
    macAddress: string;
    ipAddress: string;
  }) => {
    const nextTs = nowMs + 1000;
    setNowMs(nextTs);
    const fresh = generateDeviceToken();
    const newNode: ESP32Node = {
      id: `esp8266-${nextTs}`,
      userId: activeUserId,
      name: params.name,
      roomLabel: params.roomLabel,
      macAddress: params.macAddress,
      ipAddress: params.ipAddress,
      firmwareVersion: 'v2.5.0-esp8266',
      deviceToken: fresh.token,
      tokenHash: fresh.tokenHash,
      lastSeen: new Date(nextTs).toISOString(),
      temperature: 0,
      humidity: 0,
      pinout: {
        dht22: 'GPIO 21',
        irRx: 'GPIO 18',
        irTx: 'Multi-Channel 1–4',
      },
      telemetryHistory: [],
    };
    setEsp32Nodes((prev) => [...prev, newNode]);
    persistIotMutation({ action: 'upsert_node', node: newNode });
    showToast('success', `${params.name} tersimpan di Supabase.`);
  };

  const handleUpdateEsp32Node = (
    esp32Id: string,
    updates: {
      name: string;
      roomLabel: string;
      macAddress: string;
      ipAddress: string;
    }
  ) => {
    setEsp32Nodes((prev) =>
      prev.map((node) => {
        if (node.id !== esp32Id) return node;
        const updated = {
          ...node,
          name: updates.name,
          roomLabel: updates.roomLabel,
          macAddress: updates.macAddress,
          ipAddress: updates.ipAddress,
        };
        persistIotMutation({ action: 'upsert_node', node: updated });
        return updated;
      })
    );
    showToast('success', `${updates.name} berhasil diperbarui.`);
  };

  const handleDeleteEsp32Node = (esp32Id: string) => {
    const target = esp32Nodes.find((n) => n.id === esp32Id);
    setEsp32Nodes((prev) => prev.filter((n) => n.id !== esp32Id));
    setAppliances((prev) => prev.filter((a) => a.esp32Id !== esp32Id));
    persistIotMutation({ action: 'delete_node', esp32Id });
    if (target) {
      showToast('warning', `${target.name} dihapus.`);
    }
  };

  const handleAddApplianceManual = (params: {
    name: string;
    esp32Id: string;
    brand?: string;
    protocol: string;
    protocolBits?: number;
    irTxPin: IrTxPin;
  }) => {
    const currentTs = nowMs + 1000;
    setNowMs(currentTs);
    const matchedProto =
      IR_PROTOCOL_CATALOG.find(
        (p) =>
          (!params.brand || p.brand === params.brand) &&
          p.protocol === params.protocol
      ) ||
      IR_PROTOCOL_CATALOG.find((p) => p.protocol === params.protocol) ||
      IR_PROTOCOL_CATALOG[0];
    const newAppliance: ACAppliance = {
      id: `ac-${currentTs}`,
      esp32Id: params.esp32Id,
      name: params.name,
      brand: params.brand || matchedProto.brand,
      protocol: matchedProto.protocol,
      protocolBits: params.protocolBits || matchedProto.bits,
      irTxPin: params.irTxPin,
      state: {
        power: false,
        temp: 24,
        mode: 'cool',
        fan: 'auto',
        swing: true,
      },
      lastUpdated: new Date(currentTs).toISOString(),
      lastSource: 'Web',
    };
    setAppliances((prev) => [...prev, newAppliance]);
    persistIotMutation({ action: 'upsert_appliance', appliance: newAppliance });
    showToast('success', `${params.name} ditambahkan.`);
  };

  const handleUpdateAppliance = (
    applianceId: string,
    updates: {
      name: string;
      esp32Id: string;
      brand?: string;
      protocol: string;
      protocolBits?: number;
      irTxPin: IrTxPin;
    }
  ) => {
    const matchedProto =
      IR_PROTOCOL_CATALOG.find(
        (p) =>
          (!updates.brand || p.brand === updates.brand) &&
          p.protocol === updates.protocol
      ) || IR_PROTOCOL_CATALOG.find((p) => p.protocol === updates.protocol);
    setAppliances((prev) =>
      prev.map((app) => {
        if (app.id !== applianceId) return app;
        const updated = {
          ...app,
          name: updates.name,
          esp32Id: updates.esp32Id,
          protocol: updates.protocol,
          irTxPin: updates.irTxPin,
          brand: updates.brand || matchedProto?.brand || app.brand,
          protocolBits:
            updates.protocolBits || matchedProto?.bits || app.protocolBits,
        };
        persistIotMutation({ action: 'upsert_appliance', appliance: updated });
        return updated;
      })
    );
    showToast('success', `${updates.name} diperbarui.`);
  };

  const handleDeleteAppliance = (applianceId: string) => {
    const target = appliances.find((a) => a.id === applianceId);
    setAppliances((prev) => prev.filter((a) => a.id !== applianceId));
    persistIotMutation({ action: 'delete_appliance', applianceId });
    if (selectedApplianceId === applianceId) {
      const remaining = userAppliances.filter((a) => a.id !== applianceId);
      setSelectedApplianceId(remaining[0]?.id || '');
    }
    if (target) {
      showToast('warning', `${target.name} dihapus.`);
    }
  };

  const onlineHubCount = userEsp32Nodes.filter((n) =>
    isEsp32Online(n.lastSeen, nowMs)
  ).length;
  const activeAcCount = userAppliances.filter((a) => a.state.power).length;
  const avgRoomTemp =
    userEsp32Nodes.length > 0
      ? (
          userEsp32Nodes.reduce((sum, n) => sum + n.temperature, 0) /
          userEsp32Nodes.length
        ).toFixed(1)
      : '25.0';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 pb-20 lg:pb-10">
      {/* Compact Sticky Top Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 border-b border-slate-200/80 dark:border-zinc-800/80 backdrop-blur-md bg-white/85 dark:bg-zinc-900/85">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveNav('dashboard')}
          className="inline-flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-zinc-50 whitespace-nowrap shrink-0 text-left"
        >
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-600 to-sky-400 text-white flex items-center justify-center shadow-xs shadow-sky-500/30">
            <Snowflake className="w-4 h-4" />
          </span>
          <span>ThermoSync</span>
        </button>

        {/* Zone 2: Desktop Nav Links */}
        <nav
          aria-label="Navigasi Utama"
          className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-zinc-400"
        >
          {(
            [
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'controller', label: 'Remote AC' },
              { id: 'scanner', label: 'Scanner' },
              { id: 'devices', label: 'Devices' },
              { id: 'history', label: 'Riwayat' },
            ] as { id: NavSection; label: string }[]
          ).map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'border-sky-500 text-slate-900 dark:text-zinc-50 font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Top Nav Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            aria-label={isDark ? 'Light Mode' : 'Dark Mode'}
            className="h-8 sm:h-9 inline-flex items-center justify-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 sm:px-2.5 text-[11px] sm:text-xs font-medium text-slate-700 dark:text-zinc-300"
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
            <span className="hidden sm:inline">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="h-8 sm:h-9 inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 sm:px-2.5 text-[11px] sm:text-xs font-medium text-slate-700 dark:text-zinc-300"
            title="Autentikasi & Isolasi Data"
          >
            <User className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="truncate max-w-[68px] sm:max-w-[100px]">
              {currentUser ? currentUser.name.split(' ')[0] : 'Login'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScannerTargetEsp32Id(undefined);
              setActiveNav('scanner');
            }}
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold text-white bg-sky-500 hover:bg-sky-400 rounded-lg sm:rounded-xl transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            + Scan AC
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-3"
          >
            <div
              role="status"
              className={`rounded-2xl border px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 ${
                toastBanner.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : toastBanner.type === 'warning'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {toastBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">{toastBanner.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="underline text-[11px] shrink-0"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {!currentUser ? (
          <div className="max-w-md mx-auto my-8 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                Isolasi Data Aktif
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Silakan masuk dengan akun Anda untuk melihat dan mengontrol unit
                Smart Hub serta AC milik Anda sendiri.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full min-h-[42px] rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold"
            >
              Masuk ke Akun
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* 1. DASHBOARD (/dashboard) — 1 Clean Room Card with Multi-AC & Bulk Power ON/OFF */}
            {activeNav === 'dashboard' && (
              <motion.div
                key="view-dashboard"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="space-y-4 sm:space-y-5"
              >
                {/* Clean Header: Dashboard Kontrol AC */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                      Dashboard Kontrol AC
                    </h1>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveNav('controller')}
                      className="h-9 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-bold text-slate-800 dark:text-zinc-100 whitespace-nowrap shadow-2xs"
                    >
                      <Sliders className="w-3.5 h-3.5 text-sky-500" />
                      <span>Remote</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTargetEsp32Id(undefined);
                        setActiveNav('scanner');
                      }}
                      className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-3 text-xs font-bold whitespace-nowrap shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah AC</span>
                    </button>
                  </div>
                </div>

                {/* Room AC Control Card */}
                <section className="space-y-4">
                  {isLoadingData ? (
                    <div className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-10 text-center space-y-3 shadow-sm">
                      <Loader2 className="w-6 h-6 animate-spin text-sky-500 mx-auto" />
                      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                        Memuat data perangkat dari Supabase...
                      </p>
                    </div>
                  ) : userEsp32Nodes.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-8 sm:p-10 text-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mx-auto">
                        <Cpu className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 max-w-md mx-auto">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-50">
                          Belum Ada Perangkat ESP8266 Terdaftar
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                          Database Supabase sudah aktif dan bersih. Tambahkan area
                          perangkat ESP8266 Anda di menu Devices untuk mendapatkan
                          token perangkat dan mulai memantau suhu serta mengontrol AC.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveNav('devices')}
                          className="h-10 inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-4 text-xs font-bold shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Perangkat ESP8266</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    userEsp32Nodes.map((node) => {
                    const online = isEsp32Online(node.lastSeen, nowMs);
                    const roomAppliances = userAppliances.filter(
                      (a) => a.esp32Id === node.id
                    );
                    const activeHubAcs = roomAppliances.filter(
                      (a) => a.state.power
                    );
                    const inactiveHubAcs = roomAppliances.filter(
                      (a) => !a.state.power
                    );
                    const showChannelBadge = hasMultipleActiveChannels(
                      userAppliances,
                      node.id
                    );
                    const isConfirmingBulkOff = confirmBulkOffHubId === node.id;

                    return (
                      <div
                        key={node.id}
                        className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-4 sm:p-6 space-y-5 shadow-sm"
                      >
                        {/* Card Header: Room Name, Status Pill, Temp & Humidity, Bulk Power ON/OFF, and Full-Width Sparkline */}
                        <div className="flex flex-col gap-4 pb-4 border-b border-slate-100 dark:border-zinc-800/80">
                          <div className="flex flex-col gap-3.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2.5">
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-50 truncate">
                                  {node.name.replace(/^Smart Hub\s*[—-]\s*/i, '')}
                                </h2>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    online
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      online ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                  />
                                  <span>{online ? 'Online' : 'Offline'}</span>
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span>{node.roomLabel}</span>
                                {node.wifiSsid && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono text-[11px] text-slate-600 dark:text-zinc-300">
                                      WiFi {node.wifiSsid}
                                      {typeof node.rssi === 'number'
                                        ? ` (${node.rssi} dBm · ${evaluateRssiStatus(node.rssi).label})`
                                        : ''}
                                    </span>
                                  </>
                                )}
                                {node.ipAddress && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono text-[11px]">
                                      {node.ipAddress}
                                    </span>
                                  </>
                                )}
                                <span aria-hidden="true">·</span>
                                <span>{formatLastSeenLabel(node.lastSeen, nowMs)}</span>
                              </p>
                            </div>

                            {/* Prominent Real-Time Sensor Bar & Large Master AC Controls */}
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              {/* Real-time Room Sensor Bar: Temp (°C), Humidity (%), & Active Power (W/kW) */}
                              <div
                                className={`w-full lg:w-auto grid ${
                                  hasPzemReading(node.pzem) ? 'grid-cols-3' : 'grid-cols-2'
                                } sm:inline-flex items-center divide-x divide-slate-200 dark:divide-zinc-800 sm:divide-x-0 sm:gap-5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800 py-3 sm:px-6 sm:py-3.5 font-mono tabular-nums`}
                              >
                                <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-0 font-bold text-lg sm:text-3xl tracking-tight text-slate-900 dark:text-zinc-50 whitespace-nowrap">
                                  <Thermometer className="w-4 h-4 sm:w-6 sm:h-6 text-sky-500 shrink-0" />
                                  <span>
                                    {node.temperature > 0
                                      ? `${node.temperature.toFixed(1)}°C`
                                      : '--°C'}
                                  </span>
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="hidden sm:block h-7 w-px bg-slate-200 dark:bg-zinc-800"
                                />
                                <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-0 font-bold text-lg sm:text-3xl tracking-tight text-slate-700 dark:text-zinc-200 whitespace-nowrap">
                                  <Droplets className="w-4 h-4 sm:w-6 sm:h-6 text-sky-400 shrink-0" />
                                  <span>
                                    {node.humidity > 0 ? `${node.humidity}%` : '--%'}
                                  </span>
                                </span>
                                {hasPzemReading(node.pzem) && (
                                  <>
                                    <span
                                      aria-hidden="true"
                                      className="hidden sm:block h-7 w-px bg-slate-200 dark:bg-zinc-800"
                                    />
                                    <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-0 font-bold text-lg sm:text-3xl tracking-tight text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      <Zap className="w-4 h-4 sm:w-6 sm:h-6 text-amber-500 shrink-0" />
                                      <span>
                                        {formatPzemPower(node.pzem?.power).value}{' '}
                                        {formatPzemPower(node.pzem?.power).unit}
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {!online ? (
                                <button
                                  type="button"
                                  onClick={() => handleSimulateHeartbeat(node.id)}
                                  className="h-12 sm:h-14 w-full sm:w-auto rounded-2xl bg-sky-500 hover:bg-sky-400 text-white px-6 text-sm sm:text-base font-bold transition-colors shadow-xs"
                                >
                                  Pulihkan Koneksi
                                </button>
                              ) : isConfirmingBulkOff ? (
                                <div className="min-h-[48px] sm:min-h-[56px] flex flex-wrap items-center justify-between sm:justify-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm">
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    Matikan {activeHubAcs.length} AC?
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleBulkPowerHub(node.id, false)
                                      }
                                      className="h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 font-bold"
                                    >
                                      Ya
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmBulkOffHubId(null)}
                                      className="h-9 rounded-xl border border-slate-300 dark:border-zinc-700 px-3.5 font-medium"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full lg:w-auto">
                                  <button
                                    type="button"
                                    disabled={inactiveHubAcs.length === 0}
                                    onClick={() =>
                                      handleBulkPowerHub(node.id, true)
                                    }
                                    className="h-12 sm:h-14 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 px-4 sm:px-6 text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                                    title="Nyalakan seluruh AC"
                                  >
                                    <Power className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
                                    <span>Nyalakan Semua</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={activeHubAcs.length === 0}
                                    onClick={() =>
                                      setConfirmBulkOffHubId(node.id)
                                    }
                                    className="h-12 sm:h-14 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:bg-rose-500/10 hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 px-4 sm:px-6 text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                                    title="Matikan seluruh AC"
                                  >
                                    <PowerOff className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500 shrink-0" />
                                    <span>Matikan Semua</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Full-Width Sparkline Section spanning entire card width */}
                          <div className="w-full">
                            <div className="w-full rounded-2xl bg-slate-50/70 dark:bg-zinc-950/60 border border-slate-200/70 dark:border-zinc-800/80 px-4 py-3">
                              <SparklineChart
                                data={node.telemetryHistory}
                                accentColor={online ? '#38BDF8' : '#71717A'}
                                height={52}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Modul PZEM-004T v4.0 — 6 Parameter Listrik AC (Sensor CT 100A) */}
                        <PzemTelemetryPanel
                          pzem={node.pzem}
                          online={online}
                          onResetEnergy={() => handleResetEnergyNode(node)}
                          isResettingEnergy={resettingEnergyNodeId === node.id}
                        />

                        {/* Sub-Grid Multi-AC */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {roomAppliances.map((ac) => {
                            const chInfo = getIrChannelInfo(ac.irTxPin);
                            const queueItem = bulkQueueStatus[ac.id];
                            const ModeIcon =
                              ac.state.mode === 'cool'
                                ? Snowflake
                                : ac.state.mode === 'dry'
                                ? Droplets
                                : ac.state.mode === 'fan'
                                ? Wind
                                : Sparkles;

                            return (
                              <div
                                key={ac.id}
                                className={`rounded-2xl border p-4 flex flex-col justify-between gap-3.5 transition-all ${
                                  queueItem
                                    ? 'border-amber-500/50 bg-amber-500/5'
                                    : ac.state.power
                                    ? 'border-slate-200/90 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/90'
                                    : 'border-slate-200/60 dark:border-zinc-800/60 bg-slate-50/30 dark:bg-zinc-950/40'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                                        {ac.name}
                                      </h3>
                                      {showChannelBadge && (
                                        <span className="rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 text-[10px] font-mono font-bold shrink-0">
                                          {chInfo.shortBadge}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                                      {ac.brand} · {ac.protocol}
                                    </p>
                                  </div>

                                  {/* Quick Toggle Power ON/OFF or Staggered Queue Spinner */}
                                  {queueItem ? (
                                    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>
                                        #{queueItem.step}/{queueItem.total}
                                      </span>
                                    </div>
                                  ) : (
                                    <motion.button
                                      whileTap={{ scale: 0.94 }}
                                      type="button"
                                      disabled={!online}
                                      aria-label={`Toggle Power ${ac.name}`}
                                      onClick={() =>
                                        handleDispatchStateChange(
                                          ac.id,
                                          { power: !ac.state.power },
                                          'Web'
                                        )
                                      }
                                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 disabled:opacity-40 ${
                                        ac.state.power
                                          ? 'bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-500/30'
                                          : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                                      }`}
                                    >
                                      <Power className="w-4 h-4" />
                                    </motion.button>
                                  )}
                                </div>

                                {/* Bottom Row: Target Temperature & Link to /control/[applianceId] */}
                                <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-zinc-800/70">
                                  <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                                    <span
                                      className={`font-bold ${
                                        ac.state.power
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-slate-400 dark:text-zinc-500'
                                      }`}
                                    >
                                      {ac.state.power ? 'ON' : 'OFF'}
                                    </span>
                                    <span className="text-slate-300 dark:text-zinc-700">
                                      ·
                                    </span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                                      {ac.state.temp}°C
                                    </span>
                                    <span className="text-slate-300 dark:text-zinc-700">
                                      ·
                                    </span>
                                    <span className="inline-flex items-center gap-1 uppercase text-slate-500 dark:text-zinc-400">
                                      <ModeIcon className="w-3 h-3 text-sky-500" />
                                      <span>{ac.state.mode}</span>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedApplianceId(ac.id);
                                      setActiveNav('controller');
                                    }}
                                    className="h-8 inline-flex items-center gap-1 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 text-xs font-bold text-sky-600 dark:text-sky-400 hover:border-sky-500/40 transition-colors"
                                  >
                                    <span>Kontrol</span>
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* "+ Tambah AC" Dashed Card */}
                          <button
                            type="button"
                            onClick={() => {
                              setScannerTargetEsp32Id(node.id);
                              setActiveNav('scanner');
                            }}
                            className="min-h-[112px] rounded-2xl border-2 border-dashed border-slate-200/90 dark:border-zinc-800/90 hover:border-sky-500/60 dark:hover:border-sky-500/60 bg-slate-50/30 dark:bg-zinc-950/30 p-4 flex flex-col items-center justify-center gap-1.5 text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center">
                              <Plus className="w-4 h-4" />
                            </div>
                            <span>+ Tambah AC Baru</span>
                          </button>
                        </div>
                      </div>
                    );
                  }))}
                </section>
              </motion.div>
            )}

            {/* 2. UNIVERSAL AC CONTROLLER (/control/[applianceId]) */}
            {activeNav === 'controller' && (
              <motion.div
                key="view-controller"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <UniversalACController
                  appliances={userAppliances}
                  esp32Nodes={userEsp32Nodes}
                  selectedApplianceId={selectedApplianceId}
                  nowMs={nowMs}
                  onSelectAppliance={setSelectedApplianceId}
                  onDispatchStateChange={handleDispatchStateChange}
                  syncState={syncState}
                  onSimulateHeartbeat={handleSimulateHeartbeat}
                />
              </motion.div>
            )}

            {/* 3. AUTOMATIC DEVICE SCANNER (/scanner) */}
            {activeNav === 'scanner' && (
              <motion.div
                key="view-scanner"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <AutomaticScannerWizard
                  esp32Nodes={userEsp32Nodes}
                  appliances={userAppliances}
                  learnedIrCodes={learnedIrCodes}
                  initialEsp32Id={scannerTargetEsp32Id}
                  nowMs={nowMs}
                  onTriggerLearnIr={handleTriggerLearnIr}
                  onSendTestIrSignal={handleSendTestIrSignal}
                  onSaveScannedAppliance={handleSaveScannedAppliance}
                />
              </motion.div>
            )}

            {/* 4. DEVICE MANAGEMENT (/devices) */}
            {activeNav === 'devices' && (
              <motion.div
                key="view-devices"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <DevicesManagement
                  esp32Nodes={userEsp32Nodes}
                  appliances={userAppliances}
                  nowMs={nowMs}
                  onRegenerateToken={handleRegenerateToken}
                  onToggleEsp32OnlineStatus={handleToggleEsp32OnlineStatus}
                  onAddEsp32Node={handleAddEsp32Node}
                  onUpdateEsp32Node={handleUpdateEsp32Node}
                  onDeleteEsp32Node={handleDeleteEsp32Node}
                  onAddApplianceManual={handleAddApplianceManual}
                  onUpdateAppliance={handleUpdateAppliance}
                  onDeleteAppliance={handleDeleteAppliance}
                />
              </motion.div>
            )}

            {/* 5. HISTORY / RIWAYAT (/history) */}
            {activeNav === 'history' && (
              <motion.div
                key="view-history"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <HistoryActivityView
                  commands={userCommands}
                  onClearHistory={() => {
                    setCommands((prev) =>
                      prev.filter((c) => !userHubIds.has(c.esp32Id))
                    );
                    persistIotMutation({
                      action: 'clear_history',
                      esp32Ids: Array.from(userHubIds),
                    });
                    showToast('warning', 'Log akun ini dihapus.');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* MOBILE FIXED BOTTOM TAB BAR (< 1024px) */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 grid grid-cols-5 items-center px-1"
      >
        {(
          [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'controller', label: 'Remote', icon: Sliders },
            { id: 'scanner', label: 'Scanner', icon: Scan },
            { id: 'devices', label: 'Devices', icon: Cpu },
            { id: 'history', label: 'Riwayat', icon: History },
          ] as {
            id: NavSection;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }[]
        ).map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl text-[10px] font-semibold tracking-tight transition-colors ${
                active
                  ? 'text-sky-500'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* AUTH MODAL */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onSignIn={(user) => {
          setCurrentUser(user);
          const firstUserHub = esp32Nodes.find((n) => n.userId === user.id);
          if (firstUserHub) {
            const firstAc = appliances.find(
              (a) => a.esp32Id === firstUserHub.id
            );
            if (firstAc) setSelectedApplianceId(firstAc.id);
          }
          showToast('success', `Sesi aktif: ${user.name} (Isolasi Data RLS)`);
        }}
        onSignOut={() => {
          setCurrentUser(null);
          showToast('warning', 'Sesi keluar.');
        }}
      />
    </div>
  );
}
