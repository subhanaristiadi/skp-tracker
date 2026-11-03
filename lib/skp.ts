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
