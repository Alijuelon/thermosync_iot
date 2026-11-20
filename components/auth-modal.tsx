'use client';

import React, { useState } from 'react';
import {
  Loader2,
  Lock,
  Mail,
  UserCheck,
  LogOut,
  Shield,
  Users,
} from 'lucide-react';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const DEMO_ACCOUNTS: UserSession[] = [
  {
    id: 'user-demo-1',
    email: 'alijuelonsinaga01@gmail.com',
    name: 'Josua',
    role: 'Pemilik Utama',
  },
  {
    id: 'user-demo-2',
    email: 'guest.tenant@thermosync.id',
    name: 'Tenant Lantai 4',
    role: 'Akun Terisolasi RLS (1 Hub · 1 AC)',
  },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession | null;
  onSignIn: (user: UserSession) => void;
  onSignOut: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  currentUser,
  onSignIn,
  onSignOut,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('alijuelonsinaga01@gmail.com');
  const [password, setPassword] = useState<string>('thermosync2026');
  const [name, setName] = useState<string>('Josua');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.includes('@') || email.trim().length < 5) {
      setErrorMsg('Format alamat email tidak valid. Masukkan email aktif Anda.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi untuk pendaftaran akun baru.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      const cleanEmail = email.trim().toLowerCase();
      const matchedDemo = DEMO_ACCOUNTS.find(
        (acc) => acc.email.toLowerCase() === cleanEmail
      );

      if (matchedDemo && mode === 'login') {
        onSignIn(matchedDemo);
      } else {
        const customId =
          cleanEmail === 'alijuelonsinaga01@gmail.com'
            ? 'user-demo-1'
            : `user-${cleanEmail.replace(/[^a-z0-9]/g, '')}`;
        onSignIn({
          id: customId,
          email: email.trim(),
          name: mode === 'register' ? name.trim() : email.split('@')[0],
          role: 'Akun Terisolasi (RLS Aktif)',
        });
      }
      onClose();
    }, 280);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                Autentikasi &amp; Isolasi Data
              </span>
            </div>
            <h2
              id="auth-modal-title"
              className="text-xl font-bold text-slate-900 dark:text-zinc-50 mt-1"
            >
              {currentUser
                ? 'Sesi Akun & Isolasi Data'
                : mode === 'login'
                ? 'Masuk ke ThermoSync'
                : 'Registrasi Akun Baru'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            Tutup
          </button>
        </div>

        {currentUser ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-zinc-100">
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                  <span>{currentUser.name}</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  RLS: {currentUser.id}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                Email: {currentUser.email}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Isolasi Data Aktif: Hanya menampilkan Hub &amp; AC milik akun
                  ini
                </span>
              </p>
            </div>

            {/* Quick Account Switcher to demonstrate Data Isolation */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/60 p-3.5 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-500" />
                <span>Uji Isolasi Data Antar Akun</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isCurrent = currentUser.id === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        onSignIn(acc);
                        onClose();
                      }}
                      className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold'
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:border-sky-500/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">{acc.name}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                          {acc.email} · {acc.role}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] font-mono font-bold text-sky-500 shrink-0">
                          Aktif
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-2.5 px-4 text-xs font-bold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                }}
                className={`rounded-lg py-1.5 text-xs font-semibold ${
                  mode === 'login'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
                className={`rounded-lg py-1.5 text-xs font-semibold ${
                  mode === 'register'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Register
              </button>
            </div>

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Nama Lengkap
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Lengkap Anda"
                  className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
              >
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 pl-10 pr-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 pl-10 pr-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs font-medium text-rose-600 dark:text-rose-400">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white py-2.5 px-4 text-sm font-bold transition-colors"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {mode === 'login' ? 'Masuk ke Dashboard' : 'Daftar & Masuk'}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
