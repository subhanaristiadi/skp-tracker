import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ExcelJS is Node.js-only. Keep its optional unzipper/S3 reader path
  // outside the Next.js bundle; this route only writes XLSX workbooks.
  serverExternalPackages: ["@ayocore/exceljs"],
};

export default nextConfig;
