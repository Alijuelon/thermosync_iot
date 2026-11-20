'use client';

import React, { useState } from 'react';
import {
  Search,
  Radio,
  Globe,
  Scan,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import {
  formatTimeHHMMSS,
  type DeviceCommand,
  type CommandSource,
} from '@/lib/iot-engine';

interface HistoryActivityViewProps {
  commands: DeviceCommand[];
  onClearHistory: () => void;
}

export function HistoryActivityView({
  commands,
  onClearHistory,
}: HistoryActivityViewProps) {
  const [sourceFilter, setSourceFilter] = useState<'ALL' | CommandSource>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredCommands = commands.filter((cmd) => {
    const matchesSource =
      sourceFilter === 'ALL' || cmd.source === sourceFilter;
    const matchesQuery =
      !searchQuery.trim() ||
      cmd.applianceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.esp32Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.actionSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.payload.protocol.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesQuery;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
          Riwayat Kontrol ({filteredCommands.length})
        </h1>

        {commands.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-slate-600 dark:text-zinc-300"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Hapus Log</span>
          </button>
        )}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'Web', label: 'Web' },
              { id: 'Remote Fisik', label: 'Remote' },
              { id: 'Scanner', label: 'Scanner' },
            ] as { id: 'ALL' | CommandSource; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSourceFilter(tab.id)}
              className={`min-h-[38px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                sourceFilter === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Cari riwayat perintah AC"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari perangkat / protokol..."
            className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3.5 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredCommands.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Belum ada riwayat aktivitas
          </p>
        </div>
      ) : (
        <>
          {/* Mobile List Cards (< md) */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-zinc-100">
                    {cmd.source === 'Remote Fisik' && (
                      <Radio className="w-3.5 h-3.5 text-sky-500" />
                    )}
                    {cmd.source === 'Web' && (
                      <Globe className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    {cmd.source === 'Scanner' && (
                      <Scan className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span>{cmd.applianceName}</span>
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {formatTimeHHMMSS(cmd.createdAt)}
                  </span>
                </div>

                <p className="text-xs font-mono text-slate-600 dark:text-zinc-300">
                  {cmd.actionSummary}
                </p>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 dark:border-zinc-800">
                  <span>{cmd.source} · {cmd.payload.protocol}</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                    {cmd.status} {cmd.latencyMs ? `(${cmd.latencyMs}ms)` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 bg-slate-50/60 dark:bg-zinc-950/60">
                  <th className="py-3 px-4 font-semibold">Waktu</th>
                  <th className="py-3 px-4 font-semibold">Sumber</th>
                  <th className="py-3 px-4 font-semibold">Perangkat</th>
                  <th className="py-3 px-4 font-semibold">Perintah</th>
                  <th className="py-3 px-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 text-xs">
                {filteredCommands.map((cmd) => (
                  <tr
                    key={cmd.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatTimeHHMMSS(cmd.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200">
                        {cmd.source === 'Remote Fisik' && (
                          <Radio className="w-3.5 h-3.5 text-sky-500" />
                        )}
                        {cmd.source === 'Web' && (
                          <Globe className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        {cmd.source === 'Scanner' && (
                          <Scan className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>{cmd.source}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-zinc-100">
                        {cmd.applianceName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {cmd.esp32Name}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300">
                      {cmd.actionSummary}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {cmd.status === 'executed' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            OK {cmd.latencyMs ? `(${cmd.latencyMs}ms)` : ''}
                          </span>
                        </span>
                      )}
                      {cmd.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </span>
                      )}
                      {(cmd.status === 'failed' || cmd.status === 'timeout') && (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Timeout</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
