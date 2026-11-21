import { authenticatedUser, getGoogleDriveConnection, removeGoogleDriveConnection } from "@/lib/google-drive-server";

export async function GET(request: Request) {
  const user = await authenticatedUser(request.headers.get("authorization") ?? "");
  if (!user) return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  const connection = await getGoogleDriveConnection(user.id);
  return Response.json({ connected: Boolean(connection) });
}

export async function DELETE(request: Request) {
  const user = await authenticatedUser(request.headers.get("authorization") ?? "");
  if (!user) return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  await removeGoogleDriveConnection(user.id);
  return Response.json({ success: true });
}
