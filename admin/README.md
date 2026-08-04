# Furas desktop admin workspace

Static, read-only safety and product-insights dashboard for the existing
administrator account.

## Security model

- Sign-in repeats the app's Firebase SMS verification -> Supabase password
  flow. It does not introduce a second admin password.
- The browser contains only Firebase/Supabase public client configuration.
  It never contains a service-role key or webhook secret.
- The client rejects every Supabase user except the fixed app administrator.
- Postgres RLS remains the real authorization boundary for safety signals,
  screening results, and reports.
- Raw chat messages are not queried by this dashboard.

## Required one-time Firebase setting

Before phone sign-in works at `https://furasapp.com/admin/`, add
`furasapp.com` under Firebase Console -> Authentication -> Settings ->
Authorized domains. The service account available in this repository does
not have `firebaseauth.configs.update`, so this cannot be applied by the
deployment script.

`localhost` is already authorized for local development.

## Local preview

From the parent repository:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/website/admin/`.
