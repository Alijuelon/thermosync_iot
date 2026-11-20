'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Code,
  ShieldCheck,
  Wifi,
  WifiOff,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Cable,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  isEsp32Online,
  formatLastSeenLabel,
  maskDeviceToken,
  getIrChannelInfo,
  getActiveChannelsForHub,
  detectSamePinBrandCollision,
  IR_PROTOCOL_CATALOG,
  IR_OUTPUT_CHANNELS,
  type ESP32Node,
  type ACAppliance,
  type IrTxPin,
} from '@/lib/iot-engine';
import {
  generateEsp32FirmwareCode,
  ESP8266_WIRING_GUIDE,
  SUPABASE_SQL_SCHEMA,
} from '@/lib/firmware-template';

interface DevicesManagementProps {
  esp32Nodes: ESP32Node[];
  appliances: ACAppliance[];
  nowMs: number;
  onRegenerateToken: (esp32Id: string) => void;
  onToggleEsp32OnlineStatus: (esp32Id: string) => void;
  onAddEsp32Node: (params: {
    name: string;
    roomLabel: string;
    macAddress: string;
    ipAddress: string;
  }) => void;
  onUpdateEsp32Node: (
    esp32Id: string,
    updates: {
      name: string;
      roomLabel: string;
      macAddress: string;
      ipAddress: string;
    }
  ) => void;
  onDeleteEsp32Node: (esp32Id: string) => void;
  onAddApplianceManual: (params: {
    name: string;
    esp32Id: string;
    protocol: string;
    irTxPin: IrTxPin;
  }) => void;
  onUpdateAppliance: (
    applianceId: string,
    updates: {
      name: string;
      esp32Id: string;
      protocol: string;
      irTxPin: IrTxPin;
    }
  ) => void;
  onDeleteAppliance: (applianceId: string) => void;
}

export function DevicesManagement({
  esp32Nodes,
  appliances,
  nowMs,
  onRegenerateToken,
  onToggleEsp32OnlineStatus,
  onAddEsp32Node,
  onUpdateEsp32Node,
  onDeleteEsp32Node,
  onAddApplianceManual,
  onUpdateAppliance,
  onDeleteAppliance,
}: DevicesManagementProps) {
  const [expandedHubIds, setExpandedHubIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(esp32Nodes.map((node) => [node.id, true]))
  );

  const [confirmDeleteHubId, setConfirmDeleteHubId] = useState<string | null>(
    null
  );
  const [firmwareModalNode, setFirmwareModalNode] = useState<ESP32Node | null>(
    null
  );
  const [firmwareTab, setFirmwareTab] = useState<'cpp' | 'wiring' | 'sql'>('cpp');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Unified Add / Edit Hub Modal state
  const [hubModalMode, setHubModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingHubId, setEditingHubId] = useState<string | null>(null);
  const [hubFormName, setHubFormName] = useState<string>('');
  const [hubFormRoom, setHubFormRoom] = useState<string>('');
  const [hubFormMac, setHubFormMac] = useState<string>('24:6F:28:9A:33:B1');
  const [hubFormIp, setHubFormIp] = useState<string>('192.168.1.115');
  const [hubFormError, setHubFormError] = useState<string>('');

  // Unified Add / Edit AC Modal state
  const [acModalMode, setAcModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingApplianceId, setEditingApplianceId] = useState<string | null>(
    null
  );
  const [formAcName, setFormAcName] = useState<string>('');
  const [formAcEsp32Id, setFormAcEsp32Id] = useState<string>('');
  const [formAcProtocol, setFormAcProtocol] = useState<string>('DAIKIN');
  const [formAcIrTxPin, setFormAcIrTxPin] = useState<IrTxPin>(23);
  const [acFormError, setAcFormError] = useState<string>('');

  const toggleHubAccordion = (hubId: string) => {
    setExpandedHubIds((prev) => ({
      ...prev,
      [hubId]: !(prev[hubId] ?? true),
    }));
  };

  const openAddHubModal = () => {
    setHubModalMode('add');
    setEditingHubId(null);
    setHubFormName('');
    setHubFormRoom('');
    setHubFormMac('24:6F:28:9A:33:B1');
    setHubFormIp('192.168.1.115');
    setHubFormError('');
  };

  const openEditHubModal = (node: ESP32Node) => {
    setHubModalMode('edit');
    setEditingHubId(node.id);
    setHubFormName(node.name);
    setHubFormRoom(node.roomLabel);
    setHubFormMac(node.macAddress);
    setHubFormIp(node.ipAddress);
    setHubFormError('');
  };

  const handleHubFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubFormName.trim() || !hubFormRoom.trim()) {
      setHubFormError('Nama Smart Hub & area ruangan wajib diisi.');
      return;
    }
    if (hubModalMode === 'add') {
      onAddEsp32Node({
        name: hubFormName.trim(),
        roomLabel: hubFormRoom.trim(),
        macAddress: hubFormMac.trim() || '24:6F:28:9A:33:B1',
        ipAddress: hubFormIp.trim() || '192.168.1.115',
      });
    } else if (hubModalMode === 'edit' && editingHubId) {
      onUpdateEsp32Node(editingHubId, {
        name: hubFormName.trim(),
        roomLabel: hubFormRoom.trim(),
        macAddress: hubFormMac.trim() || '24:6F:28:9A:33:B1',
        ipAddress: hubFormIp.trim() || '192.168.1.115',
      });
    }
    setHubModalMode(null);
    setEditingHubId(null);
    setHubFormError('');
  };

  const openAddApplianceModal = (defaultEsp32Id?: string) => {
    setAcModalMode('add');
    setEditingApplianceId(null);
    setFormAcName('');
    setFormAcEsp32Id(defaultEsp32Id || esp32Nodes[0]?.id || '');
    setFormAcProtocol('DAIKIN');
    setFormAcIrTxPin(23);
    setAcFormError('');
  };

  const openEditApplianceModal = (app: ACAppliance) => {
    setAcModalMode('edit');
    setEditingApplianceId(app.id);
    setFormAcName(app.name);
    setFormAcEsp32Id(app.esp32Id);
    setFormAcProtocol(app.protocol);
    setFormAcIrTxPin(app.irTxPin || 23);
    setAcFormError('');
  };

  const selectedProtoProfile =
    IR_PROTOCOL_CATALOG.find((p) => p.protocol === formAcProtocol) ||
    IR_PROTOCOL_CATALOG[0];

  const formCollisionAppliance =
    acModalMode && formAcEsp32Id
      ? detectSamePinBrandCollision(appliances, {
          esp32Id: formAcEsp32Id,
          brand: selectedProtoProfile.brand,
          protocol: formAcProtocol,
          irTxPin: formAcIrTxPin,
          excludeApplianceId: editingApplianceId || undefined,
        })
      : null;

  const selectedChannelOption = getIrChannelInfo(formAcIrTxPin);

  const handleSaveApplianceForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAcName.trim()) {
      setAcFormError('Nama perangkat AC wajib diisi.');
      return;
    }
    if (acModalMode === 'add') {
      onAddApplianceManual({
        name: formAcName.trim(),
        esp32Id: formAcEsp32Id,
        protocol: formAcProtocol,
        irTxPin: formAcIrTxPin,
      });
    } else if (acModalMode === 'edit' && editingApplianceId) {
      onUpdateAppliance(editingApplianceId, {
        name: formAcName.trim(),
        esp32Id: formAcEsp32Id,
        protocol: formAcProtocol,
        irTxPin: formAcIrTxPin,
      });
    }
    setAcModalMode(null);
    setEditingApplianceId(null);
  };

  return (
    <div className="space-y-5">
      {/* Executive Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
            Manajemen Perangkat AC
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {esp32Nodes.length} Area Ruangan · {appliances.length} Unit AC Terdaftar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {esp32Nodes[0] && (
            <button
              type="button"
              onClick={() => {
                setFirmwareTab('cpp');
                setFirmwareModalNode(esp32Nodes[0]);
              }}
              className="h-9 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap shadow-xs"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Firmware &amp; Rangkaian ESP8266</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openAddApplianceModal()}
            className="h-9 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-bold text-slate-800 dark:text-zinc-100 whitespace-nowrap shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-sky-500" />
            <span>Tambah AC</span>
          </button>

          <button
            type="button"
            onClick={openAddHubModal}
            className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-3 text-xs font-bold transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Area</span>
          </button>
        </div>
      </div>

      {/* Grouped Room Cards with Appliances */}
      <section className="space-y-4">
        {esp32Nodes.map((node) => {
          const online = isEsp32Online(node.lastSeen, nowMs);
          const hubAppliances = appliances.filter((a) => a.esp32Id === node.id);
          const isExpanded = expandedHubIds[node.id] ?? true;
          const cleanNodeName = node.name.replace(/^Smart Hub\s*[—-]\s*/i, '');

          return (
            <div
              key={node.id}
              className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 overflow-hidden shadow-sm"
            >
              {/* Accordion Header Bar (CSS selector 1) */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-zinc-900/60">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleHubAccordion(node.id)}
                    aria-expanded={isExpanded}
                    aria-label={`Toggle daftar perangkat ${cleanNodeName}`}
                    className="w-9 h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-center text-slate-700 dark:text-zinc-200 shrink-0 shadow-2xs"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50 truncate">
                        {cleanNodeName}
                      </h2>
                      <span className="rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-2.5 py-0.5 text-[11px] font-semibold">
                        {hubAppliances.length} Unit AC
                      </span>
                    </div>
                  </div>
                </div>

                {/* Room Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleEsp32OnlineStatus(node.id)}
                    className={`h-8 inline-flex items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold border transition-colors ${
                      online
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {online ? (
                      <Wifi className="w-3.5 h-3.5" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5" />
                    )}
                    <span>{online ? 'Online' : 'Offline'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditHubModal(node)}
                    className="h-8 inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                    title="Ubah Nama Area"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-sky-500" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteHubId(node.id)}
                    className="h-8 inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400"
                    title="Hapus Area"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>

              {/* Expanded Body */}
              {isExpanded && (
                <div className="p-4 sm:p-5 border-t border-slate-200/70 dark:border-zinc-800/80 space-y-4">
                  {/* Confirm Delete Hub Banner */}
                  {confirmDeleteHubId === node.id && (
                    <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="text-rose-800 dark:text-rose-200 font-medium">
                        Hapus <strong>{cleanNodeName}</strong> beserta{' '}
                        {hubAppliances.length} unit AC di dalamnya?
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteEsp32Node(node.id);
                            setConfirmDeleteHubId(null);
                          }}
                          className="rounded-lg bg-rose-600 text-white px-3 py-1 font-bold"
                        >
                          Ya, Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteHubId(null)}
                          className="rounded-lg border border-slate-300 dark:border-zinc-700 px-3 py-1 font-medium"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Simplified Connection Info Strip */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 dark:bg-zinc-950 px-3.5 py-2.5 border border-slate-200/70 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
                      <span className="font-medium">Status Koneksi</span>
                      <span className="font-semibold text-slate-800 dark:text-zinc-200">
                        {online ? 'Terhubung' : 'Terputus'} ·{' '}
                        {formatLastSeenLabel(node.lastSeen, nowMs)}
                      </span>
                    </div>
                  </div>

                  {/* Simplified AC Units Grid (CSS selector 4 & 5) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">
                        Daftar Unit AC ({hubAppliances.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => openAddApplianceModal(node.id)}
                        className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah AC</span>
                      </button>
                    </div>

                    {hubAppliances.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 p-4 text-center text-xs text-slate-500">
                        Belum ada perangkat AC di area ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {hubAppliances.map((app) => {
                          const chInfo = getIrChannelInfo(app.irTxPin);
                          return (
                            <div
                              key={app.id}
                              className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 p-3.5 flex flex-col justify-between gap-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                                    {app.name}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                                    Merek {app.brand}
                                  </p>
                                </div>

                                <span className="rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[11px] font-semibold shrink-0">
                                  {chInfo.shortBadge}
                                </span>
                              </div>

                              <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70 dark:border-zinc-800/80">
                                <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                                  {app.state.power ? 'Menyala' : 'Mati'} ·{' '}
                                  {app.state.temp}°C · Mode{' '}
                                  {app.state.mode.toUpperCase()}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditApplianceModal(app)}
                                    className="h-8 inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteAppliance(app.id)}
                                    aria-label={`Hapus ${app.name}`}
                                    className="h-8 inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Hapus</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Modal: Add / Edit Smart Hub */}
      {hubModalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-hub-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 shadow-xl">
            <h3
              id="modal-hub-form-title"
              className="text-lg font-bold text-slate-900 dark:text-zinc-50"
            >
              {hubModalMode === 'add'
                ? 'Tambah Smart Hub Baru'
                : 'Ubah Nama & Info Smart Hub'}
            </h3>
            <form onSubmit={handleHubFormSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="hub-name-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Nama Smart Hub
                </label>
                <input
                  id="hub-name-input"
                  type="text"
                  value={hubFormName}
                  onChange={(e) => setHubFormName(e.target.value)}
                  placeholder="Smart Hub — Lantai 3"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="hub-room-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Area / Ruangan
                </label>
                <input
                  id="hub-room-input"
                  type="text"
                  value={hubFormRoom}
                  onChange={(e) => setHubFormRoom(e.target.value)}
                  placeholder="Executive Lounge • Lantai 3"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="hub-mac-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                  >
                    MAC Address
                  </label>
                  <input
                    id="hub-mac-input"
                    type="text"
                    value={hubFormMac}
                    onChange={(e) => setHubFormMac(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="hub-ip-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                  >
                    IP Lokal
                  </label>
                  <input
                    id="hub-ip-input"
                    type="text"
                    value={hubFormIp}
                    onChange={(e) => setHubFormIp(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs font-mono"
                  />
                </div>
              </div>
              {hubFormError && (
                <p className="text-xs text-rose-500 font-medium">
                  {hubFormError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setHubModalMode(null);
                    setEditingHubId(null);
                  }}
                  className="min-h-[40px] rounded-xl border border-slate-300 dark:border-zinc-700 px-4 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-4 text-xs font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Appliance with IR Output Channel & Collision Warning */}
      {acModalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-ac-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 shadow-xl">
            <h3
              id="modal-ac-form-title"
              className="text-lg font-bold text-slate-900 dark:text-zinc-50"
            >
              {acModalMode === 'add'
                ? 'Tambah Perangkat AC'
                : 'Edit Perangkat AC (Pin IR TX & Protokol)'}
            </h3>
            <form onSubmit={handleSaveApplianceForm} className="space-y-3">
              <div>
                <label
                  htmlFor="form-ac-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Nama AC
                </label>
                <input
                  id="form-ac-name"
                  type="text"
                  value={formAcName}
                  onChange={(e) => {
                    setFormAcName(e.target.value);
                    if (acFormError) setAcFormError('');
                  }}
                  placeholder="Contoh: AC Ruang Meeting 2"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="form-ac-hub"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Smart Hub
                </label>
                <select
                  id="form-ac-hub"
                  value={formAcEsp32Id}
                  onChange={(e) => setFormAcEsp32Id(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm"
                >
                  {esp32Nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="form-ac-protocol"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Merek &amp; Protokol IR
                </label>
                <select
                  id="form-ac-protocol"
                  value={formAcProtocol}
                  onChange={(e) => setFormAcProtocol(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-mono"
                >
                  {IR_PROTOCOL_CATALOG.map((p) => (
                    <option key={p.id} value={p.protocol}>
                      {p.brand} — {p.protocol} ({p.bits}-bit)
                    </option>
                  ))}
                </select>
              </div>

              {/* IR Output Channel */}
              <div>
                <label
                  htmlFor="form-ac-ir-pin"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5"
                >
                  <Cable className="w-3.5 h-3.5 text-sky-500" />
                  <span>Pemetaan Pin IR TX (ir_tx_pin)</span>
                </label>
                <select
                  id="form-ac-ir-pin"
                  value={formAcIrTxPin}
                  onChange={(e) =>
                    setFormAcIrTxPin(Number(e.target.value) as IrTxPin)
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-mono"
                >
                  {IR_OUTPUT_CHANNELS.map((ch) => (
                    <option key={ch.gpioPin} value={ch.gpioPin}>
                      {ch.label} — {ch.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Non-blocking warning if same brand/protocol on same channel */}
              {formCollisionAppliance && (
                <div
                  role="alert"
                  className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Peringatan: Sudah ada AC bermerek{' '}
                    <strong>{formCollisionAppliance.brand}</strong> (
                    {formCollisionAppliance.name}) pada{' '}
                    <strong>{selectedChannelOption.label}</strong>. Mengontrol
                    AC ini mungkin ikut memicu AC tersebut jika berada dalam
                    satu jangkauan IR. Pertimbangkan menggunakan Channel
                    berbeda.
                  </p>
                </div>
              )}

              {acFormError && (
                <p className="text-xs text-rose-500 font-medium">
                  {acFormError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAcModalMode(null);
                    setEditingApplianceId(null);
                  }}
                  className="min-h-[40px] rounded-xl border border-slate-300 dark:border-zinc-700 px-4 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-4 text-xs font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: System Configuration */}
      {firmwareModalNode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-firmware-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id="modal-firmware-title"
                className="text-base font-bold text-slate-900 dark:text-zinc-50"
              >
                Firmware &amp; Rangkaian ESP8266 —{' '}
                {firmwareModalNode.name.replace(/^Smart Hub\s*[—-]\s*/i, '')}
              </h3>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFirmwareTab('cpp')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    firmwareTab === 'cpp'
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  Firmware ESP8266 (.ino)
                </button>
                <button
                  type="button"
                  onClick={() => setFirmwareTab('wiring')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    firmwareTab === 'wiring'
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  Rangkaian Kabel (Wiring)
                </button>
                <button
                  type="button"
                  onClick={() => setFirmwareTab('sql')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    firmwareTab === 'sql'
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  Database Schema (.sql)
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5">
              <button
                type="button"
                onClick={() => {
                  const text =
                    firmwareTab === 'cpp'
                      ? generateEsp32FirmwareCode({
                          esp32Name: firmwareModalNode.name,
                          deviceToken: firmwareModalNode.deviceToken,
                          apiEndpoint:
                            'https://thermosync-iot.vercel.app/api/iot',
                        })
                      : firmwareTab === 'wiring'
                      ? ESP8266_WIRING_GUIDE
                      : SUPABASE_SQL_SCHEMA;
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(text);
                  }
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="sticky top-2 float-right inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-3 py-1.5 text-xs font-medium"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Code className="w-3.5 h-3.5" />
                    <span>Salin</span>
                  </>
                )}
              </button>
              <pre className="text-[11px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                {firmwareTab === 'cpp'
                  ? generateEsp32FirmwareCode({
                      esp32Name: firmwareModalNode.name,
                      deviceToken: firmwareModalNode.deviceToken,
                      apiEndpoint: 'https://thermosync-iot.vercel.app/api/iot',
                    })
                  : firmwareTab === 'wiring'
                  ? ESP8266_WIRING_GUIDE
                  : SUPABASE_SQL_SCHEMA}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setFirmwareModalNode(null)}
                className="min-h-[40px] rounded-xl bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
