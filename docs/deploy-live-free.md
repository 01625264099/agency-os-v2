# Agency OS Live Deployment

Best free stack:

- Vercel Hobby: static dashboard + serverless API.
- Supabase Free: persistent CRM/state storage.
- Make.com: automation bridge to Gmail, Calendar, GoHighLevel, Vapi, and Deel reminders.

## 1. Supabase

1. Create a free Supabase project.
2. Open SQL Editor.
3. Run `docs/supabase-schema.sql`.
4. Copy:
   - Project URL
   - Service role key

Keep the service role key private. It goes only into Vercel environment variables.

## 2. Vercel

1. Push `agency-os-v2` to a GitHub repository.
2. Import the repository in Vercel.
3. Add these environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
HIGHLEVEL_PRIVATE_INTEGRATION_TOKEN=
VAPI_PUBLIC_API_KEY=
MAKE_OUTREACH_WEBHOOK_URL=
MAKE_CALENDAR_WEBHOOK_URL=
MAKE_ONBOARDING_WEBHOOK_URL=
```

4. Deploy.

The live app will use `/api/state`, `/api/prospects`, `/api/queue/generate`, and the other API routes through Vercel Functions.

## 3. Make.com

Keep Manual approval while testing. Connect:

- Outreach webhook: Gmail or Google Sheets draft/send workflow.
- Calendar webhook: Calendly/Google Calendar/Zoom workflow.
- Onboarding webhook: GHL/Vapi setup workflow after payment.

Do not switch to `Webhook auto-send` until every Make scenario is tested with a dummy prospect.

## 4. Deel

Keep Deel as manual invoice. Each client gets a client-specific contract or external invoice after verbal yes.

## 5. Safety

Never put API keys in `public/`, `data/store.json`, or browser-visible settings. Use Vercel environment variables.
