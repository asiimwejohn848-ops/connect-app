# CONNECT account access — setup guide

The repository now includes an account-access page at `app/auth.html`. It is a frontend integration scaffold, not a live account system until a project owner configures Supabase and deploys the site.

## 1. Create the authentication project

1. Create a Supabase account and a new project using an email address you control.
2. In the Supabase dashboard, open **Authentication → Providers** and enable **Email**.
3. Keep email confirmation enabled for production.
4. Open **Project Settings → API** (or **API Keys**) and copy the Project URL and the public anon/publishable key.

## 2. Connect the page

Open `app/auth.html` and replace only these two placeholders near the bottom:

- `YOUR_SUPABASE_URL` with your Supabase Project URL.
- `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY` with the public anon/publishable key.

The browser page must only use the public anon/publishable key. **Never put a service-role key, database password, or other secret in this repository or browser code.**

## 3. Configure allowed URLs

In Supabase **Authentication → URL Configuration**, set the deployed site URL as the Site URL and add the exact deployed authentication page URL to the Redirect URLs list. Do this after choosing a hosting provider and domain.

## 4. Before real messaging is enabled

- Add database tables with Row Level Security (RLS) enabled.
- Write and test policies so users can read only conversations they belong to and send messages only as themselves.
- Do not expose private conversations through an administrator backdoor. Any moderation access must be disclosed, narrowly permissioned, justified, and audited.
- Connect the authenticated session to the messaging interface and test sign-up, email confirmation, sign-in, sign-out, password reset, and access rules with separate test accounts.
- Add rate limits, abuse reporting, secure file-storage policies, backups, and a privacy policy before public launch.

## Current scope

- Email sign-up, email/password sign-in, and password-reset request are wired to the Supabase JavaScript client once configured.
- The page intentionally displays a setup message while placeholders remain.
- It does not yet provide phone/SMS verification, profiles, live messaging, group chat, end-to-end encryption, or production deployment.
- Do not enter real user passwords until the page is configured and served over HTTPS on the intended domain.
