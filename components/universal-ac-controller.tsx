'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Power,
  Minus,
  Plus,
  Snowflake,
  Droplets,
  Sparkles,
  Wind,
  Fan,
  ArrowUpDown,
  Radio,
  WifiOff,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Code2,
  Thermometer,
  Cpu,
  Info,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  isEsp32Online,
  formatLastSeenLabel,
  clampTemperature,
  buildFullStatePayload,
  getIrChannelInfo,
  hasDuplicateProtocolInHub,
  MIN_AC_TEMP,
  MAX_AC_TEMP,
  type ACAppliance,
  type ESP32Node,
  type ACState,
  type ACMode,
  type FanSpeed,
  type CommandSource,
} from '@/lib/iot-engine';

interface UniversalACControllerProps {
  appliances: ACAppliance[];
  esp32Nodes: ESP32Node[];
  selectedApplianceId: string;
  nowMs: number;
  onSelectAppliance: (id: string) => void;
  onDispatchStateChange: (
    applianceId: string,
    nextPartial: Partial<ACState>,
    source?: CommandSource,
    options?: { simulateTimeout?: boolean }
  ) => Promise<void>;
  syncState: {
    status: 'idle' | 'sending' | 'confirmed' | 'remote_synced' | 'timeout_error';
    message: string;
    latencyMs?: number;
  };
  onSimulateHeartbeat: (esp32Id: string) => void;
}

export function UniversalACController({
  appliances,
  esp32Nodes,
  selectedApplianceId,
  nowMs,
  onSelectAppliance,
  onDispatchStateChange,
  syncState,
  onSimulateHeartbeat,
}: UniversalACControllerProps) {
  const [showJsonPayload, setShowJsonPayload] = useState(false);
  const [showDuplicateTooltip, setShowDuplicateTooltip] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const activeAppliance =
    appliances.find((a) => a.id === selectedApplianceId) || appliances[0];

  if (!activeAppliance) {
    return (
      <div className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
          Belum ada perangkat AC terdaftar pada akun ini
        </p>
      </div>
    );
  }

  const parentHub = esp32Nodes.find((e) => e.id === activeAppliance.esp32Id);
  const isOnline = parentHub ? isEsp32Online(parentHub.lastSeen, nowMs) : false;
  const lastSeenLabel = parentHub
    ? formatLastSeenLabel(parentHub.lastSeen, nowMs)
    : '-';

  const { power, temp, mode, fan, swing } = activeAppliance.state;
  const controlsDisabled = !isOnline;
  const channelInfo = getIrChannelInfo(activeAppliance.irTxPin);
  const isDuplicateProtocol = hasDuplicateProtocolInHub(
    appliances,
    activeAppliance.esp32Id,
    activeAppliance.protocol
  );

  const modeTheme = {
    cool: {
      label: 'Cool',
      glowClass: power
        ? 'from-sky-500/25 via-sky-500/5 to-transparent'
        : 'from-zinc-500/5 to-transparent',
      ringColor: power ? '#0EA5E9' : '#52525B',
      badgeText: 'text-sky-600 dark:text-sky-400',
    },
    dry: {
      label: 'Dry',
      glowClass: power
        ? 'from-amber-500/25 via-amber-500/5 to-transparent'
        : 'from-zinc-500/5 to-transparent',
      ringColor: power ? '#F59E0B' : '#52525B',
      badgeText: 'text-amber-600 dark:text-amber-400',
    },
    fan: {
      label: 'Fan',
      glowClass: power
        ? 'from-teal-500/25 via-teal-500/5 to-transparent'
        : 'from-zinc-500/5 to-transparent',
      ringColor: power ? '#14B8A6' : '#52525B',
      badgeText: 'text-teal-600 dark:text-teal-400',
    },
    auto: {
      label: 'Auto',
      glowClass: power
        ? 'from-indigo-500/25 via-indigo-500/5 to-transparent'
        : 'from-zinc-500/5 to-transparent',
      ringColor: power ? '#6366F1' : '#52525B',
      badgeText: 'text-indigo-600 dark:text-indigo-400',
    },
  }[mode];

  const effectiveMinTemp =
    activeAppliance.protocol.toUpperCase() === 'COOLIX' ||
    activeAppliance.protocol.toUpperCase() === 'MIDEA'
      ? 17
      : MIN_AC_TEMP;
  const displayTemp = Math.max(effectiveMinTemp, Math.min(MAX_AC_TEMP, temp));

  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 250 / 360;
  const maxArcLength = circumference * arcFraction;
  const progressRatio =
    (displayTemp - effectiveMinTemp) / (MAX_AC_TEMP - effectiveMinTemp);
  const activeArcLength = power ? Math.max(0.05, progressRatio) * maxArcLength : 0;

  const fullPayloadPreview = buildFullStatePayload(activeAppliance, {});

  const handleTempAdjust = (delta: number) => {
    if (controlsDisabled || !power) return;
    const nextTemp = Math.max(
      effectiveMinTemp,
      clampTemperature(displayTemp + delta)
    );
    if (nextTemp !== displayTemp) {
      onDispatchStateChange(activeAppliance.id, { temp: nextTemp }, 'Web');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-3.5 sm:px-5 sm:py-4 shadow-xs">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 leading-tight truncate">
              {activeAppliance.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs shrink-0">
            <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-zinc-200">
              {activeAppliance.brand}
            </span>
            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-zinc-700"
            >
              ·
            </span>
            <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 px-2.5 py-0.5 text-[11px] font-mono font-medium text-slate-600 dark:text-zinc-300">
              {activeAppliance.protocol}
            </span>
            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-zinc-700"
            >
              ·
            </span>
            <span className="inline-flex items-center rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-600 dark:text-sky-400 px-2.5 py-0.5 text-[11px] font-mono font-semibold">
              {channelInfo.shortBadge}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <label htmlFor="select-appliance-control" className="sr-only">
              Pilih AC
            </label>
            <button
              id="select-appliance-control"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isSelectOpen}
              onClick={() => setIsSelectOpen((prev) => !prev)}
              className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-zinc-100 flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    power
                      ? mode === 'cool'
                        ? 'bg-sky-500/15 text-sky-500'
                        : mode === 'dry'
                        ? 'bg-amber-500/15 text-amber-500'
                        : mode === 'fan'
                        ? 'bg-teal-500/15 text-teal-500'
                        : 'bg-indigo-500/15 text-indigo-500'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-400'
                  }`}
                >
                  {mode === 'cool' ? (
                    <Snowflake className="w-3.5 h-3.5" />
                  ) : mode === 'dry' ? (
                    <Droplets className="w-3.5 h-3.5" />
                  ) : mode === 'fan' ? (
                    <Wind className="w-3.5 h-3.5" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                </span>
                <span className="truncate font-semibold">
                  {activeAppliance.name}
                </span>
                <span className="rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 text-[10px] font-mono font-bold shrink-0">
                  {channelInfo.shortBadge}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  isSelectOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {isSelectOpen && (
                <motion.ul
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  role="listbox"
                  aria-label="Daftar Perangkat AC"
                  className="absolute right-0 left-0 mt-1.5 z-40 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 shadow-xl space-y-1 max-h-64 overflow-y-auto"
                >
                  {appliances.map((app) => {
                    const node = esp32Nodes.find((n) => n.id === app.esp32Id);
                    const nodeOnline = node
                      ? isEsp32Online(node.lastSeen, nowMs)
                      : false;
                    const ch = getIrChannelInfo(app.irTxPin);
                    const isSelected = app.id === activeAppliance.id;
                    const OptionModeIcon =
                      app.state.mode === 'cool'
                        ? Snowflake
                        : app.state.mode === 'dry'
                        ? Droplets
                        : app.state.mode === 'fan'
                        ? Wind
                        : Sparkles;

                    return (
                      <li key={app.id} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectAppliance(app.id);
                            setIsSelectOpen(false);
                          }}
                          className={`w-full rounded-xl px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold'
                              : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                app.state.power
                                  ? app.state.mode === 'cool'
                                    ? 'bg-sky-500/15 text-sky-500'
                                    : app.state.mode === 'dry'
                                    ? 'bg-amber-500/15 text-amber-500'
                                    : app.state.mode === 'fan'
                                    ? 'bg-teal-500/15 text-teal-500'
                                    : 'bg-indigo-500/15 text-indigo-500'
                                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-400'
                              }`}
                            >
                              <OptionModeIcon className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {app.name}
                              </p>
                              <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                                <span>{ch.shortBadge}</span>
                                <span>·</span>
                                <span>{app.state.temp}°C</span>
                                <span>·</span>
                                <span
                                  className={
                                    nodeOnline
                                      ? 'text-emerald-500'
                                      : 'text-rose-500'
                                  }
                                >
                                  {nodeOnline ? 'Online' : 'Offline'}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                app.state.power
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-400'
                              }`}
                              title={app.state.power ? 'Power ON' : 'Power OFF'}
                            >
                              <Power className="w-3 h-3" />
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-sky-500" />
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Subtle Hybrid Sync Notification Banner when updated from Physical Remote */}
      <AnimatePresence>
        {(syncState.status === 'remote_synced' ||
          activeAppliance.lastSource === 'Remote Fisik') &&
          !isDuplicateProtocol && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-sky-700 dark:text-sky-300"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Radio className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="font-semibold truncate">
                  Status Hybrid Sync: Pengaturan AC diperbarui otomatis dari remote fisik ({temp}°C · Mode {modeTheme.label})
                </span>
              </div>
              <span className="font-mono text-[11px] shrink-0">Tersinkronisasi</span>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Hybrid Sync Disabled Info Badge on Duplicate IR Protocol */}
      {isDuplicateProtocol && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 truncate">
                Sinkronisasi Remote Fisik Dinonaktifkan (Protokol Ganda)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDuplicateTooltip((prev) => !prev)}
              aria-expanded={showDuplicateTooltip}
              className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 underline shrink-0"
            >
              {showDuplicateTooltip ? 'Tutup Info' : 'Detail'}
            </button>
          </div>

          {showDuplicateTooltip && (
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed pl-6">
              Sensor penerima inframerah pada {parentHub?.name || 'Smart Hub ini'} tidak dapat membedakan remote fisik mana yang ditekan karena terdapat ≥ 2 unit AC dengan protokol identik ({activeAppliance.protocol}). Kontrol dari aplikasi tetap terisolasi secara presisi melalui {channelInfo.label}.
            </p>
          )}
        </div>
      )}

      {/* Offline Protection Banner */}
      {!isOnline && parentHub && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <WifiOff className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate">
              Proteksi Offline: {parentHub.name} tidak aktif ({lastSeenLabel}) — Tombol kontrol dikunci
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSimulateHeartbeat(parentHub.id)}
            className="min-h-[38px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Pulihkan Hub
          </button>
        </div>
      )}

      {/* Main Thermostat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* Thermostat Dial Card */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-5 sm:p-7 flex flex-col justify-between shadow-sm">
          <div
            className={`pointer-events-none absolute inset-0 bg-radial ${modeTheme.glowClass} transition-all duration-500`}
          />

          {/* Optimistic Status (pending -> executed) & Room Telemetry */}
          <div className="relative z-10 flex items-center justify-between gap-2 text-xs">
            <div className="font-medium truncate">
              {syncState.status === 'sending' && (
                <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Status: pending → {channelInfo.shortBadge}...</span>
                </span>
              )}
              {syncState.status === 'confirmed' && (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Status: executed {syncState.latencyMs ? `(${syncState.latencyMs}ms)` : ''}
                  </span>
                </span>
              )}
              {syncState.status === 'remote_synced' && (
                <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-mono">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Hybrid Sync · Remote Fisik</span>
                </span>
              )}
              {syncState.status === 'timeout_error' && (
                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Status: timeout · Rollback</span>
                </span>
              )}
              {syncState.status === 'idle' && (
                <span className="text-slate-500 dark:text-zinc-400">
                  Sumber: {activeAppliance.lastSource} · {lastSeenLabel}
                </span>
              )}
            </div>

            {parentHub && (
              <div className="flex items-center gap-2 font-mono tabular-nums text-slate-600 dark:text-zinc-300 shrink-0 rounded-full bg-slate-100/80 dark:bg-zinc-800/70 px-3 py-1">
                <span className="inline-flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-sky-500" />
                  <strong>{parentHub.temperature.toFixed(1)}°C</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span><strong>{parentHub.humidity}%</strong></span>
              </div>
            )}
          </div>

          {/* Responsive Dial + Thumb-Friendly - / + Buttons */}
          <div
            className={`relative z-10 my-4 sm:my-6 flex items-center justify-center gap-3 sm:gap-7 ${
              controlsDisabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="button"
              aria-label="Turunkan suhu AC"
              disabled={controlsDisabled || !power || displayTemp <= effectiveMinTemp}
              onClick={() => handleTempAdjust(-1)}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/90 flex items-center justify-center text-slate-800 dark:text-zinc-100 hover:border-sky-500/50 disabled:opacity-40 transition-colors shadow-xs shrink-0"
            >
              <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.button>

            <div className="relative w-48 h-48 sm:w-60 sm:h-60 flex items-center justify-center select-none shrink-0">
              <svg
                viewBox="0 0 250 250"
                className="w-full h-full -rotate-[215deg]"
                aria-hidden="true"
              >
                <circle
                  cx="125"
                  cy="125"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200/80 dark:text-zinc-800/90"
                  strokeWidth="14"
                  strokeDasharray={`${maxArcLength} ${circumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="125"
                  cy="125"
                  r={radius}
                  fill="none"
                  stroke={modeTheme.ringColor}
                  strokeWidth="14"
                  strokeDasharray={`${activeArcLength} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                  {power ? modeTheme.label : 'Standby'}
                </span>

                <div className="h-16 sm:h-20 flex items-center justify-center overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={power ? displayTemp : 'off'}
                      initial={{ y: 16, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -16, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      className={`text-5xl sm:text-6xl font-bold tracking-tight font-mono tabular-nums ${
                        power
                          ? 'text-slate-900 dark:text-zinc-50'
                          : 'text-slate-400 dark:text-zinc-600'
                      }`}
                    >
                      {power ? `${displayTemp}°C` : 'OFF'}
                    </motion.span>
                  </AnimatePresence>
                </div>

                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                  {effectiveMinTemp}°C – {MAX_AC_TEMP}°C
                </span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.94 }}
              type="button"
              aria-label="Naikkan suhu AC"
              disabled={controlsDisabled || !power || displayTemp >= MAX_AC_TEMP}
              onClick={() => handleTempAdjust(1)}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/90 flex items-center justify-center text-slate-800 dark:text-zinc-100 hover:border-sky-500/50 disabled:opacity-40 transition-colors shadow-xs shrink-0"
            >
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.button>
          </div>

          {/* Slider & Power CTA */}
          <div
            className={`relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800/80 ${
              controlsDisabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="w-full sm:max-w-xs flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {effectiveMinTemp}°
              </span>
              <input
                type="range"
                aria-label="Geser suhu target AC"
                min={effectiveMinTemp}
                max={MAX_AC_TEMP}
                step={1}
                disabled={controlsDisabled || !power}
                value={displayTemp}
                onChange={(e) =>
                  onDispatchStateChange(
                    activeAppliance.id,
                    { temp: Number(e.target.value) },
                    'Web'
                  )
                }
                className="w-full h-2 accent-sky-500 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-slate-500">30°</span>
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              disabled={controlsDisabled}
              onClick={() =>
                onDispatchStateChange(activeAppliance.id, { power: !power }, 'Web')
              }
              aria-label={power ? 'Matikan AC' : 'Nyalakan AC'}
              className={`w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                power
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400'
                  : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 shadow-inner hover:bg-slate-300 dark:hover:bg-zinc-700'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{power ? 'Power ON' : 'Power OFF'}</span>
            </motion.button>
          </div>
        </div>

        {/* Right Controls: Mode (Cool, Dry, Fan, Auto), Fan Speed (Auto, Low, Medium, High), Swing */}
        <div
          className={`lg:col-span-5 flex flex-col justify-between gap-4 ${
            controlsDisabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {/* Mode (Cool, Dry, Fan, Auto) */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                Mode AC
              </span>
              <span className={`text-xs font-semibold ${modeTheme.badgeText}`}>
                {modeTheme.label}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800">
              {(
                [
                  { id: 'cool', label: 'Cool', icon: Snowflake },
                  { id: 'dry', label: 'Dry', icon: Droplets },
                  { id: 'fan', label: 'Fan', icon: Fan },
                  { id: 'auto', label: 'Auto', icon: Sparkles },
                ] as { id: ACMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    key={item.id}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() =>
                      onDispatchStateChange(
                        activeAppliance.id,
                        { mode: item.id, power: true },
                        'Web'
                      )
                    }
                    className={`relative min-h-[44px] flex items-center justify-center gap-1 rounded-xl px-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'text-slate-900 dark:text-zinc-50'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="ac-mode-segmented-bg"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="absolute inset-0 rounded-xl bg-white dark:bg-zinc-800 shadow-xs border border-slate-200/80 dark:border-zinc-700"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Fan Speed (Auto, Low, Medium, High) */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Fan Speed
                </span>
              </div>
              <span className="text-xs font-mono uppercase text-slate-500 dark:text-zinc-400">
                {fan === 'med' ? 'MEDIUM' : fan}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'low', label: 'Low' },
                  { id: 'med', label: 'Medium' },
                  { id: 'high', label: 'High' },
                ] as { id: FanSpeed; label: string }[]
              ).map((item) => {
                const active = fan === item.id;
                return (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    key={item.id}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() =>
                      onDispatchStateChange(
                        activeAppliance.id,
                        { fan: item.id, power: true },
                        'Web'
                      )
                    }
                    className={`min-h-[44px] rounded-xl px-2 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                        : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Swing & Quick Diagnostics */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                  <ArrowUpDown className="w-4 h-4 text-sky-500" />
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Swing ON/OFF
                </span>
              </div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                disabled={controlsDisabled}
                onClick={() =>
                  onDispatchStateChange(
                    activeAppliance.id,
                    { swing: !swing, power: true },
                    'Web'
                  )
                }
                className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  swing
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                }`}
              >
                {swing ? 'ON' : 'OFF'}
              </motion.button>
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowJsonPayload((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showJsonPayload ? 'Tutup Payload' : 'Lihat Payload'}</span>
              </button>

              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() =>
                  onDispatchStateChange(
                    activeAppliance.id,
                    { temp: clampTemperature(temp + 1) },
                    'Web',
                    { simulateTimeout: true }
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Simulasi Timeout</span>
              </button>
            </div>

            {showJsonPayload && (
              <pre className="rounded-xl bg-slate-950 text-emerald-400 p-3 text-[11px] font-mono overflow-x-auto border border-zinc-800">
                {JSON.stringify(fullPayloadPreview, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
