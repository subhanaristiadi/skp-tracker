"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDate, SKP_INDICATORS, SkpActivity, SkpIndicator, todayInMakassar } from "@/lib/skp";

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<SkpActivity[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activity, setActivity] = useState("");
  const [date, setDate] = useState("");
  const [indicator, setIndicator] = useState<SkpIndicator | "">("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadActivities = useCallback(async () => {
    if (!supabase || !userId) return;

    const { data, error: queryError } = await supabase
      .from("skp_activities")
      .select("id,tanggal,aktivitas,indikator,photo_upload_status,drive_file_url,created_at")
      .order("tanggal", { ascending: false })
      .order("created_at", { ascending: false });

    if (queryError) setError(queryError.message);
    else setActivities((data ?? []) as SkpActivity[]);
  }, [userId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const count = useMemo(() => activities.length, [activities]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Konfigurasi Supabase belum diisi. Salin .env.example menjadi .env.local.");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
  }

  async function saveActivity(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase || !userId) return;
    if (!activity.trim() || !indicator) {
      setError("Lengkapi aktivitas dan pilih indikator.");
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from("skp_activities").insert({
      user_id: userId,
      tanggal: date || todayInMakassar(),
      aktivitas: activity.trim(),
      indikator: indicator,
      source: "web",
      photo_upload_status: "not_required",
    });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setActivity("");
    setDate(todayInMakassar());
    setIndicator("");
    setMessage("Aktivitas berhasil disimpan.");
    await loadActivities();
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setActivities([]);
  }

  if (loading) return <main className="center"><p>Memuat aplikasi...</p></main>;

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="login-card">
          <div className="eyebrow">PERSONAL WORK LOG</div>
          <h1>SKP Activity Tracker</h1>
          <p className="muted">Masuk untuk mencatat dan meninjau aktivitas kerja.</p>
          {!supabase && <div className="alert error">Konfigurasi Supabase belum tersedia. Isi variabel pada file .env.local.</div>}
          <form onSubmit={signIn} className="stack">
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
            <button className="primary" disabled={!supabase}>Masuk</button>
          </form>
          {error && <p className="alert error">{error}</p>}
          <p className="hint">Akun dibuat oleh administrator melalui Supabase. Pendaftaran publik tidak disediakan pada tahap ini.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">PERSONAL WORK LOG</div><h1>SKP Activity Tracker</h1></div>
        <button className="secondary" onClick={signOut}><LogOut size={16}/> Keluar</button>
      </header>

      <section className="summary">
        <div><span className="muted">Total aktivitas tercatat</span><strong>{count}</strong></div>
        <div><span className="muted">Akun aktif</span><strong className="email">{session.user.email}</strong></div>
      </section>

      <section className="panel">
        <div className="section-heading"><div><h2>Tambah aktivitas</h2><p className="muted">Pilih indikator resmi secara manual.</p></div></div>
        <form onSubmit={saveActivity} className="form-grid">
          <label className="full">Aktivitas<textarea value={activity} onChange={e=>setActivity(e.target.value)} placeholder="Contoh: Menyusun lesson plan untuk unit kompetensi..." rows={3} required /></label>
          <label>Tanggal<input type="date" value={date || todayInMakassar()} onChange={e=>setDate(e.target.value)} required /></label>
          <label className="full">Indikator SKP
            <select value={indicator} onChange={e=>setIndicator(e.target.value as SkpIndicator)} required>
              <option value="">Pilih satu indikator</option>
              {SKP_INDICATORS.map((item, index)=><option key={item} value={item}>{index+1}. {item}</option>)}
            </select>
          </label>
          <div className="full upload-note">Foto bersifat opsional dan belum diaktifkan pada tahap pertama. Integrasi Google Drive dikerjakan pada tahap berikutnya.</div>
          <div className="full actions"><button className="primary" type="submit" disabled={saving}><Plus size={16}/>{saving ? "Menyimpan..." : "Simpan aktivitas"}</button></div>
        </form>
        {message && <p className="alert success">{message}</p>}
        {error && <p className="alert error">{error}</p>}
      </section>

      <section className="panel">
        <div className="section-heading"><div><h2>Riwayat aktivitas</h2><p className="muted">Data yang ditampilkan berasal dari akun ini.</p></div><button className="secondary" onClick={loadActivities}><RefreshCw size={15}/> Muat ulang</button></div>
        {activities.length === 0 ? <div className="empty">Belum ada aktivitas. Tambahkan catatan pertama melalui formulir di atas.</div> :
          <div className="activity-list">{activities.map(item=><article className="activity" key={item.id}>
            <div className="activity-meta"><span>{formatDate(item.tanggal)}</span><span className="status">{item.photo_upload_status === "uploaded" ? "Foto tersimpan" : item.photo_upload_status === "failed" ? "Upload foto gagal" : "Tanpa foto"}</span></div>
            <p>{item.aktivitas}</p><small>{item.indikator}</small>
          </article>)}</div>}
      </section>
      <footer>SKP Activity Tracker · Zona waktu acuan: Asia/Makassar (WITA)</footer>
    </main>
  );
}
