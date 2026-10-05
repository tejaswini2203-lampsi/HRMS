# Email configuration for passport alerts

Passport expiry alerts (180d / 90d / 30d) email the **employee** linked to the passport (`Employee.Email`).

## Environment variables (`backend/.env`)

```
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your-smtp-user
MAIL_PASSWORD=your-smtp-password
MAIL_FROM=noreply@yourdomain.com
MAIL_SECURE=false
```

If `MAIL_HOST` or `MAIL_FROM` is empty:
- Alert is still written to `PassportAlertLog`
- `RecipientList` is set to the employee email (or a no-email marker)
- `Status` is set to `Failed`
- Passport create/update/get still succeeds

## Local testing options

1. **Ethereal / Mailtrap / similar SMTP sandbox** — set the env vars above to the sandbox credentials, restart the backend, then create/update a passport with an expiry inside 180 days for an employee that has `Email` set.
2. **Without SMTP** — leave mail env blank; verify `PassportAlertLog` rows appear with employee recipient and `Status=Failed`.

## Triggering alerts

Alerts run when an active passport is created, updated, or loaded via `GET /passports/:empId`.
Duplicates for the same `PassportID + AlertType` are not re-created or re-emailed.
