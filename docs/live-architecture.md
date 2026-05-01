# Live Architecture

```mermaid
flowchart LR
  A["Agency OS dashboard on Vercel"] --> B["Vercel serverless API"]
  B --> C["Supabase agency_state JSON"]
  B --> D["Make outreach webhook"]
  B --> E["Make calendar webhook"]
  D --> F["Gmail drafts or sends"]
  E --> G["Calendar / Zoom follow-up"]
  B --> H["Manual Deel invoice step"]
  B --> I["Post-payment onboarding webhook"]
  I --> J["GoHighLevel"]
  I --> K["Vapi"]
```

Manual approval is the default safety mode.

In Manual approval:

- Queue generation works.
- CRM updates work.
- Copy-ready messages work.
- Buttons update status locally.
- Make webhooks are not called.

In Webhook auto-send:

- Outreach can call Make.
- Calendar actions can call Make.
- Onboarding can call Make.
- You must test every scenario before switching.
