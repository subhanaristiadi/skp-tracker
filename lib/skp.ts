export const SKP_INDICATORS = [
  "Kuantitas - Jumlah Kebutuhan Pelatihan yang Teridentifikasi",
  "Kuantitas - Jumlah Rencana Pelatihan / Lesson Plan per Unit Kompetensi",
  "Kuantitas - Jumlah Dokumen Administrasi dan Operasional UPTD LK",
  "Kuantitas - Jumlah Media Pembelajaran Berdasarkan Kompetensi",
  "Kuantitas - Jumlah Koordinasi Pelatihan Kerja Pusat dan Kabupaten/Kota",
  "Waktu - Terlaksananya Tugas Lain yang Diberikan Oleh Atasan Baik Secara Lisan / Tertulis",
] as const;

export type SkpIndicator = (typeof SKP_INDICATORS)[number];

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
