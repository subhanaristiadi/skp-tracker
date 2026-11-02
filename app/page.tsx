"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Camera, Download, ExternalLink, LogOut, Plus, RefreshCw, Upload } from "lucide-react";
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
  const [exportMonth, setExportMonth] = useState(todayInMakassar().slice(0, 7));
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploadingActivityId, setUploadingActivityId] = useState<string | null>(null);

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

  const uploadPhotoForActivity = useCallback(async (activityId: string, file: File): Promise<string | null> => {
    if (!supabase) return "Konfigurasi Supabase belum tersedia.";
    if (file.size <= 0 || file.size > 4 * 1024 * 1024) return "Ukuran foto maksimal 4 MB.";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Format foto harus JPG, PNG, atau WebP.";
    }

    setUploadingActivityId(activityId);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Sesi login tidak tersedia. Silakan login kembali.");
      }

      const formData = new FormData();
      formData.append("activityId", activityId);
      formData.append("photo", file);

      const response = await fetch("/api/activities/photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Foto gagal diunggah.");
      }

      return null;
    } catch (uploadError) {
      return uploadError instanceof Error ? uploadError.message : "Terjadi kesalahan saat mengunggah foto.";
    } finally {
      setUploadingActivityId(null);
    }
  }, []);

  async function saveActivity(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase || !userId) return;
    if (!activity.trim() || !indicator) {
      setError("Lengkapi aktivitas dan pilih indikator.");
      return;
    }

    const selectedPhoto = photo;
    if (selectedPhoto && selectedPhoto.size > 4 * 1024 * 1024) {
      setError("Ukuran foto maksimal 4 MB.");
      return;
    }
    if (selectedPhoto && !["image/jpeg", "image/png", "image/webp"].includes(selectedPhoto.type)) {
      setError("Format foto harus JPG, PNG, atau WebP.");
      return;
    }

    setSaving(true);
    const { data: insertedActivity, error: insertError } = await supabase
      .from("skp_activities")
      .insert({
        user_id: userId,
        tanggal: date || todayInMakassar(),
        aktivitas: activity.trim(),
        indikator: indicator,
        source: "web",
        photo_upload_status: selectedPhoto ? "pending" : "not_required",
      })
      .select("id")
      .single();
    setSaving(false);

    if (insertError || !insertedActivity) {
      setError(insertError?.message || "Aktivitas gagal disimpan.");
      return;
    }

    setActivity("");
    setDate(todayInMakassar());
    setIndicator("");
    setPhoto(null);
    setMessage("Aktivitas berhasil disimpan.");

    if (selectedPhoto) {
      setMessage("Aktivitas tersimpan. Foto sedang diunggah ke Google Drive...");
      const uploadError = await uploadPhotoForActivity(insertedActivity.id, selectedPhoto);
      if (uploadError) {
        setError(`Aktivitas tetap tersimpan, tetapi foto belum berhasil diunggah: ${uploadError}`);
      } else {
        setMessage("Aktivitas dan foto berhasil disimpan ke Google Drive.");
      }
    }

    await loadActivities();
  }

  async function downloadMonthlyReport() {
    if (!supabase || !session) return;

    setExporting(true);
    setExportMessage("");
    setExportError("");

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Sesi login tidak tersedia. Silakan login kembali.");
      }

      const response = await fetch(`/api/reports/monthly?month=${encodeURIComponent(exportMonth)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "Gagal mengunduh laporan XLSX.");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("File XLSX yang diterima kosong.");

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `riwayat-aktivitas-skp-${exportMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setExportMessage("File XLSX berhasil dibuat dan diunduh.");
    } catch (downloadError) {
      setExportError(downloadError instanceof Error ? downloadError.message : "Terjadi kesalahan saat mengunduh file.");
    } finally {
      setExporting(false);
    }
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
          <label className="full">Foto bukti dukung (opsional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={e=>setPhoto(e.target.files?.[0] ?? null)}
            />
            <span className="field-hint">JPG, PNG, atau WebP · Maksimal 4 MB. Foto diunggah ke folder Google Drive setelah aktivitas tersimpan.</span>
          </label>
          {photo && <div className="full selected-photo"><Camera size={15}/><span>{photo.name}</span><button type="button" className="text-button" onClick={()=>setPhoto(null)}>Hapus</button></div>}
          <div className="full actions"><button className="primary" type="submit" disabled={saving || uploadingActivityId !== null}><Plus size={16}/>{saving ? "Menyimpan aktivitas..." : uploadingActivityId ? "Mengunggah foto..." : "Simpan aktivitas"}</button></div>
        </form>
        {message && <p className="alert success">{message}</p>}
        {error && <p className="alert error">{error}</p>}
      </section>

      <section className="panel">
        <div className="section-heading history-heading">
          <div><h2>Riwayat aktivitas</h2><p className="muted">Data yang ditampilkan berasal dari akun ini.</p></div>
          <div className="history-actions">
            <button className="secondary" type="button" onClick={loadActivities}><RefreshCw size={15}/> Muat ulang</button>
          </div>
        </div>
        <div className="export-controls">
          <label className="month-picker">Bulan laporan
            <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} />
          </label>
          <button className="primary export-button" type="button" onClick={downloadMonthlyReport} disabled={exporting || !exportMonth}>
            <Download size={16}/>{exporting ? "Menyiapkan XLSX..." : "Download XLSX"}
          </button>
        </div>
        {exportMessage && <p className="alert success" role="status">{exportMessage}</p>}
        {exportError && <p className="alert error" role="alert">{exportError}</p>}
        {activities.length === 0 ? <div className="empty">Belum ada aktivitas. Tambahkan catatan pertama melalui formulir di atas.</div> :
          <div className="activity-list">{activities.map(item=><article className="activity" key={item.id}>
            <div className="activity-meta"><span>{formatDate(item.tanggal)}</span><span className="status">{item.photo_upload_status === "uploaded" ? "Foto tersimpan" : item.photo_upload_status === "failed" ? "Upload foto gagal" : item.photo_upload_status === "pending" ? "Menunggu upload" : "Tanpa foto"}</span></div>
            <p>{item.aktivitas}</p><small>{item.indikator}</small>
            <div className="activity-photo-actions">
              {item.drive_file_url ? (
                <a className="photo-link" href={item.drive_file_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Lihat foto di Google Drive</a>
              ) : (
                <label className={`photo-upload-trigger ${uploadingActivityId === item.id ? "disabled" : ""}`}>
                  <input
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingActivityId !== null}
                    onChange={e=>{
                      const selectedFile=e.target.files?.[0] ?? null;
                      e.target.value="";
                      if(selectedFile) {
                        void uploadPhotoForActivity(item.id, selectedFile).then(async uploadError=>{
                          if(uploadError) setError(`Foto belum berhasil diunggah: ${uploadError}`);
                          else setMessage("Foto berhasil diunggah ke Google Drive.");
                          await loadActivities();
                        });
                      }
                    }}
                  />
                  {uploadingActivityId === item.id ? <RefreshCw size={14}/> : <Upload size={14}/>}
                  {uploadingActivityId === item.id ? "Mengunggah..." : item.photo_upload_status === "failed" ? "Coba unggah ulang" : "Unggah foto"}
                </label>
              )}
            </div>
          </article>)}</div>}
      </section>
      <footer>SKP Activity Tracker · Zona waktu acuan: Asia/Makassar (WITA)</footer>
    </main>
  );
}
