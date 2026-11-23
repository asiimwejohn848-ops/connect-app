# CONNECT — Next.js foundation

The repository now contains the first Next.js application scaffold and Supabase SSR authentication integration. This is source code committed to GitHub; it is **not deployed** and has not yet been built or tested in a local Node.js environment.

## Run it locally

1. Install Node.js (LTS) on your computer.
2. Clone the repository:
   `git clone https://github.com/asiimwejohn848-ops/connect-app.git`
3. Enter the folder:
   `cd connect-app`
4. Install packages:
   `npm install`
5. Copy `.env.example` to a new file named `.env.local`.
6. In `.env.local`, enter the Supabase Project URL and the **publishable** key from the Supabase Connect panel:
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...`
7. Start the development server:
   `npm run dev`
8. Open `http://localhost:3000`.

Never commit `.env.local`. It is ignored by Git. Never use a Supabase secret or service-role key in browser code, environment variables prefixed with NEXT_PUBLIC, or this repository.

## Supabase dashboard configuration

- Authentication → Sign In / Providers → Email: enable email/password sign-in.
- Keep email confirmation enabled for production.
- Authentication → URL Configuration: add your local callback URL `http://localhost:3000/auth/callback` to allowed Redirect URLs.
- When deployed, set the production Site URL and add `https://YOUR_DOMAIN/auth/callback` to Redirect URLs.

## What is included

- Next.js App Router foundation.
- Supabase browser and server client helpers using `@supabase/ssr`.
- Session-refresh middleware.
- Email sign-up, sign-in, password reset request, and confirmation callback.
- A basic CONNECT landing page and sign-out action.

## Not included yet

No live chat, database schema, user profile system, group conversations, file uploads, calls, translation, end-to-end encryption, admin console, or production deployment has been completed. Before implementing messaging, design and test database tables and Row Level Security policies so each user can access only conversations they belong to.
