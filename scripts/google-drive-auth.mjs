import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET terlebih dahulu.");
  process.exit(1);
}

const state = randomBytes(24).toString("hex");
const params = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
  state,
});

const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", REDIRECT_URI);

  if (requestUrl.pathname !== "/oauth2callback") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (requestUrl.searchParams.get("state") !== state) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("State validation failed. Close this tab and run the script again.");
    server.close();
    process.exitCode = 1;
    return;
  }

  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Google authorization was not completed. You can close this tab.");
    console.error(`Google authorization failed: ${oauthError}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Authorization code is missing.");
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? "Token exchange failed.");
    }

    if (!tokenData.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Revoke this app's previous access in your Google Account and run the script again."
      );
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<h2>Google Drive authorization completed.</h2><p>You can close this tab and return to the terminal.</p>");

    console.log("\nAuthorization successful.");
    console.log("Copy this value directly into the Vercel environment variable GOOGLE_REFRESH_TOKEN.");
    console.log("Keep it private. Do not commit it to GitHub or send it in chat.\n");
    console.log(tokenData.refresh_token);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Could not complete the token exchange. Check the terminal for details.");
    console.error(error instanceof Error ? error.message : "Token exchange failed.");
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this Google authorization URL in your browser:");
  console.log("\n" + authorizationUrl + "\n");
  console.log(`Waiting for Google callback at ${REDIRECT_URI}`);
});

server.on("error", (error) => {
  console.error("Could not start local OAuth callback server:", error.message);
  process.exit(1);
});
