# Cizzy Technologies

The official multi-product website and private publishing workspace for Cizzy Technologies.

**CONNECT is the flagship product.** New applications can be added to the public catalogue through Cizzy Studio without editing the website source code.

## Quick start

- Read [CIZZY_STUDIO_SETUP.md](./CIZZY_STUDIO_SETUP.md) for Supabase setup, first-owner activation and team access.
- Read [NEXTJS_SETUP.md](./NEXTJS_SETUP.md) for the Next.js project setup.
- Run `npm install`, configure `.env.local`, then run `npm run dev`.

## Main routes

- `/` — public Cizzy Technologies company and product catalogue
- `/products/[slug]` — public detail page for each application
- `/login` — secure Supabase authentication
- `/admin` — private Cizzy Studio product and team management
- `/contact` — company contact information page

## Product publishing

Cizzy Studio supports product descriptions, categories, visibility status, featured placement, logo uploads, screenshots, website links and Android/iOS download links.

## Security

Studio access is controlled by Supabase Auth and the `public.cizzy_staff` membership table. Database Row Level Security policies enforce permissions; the dashboard's visual controls are not the security boundary. The first owner must be bootstrapped by an authorised operator in the Supabase SQL Editor.

Never expose a Supabase service-role key in browser code or a `NEXT_PUBLIC_*` environment variable.

## Build and deployment

Run `npm run build` before deploying. The GitHub Actions workflow `.github/workflows/verify-site.yml` checks production builds on pushes and pull requests to `main`.

The repository code is committed, but public hosting, domain DNS and Supabase project configuration must still be completed separately.
