# Cizzy Technologies platform

The public site is the company and product portfolio for Cizzy Technologies. CONNECT is the flagship product; future apps can be added through the private Cizzy Studio dashboard.

## Stack

- Next.js App Router
- Supabase Auth (email/password)
- Supabase Postgres with Row Level Security
- Supabase Storage for product logos and screenshots

## Local setup

1. Install dependencies: `npm install`.
2. Create a Supabase project.
3. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
4. In Supabase SQL Editor, run the complete script at `supabase/cizzy-platform.sql`.
5. In Supabase Authentication settings, set the Site URL to your deployed website URL and add the exact callback URL `https://YOUR-DOMAIN/auth/callback` to the allowed redirect URLs. Add your local callback URL while developing.
6. Run `npm run dev` and open `http://localhost:3000`.

## First owner setup

1. Open `/login`, create an account using an email address you control, and confirm it from your email.
2. In Supabase Dashboard, open Authentication > Users and copy the UUID for that account.
3. In the SQL Editor, run the following statement, replacing the placeholder with the UUID:

   ```sql
   insert into public.cizzy_staff (user_id, role)
   values ('YOUR-AUTH-USER-UUID', 'owner');
   ```

4. Sign in at `/login`, then open `/admin`.

There is intentionally no public route or self-service mechanism for granting Studio privileges. The first owner is bootstrapped manually in the trusted Supabase dashboard.

## Add authorised team members

1. The colleague creates and confirms their own account at `/login`.
2. An owner obtains their Auth user UUID from Supabase Authentication > Users.
3. In Cizzy Studio > Team access, the owner adds that UUID and chooses Editor or Owner.
4. Editors can create, edit and delete products. Owners can also manage team roles and access.

## Product publishing

- Draft: visible only to authorised Studio staff.
- In development: visible on the public catalogue with its development status.
- Coming soon: visible on the public catalogue as an upcoming product.
- Available: visible as a released product.
- Each product supports a logo, multiple screenshots, a detail page, website URL and Android/iOS download links.

Product images are uploaded to the public-read `cizzy-product-media` bucket. Only authorised staff can upload, replace or delete media. The bucket enforces a 5 MB per-file limit and image MIME types.

## Security notes

- Authentication is handled by Supabase Auth; the app does not store passwords.
- The admin route checks the authenticated user and their `cizzy_staff` membership on the server.
- Database permissions are enforced with Postgres Row Level Security. Hiding the dashboard UI is not the security boundary.
- The browser uses only the Supabase publishable key. Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or browser code.
- Keep email confirmation enabled. Use strong unique passwords and enable MFA for owner accounts in Supabase when available.
- Review and test policies before inviting staff or publishing private information.

## Build

Run `npm run build` before deployment. Configure the same Supabase environment variables in the hosting provider. Add the deployed domain and auth callback to Supabase Auth URL settings.

The source code being committed does not by itself deploy the site. Hosting and DNS still need to be configured.
