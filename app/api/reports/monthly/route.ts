import { createClient } from "@supabase/supabase-js";
import { Workbook } from "@ayocore/exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActivityRow = {
  tanggal: string;
  aktivitas: string;
  indikator: string;
  photo_upload_status: "not_required" | "pending" | "uploaded" | "failed";
};

const PAGE_SIZE = 1000;

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return Response.json({ error: "Sesi login tidak ditemukan. Silakan login kembali." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);

    if (!match) {
      return Response.json({ error: "Format bulan tidak valid. Gunakan YYYY-MM." }, { status: 400 });
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    const startDate = `${match[1]}-${match[2]}-01`;
    const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
    const endDate = nextMonthDate.toISOString().slice(0, 10);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      return Response.json({ error: "Konfigurasi Supabase belum lengkap di server." }, { status: 500 });
    }

    // Pass the signed-in user's JWT so authentication and database queries use RLS.
    // No service-role or secret key is required for this report.
    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali." }, { status: 401 });
    }

    const activities: ActivityRow[] = [];
    let offset = 0;

    // Read in pages so the report is not silently truncated by the API row limit.
    while (true) {
      const { data, error } = await supabase
        .from("skp_activities")
        .select("tanggal,aktivitas,indikator,photo_upload_status,created_at")
        .gte("tanggal", startDate)
        .lt("tanggal", endDate)
        .order("tanggal", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return Response.json({ error: "Gagal mengambil riwayat aktivitas dari Supabase." }, { status: 500 });
      }

      const batch = (data ?? []) as ActivityRow[];
      activities.push(...batch);

      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const periodLabel = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));

    const workbook = new Workbook();
    workbook.creator = "SKP Activity Tracker";
    workbook.subject = `Riwayat aktivitas SKP bulan ${periodLabel}`;
    workbook.title = `Riwayat Aktivitas SKP - ${periodLabel}`;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Riwayat Aktivitas");
    worksheet.columns = [
      { key: "number", width: 8 },
      { key: "tanggal", width: 16 },
      { key: "aktivitas", width: 58 },
      { key: "indikator", width: 78 },
      { key: "bukti", width: 16 },
    ];

    worksheet.mergeCells("A1:E1");
    worksheet.getCell("A1").value = "RIWAYAT AKTIVITAS SKP";
    worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FF173B73" } };
    worksheet.getCell("A1").alignment = { vertical: "middle" };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells("A2:E2");
    worksheet.getCell("A2").value = `Periode: ${periodLabel}`;
    worksheet.getCell("A2").font = { name: "Arial", size: 11, color: { argb: "FF475569" } };
    worksheet.getRow(2).height = 22;

    worksheet.mergeCells("A3:E3");
    worksheet.getCell("A3").value = `Jumlah aktivitas: ${activities.length}`;
    worksheet.getCell("A3").font = { name: "Arial", size: 10, color: { argb: "FF475569" } };
    worksheet.getRow(3).height = 20;

    worksheet.addRow([]);
    const headerRow = worksheet.addRow(["No.", "Tanggal", "Aktivitas", "Indikator SKP", "Bukti"]);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457D6" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF1D46AD" } } };
    });

    if (activities.length === 0) {
      worksheet.mergeCells("A6:E6");
      worksheet.getCell("A6").value = "Tidak ada aktivitas pada periode ini.";
      worksheet.getCell("A6").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF687386" } };
      worksheet.getCell("A6").alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(6).height = 28;
    } else {
      activities.forEach((item, index) => {
        const row = worksheet.addRow([
          index + 1,
          formatDate(item.tanggal),
          item.aktivitas,
          item.indikator,
          item.photo_upload_status === "uploaded" ? "Sudah" : "Belum",
        ]);
        row.height = 42;
        row.eachCell((cell) => {
          cell.font = { name: "Arial", size: 10, color: { argb: "FF172033" } };
          cell.alignment = { vertical: "top", wrapText: true };
          cell.border = { bottom: { style: "thin", color: { argb: "FFE3E8F0" } } };
        });
        row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
        row.getCell(2).alignment = { horizontal: "center", vertical: "top" };
      });
    }

    worksheet.autoFilter = { from: "A5", to: `E${Math.max(5, 5 + activities.length)}` };
    worksheet.views = [{ state: "frozen", ySplit: 5, topLeftCell: "A6" }];
    worksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());
    const filename = `riwayat-aktivitas-skp-${month}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Terjadi kesalahan saat membuat file XLSX." }, { status: 500 });
  }
}
