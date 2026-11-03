"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Download, ExternalLink, LogOut, Paperclip, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EVIDENCE_ACCEPT, formatDate, SKP_INDICATORS, SkpActivity, SkpIndicator, todayInMakassar, validateEvidenceFile } from "@/lib/skp";

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
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceInputKey, setEvidenceInputKey] = useState(0);
  const [uploadingActivityId, setUploadingActivityId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<SkpActivity | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [deletedEvidenceReminder, setDeletedEvidenceReminder] = useState<{
    aktivitas: string;
    driveFileUrl: string | null;
  } | null>(null);

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

  const uploadEvidenceForActivity = useCallback(async (activityId: string, file: File): Promise<string | null> => {
    if (!supabase) return "Konfigurasi Supabase belum tersedia.";
    const validationError = validateEvidenceFile(file);
    if (validationError) return validationError;

    setUploadingActivityId(activityId);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Sesi login tidak tersedia. Silakan login kembali.");
      }

      const formData = new FormData();
      formData.append("activityId", activityId);
      formData.append("evidence", file);

      const response = await fetch("/api/activities/photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
      if (!response.ok) {
        throw new Error(result?.error || "File bukti gagal diunggah.");
      }

      return null;
    } catch (uploadError) {
      return uploadError instanceof Error ? uploadError.message : "Terjadi kesalahan saat mengunggah bukti.";
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

    const selectedEvidence = evidence;
    if (selectedEvidence) {
      const validationError = validateEvidenceFile(selectedEvidence);
      if (validationError) {
        setError(validationError);
        return;
      }
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
        photo_upload_status: selectedEvidence ? "pending" : "not_required",
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
    setEvidence(null);
    setEvidenceInputKey(current => current + 1);
    setMessage("Aktivitas berhasil disimpan.");

    if (selectedEvidence) {
      setMessage("Aktivitas tersimpan. Bukti sedang diunggah ke Google Drive...");
      const uploadError = await uploadEvidenceForActivity(insertedActivity.id, selectedEvidence);
      if (uploadError) {
        setError(`Aktivitas tetap tersimpan, tetapi bukti belum berhasil diunggah: ${uploadError}`);
      } else {
        setMessage("Aktivitas dan bukti berhasil disimpan ke Google Drive.");
      }
    }

    await loadActivities();
  }

  async function deleteActivity(item: SkpActivity) {
    if (!supabase || !userId) {
      setError("Sesi login tidak tersedia. Silakan login kembali.");
      return;
    }

    setError("");
    setMessage("");
    setDeletingActivityId(item.id);

    try {
      const { data: deletedActivity, error: deleteError } = await supabase
        .from("skp_activities")
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (!deletedActivity) {
        throw new Error("Aktivitas tidak ditemukan atau tidak dapat dihapus. Muat ulang riwayat.");
      }

      setActivities(current => current.filter(activityItem => activityItem.id !== item.id));
      setDeleteCandidate(null);

      if (item.drive_file_url || item.photo_upload_status === "uploaded") {
        setDeletedEvidenceReminder({
          aktivitas: item.aktivitas,
          driveFileUrl: item.drive_file_url,
        });
      } else {
        setDeletedEvidenceReminder(null);
      }

      setMessage("Aktivitas berhasil dihapus dari SKP Tracker.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Aktivitas gagal dihapus.");
    } finally {
      setDeletingActivityId(null);
    }
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
          <label className="full">Bukti pendukung (opsional)
            <input
              key={evidenceInputKey}
              type="file"
              accept={EVIDENCE_ACCEPT}
              onChange={e=>setEvidence(e.target.files?.[0] ?? null)}
            />
            <span className="field-hint">Gambar (JPG, PNG, WebP), PDF, Word (DOC/DOCX), Excel (XLS/XLSX), atau PowerPoint (PPT/PPTX) · Maksimal 4 MB. File diunggah ke folder Google Drive setelah aktivitas tersimpan.</span>
          </label>
          {photo && <div className="full selected-evidence"><Paperclip size={15}/><span>{photo.name}</span><button type="button" className="text-button" onClick={()=>setEvidence(null)}>Hapus</button></div>}
          <div className="full actions"><button className="primary" type="submit" disabled={saving || uploadingActivityId !== null}><Plus size={16}/>{saving ? "Menyimpan aktivitas..." : uploadingActivityId ? "Mengunggah bukti..." : "Simpan aktivitas"}</button></div>
        </form>
        {message && <p className="alert success">{message}</p>}
        {deletedEvidenceReminder && (
          <div className="alert delete-reminder" role="status">
            <strong>Pengingat file bukti di Google Drive</strong>
            <p>Catatan &quot;{deletedEvidenceReminder.aktivitas}&quot; sudah dihapus dari aplikasi, tetapi file bukti di Drive tetap ada. Hapus file tersebut secara manual dari folder <strong>SKP Activity Tracker</strong>.</p>
            {deletedEvidenceReminder.driveFileUrl && (
              <a href={deletedEvidenceReminder.driveFileUrl} target="_blank" rel="noreferrer">
                Buka file bukti terkait di Google Drive <ExternalLink size={13}/>
              </a>
            )}
          </div>
        )}
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
            <div className="activity-meta"><span>{formatDate(item.tanggal)}</span><span className="status">{item.photo_upload_status === "uploaded" ? "Bukti tersimpan" : item.photo_upload_status === "failed" ? "Upload bukti gagal" : item.photo_upload_status === "pending" ? "Menunggu upload" : "Tanpa bukti"}</span></div>
            <p>{item.aktivitas}</p><small>{item.indikator}</small>
            {deleteCandidate?.id === item.id ? (
              <div className="delete-confirmation">
                <div>
                  <strong>Konfirmasi penghapusan</strong>
                  <p>Aktivitas ini akan dihapus dari SKP Tracker. File bukti dukung di Google Drive tidak ikut terhapus otomatis.</p>
                  {item.drive_file_url ? (
                    <a className="evidence-link" href={item.drive_file_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14}/> Buka foto di Google Drive sebelum menghapus
                    </a>
                  ) : (
                    <p className="delete-reminder-copy">Jika file bukti untuk aktivitas ini pernah diunggah, periksa folder <strong>SKP Activity Tracker</strong> dan hapus secara manual.</p>
                  )}
                </div>
                <div className="delete-confirmation-actions">
                  <button className="secondary" type="button" onClick={() => setDeleteCandidate(null)} disabled={deletingActivityId === item.id}>
                    Batal
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void deleteActivity(item)}
                    disabled={deletingActivityId !== null || uploadingActivityId !== null || saving}
                  >
                    <Trash2 size={14}/>{deletingActivityId === item.id ? "Menghapus..." : "Ya, hapus aktivitas"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="activity-evidence-actions">
                {item.drive_file_url ? (
                  <a className="evidence-link" href={item.drive_file_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Lihat bukti di Google Drive</a>
                ) : (
                  <label className={`evidence-upload-trigger ${uploadingActivityId === item.id ? "disabled" : ""}`}>
                    <input
                      className="visually-hidden"
                      type="file"
                      accept={EVIDENCE_ACCEPT}
                      disabled={uploadingActivityId !== null || deletingActivityId !== null}
                      onChange={e=>{
                        const selectedFile=e.target.files?.[0] ?? null;
                        e.target.value="";
                        if(selectedFile) {
                          void uploadEvidenceForActivity(item.id, selectedFile).then(async uploadError=>{
                            if(uploadError) setError(`Bukti belum berhasil diunggah: ${uploadError}`);
                            else setMessage("Bukti berhasil diunggah ke Google Drive.");
                            await loadActivities();
                          });
                        }
                      }}
                    />
                    {uploadingActivityId === item.id ? <RefreshCw size={14}/> : <Upload size={14}/>}
                    {uploadingActivityId === item.id ? "Mengunggah..." : item.photo_upload_status === "failed" ? "Coba unggah ulang" : "Unggah foto"}
                  </label>
                )}
                <button
                  className="danger-text-button"
                  type="button"
                  onClick={() => {
                    setError("");
                    setMessage("");
                    setDeleteCandidate(item);
                  }}
                  disabled={uploadingActivityId !== null || deletingActivityId !== null || saving}
                >
                  <Trash2 size={14}/> Hapus aktivitas
                </button>
              </div>
            )}
          </article>)}</div>}
      </section>
      <footer>SKP Activity Tracker · Zona waktu acuan: Asia/Makassar (WITA)</footer>
    </main>
  );
}
