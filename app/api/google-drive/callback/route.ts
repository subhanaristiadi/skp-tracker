import { googleOAuthConfig, saveGoogleDriveConnection, verifyOAuthState } from "@/lib/google-drive-server";

function redirect(request: Request, status: "connected" | "error") {
  const url = new URL("/", request.url);
  url.searchParams.set("google-drive", status);
  return Response.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = verifyOAuthState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!state || !code || url.searchParams.get("error")) return redirect(request, "error");

  try {
    const { clientId, clientSecret, redirectUri } = googleOAuthConfig();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
    });
    const data = await response.json() as { refresh_token?: string };
    if (!response.ok || !data.refresh_token) throw new Error("Google did not issue a refresh token.");
    await saveGoogleDriveConnection(state.userId, data.refresh_token);
    return redirect(request, "connected");
  } catch (error) {
    console.error("Could not connect the user's Google Drive:", error instanceof Error ? error.message : "Unknown error");
    return redirect(request, "error");
  }
}
