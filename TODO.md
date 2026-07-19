# TODO — MVP Container

Working list toward go-live. Updated 2026-07-15.

## Go-live blockers

- [x] **Real email delivery** — two transports in `apps/api/smtp.mjs`: SendGrid HTTP API
      (preferred — Railway blocks ALL outbound SMTP ports, verified 2026-07-15) and
      Gmail SMTP (587 STARTTLS / 465) for hosts that allow it. Log-only dev mode when
      neither is configured. SMS remains log-only until a gateway (e.g. Twilio) is added.
- [ ] **Set Railway env vars** — `SENDGRID_API_KEY` + `MAIL_FROM` (the SendGrid-verified
      single sender), optional `MAIL_FROM_NAME` / `ORDER_NOTIFY_EMAILS` (defaults to
      tgmoore@gmail.com). The `SMTP_USER`/`SMTP_PASS` vars are dead weight on Railway
      (SMTP blocked) — remove them or leave them; SendGrid wins when both are set.
- [x] **True authentication** — admin logins require an emailed 6-digit code;
      email-code password reset for all roles; seeded `test1234` passwords force a
      change at the door; checkout verification codes now arrive by email.
- [x] **Phone-payment checkout** — card fields removed; cart explains payment is
      collected by phone. Orders land as *Pending Review* with an admin checklist:
      validate availability → call customer → payment collected → assign driver.
- [x] **Order intake notifications** — every new order emails ORDER_NOTIFY_EMAILS
      with full details, and customers get a "we'll call you" confirmation.
- [x] **Driver-assignment + internal messaging** — assign-driver notifies the customer
      (email/SMS-log) and the driver (inbox message + email + SMS-log). Admin portal has
      an Inbox (reply to drivers & customers); customers have a Messages tab (message
      dispatch, see replies); drivers keep their field-app inbox. 30-test API suite
      passes (`node apps/api/test.mjs`).
- [ ] **Deploy** — commit + push (Railway redeploys API; rebuild ships the web app),
      then set the env vars above and place a real test order.

## Hardening (CSV storage, pre-database)

- [x] Atomic CSV writes (temp file + rename) — a crash mid-write can't corrupt a table.
- [ ] Automated backup of the Railway data volume (daily snapshot of /data CSVs + photos).
- [x] Serialized request handling so concurrent writes can't lose updates.
- Keep Railway at exactly 1 API replica (CSV storage + SSE assume a single instance).

## Major roadmap

- [ ] **Multi-tenant resellers** (added 2026-07-15) — make the entire site multi-tenant so
      multiple resellers can sign up, each with their own branding, inventory, users, orders,
      and data isolation. Today the only reseller is "MVP Containers". Touches everything:
      per-tenant CSV namespaces (or the database move), tenant-scoped auth/RBAC, branded
      marketplace themes, per-tenant notification addresses, and tenant admin onboarding.
- [ ] **Real SMS gateway** (Twilio) — SMS is logged to outbox.csv but not delivered;
      wire it up when ready and checkout/2FA can move back to text codes.
- [ ] **Implement RBAC** using the following roles, implaement single sign on with access
      to each portal as setup within Admin Portal as new node. User profiles to include admin, driver, 
      customer with ability to change by user or multi-select by user which profile they are. admin will
      have access to Admin Portal. Driver will have access to Field App. Customer will have access to 
      marketplace. Admin as access to all portals. 
- [ ] **Create New Portal - Marketing** build elements of a true marketing hub, like hubspot, that lets
      admins track emails sent, responded, follow ups, etc. with tracking, reports, charts, etc.
      showing how each email, direct mail, or social media publish has performed. 

## Shipped

- [x] Live cross-app auto-refresh (SSE): admin ⇄ field ⇄ marketplace sync without
      manual browser refresh — 2026-07-15
- [x] Go-live auth + phone-payment pipeline + 3-way messaging (see blockers above) — 2026-07-15
- [x] 3D spinner simplified: real front/back photos on the ends, size callout on the
      sides, top/bottom unchanged — 2026-07-15

## Nice-to-have / later

- [ ] Code-split the web bundle (HEIC converter + background-removal model warn at >500 kB).
- [ ] Add `apps/.DS_Store` to .gitignore.
- [ ] Move from CSVs to a real database when volume outgrows them (multi-tenancy will force this).
