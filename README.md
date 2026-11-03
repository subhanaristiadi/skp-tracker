# SKP Activity Tracker

A separate web application for recording SKP work activities. This repository is intentionally independent from the Finance Tracker.

## Stage 1 scope

Included:
- Next.js App Router starter using Next.js 15, React 19, TypeScript, and Supabase JS.
- Supabase email/password sign-in.
- Create, list, and delete SKP activities.
- Manual selection from the exact six official SKP indicators.
- Activity date handling based on Asia/Makassar (WITA).
- Supabase SQL migration with closed-list validation, per-user Row Level Security, and explicit Data API grants.

Not included yet:
- AI extraction or n8n webhook integration.
- WhatsApp-to-app synchronization. The current decision is web-only, so WhatsApp entries are not included in this app.
- Google Drive photo upload is optional and performed after the SKP activity has been saved.
- Edit UI, analytics, and AI/n8n extraction.

## Architecture decisions

- App: SKP Activity Tracker.
- Database: dedicated Supabase project `skp-tracker` (`tnksnsslohnvrscdbktx`); do not reuse Finance Tracker tables or credentials.
- Source: web only in this stage.
- Indicator: user-selected; no AI classification.
- Photo: the app saves the activity first, then uploads an optional photo to a private Google Drive folder.
- Existing WhatsApp n8n workflow remains unchanged.

## Requirements

- Node.js 22.x. The project pins the Node 22 major line for compatibility with Supabase JS.
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
- The browser uses the project's publishable key only. Row Level Security restricts every row to its authenticated owner. The XLSX endpoint requires the current user's access token and forwards it to Supabase; it does not use a service-role key.
- The table grants Data API access to the `authenticated` role only; anonymous access is revoked.
- Use a dedicated Supabase project and credentials for SKP.
- Do not commit `.env.local`.
- Do not put Google Drive or n8n credentials in this repository.

## Monthly XLSX export

The activity history can be exported as an Excel workbook from the **Riwayat Aktivitas** section. Select the reporting month, then choose **Download XLSX**.

### Report scope and access

- The selected month is applied to `skp_activities.tanggal` using a start-inclusive, next-month-exclusive date range.
- The report contains only rows visible to the currently signed-in user. The endpoint validates the user's Supabase JWT and queries through the existing Row Level Security (RLS) policies.
- Records are read in pages to avoid silently truncating reports at the API row limit.
- Filename format: `riwayat-aktivitas-skp-YYYY-MM.xlsx`.
- A month with no activity records still produces a valid workbook with an empty-period message.
- This export requires no additional environment variable, credential, or database migration.

### Workbook columns

| Column | Description |
|---|---|
| No. | Sequential number within the exported report. |
| Tanggal | Activity date, formatted as `DD-MM-YYYY`. |
| Aktivitas | Activity description saved in SKP Tracker. |
| Indikator SKP | The official SKP indicator selected when the activity was recorded. |
| Bukti Foto | Indicates whether the activity's photo upload to Google Drive has completed successfully. |

### Bukti Foto status rule

The **Bukti Foto** value is derived from `skp_activities.photo_upload_status`, not merely from whether a photo was selected on the form.

| `photo_upload_status` | Value in XLSX | Meaning |
|---|---|---|
| `uploaded` | **Sudah** | The photo upload to Google Drive completed and the activity row was updated successfully. |
| `not_required` | **Belum** | No photo was required or attached to the activity. |
| `pending` | **Belum** | A photo upload is pending or has not completed. |
| `failed` | **Belum** | The photo upload failed and can be retried from the activity history. |

Only `uploaded` is reported as **Sudah**. All other supported states are reported as **Belum**. Therefore, an activity with a selected photo is not marked **Sudah** until the upload status has been saved as `uploaded`.


## Deleting an activity

- The owner can delete an activity from the history list. The browser asks for confirmation before removing the Supabase row.
- The delete query is scoped to the signed-in user's ID and is also protected by the existing `authenticated` DELETE RLS policy. No service-role key or schema migration is required.
- Deleting an activity does **not** delete its Google Drive photo. The confirmation panel warns about this and provides the stored Drive file link when available.
- After deletion, when the activity has a successful Drive upload, the app displays a reminder to manually delete the photo from the private `SKP Activity Tracker` folder and provides its stored Drive link when available. This is intentionally a manual step; the app does not send a Drive delete request.

## Google Drive photo upload

Photo upload is optional and happens after the SKP activity row has been saved. The app uploads JPG, PNG, or WebP images up to 4 MB to a folder named `SKP Activity Tracker` in the authorized Google Drive. The folder and uploaded files remain private; the app does not create public sharing permissions. Drive filenames use the activity date and a sanitized version of the activity description (for example, `2026-11-02 - Menyusun lesson plan Google Sheets.png`); long descriptions are shortened to keep filenames manageable.

The server endpoint is `POST /api/activities/photo`. It requires the signed-in Supabase user's JWT, verifies that the activity belongs to that user through RLS, validates the actual image signature and size, uploads the image with the Google Drive API, and then stores `drive_file_id`, `drive_file_url`, and `photo_upload_status` in `public.skp_activities`. No n8n workflow is involved and no Supabase service-role key is used.

### One-time Google Cloud setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud project and enable **Google Drive API**.
3. Configure the Google Auth Platform consent screen. For an individual account, choose External and add the Google account used for Drive as a test user while setting up.
4. Create an OAuth Client ID with application type **Web application**.
5. Add this exact Authorized redirect URI:

   ```text
   http://localhost:53682/oauth2callback
   ```

6. Declare this least-privilege Drive scope in the consent configuration:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

7. Copy the OAuth Client ID and Client Secret into the local `.env.local` file (never into GitHub):

   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

8. From the repository root, run:

   ```bash
   node --env-file=.env.local scripts/google-drive-auth.mjs
   ```

9. Open the Google authorization URL printed by the script, sign in with the intended Google account, and approve Drive file access. The script prints a refresh token in the terminal. Treat it as a password; do not paste it into chat, GitHub, screenshots, or public documentation.
10. In Vercel → Project `skp-tracker-app` → Settings → Environment Variables, add these three **server-only** variables for Production, Preview, and Development:
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
    - `GOOGLE_REFRESH_TOKEN`

    Mark them Sensitive/Encrypted where the dashboard allows it. Do not prefix them with `NEXT_PUBLIC_`.
11. Redeploy the latest commit so the new environment variables are available to the serverless function.

The refresh token is issued for offline access. Google notes that OAuth projects left in External / Testing mode issue refresh tokens that expire after 7 days for Drive scopes. For an ongoing deployment, review the app's publishing status and complete any Google verification requirement that applies to the configured scopes.

### Photo behavior

- New activity first writes to Supabase with photo status `pending` when a photo was selected.
- The server uploads the file and then updates the row to `uploaded` with Drive metadata.
- If upload fails, the activity remains saved and its photo status becomes `failed`; the user can retry from the activity history.
- File validation accepts JPEG, PNG, and WebP only, with a maximum size of 4 MB.
- Existing activity rows can also receive a photo from the history section.
- Photos are not synchronized from WhatsApp. The SKP app uses the web-only source decision.

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

This is the SKP Activity Tracker application schema, separate from the existing WhatsApp workflow and Google Sheets schema.

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
- [ ] Monthly XLSX export downloads the selected month and contains the expected rows.
- [ ] Photo upload requires authentication and rejects non-image files or files over 4 MB.
- [ ] Successful Drive upload records the Drive file ID, URL, and uploaded status.
- [ ] Failed photo upload leaves the activity saved and can be retried.
- [ ] Google Drive OAuth secrets are configured only in local environment/Vercel server-only variables.\n- [ ] An empty month produces a valid XLSX workbook.\n- [ ] An unauthenticated export request is rejected.\n- [ ] No `.env.local` or secrets are committed.

## Known limitations

- The current implementation provides client-side Supabase authentication and relies on Supabase RLS for row isolation. Add server-side session handling before introducing privileged server features.
- The UI supports create/read/delete and optional photo upload/retry. Update and analytics are future work.
- Google Drive upload requires the one-time OAuth configuration described above; no n8n integration is used.
