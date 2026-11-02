# SKP Activity Tracker

A separate web application for recording SKP work activities. This repository is intentionally independent from the Finance Tracker.

## Stage 1 scope

Included:
- Next.js App Router starter using Next.js 15, React 19, TypeScript, and Supabase JS.
- Supabase email/password sign-in.
- Create and list SKP activities.
- Manual selection from the exact six official SKP indicators.
- Activity date handling based on Asia/Makassar (WITA).
- Supabase SQL migration with closed-list validation, per-user Row Level Security, and explicit Data API grants.

Not included yet:
- AI extraction or n8n webhook integration.
- WhatsApp-to-app synchronization. The current decision is web-only, so WhatsApp entries are not included in this app.
- Google Drive upload and photo upload UI.
- Edit/delete UI, analytics, exports, and deployment configuration.

## Architecture decisions

- App: SKP Activity Tracker.
- Database: dedicated Supabase project `skp-tracker` (`tnksnsslohnvrscdbktx`); do not reuse Finance Tracker tables or credentials.
- Source: web only in this stage.
- Indicator: user-selected; no AI classification.
- Photo: planned flow saves the activity first, then uploads an optional photo to Google Drive.
- Existing WhatsApp n8n workflow remains unchanged.

## Requirements

- Node.js 22 or later. Supabase JS no longer supports Node.js 20.
- npm.
- A dedicated Supabase project.

## Local setup

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local`.
4. The Supabase URL is already set in the example file. Copy the project's **publishable key** from Supabase Dashboard → Project Settings → API Keys, then set:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://tnksnsslohnvrscdbktx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

5. The initial schema migration has been applied to the connected SKP Supabase project. For a new environment, run `supabase/migrations/0001_initial_schema.sql` in its SQL Editor.
6. In Supabase Authentication, create the first user manually. For a private personal app, keep public sign-ups disabled unless there is a specific reason to enable them.
7. Run:

   ```bash
   npm run dev
   ```

8. Open `http://localhost:3000` and sign in using the Supabase user.

## Security notes

- Never put a Supabase `service_role` or secret API key in `NEXT_PUBLIC_*` variables or browser code.
- The browser uses the project's publishable key only. Row Level Security restricts every row to its authenticated owner.
- The table grants Data API access to the `authenticated` role only; anonymous access is revoked.
- Use a dedicated Supabase project and credentials for SKP.
- Do not commit `.env.local`.
- Do not put Google Drive or n8n credentials in this repository.

## Initial data model

Table: `public.skp_activities`

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | Supabase Auth owner |
| tanggal | date | Activity date |
| aktivitas | text | Activity description |
| indikator | text | One exact official SKP indicator |
| source | text | Defaults to `web` |
| drive_file_id | text nullable | Reserved for later Drive integration |
| drive_file_url | text nullable | Reserved for later Drive integration |
| photo_upload_status | text | `not_required`, `pending`, `uploaded`, `failed` |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Reserved for future update flow |

This is the proposed Stage 1 application schema, not a change to the existing WhatsApp workflow or Google Sheets schema.

## Verification checklist

- [x] Migration applied to the connected SKP Supabase project.
- [x] `public.skp_activities` exists with the expected columns.
- [x] RLS is enabled.
- [x] SELECT, INSERT, UPDATE, DELETE policies are restricted to `authenticated` and `auth.uid() = user_id`.
- [ ] `npm install` completes.
- [ ] A manually created user can sign in.
- [ ] User can save an activity with each of the six valid indicators.
- [ ] Activity appears in history after save and page refresh.
- [ ] A second user cannot read or modify the first user's rows (RLS test).
- [ ] No `.env.local` or secrets are committed.

## Known limitations

- The current implementation provides client-side Supabase authentication and relies on Supabase RLS for row isolation. Add server-side session handling before introducing privileged server features.
- The UI currently supports create/read only. Update/delete and photo retry are future work.
- The migration does not create a Supabase Storage bucket or Google Drive connection.
