# Make.com Scenario Map

Keep Agency OS in `Manual approval` until these scenarios are tested with dummy data.

## Scenario 1: Outreach Review / Send

Webhook field in Agency OS:

```text
Make / Outreach Webhook
```

Incoming payload:

```json
{
  "type": "outreach.send",
  "item": {
    "prospectName": "Clinic Name",
    "channel": "Email",
    "message": "Subject + body"
  },
  "prospect": {
    "email": "owner@example.com",
    "phone": "...",
    "website": "..."
  },
  "settings": {
    "senderEmail": "fahimsaif99@gmail.com",
    "bookingLink": "https://calendly.com/fahimsaif99/10-minute-ai-receptionist-demo"
  }
}
```

Recommended Make modules:

1. Webhooks: Custom webhook.
2. Gmail: Create draft first.
3. Google Sheets/Airtable: Log outbound message.
4. Gmail: Send email only after you have tested the draft flow.

## Scenario 2: Calendar / Call Booking

Webhook field in Agency OS:

```text
Calendar Webhook
```

Incoming payload:

```json
{
  "type": "calendar.book_call",
  "prospect": {},
  "settings": {
    "bookingLink": "...",
    "zoomBookingLink": "..."
  }
}
```

Recommended Make modules:

1. Webhooks: Custom webhook.
2. Gmail: Send booking confirmation or reminder.
3. Google Calendar: Create event only if you manually confirmed the time.
4. Google Sheets/Airtable: Log call booked.

## Scenario 3: Post-Payment Onboarding

This should run only after Deel payment is confirmed.

Incoming payload:

```json
{
  "type": "onboarding.start",
  "prospect": {},
  "settings": {},
  "hasHighLevelToken": true,
  "hasVapiKey": true
}
```

Recommended Make modules:

1. Webhooks: Custom webhook.
2. Gmail: Send onboarding intake message.
3. GoHighLevel: Create/update contact or opportunity.
4. Vapi: Create assistant only after the client intake data is complete.
5. Google Sheets/Airtable: Log onboarding status.

## Manual Deel Step

Do not automate Deel yet.

After the client says yes:

1. Create a client-specific Deel contract or external invoice for `$499/mo`.
2. Send it manually.
3. Mark the prospect `Pre-Sold`.
4. After payment, mark `Active` and start onboarding.
