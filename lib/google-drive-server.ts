import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const CONNECTION_TABLE = "google_drive_connections";

type OAuthState = { userId: string; expiresAt: number };
type GoogleDriveConnection = { refresh_token_ciphertext: string; drive_folder_id: string | null };

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(requiredEnvironment("GOOGLE_TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function serviceClient() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  );
}

export function googleOAuthConfig() {
  return {
    clientId: requiredEnvironment("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnvironment("GOOGLE_CLIENT_SECRET"),
    redirectUri: requiredEnvironment("GOOGLE_OAUTH_REDIRECT_URI"),
  };
}

export async function authenticatedUser(authorization: string) {
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) return null;

  const client = createClient(requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"), requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

export function encryptRefreshToken(refreshToken: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return [nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptRefreshToken(value: string): string {
  const [nonce, tag, encrypted] = value.split(".");
  if (!nonce || !tag || !encrypted) throw new Error("Stored Google Drive connection is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function createOAuthState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60_000 } satisfies OAuthState)).toString("base64url");
  const signature = createHmac("sha256", encryptionKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(value: string | null): OAuthState | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", encryptionKey()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return typeof state.userId === "string" && state.expiresAt > Date.now() ? state : null;
  } catch {
    return null;
  }
}

export async function getGoogleDriveConnection(userId: string): Promise<{ refreshToken: string; folderId: string | null } | null> {
  const { data, error } = await serviceClient().from(CONNECTION_TABLE).select("refresh_token_ciphertext,drive_folder_id").eq("user_id", userId).maybeSingle<GoogleDriveConnection>();
  if (error) throw error;
  return data ? { refreshToken: decryptRefreshToken(data.refresh_token_ciphertext), folderId: data.drive_folder_id } : null;
}

export async function saveGoogleDriveConnection(userId: string, refreshToken: string) {
  const { error } = await serviceClient().from(CONNECTION_TABLE).upsert({
    user_id: userId,
    refresh_token_ciphertext: encryptRefreshToken(refreshToken),
    drive_folder_id: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveGoogleDriveFolder(userId: string, folderId: string) {
  const { error } = await serviceClient().from(CONNECTION_TABLE).update({ drive_folder_id: folderId, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw error;
}

export async function removeGoogleDriveConnection(userId: string) {
  const { error } = await serviceClient().from(CONNECTION_TABLE).delete().eq("user_id", userId);
  if (error) throw error;
}
