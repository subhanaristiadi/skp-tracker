export const SKP_INDICATORS = [
  "Kuantitas - Jumlah Kebutuhan Pelatihan yang Teridentifikasi",
  "Kuantitas - Jumlah Rencana Pelatihan / Lesson Plan per Unit Kompetensi",
  "Kuantitas - Jumlah Dokumen Administrasi dan Operasional UPTD LK",
  "Kuantitas - Jumlah Media Pembelajaran Berdasarkan Kompetensi",
  "Kuantitas - Jumlah Koordinasi Pelatihan Kerja Pusat dan Kabupaten/Kota",
  "Waktu - Terlaksananya Tugas Lain yang Diberikan Oleh Atasan Baik Secara Lisan / Tertulis",
] as const;

export type SkpIndicator = (typeof SKP_INDICATORS)[number];

export const MAX_EVIDENCE_FILE_SIZE = 4 * 1024 * 1024;
export const EVIDENCE_ACCEPT = [
  ".jpg", ".jpeg", ".png", ".webp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
].join(",");

const EVIDENCE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

export function validateEvidenceFile(file: File): string | null {
  if (file.size <= 0) return "File bukti tidak boleh kosong.";
  if (file.size > MAX_EVIDENCE_FILE_SIZE) return "Ukuran file bukti maksimal 4 MB.";

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EVIDENCE_EXTENSIONS.has(extension)) {
    return "Format bukti harus JPG, PNG, WebP, PDF, Word, Excel, atau PowerPoint.";
  }

  return null;
}

export type SkpActivity = {
  id: string;
  tanggal: string;
  aktivitas: string;
  indikator: SkpIndicator;
  photo_upload_status: "not_required" | "pending" | "uploaded" | "failed";
  drive_file_url: string | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  created_at: string;
};

export function todayInMakassar(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

// Time range helpers for the optional "Waktu Mulai-Selesai" field.
// Values are wall-clock WITA times ("HH:MM") and never carry a time zone.

export const MIN_TIME_MINUTES = 0;
// 23:55 keeps every slider value representable by <input type="time">.
export const MAX_TIME_MINUTES = 23 * 60 + 55;
export const TIME_STEP_MINUTES = 5;

const DEFAULT_RANGE_MINUTES = 90;

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), 23 * 60 + 59);
  const hours = Math.floor(clamped / 60);
  return `${String(hours).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function nowInMakassar(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function defaultTimeRange(): { start: string; end: string } {
  const now = parseTimeToMinutes(nowInMakassar()) ?? 0;
  const roundedEnd = Math.floor(now / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  const end = Math.min(Math.max(roundedEnd, TIME_STEP_MINUTES), MAX_TIME_MINUTES);
  const start = Math.max(MIN_TIME_MINUTES, end - DEFAULT_RANGE_MINUTES);
  return { start: minutesToTime(start), end: minutesToTime(end) };
}

/** Trims a database `time` value ("10:00:00") down to "HH:MM". */
export function normalizeTime(value: string | null | undefined): string | null {
  const minutes = parseTimeToMinutes(value);
  return minutes === null ? null : minutesToTime(minutes);
}

export function formatTimeRange(start: string | null, end: string | null): string {
  const startTime = normalizeTime(start);
  const endTime = normalizeTime(end);
  return startTime && endTime ? `${startTime}–${endTime}` : "";
}

export function validateTimeRange(start: string, end: string): string | null {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null && endMinutes === null) return null;
  if (startMinutes === null || endMinutes === null) {
    return "Lengkapi waktu mulai dan waktu selesai, atau kosongkan keduanya.";
  }
  if (endMinutes <= startMinutes) {
    return "Waktu selesai harus lebih lambat dari waktu mulai.";
  }
  return null;
}

/** Converts form input into a value Supabase can store, or null when empty. */
export function toDatabaseTime(value: string): string | null {
  const minutes = parseTimeToMinutes(value);
  return minutes === null ? null : minutesToTime(minutes);
}

const TIME_COLUMN_HINT =
  "Kolom waktu belum tersedia di database. Jalankan migration supabase/migrations/20261124152200_activity_time_range.sql di SQL Editor Supabase, lalu muat ulang halaman.";

/** Turns a PostgREST "column does not exist" error into an actionable hint. */
export function explainDatabaseError(message: string): string {
  return /waktu_(mulai|selesai)/i.test(message) ? TIME_COLUMN_HINT : message;
}
