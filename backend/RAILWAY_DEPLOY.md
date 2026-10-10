# Deploy the shared health API on Railway

This is a deployment checklist for the FastAPI service. It creates billable cloud resources; review Railway's current usage pricing before creating the project. Use synthetic records for smoke tests until the security and clinical review is complete.

## Create services

In a Railway project, create PostgreSQL, Redis, and a private Storage Bucket in the same region (Singapore is closest to India among Railway's listed regions). Add two services from this repository, both with root directory `backend` and the repository's `Dockerfile`:

- **API:** enable public HTTPS networking; set the start command to `uvicorn nutritiscan.main:app --host 0.0.0.0 --port $PORT --no-access-log`, health check path to `/status`, and pre-deploy command to `python -m nutritiscan.migrate`.
- **Worker:** set the start command to `celery -A nutritiscan.worker worker --loglevel warning --concurrency 2 --max-tasks-per-child 20`.

The worker must use the same database, Redis, encryption key, and bucket credentials as the API. Do not expose Postgres or Redis publicly.

## Configure API and worker variables

Use Railway reference variables for the managed services, rather than copying generated credentials between dashboards:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `HEALTH_DATABASE_URL` | Railway Postgres connection URL |
| `REDIS_URL` | Railway Redis URL |
| `S3_BUCKET` | Bucket's `BUCKET` value |
| `S3_ENDPOINT_URL` | Bucket's `ENDPOINT` value |
| `AWS_ACCESS_KEY_ID` | Bucket's `ACCESS_KEY_ID` value |
| `AWS_SECRET_ACCESS_KEY` | Bucket's `SECRET_ACCESS_KEY` value |
| `AWS_DEFAULT_REGION` | Bucket's `REGION` value |
| `HEALTH_DATA_KEY` | Separately generate one 32-byte key as 64 hex characters; use the same value for API and worker and keep a protected recovery copy |
| `HEALTH_ALLOWED_ORIGINS` | `https://nutritiscan.com,https://www.nutritiscan.com` |
| `HEALTH_LLM_PROVIDER` | `none` |
| `HEALTH_MODEL_APPROVED` | `false` |

For Google sign-in, set `GOOGLE_CLIENT_ID` on the API and set the same Web client ID as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in the production Vercel project. Email/password can be tested without Google OAuth.

## Connect Vercel and verify

After the API is deployed and `/status` reports `database: connected` and `document_storage: configured`, set the API's public HTTPS origin as the server-only `HEALTH_API_URL` on the Vercel project serving NutritiScan. Redeploy the web project, then verify `https://www.nutritiscan.com/api/health/status` before testing registration, consent, PDF upload, extraction review, confirmation, export, and deletion with synthetic data.

Railway buckets are private S3-compatible storage. The application encrypts original files before upload; keep the bucket private and do not enable any public access path.
