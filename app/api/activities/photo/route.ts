import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { MAX_EVIDENCE_FILE_SIZE } from "@/lib/skp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOLDER_NAME = "SKP Activity Tracker";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type EvidenceInfo = {
  mimeType: string;
  extension: string;
};

const EVIDENCE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function sanitizeActivityFilename(value: string): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return Array.from(cleaned).slice(0, 100).join("").replace(/[. ]+$/g, "") || "Aktivitas";
}

function detectEvidenceType(bytes: Buffer, originalFilename: string): EvidenceInfo | null {
  const extension = originalFilename.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = EVIDENCE_MIME_TYPES[extension];
  if (!mimeType) return null;

  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  const isPdf = bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
  const isOleCompoundFile = bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    bytes[2] === 0x03 && bytes[3] === 0x04;
  const hasZipEntry = (entry: string) => bytes.includes(Buffer.from(entry, "utf8"));

  if ((extension === "jpg" || extension === "jpeg") && isJpeg) return { mimeType, extension };
  if (extension === "png" && isPng) return { mimeType, extension };
  if (extension === "webp" && isWebp) return { mimeType, extension };
  if (extension === "pdf" && isPdf) return { mimeType, extension };

  // Legacy DOC/XLS/PPT files share the OLE Compound File container signature.
  if (["doc", "xls", "ppt"].includes(extension) && isOleCompoundFile) {
    return { mimeType, extension };
  }

  // Modern Office Open XML files are ZIP containers with type-specific package entries.
  if (isZip && hasZipEntry("[Content_Types].xml")) {
    if (extension === "docx" && hasZipEntry("word/")) return { mimeType, extension };
    if (extension === "xlsx" && hasZipEntry("xl/")) return { mimeType, extension };
    if (extension === "pptx" && hasZipEntry("ppt/")) return { mimeType, extension };
  }

  return null;
}
async function getGoogleAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const data = await response.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    console.error("Google OAuth token refresh failed:", data.error ?? response.status);
    throw new Error("GOOGLE_OAUTH_REFRESH_FAILED");
  }

  return data.access_token;
}

async function driveApiRequest(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function getOrCreateFolder(accessToken: string): Promise<string> {
  const query = new URLSearchParams({
    q: `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    pageSize: "10",
    spaces: "drive",
    fields: "files(id,name)",
  });

  const listResponse = await driveApiRequest(
    `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
    accessToken
  );

  if (!listResponse.ok) {
    console.error("Google Drive folder lookup failed:", listResponse.status);
    throw new Error("GOOGLE_DRIVE_FOLDER_LOOKUP_FAILED");
  }

  const listData = await listResponse.json() as { files?: Array<{ id?: string }> };
  const existingFolderId = listData.files?.find((item) => item.id)?.id;
  if (existingFolderId) return existingFolderId;

  const createResponse = await driveApiRequest(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    }
  );

  const createData = await createResponse.json() as { id?: string };
  if (!createResponse.ok || !createData.id) {
    console.error("Google Drive folder creation failed:", createResponse.status);
    throw new Error("GOOGLE_DRIVE_FOLDER_CREATE_FAILED");
  }

  return createData.id;
}

async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveApiRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    accessToken,
    { method: "DELETE" }
  );
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return Response.json({ error: "Sesi login tidak ditemukan. Silakan login kembali." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return Response.json({ error: "Konfigurasi Supabase belum lengkap." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  }

  let activityId = "";
  let uploadedDriveFileId: string | null = null;
  let googleAccessToken: string | null = null;

  try {
    const form = await request.formData();
    activityId = String(form.get("activityId") ?? "");
    const evidence = form.get("evidence") ?? form.get("photo");

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId)) {
      return Response.json({ error: "ID aktivitas tidak valid." }, { status: 400 });
    }

    const { data: activity, error: activityError } = await supabase
      .from("skp_activities")
      .select("id,tanggal,aktivitas")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError || !activity) {
      return Response.json({ error: "Aktivitas tidak ditemukan atau bukan milik akun ini." }, { status: 404 });
    }

    const markFailed = async () => {
      await supabase
        .from("skp_activities")
        .update({ photo_upload_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", activityId);
    };

    if (!(evidence instanceof File)) {
      await markFailed();
      return Response.json({ error: "File bukti tidak ditemukan." }, { status: 400 });
    }

    if (evidence.size <= 0 || evidence.size > MAX_EVIDENCE_FILE_SIZE) {
      await markFailed();
      return Response.json({ error: "Ukuran file bukti harus lebih dari 0 dan maksimal 4 MB." }, { status: 413 });
    }

    const bytes = Buffer.from(await evidence.arrayBuffer());
    const evidenceInfo = detectEvidenceType(bytes, evidence.name);

    if (!evidenceInfo) {
      await markFailed();
      return Response.json({
        error: "Format file tidak didukung atau isi file tidak sesuai dengan ekstensi. Gunakan JPG, PNG, WebP, PDF, DOC/DOCX, XLS/XLSX, atau PPT/PPTX.",
      }, { status: 415 });
    }

    googleAccessToken = await getGoogleAccessToken();
    const folderId = await getOrCreateFolder(googleAccessToken);
    const activityName = sanitizeActivityFilename(activity.aktivitas);
    const filename = `${activity.tanggal} - ${activityName}.${evidenceInfo.extension}`;
    const boundary = `skp_tracker_${randomUUID().replace(/-/g, "")}`;

    const metadata = {
      name: filename,
      mimeType: evidenceInfo.mimeType,
      parents: [folderId],
      appProperties: { skpActivityId: activityId },
    };

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${evidenceInfo.mimeType}\r\n\r\n`,
        "utf8"
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const uploadResponse = await driveApiRequest(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      googleAccessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      }
    );

    const uploadData = await uploadResponse.json() as {
      id?: string;
      webViewLink?: string;
    };

    if (!uploadResponse.ok || !uploadData.id) {
      console.error("Google Drive evidence upload failed:", uploadResponse.status);
      throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED");
    }

    uploadedDriveFileId = uploadData.id;
    const driveFileUrl = uploadData.webViewLink ??
      `https://drive.google.com/file/d/${uploadData.id}/view`;

    const { error: updateError } = await supabase
      .from("skp_activities")
      .update({
        drive_file_id: uploadData.id,
        drive_file_url: driveFileUrl,
        photo_upload_status: "uploaded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", activityId);

    if (updateError) {
      await deleteDriveFile(googleAccessToken, uploadData.id);
      uploadedDriveFileId = null;
      console.error("Could not save Drive metadata to Supabase:", updateError.message);
      throw new Error("SKP_ACTIVITY_UPDATE_FAILED");
    }

    return Response.json({
      success: true,
      driveFileId: uploadData.id,
      driveFileUrl,
    });
  } catch (error) {
    if (uploadedDriveFileId && googleAccessToken) {
      try {
        await deleteDriveFile(googleAccessToken, uploadedDriveFileId);
      } catch {
        console.error("Could not roll back an uploaded Drive file after a database error.");
      }
    }

    if (activityId) {
      await supabase
        .from("skp_activities")
        .update({ photo_upload_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", activityId);
    }

    if (error instanceof Error && error.message === "GOOGLE_DRIVE_NOT_CONFIGURED") {
      return Response.json({
        error: "Integrasi Google Drive belum dikonfigurasi. Lengkapi environment variables pada Vercel.",
      }, { status: 503 });
    }

    if (error instanceof Error && error.message === "GOOGLE_OAUTH_REFRESH_FAILED") {
      return Response.json({
        error: "Google Drive tidak dapat terhubung. Periksa OAuth credentials atau buat ulang refresh token.",
      }, { status: 502 });
    }

    console.error("SKP evidence upload failed:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({
      error: "File bukti belum berhasil diunggah ke Google Drive. Aktivitas tetap tersimpan; Anda dapat mencoba unggah ulang.",
    }, { status: 502 });
  }
}
