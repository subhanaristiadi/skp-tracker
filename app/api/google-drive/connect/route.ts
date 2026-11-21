import { authenticatedUser, createOAuthState, googleOAuthConfig } from "@/lib/google-drive-server";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export async function GET(request: Request) {
  const user = await authenticatedUser(request.headers.get("authorization") ?? "");
  if (!user) return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  const { clientId, redirectUri } = googleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: createOAuthState(user.id),
  });
  return Response.json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}
