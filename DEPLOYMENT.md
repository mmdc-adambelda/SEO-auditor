# SEO Auditor — Deployment & Architecture Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────────┐
│                    Nginx (Reverse Proxy)                        │
│         Rate limiting · SSL termination · Routing              │
└──────────────┬──────────────────────────────────────────────────┘
               │                          │
┌──────────────▼──────────┐  ┌────────────▼────────────────────┐
│   Next.js Web (Port 3000)│  │  Express API (Port 4000)        │
│   · Homepage (URL input) │  │  · POST /api/v1/audit           │
│   · Audit progress page  │  │  · GET  /api/v1/audit/:id       │
│   · Results dashboard    │  │  · GET  /api/v1/audit/:id/...   │
│   · Export downloads     │  │  · GET  /api/v1/reports/:id/... │
└─────────────────────────┘  └─────────────┬───────────────────┘
                                           │
               ┌───────────────────────────┼─────────────────────┐
               │                           │                     │
┌──────────────▼──────────┐  ┌─────────────▼──────┐  ┌──────────▼───────┐
│   PostgreSQL (Port 5432) │  │  Redis (Port 6379)  │  │   Storage (/app/ │
│   · AuditJob             │  │  · BullMQ queues    │  │   storage)       │
│   · CrawledPage          │  │  · Job status       │  │   · PDF reports  │
│   · TechnicalIssue       │  │  · Rate limiting    │  │   · CSV exports  │
│   · KeywordOpportunity   │  └─────────────────────┘  │   · JSON reports │
│   · Competitor           │                           └──────────────────┘
│   · AuditReport          │
│   · CoreWebVitals        │  External APIs:
└─────────────────────────┘  · Google PageSpeed Insights
                             · DataForSEO (keywords/competitors)
                             · OpenAI GPT-4o (AI recommendations)

Worker Process (BullMQ):
  1. CRAWL  → CrawlerService (Axios + Cheerio, p-queue)
  2. AUDIT  → TechnicalAuditService + OnPageAuditService
  3. CWV    → PageSpeedService (Google API)
  4. AI     → OpenAIService (GPT-4o)
  5. KW/COMP→ DataForSEOService
  6. REPORT → ReportGeneratorService (PDFKit, CSV, JSON)
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### 1. Clone & Install

```bash
git clone https://github.com/your-org/seo-auditor
cd seo-auditor
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start Infrastructure

```bash
docker compose up postgres redis -d
```

### 4. Set Up Database

```bash
pnpm db:generate        # Generate Prisma client
pnpm db:migrate         # Run migrations
pnpm db:seed            # (optional) seed demo data
```

### 5. Start Development Servers

```bash
pnpm dev
# Web:  http://localhost:3000
# API:  http://localhost:4000
```

## Production Deployment

### Option 1: Docker Compose (Single Server)

```bash
# 1. Copy environment file
cp .env.example .env.production
# Edit with production values

# 2. Build images
docker build -f docker/Dockerfile.api -t seo-auditor-api:latest .
docker build -f docker/Dockerfile.web --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 -t seo-auditor-web:latest .

# 3. Deploy
docker compose -f docker-compose.prod.yml up -d

# 4. Run migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### Option 2: Cloud (Recommended for Scale)

**Recommended stack:**
- **API**: Railway, Fly.io, or AWS ECS (2+ replicas)
- **Web**: Vercel (Next.js optimized)
- **Database**: Supabase, Neon, or AWS RDS
- **Redis**: Upstash or AWS ElastiCache
- **Storage**: AWS S3 (set AWS env vars in .env)

## Required API Keys

| Service | Where to Get | Free Tier |
|---------|-------------|-----------|
| Google PageSpeed API | console.cloud.google.com → APIs → PageSpeed Insights | Yes (25k/day) |
| DataForSEO | dataforseo.com | Pay-per-use |
| OpenAI | platform.openai.com | Pay-per-use |

## Security Best Practices

### Implemented
- ✅ Helmet.js security headers
- ✅ CORS restricted to allowed origins
- ✅ Rate limiting (200 req/15min general, 20 audits/hour)
- ✅ Input validation with Zod
- ✅ SQL injection protection via Prisma ORM
- ✅ Path traversal prevention in report downloads
- ✅ Non-root Docker user
- ✅ Docker internal network for DB/Redis
- ✅ nginx SSL termination + security headers

### Production Checklist
- [ ] Change `API_SECRET` to a 32+ character random string
- [ ] Enable HTTPS in nginx (certbot/Let's Encrypt)
- [ ] Set `REDIS_PASSWORD` to a strong password
- [ ] Set `CORS_ORIGIN` to your exact frontend domain
- [ ] Configure `DATABASE_URL` with SSL (`?sslmode=require`)
- [ ] Set up automated DB backups
- [ ] Configure log aggregation (Datadog, Papertrail)
- [ ] Set up uptime monitoring (UptimeRobot, BetterUptime)
- [ ] Review and tighten nginx rate limits for your traffic

## Environment Variables Reference

See `.env.example` for the complete list with descriptions.

Critical variables:
```bash
DATABASE_URL         # PostgreSQL connection string
REDIS_HOST           # Redis host
REDIS_PORT           # Redis port (default: 6379)
REDIS_PASSWORD       # Redis auth password
API_SECRET           # JWT secret (min 32 chars)
CORS_ORIGIN          # Frontend URL
GOOGLE_PAGESPEED_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
OPENAI_API_KEY
NEXT_PUBLIC_API_URL  # Backend URL visible to browser
```

## Database Migrations

```bash
# Development
pnpm db:migrate                    # Create + apply new migration
pnpm db:studio                     # Visual database browser

# Production
pnpm --filter @seo-auditor/database migrate:deploy   # Apply pending migrations
```

## Monitoring & Health

- API health: `GET /health` → `{"status":"ok","db":"connected"}`
- Web health: `GET /api/health` → `{"status":"ok"}`
- Queue monitoring: Add Bull Board at `/admin/queues` (add auth middleware)

## Scaling Considerations

1. **Crawler concurrency**: Adjust `CRAWLER_CONCURRENCY` (default: 10)
2. **Worker concurrency**: Edit `createAuditWorker` concurrency option (default: 3)
3. **Max pages**: Set `CRAWLER_MAX_PAGES` per your server capacity
4. **Horizontal scaling**: The API is stateless — run multiple instances behind a load balancer. BullMQ + Redis handles job distribution automatically.
5. **Storage**: For multi-instance deployments, use S3 instead of local storage for report files.
