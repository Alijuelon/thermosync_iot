'use client';

import React from 'react';
import {
  Zap,
  Activity,
  Gauge,
  BarChart3,
  Waves,
  ShieldCheck,
} from 'lucide-react';
import {
  hasPzemReading,
  formatPzemPower,
  evaluateVoltageStatus,
  evaluatePowerFactorStatus,
  evaluateFrequencyStatus,
  type PzemTelemetry,
  type PzemStatusTone,
} from '@/lib/iot-engine';

interface PzemTelemetryPanelProps {
  pzem?: PzemTelemetry;
  online: boolean;
}

function getToneTextClass(tone: PzemStatusTone): string {
  switch (tone) {
    case 'nominal':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'alert':
      return 'text-rose-600 dark:text-rose-400';
    default:
      return 'text-slate-400 dark:text-zinc-500';
  }
}

export function PzemTelemetryPanel({ pzem, online }: PzemTelemetryPanelProps) {
  const active = hasPzemReading(pzem);
  const voltage = active ? pzem!.voltage : null;
  const current = active ? pzem!.current : null;
  const power = active ? pzem!.power : null;
  const energy = active ? pzem!.energy : null;
  const frequency = active ? pzem!.frequency : null;
  const pf = active ? pzem!.pf : null;

  const formattedPower = formatPzemPower(power);
  const voltageStatus = evaluateVoltageStatus(voltage);
  const pfStatus = evaluatePowerFactorStatus(pf);
  const freqStatus = evaluateFrequencyStatus(frequency);

  // Proportional load indicator relative to 23 kW (23,000 W) max PZEM-004T v4.0 CT capacity
  const powerRatioPct =
    typeof power === 'number' && Number.isFinite(power) && power > 0
      ? Math.min(100, Math.max(2, (power / 23000) * 100))
      : 0;

  // Proportional current indicator relative to 100 A CT coil ceiling
  const currentRatioPct =
    typeof current === 'number' && Number.isFinite(current) && current > 0
      ? Math.min(100, Math.max(2, (current / 100) * 100))
      : 0;

  return (
    <div className="space-y-2.5">
      {/* Clean Unboxed Header Row */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100">
            Monitoring Listrik AC · PZEM-004T v4.0
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            Sensor CT 100A · 6 Parameter Real-Time
          </span>
        </div>

        <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
          {!online ? (
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              Hub Terputus
            </span>
          ) : active ? (
            <span className={getToneTextClass(voltageStatus.tone) + ' font-semibold'}>
              Sensor Aktif · {voltageStatus.label}
            </span>
          ) : (
            <span>Menunggu pembacaan PZEM-004T</span>
          )}
        </div>
      </div>

      {/* Single-Elevation 6-Parameter Hairline Grid (No Nested Card Clutter) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 bg-slate-200/80 dark:bg-zinc-800/80 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px">
          {/* 1. Tegangan (Voltage): 80 – 260 VAC */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Tegangan
              </span>
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {voltage !== null ? voltage.toFixed(1) : '--'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                VAC
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
              <span className="text-slate-400 dark:text-zinc-500">80–260 V</span>
              <span className={`font-sans font-semibold ${getToneTextClass(voltageStatus.tone)}`}>
                {voltageStatus.label}
              </span>
            </div>
          </div>

          {/* 2. Arus (Current): hingga 100 A (CT Eksternal) */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Arus CT
              </span>
              <Activity className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {current !== null ? current.toFixed(2) : '--'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                A
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${currentRatioPct}%` }}
                />
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                Maks. 100 A
              </div>
            </div>
          </div>

          {/* 3. Daya Aktif (Power): hingga ~23 kW */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Daya Aktif
              </span>
              <Gauge className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {formattedPower.value}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                {formattedPower.unit}
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${powerRatioPct}%` }}
                />
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                Maks. 23 kW
              </div>
            </div>
          </div>

          {/* 4. Energi Kumulatif (Energy): 0 – 9999 kWh */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Energi
              </span>
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {energy !== null ? energy.toFixed(3) : '--'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                kWh
              </span>
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-zinc-500">
              Kumulatif 0–9999
            </div>
          </div>

          {/* 5. Frekuensi (Frequency): 45 – 65 Hz */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Frekuensi
              </span>
              <Waves className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {frequency !== null ? frequency.toFixed(1) : '--'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Hz
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
              <span className="text-slate-400 dark:text-zinc-500">45–65 Hz</span>
              <span className={`font-sans font-semibold ${getToneTextClass(freqStatus.tone)}`}>
                {freqStatus.label}
              </span>
            </div>
          </div>

          {/* 6. Faktor Daya (Power Factor / PF): 0 – 1 */}
          <div className="bg-slate-50 dark:bg-zinc-950/95 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Faktor Daya
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                {pf !== null ? pf.toFixed(2) : '--'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                PF
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
              <span className="text-slate-400 dark:text-zinc-500">0.00–1.00</span>
              <span className={`font-sans font-semibold ${getToneTextClass(pfStatus.tone)}`}>
                {pfStatus.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
