'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Radio,
  Zap,
  CheckCircle2,
  ArrowRight,
  Power,
  Volume2,
  Sparkles,
  AlertTriangle,
  Search,
} from 'lucide-react';
import {
  AC_BRANDS,
  IR_PROTOCOL_CATALOG,
  isEsp32Online,
  getProtocolsByBrand,
  getIrChannelInfo,
  detectSamePinBrandCollision,
  type ESP32Node,
  type ACAppliance,
  type IRProtocolProfile,
  type IrTxPin,
} from '@/lib/iot-engine';

interface AutomaticScannerWizardProps {
  esp32Nodes: ESP32Node[];
  appliances: ACAppliance[];
  initialEsp32Id?: string;
  nowMs: number;
  onSaveScannedAppliance: (params: {
    esp32Id: string;
    name: string;
    brand: string;
    protocol: string;
    protocolBits: number;
    irTxPin: IrTxPin;
    tierMethod: string;
  }) => void;
}

type MainScannerMethod = 'ir_remote' | 'smart_bruteforce';

export function AutomaticScannerWizard({
  esp32Nodes,
  appliances,
  initialEsp32Id,
  nowMs,
  onSaveScannedAppliance,
}: AutomaticScannerWizardProps) {
  const onlineNodes = esp32Nodes.filter((n) => isEsp32Online(n.lastSeen, nowMs));
  const [selectedEsp32Id] = useState<string>(
    initialEsp32Id || onlineNodes[0]?.id || esp32Nodes[0]?.id || ''
  );
  const [selectedIrTxPin] = useState<IrTxPin>(23);
  const [activeMethod, setActiveMethod] =
    useState<MainScannerMethod>('ir_remote');

  const [isListeningIr, setIsListeningIr] = useState<boolean>(true);
  const [detectedProfile, setDetectedProfile] =
    useState<IRProtocolProfile | null>(null);

  const [selectedBrand, setSelectedBrand] = useState<string>('Daikin');
  const [brandSearchQuery, setBrandSearchQuery] = useState<string>('');
  const [bruteforceIndex, setBruteforceIndex] = useState<number>(0);
  const [lastFiredSignalText, setLastFiredSignalText] = useState<string>('');

  const [testPowerState, setTestPowerState] = useState<boolean>(true);
  const [testTempState, setTestTempState] = useState<number>(22);
  const [testFeedback, setTestFeedback] = useState<string>('');
  const [applianceName, setApplianceName] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');

  const selectedHub = esp32Nodes.find((n) => n.id === selectedEsp32Id);
  const selectedHubOnline = selectedHub
    ? isEsp32Online(selectedHub.lastSeen, nowMs)
    : false;
  const selectedChannelInfo = getIrChannelInfo(selectedIrTxPin);

  const filteredBrands = AC_BRANDS.filter((b) =>
    b.toLowerCase().includes(brandSearchQuery.trim().toLowerCase())
  );

  const brandCandidates = getProtocolsByBrand(selectedBrand);
  const activeBruteforceProfile =
    brandCandidates[bruteforceIndex] || brandCandidates[0];

  const activeTargetBrand =
    detectedProfile?.brand ||
    (activeMethod === 'smart_bruteforce' ? selectedBrand : '');
  const activeTargetProto =
    detectedProfile?.protocol ||
    (activeMethod === 'smart_bruteforce'
      ? activeBruteforceProfile?.protocol || ''
      : '');

  const samePinCollision =
    activeTargetBrand && activeTargetProto
      ? detectSamePinBrandCollision(appliances, {
          esp32Id: selectedEsp32Id,
          brand: activeTargetBrand,
          protocol: activeTargetProto,
          irTxPin: selectedIrTxPin,
        })
      : null;

  const handleSimulateRemoteCapture = (brandName: string) => {
    setIsListeningIr(true);
    const match =
      IR_PROTOCOL_CATALOG.find(
        (p) => p.brand.toLowerCase() === brandName.toLowerCase()
      ) || IR_PROTOCOL_CATALOG[0];
    setDetectedProfile(match);
    setIsListeningIr(false);
    setApplianceName(`AC ${match.brand}`);
    setNameError('');
    setTestFeedback('');
  };

  const handleConfirmBruteforceProfile = (profile: IRProtocolProfile) => {
    setDetectedProfile(profile);
    setApplianceName(`AC ${profile.brand}`);
    setNameError('');
    setTestFeedback('');
  };

  const handleFireTestCommand = (label: string) => {
    if (!detectedProfile) return;
    setTestFeedback(`Sinyal ${label} terkirim ke AC ${detectedProfile.brand}`);
  };

  const handleSubmitNewAppliance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectedProfile) return;
    const trimmed = applianceName.trim();
    if (!trimmed) {
      setNameError('Nama AC wajib diisi.');
      return;
    }

    const methodLabel =
      activeMethod === 'ir_remote' ? 'IR Auto-Detect' : 'Smart Bruteforce';

    onSaveScannedAppliance({
      esp32Id: selectedEsp32Id,
      name: trimmed,
      brand: detectedProfile.brand,
      protocol: detectedProfile.protocol,
      protocolBits: detectedProfile.bits,
      irTxPin: selectedIrTxPin,
      tierMethod: `${methodLabel} (${selectedChannelInfo.shortBadge})`,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Executive Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
          Scanner AC Universal
        </h1>
        <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-zinc-300">
          {AC_BRANDS.length} Merek AC Didukung
        </span>
      </div>

      {/* 2 MENU UTAMA: Selector Card Terpisah */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <button
          type="button"
          onClick={() => setActiveMethod('ir_remote')}
          className={`rounded-3xl border p-4 sm:p-5 text-left transition-all flex items-start gap-3.5 shadow-sm ${
            activeMethod === 'ir_remote'
              ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500'
              : 'border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 hover:border-sky-500/40'
          }`}
        >
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              activeMethod === 'ir_remote'
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                : 'bg-sky-500/10 text-sky-500'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-50">
                1. Deteksi Remote Asli
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Arahkan remote AC fisik Anda ke sensor untuk deteksi otomatis.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveMethod('smart_bruteforce')}
          className={`rounded-3xl border p-4 sm:p-5 text-left transition-all flex items-start gap-3.5 shadow-sm ${
            activeMethod === 'smart_bruteforce'
              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
              : 'border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 hover:border-amber-500/40'
          }`}
        >
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              activeMethod === 'smart_bruteforce'
                ? 'bg-amber-500 text-zinc-950 shadow-sm shadow-amber-500/30'
                : 'bg-amber-500/10 text-amber-500'
            }`}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-50">
                2. Cari Berdasarkan Merek
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Pilih dari {AC_BRANDS.length} merek AC jika remote fisik tidak tersedia.
            </p>
          </div>
        </button>
      </div>

      {/* KARTU METODE 1: IR Auto-Detect (Dipisahkan menjadi 2 Card: Radar & Pilihan Remote) */}
      {activeMethod === 'ir_remote' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Card Radar Penerima IR */}
          <section className="lg:col-span-4 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-6 flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
            <div className="relative w-36 h-36 flex items-center justify-center">
              {isListeningIr ? (
                <>
                  {/* Outer static radar grid ring */}
                  <div className="absolute inset-1 rounded-full border border-dashed border-sky-500/30" />

                  {/* Rotating radar sweep beam */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                    className="absolute inset-2 rounded-full bg-conic from-sky-500/25 via-sky-500/5 to-transparent"
                  />

                  {/* Expanding pulse wave 1 */}
                  <motion.div
                    animate={{
                      scale: [0.65, 1.35],
                      opacity: [0.7, 0],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeOut',
                    }}
                    className="absolute w-28 h-28 rounded-full border-2 border-sky-400/60 bg-sky-500/10"
                  />

                  {/* Expanding pulse wave 2 (staggered) */}
                  <motion.div
                    animate={{
                      scale: [0.65, 1.35],
                      opacity: [0.7, 0],
                    }}
                    transition={{
                      duration: 2.2,
                      delay: 1.1,
                      repeat: Infinity,
                      ease: 'easeOut',
                    }}
                    className="absolute w-28 h-28 rounded-full border-2 border-sky-400/50 bg-sky-500/5"
                  />
                </>
              ) : (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.15, opacity: 1 }}
                  className="absolute w-28 h-28 rounded-full border border-emerald-500/30 bg-emerald-500/10"
                />
              )}

              {/* Center Sensor Core */}
              <motion.div
                animate={
                  isListeningIr
                    ? {
                        scale: [1, 1.08, 1],
                      }
                    : { scale: 1 }
                }
                transition={{
                  duration: 1.6,
                  repeat: isListeningIr ? Infinity : 0,
                  ease: 'easeInOut',
                }}
                className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                  detectedProfile && !isListeningIr
                    ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/30'
                    : 'bg-sky-500 text-white shadow-sky-500/40'
                }`}
              >
                {detectedProfile && !isListeningIr ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : (
                  <motion.div
                    animate={{ rotate: [-8, 8, -8] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  >
                    <Radio className="w-7 h-7" />
                  </motion.div>
                )}
              </motion.div>
            </div>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 px-3 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  detectedProfile && !isListeningIr
                    ? 'bg-emerald-500'
                    : 'bg-sky-500 animate-ping'
                }`}
              />
              <span>
                {detectedProfile && !isListeningIr
                  ? 'Sinyal Tertangkap'
                  : 'Sensor IR Aktif Memindai'}
              </span>
            </div>

            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-zinc-100 text-center">
              {detectedProfile && !isListeningIr
                ? `AC ${detectedProfile.brand} Terdeteksi`
                : 'Menunggu Sinyal Remote...'}
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 text-center mt-1">
              Arahkan remote asli ke sensor penerima lalu tekan tombol Power.
            </p>
          </section>

          {/* Card Simulasi / Tangkap Sinyal Remote Semua Merek */}
          <section className="lg:col-span-8 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-5 space-y-3.5 shadow-sm flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                    Pilih Sinyal Remote Fisik ({filteredBrands.length} Merek)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Klik salah satu merek untuk simulasi tangkap sinyal remote
                  </p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={brandSearchQuery}
                    onChange={(e) => setBrandSearchQuery(e.target.value)}
                    placeholder="Cari merek AC..."
                    className="w-full h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 pl-8 pr-3 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredBrands.map((brand) => (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    key={brand}
                    type="button"
                    disabled={!selectedHubOnline}
                    onClick={() => handleSimulateRemoteCapture(brand)}
                    className="min-h-[40px] flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 text-xs font-bold text-slate-800 dark:text-zinc-100 hover:border-sky-500 transition-colors"
                  >
                    <span className="truncate">{brand}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-500 shrink-0 ml-1" />
                  </motion.button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* KARTU METODE 2: Smart Bruteforce (Dipisahkan menjadi 2 Card: Pilih Merek & Pengujian Kandidat) */}
      {activeMethod === 'smart_bruteforce' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Card Pilih Merek AC */}
          <section className="lg:col-span-6 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-5 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                Pilih Merek AC ({filteredBrands.length})
              </h3>
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={brandSearchQuery}
                  onChange={(e) => setBrandSearchQuery(e.target.value)}
                  placeholder="Cari merek AC..."
                  className="w-full h-8 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 pl-8 pr-2.5 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredBrands.map((brand) => {
                const active = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => {
                      setSelectedBrand(brand);
                      setBruteforceIndex(0);
                      setLastFiredSignalText('');
                    }}
                    className={`min-h-[40px] rounded-xl px-3 text-xs font-bold border transition-all truncate ${
                      active
                        ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500'
                        : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 hover:border-amber-500/40'
                    }`}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Card Pengujian Kandidat Protokol */}
          <section className="lg:col-span-6 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 p-5 space-y-4 shadow-sm flex flex-col justify-between">
            {activeBruteforceProfile && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                        Opsi Sinyal {bruteforceIndex + 1} dari{' '}
                        {brandCandidates.length}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 mt-0.5">
                        Profil {selectedBrand} #{bruteforceIndex + 1}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={bruteforceIndex === 0}
                        onClick={() =>
                          setBruteforceIndex((i) => Math.max(0, i - 1))
                        }
                        className="h-9 rounded-xl border border-slate-300 dark:border-zinc-700 px-3 text-xs font-semibold disabled:opacity-40"
                      >
                        Sebelumnya
                      </button>
                      <button
                        type="button"
                        disabled={bruteforceIndex >= brandCandidates.length - 1}
                        onClick={() =>
                          setBruteforceIndex((i) =>
                            Math.min(brandCandidates.length - 1, i + 1)
                          )
                        }
                        className="h-9 rounded-xl border border-slate-300 dark:border-zinc-700 px-3 text-xs font-semibold disabled:opacity-40"
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{
                        width: `${
                          ((bruteforceIndex + 1) /
                            Math.max(1, brandCandidates.length)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={() =>
                        setLastFiredSignalText(
                          `Sinyal tes dikirim ke AC ${selectedBrand}...`
                        )
                      }
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-4 text-xs font-bold text-slate-800 dark:text-zinc-100"
                    >
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>Kirim Tes Nyala</span>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={() =>
                        handleConfirmBruteforceProfile(activeBruteforceProfile)
                      }
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 text-xs sm:text-sm font-bold shadow-sm shadow-emerald-500/20"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>AC Bunyi / Menyala</span>
                    </motion.button>
                  </div>

                  {lastFiredSignalText && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {lastFiredSignalText}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* CARD 3A: Status Ringkas */}
      <div className="grid grid-cols-1 gap-4">
        <section className="rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 px-5 py-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-50">
                {detectedProfile
                  ? `AC ${detectedProfile.brand} Siap Disimpan`
                  : 'Belum Ada AC Dipilih'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {detectedProfile
                  ? 'Lengkapi nama AC pada jendela pop-up untuk menyimpan.'
                  : 'Pilih merek remote atau uji sinyal di atas untuk membuka pop-up penyimpanan.'}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* POPUP MODAL: Simpan Profil Perangkat AC ketika sudah terdeteksi */}
      {detectedProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-save-detected-ac"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
        >
          <section className="w-full max-w-md rounded-3xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xl">
            {/* Hero Visual Header */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shadow-sm">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Merek {detectedProfile.brand} Cocok
                </span>
                <h2
                  id="modal-save-detected-ac"
                  className="text-lg font-bold text-slate-900 dark:text-zinc-50"
                >
                  Simpan AC Baru
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Uji tombol di bawah untuk memastikan AC merespons, lalu beri
                  nama perangkat.
                </p>
              </div>
            </div>

            {/* Panel Uji Cepat Sederhana */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800/90 bg-slate-50/80 dark:bg-zinc-950/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-zinc-400">
                  Coba Tes Respon AC
                </span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">
                  Suhu Tes: {testTempState}°C
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !testPowerState;
                    setTestPowerState(next);
                    handleFireTestCommand(next ? 'Power ON' : 'Power OFF');
                  }}
                  className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-colors ${
                    testPowerState
                      ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                      : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{testPowerState ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(16, testTempState - 1);
                    setTestTempState(next);
                    handleFireTestCommand(`Suhu ${next}°C`);
                  }}
                  className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-sky-500/50 px-2.5 text-xs font-bold text-slate-700 dark:text-zinc-200 transition-colors"
                >
                  - Dinginkan
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(30, testTempState + 1);
                    setTestTempState(next);
                    handleFireTestCommand(`Suhu ${next}°C`);
                  }}
                  className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-sky-500/50 px-2.5 text-xs font-bold text-slate-700 dark:text-zinc-200 transition-colors"
                >
                  + Naikkan
                </button>
              </div>

              {testFeedback && (
                <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 text-center pt-0.5">
                  {testFeedback}
                </p>
              )}
            </div>

            {samePinCollision && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p>
                  AC <strong>{samePinCollision.name}</strong> memiliki merek
                  yang sama di ruangan ini.
                </p>
              </div>
            )}

            {/* Form Nama AC & Pilihan Cepat */}
            <form onSubmit={handleSubmitNewAppliance} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="new-appliance-name"
                  className="block text-xs font-bold text-slate-700 dark:text-zinc-300"
                >
                  Nama Perangkat AC
                </label>
                <input
                  id="new-appliance-name"
                  type="text"
                  value={applianceName}
                  onChange={(e) => {
                    setApplianceName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="Contoh: AC Kamar Utama"
                  className="w-full h-11 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />

                {/* Pilihan Nama Cepat */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {[
                    `AC ${detectedProfile.brand} Kamar`,
                    `AC ${detectedProfile.brand} Ruang Tamu`,
                    `AC ${detectedProfile.brand} Kerja`,
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setApplianceName(preset);
                        setNameError('');
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        applianceName === preset
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {nameError && (
                  <p className="text-xs font-medium text-rose-500">
                    {nameError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDetectedProfile(null);
                    setIsListeningIr(true);
                  }}
                  className="h-11 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 px-4 text-xs sm:text-sm font-bold text-slate-700 dark:text-zinc-300 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-4 text-xs sm:text-sm font-bold transition-colors shadow-sm shadow-sky-500/20"
                >
                  Simpan AC
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
