"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    let active = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const linkHasError = query.has("error") || hash.has("error");

    const acceptRecoverySession = () => {
      if (!active) return;
      setReady(true);
      setError("");
      setChecking(false);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session && !linkHasError) {
        acceptRecoverySession();
      }
    });

    async function verifyLink() {
      if (linkHasError) {
        if (active) {
          setError("Link reset tidak valid atau sudah kedaluwarsa. Kembali ke login dan minta link baru.");
          setChecking(false);
        }
        return;
      }

      const { data: { session }, error: sessionError } = await supabase!.auth.getSession();
      if (!active) return;
      if (sessionError || !session) {
        setError("Link reset tidak valid atau sudah kedaluwarsa. Kembali ke login dan minta link baru.");
        setChecking(false);
      }
      // For the implicit flow, PASSWORD_RECOVERY above enables the form after Supabase consumes the URL token.
    }

    void verifyLink();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !ready || busy) return;

    setError("");
    if (password.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (password !== confirmation) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.code === "same_password"
          ? "Password baru harus berbeda dari password lama."
          : "Password belum dapat diubah. Jika link kedaluwarsa, minta link baru.");
        return;
      }

      setPassword("");
      setConfirmation("");
      setReady(false);
      setDone(true);
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      setError("Terjadi gangguan koneksi. Jika password sudah berubah, coba masuk menggunakan password baru.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="eyebrow">SKP ACTIVITY TRACKER</div>
        <h1>Reset password</h1>
        {checking ? <p className="muted" role="status">Memverifikasi link reset...</p> : done ? (
          <p className="alert success" role="status">Password berhasil diubah. Silakan masuk kembali menggunakan password baru.</p>
        ) : <>
          {!supabase && <p className="alert error" role="alert">Konfigurasi Supabase belum tersedia.</p>}
          {ready && <form className="stack" onSubmit={resetPassword}>
            <p className="muted">Buat password baru minimal 8 karakter.</p>
            <label>Password baru<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
            <label>Konfirmasi password baru<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={busy} /></label>
            <button className="primary" disabled={busy}>{busy ? "Menyimpan..." : "Simpan password baru"}</button>
          </form>}
        </>}
        {error && <p className="alert error" role="alert">{error}</p>}
        {!busy && <p className="hint"><Link href="/">Kembali ke login</Link></p>}
      </section>
    </main>
  );
}
