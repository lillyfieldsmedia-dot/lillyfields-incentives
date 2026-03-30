# Lillyfields Incentives

Staff incentive tracker for Lillyfields Care Ltd. Managers log cash incentives given to care staff for covering unsociable hours at short notice. Finance reviews the data for payroll.

Built with React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and Supabase. Deployed to Netlify as a fully compliant PWA.

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Go to **SQL Editor** and run the migration file at `supabase/migrations/20240101000000_initial_schema.sql`. This creates all tables, RLS policies, enum types, and the auto-profile trigger.

### 3. Environment variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in your Supabase dashboard under **Settings > API**.

### 4. Create the first admin user

1. In your Supabase dashboard, go to **Authentication > Users** and click **Add user**.
2. Enter the admin's email and a password.
3. After the user is created, go to **Table Editor > profiles** and find the row for that user.
4. Change the `role` column from `manager` to `admin`.

The admin can then sign in and invite other users from the **Users** page in the app.

### 5. Run locally

```bash
npm run dev
```

## Deploy to Netlify

1. Connect your Git repository to Netlify.
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Netlify dashboard.

The `netlify.toml` file is already configured with SPA redirects.

## User roles

| Role | Log incentives | View own entries | View all entries | Reports | Manage staff | Manage users |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| Manager | Yes | Yes | - | - | - | - |
| Coordinator | Yes | Yes | - | - | - | - |
| Finance | - | - | Yes | Yes | - | - |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |

## Install as PWA

### iOS (Safari)

1. Open the app in Safari.
2. Tap the **Share** button (square with arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

### Android (Chrome)

1. Open the app in Chrome.
2. You should see an install banner at the bottom. Tap **Install**.
3. Or tap the **three-dot menu** > **Install app** / **Add to Home screen**.

### Desktop (Chrome/Edge)

1. Look for the install icon in the address bar.
2. Click it and confirm.

## Project structure

```
src/
  components/     UI components and layout
  contexts/       Auth context provider
  hooks/          Custom React hooks
  lib/            Supabase client, types, utilities
  pages/          Page components
supabase/
  migrations/     SQL migration files
public/
  icons/          PWA icons (192x192, 512x512)
  offline.html    Offline fallback page
```
