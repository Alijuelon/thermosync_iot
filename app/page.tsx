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
} from 'lucide-react';
import {
  createInitialSeedData,
  INITIAL_SEED_TIMESTAMP,
  formatTimeHHMMSS,
  isEsp32Online,
  formatLastSeenLabel,
  buildFullStatePayload,
  formatCommandSummary,
  generateDeviceToken,
  getIrChannelInfo,
  hasMultipleActiveChannels,
  IR_PROTOCOL_CATALOG,
  type ESP32Node,
  type ACAppliance,
  type DeviceCommand,
  type ACState,
  type CommandSource,
  type IrTxPin,
} from '@/lib/iot-engine';
import { SparklineChart } from '@/components/sparkline-chart';
import { UniversalACController } from '@/components/universal-ac-controller';
import { AutomaticScannerWizard } from '@/components/automatic-scanner-wizard';
import { DevicesManagement } from '@/components/devices-management';
import { HistoryActivityView } from '@/components/history-activity-view';
import { AuthModal, type UserSession } from '@/components/auth-modal';

type NavSection = 'dashboard' | 'controller' | 'scanner' | 'devices' | 'history';

export default function ThermoSyncApp() {
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(INITIAL_SEED_TIMESTAMP);

  const [initialSeed] = useState(() => {
    const base = createInitialSeedData(INITIAL_SEED_TIMESTAMP);
    const tenantHub: ESP32Node = {
      id: 'esp32-node-tenant-1',
      userId: 'user-demo-2',
      name: 'Studio Lantai 4',
      roomLabel: 'Private Studio • Lantai 4',
      macAddress: '4C:11:AE:9D:44:10',
      ipAddress: '192.168.1.140',
      firmwareVersion: 'v2.5.0',
      deviceToken: 'ts_live_4c11ae9d4410_tenant4_88b12a7e',
      tokenHash: 'sha256:6b21a90c14f8...88b12a7e',
      lastSeen: new Date(INITIAL_SEED_TIMESTAMP - 15 * 1000).toISOString(),
      temperature: 23.8,
      humidity: 55,
      pinout: {
        dht22: 'GPIO 21',
        irRx: 'GPIO 18',
        irTx: 'Multi-Channel 1–4',
      },
      telemetryHistory: [
        { time: '14:00', temp: 25.0, humidity: 58 },
        { time: '15:00', temp: 24.5, humidity: 57 },
        { time: '16:00', temp: 24.2, humidity: 56 },
        { time: '17:00', temp: 24.0, humidity: 55 },
        { time: '18:00', temp: 23.8, humidity: 55 },
      ],
    };
    const tenantAc: ACAppliance = {
      id: 'ac-tenant-studio',
      esp32Id: 'esp32-node-tenant-1',
      name: 'AC Studio Lantai 4',
      brand: 'Daikin',
      protocol: 'DAIKIN',
      protocolBits: 280,
      irTxPin: 23,
      state: {
        power: true,
        temp: 22,
        mode: 'cool',
        fan: 'low',
        swing: true,
      },
      lastUpdated: new Date(INITIAL_SEED_TIMESTAMP - 40 * 1000).toISOString(),
      lastSource: 'Web',
    };
    const tenantCmd: DeviceCommand = {
      id: 'cmd-tenant-1',
      esp32Id: 'esp32-node-tenant-1',
      esp32Name: 'Smart Hub — Studio Lantai 4',
      applianceId: 'ac-tenant-studio',
      applianceName: 'AC Studio Lantai 4',
      source: 'Web',
      actionSummary: '[Ch.1] Power ON · 22°C · COOL · Fan Low · Swing ON',
      payload: buildFullStatePayload(tenantAc, {}),
      status: 'executed',
      latencyMs: 210,
      createdAt: new Date(INITIAL_SEED_TIMESTAMP - 40 * 1000).toISOString(),
      executedAt: new Date(INITIAL_SEED_TIMESTAMP - 39 * 1000).toISOString(),
    };
    return {
      esp32Nodes: [...base.esp32Nodes, tenantHub],
      appliances: [...base.appliances, tenantAc],
      commands: [...base.commands, tenantCmd],
    };
  });

  const [esp32Nodes, setEsp32Nodes] = useState<ESP32Node[]>(
    initialSeed.esp32Nodes
  );
  const [appliances, setAppliances] = useState<ACAppliance[]>(
    initialSeed.appliances
  );
  const [commands, setCommands] = useState<DeviceCommand[]>(
    initialSeed.commands
  );

  const [selectedApplianceId, setSelectedApplianceId] = useState<string>(
    initialSeed.appliances[0]?.id || ''
  );
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
    const nowIso = new Date(nowMs).toISOString();
    setEsp32Nodes((prev) =>
      prev.map((node) =>
        node.id === esp32Id ? { ...node, lastSeen: nowIso } : node
      )
    );
    showToast('success', 'Smart Hub kembali Online.');
  };

  const handleToggleEsp32OnlineStatus = (esp32Id: string) => {
    setEsp32Nodes((prev) =>
      prev.map((node) => {
        if (node.id !== esp32Id) return node;
        const currentlyOnline = isEsp32Online(node.lastSeen, nowMs);
        const nextLastSeen = currentlyOnline
          ? new Date(nowMs - 5 * 60 * 1000).toISOString()
          : new Date(nowMs).toISOString();
        showToast(
          currentlyOnline ? 'warning' : 'success',
          `${node.name}: ${currentlyOnline ? 'Offline' : 'Online'}`
        );
        return { ...node, lastSeen: nextLastSeen };
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
    setSelectedApplianceId(newId);
    setActiveNav('controller');
    showToast('success', `${params.name} berhasil disimpan.`);
  };

  const handleRegenerateToken = (esp32Id: string) => {
    const fresh = generateDeviceToken();
    setEsp32Nodes((prev) =>
      prev.map((node) =>
        node.id === esp32Id
          ? {
              ...node,
              deviceToken: fresh.token,
              tokenHash: fresh.tokenHash,
            }
          : node
      )
    );
    showToast('success', 'device_token berhasil diperbarui (regenerated).');
  };

  const handleAddEsp32Node = (params: {
    name: string;
    roomLabel: string;
    macAddress: string;
    ipAddress: string;
  }) => {
    const fresh = generateDeviceToken();
    const newNode: ESP32Node = {
      id: `hub-${nowMs}`,
      userId: activeUserId,
      name: params.name,
      roomLabel: params.roomLabel,
      macAddress: params.macAddress,
      ipAddress: params.ipAddress,
      firmwareVersion: 'v2.5.0',
      deviceToken: fresh.token,
      tokenHash: fresh.tokenHash,
      lastSeen: new Date(nowMs).toISOString(),
      temperature: 25.2,
      humidity: 60,
      pinout: {
        dht22: 'GPIO 21',
        irRx: 'GPIO 18',
        irTx: 'Multi-Channel 1–4',
      },
      telemetryHistory: [
        { time: '15:00', temp: 26.2, humidity: 63 },
        { time: '16:00', temp: 25.9, humidity: 62 },
        { time: '17:00', temp: 25.6, humidity: 61 },
        { time: '18:00', temp: 25.4, humidity: 60 },
        { time: '19:00', temp: 25.2, humidity: 60 },
      ],
    };
    setEsp32Nodes((prev) => [...prev, newNode]);
    showToast('success', `${params.name} ditambahkan.`);
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
      prev.map((node) =>
        node.id === esp32Id
          ? {
              ...node,
              name: updates.name,
              roomLabel: updates.roomLabel,
              macAddress: updates.macAddress,
              ipAddress: updates.ipAddress,
            }
          : node
      )
    );
    showToast('success', `${updates.name} berhasil diperbarui.`);
  };

  const handleDeleteEsp32Node = (esp32Id: string) => {
    const target = esp32Nodes.find((n) => n.id === esp32Id);
    setEsp32Nodes((prev) => prev.filter((n) => n.id !== esp32Id));
    setAppliances((prev) => prev.filter((a) => a.esp32Id !== esp32Id));
    if (target) {
      showToast('warning', `${target.name} dihapus.`);
    }
  };

  const handleAddApplianceManual = (params: {
    name: string;
    esp32Id: string;
    protocol: string;
    irTxPin: IrTxPin;
  }) => {
    const currentTs = nowMs + 1000;
    setNowMs(currentTs);
    const matchedProto =
      IR_PROTOCOL_CATALOG.find((p) => p.protocol === params.protocol) ||
      IR_PROTOCOL_CATALOG[0];
    const newAppliance: ACAppliance = {
      id: `ac-${currentTs}`,
      esp32Id: params.esp32Id,
      name: params.name,
      brand: matchedProto.brand,
      protocol: matchedProto.protocol,
      protocolBits: matchedProto.bits,
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
    showToast('success', `${params.name} ditambahkan.`);
  };

  const handleUpdateAppliance = (
    applianceId: string,
    updates: {
      name: string;
      esp32Id: string;
      protocol: string;
      irTxPin: IrTxPin;
    }
  ) => {
    const matchedProto = IR_PROTOCOL_CATALOG.find(
      (p) => p.protocol === updates.protocol
    );
    setAppliances((prev) =>
      prev.map((app) =>
        app.id === applianceId
          ? {
              ...app,
              name: updates.name,
              esp32Id: updates.esp32Id,
              protocol: updates.protocol,
              irTxPin: updates.irTxPin,
              brand: matchedProto?.brand || app.brand,
              protocolBits: matchedProto?.bits || app.protocolBits,
            }
          : app
      )
    );
    showToast('success', `${updates.name} diperbarui.`);
  };

  const handleDeleteAppliance = (applianceId: string) => {
    const target = appliances.find((a) => a.id === applianceId);
    setAppliances((prev) => prev.filter((a) => a.id !== applianceId));
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
              Masuk atau Daftar Akun
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
                  {userEsp32Nodes.map((node) => {
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
                          <div className="flex flex-wrap items-center justify-between gap-3">
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
                              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                                {node.roomLabel} ·{' '}
                                {formatLastSeenLabel(node.lastSeen, nowMs)}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                              {/* Real-time Room Sensor Pill: Temp (°C) & Humidity (%) */}
                              <div className="inline-flex items-center gap-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800 px-3.5 py-1.5 font-mono tabular-nums text-xs">
                                <span className="inline-flex items-center gap-1 font-bold text-slate-900 dark:text-zinc-100">
                                  <Thermometer className="w-3.5 h-3.5 text-sky-500" />
                                  <span>{node.temperature.toFixed(1)}°C</span>
                                </span>
                                <span className="text-slate-300 dark:text-zinc-700">
                                  |
                                </span>
                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-zinc-300">
                                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                                  <span>{node.humidity}%</span>
                                </span>
                              </div>

                              {!online ? (
                                <button
                                  type="button"
                                  onClick={() => handleSimulateHeartbeat(node.id)}
                                  className="h-9 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-3.5 text-xs font-bold transition-colors"
                                >
                                  Pulihkan Koneksi
                                </button>
                              ) : isConfirmingBulkOff ? (
                                <div className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs">
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    Matikan {activeHubAcs.length} AC?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleBulkPowerHub(node.id, false)
                                    }
                                    className="min-h-[28px] rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-2.5 font-bold"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmBulkOffHubId(null)}
                                    className="min-h-[28px] rounded-lg border border-slate-300 dark:border-zinc-700 px-2 font-medium"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={inactiveHubAcs.length === 0}
                                    onClick={() =>
                                      handleBulkPowerHub(node.id, true)
                                    }
                                    className="h-9 inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 px-3 text-xs font-bold text-slate-700 dark:text-zinc-200 disabled:opacity-40 transition-colors whitespace-nowrap"
                                    title="Nyalakan seluruh AC"
                                  >
                                    <Power className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Nyalakan Semua</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={activeHubAcs.length === 0}
                                    onClick={() =>
                                      setConfirmBulkOffHubId(node.id)
                                    }
                                    className="h-9 inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 px-3 text-xs font-bold text-slate-700 dark:text-zinc-200 disabled:opacity-40 transition-colors whitespace-nowrap"
                                    title="Matikan seluruh AC"
                                  >
                                    <PowerOff className="w-3.5 h-3.5 text-rose-500" />
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
                  })}
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
                  initialEsp32Id={scannerTargetEsp32Id}
                  nowMs={nowMs}
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
