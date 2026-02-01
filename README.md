# Arya_3cf-

## Environment Variables (Render/Local)

### Required
- `MONGO_URI`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_MASTER_KEY`
- `EMAIL_ENABLED` (`true` or `false`)
- `SMTP_HOST`
- `SMTP_PORT` (465 preferred, 587 allowed)
- `SMTP_USER`
- `SMTP_PASS` (Gmail app password)
- `SMTP_FROM`

### Optional
- `ADMIN_EMAIL`
- `APP_BASE_URL`
- `CORS_ORIGIN`
- `MAIL_DEBUG_SECRET` (protects `/api/debug/mail` in production)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

See `.env.example` for a full template.
