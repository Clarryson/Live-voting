# 🗳️ Mulembe Nation University — Online Voting System

> A secure, real-time, mobile-responsive online voting platform built for Mulembe Nation University Guild Elections. Supports two-factor authentication, anonymous ballots, live results, and a full admin control panel.

-------

## 📋 Table of Contents

- [Overview](#-overview)
- [Live Portals](#-live-portals)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How Voting Works](#-how-voting-works)
- [Local Development Setup](#-local-development-setup)
- [Database Setup](#-database-setup)
- [Seeding Data](#-seeding-data)
- [Deployment Guide](#-deployment-guide)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Security Architecture](#-security-architecture)
- [Troubleshooting](#-troubleshooting)
- [Election Day Checklist](#-election-day-checklist)
- [License](#-license)

---

## 🌍 Overview

The Mulembe Nation University Online Voting System is a production-grade election platform purpose-built for university student guild elections. It restricts participation to a pre-verified list of registered students, enforces strict time-gated election windows, guarantees one vote per student through atomic database transactions, and keeps every ballot completely anonymous while providing live real-time results to delegates and observers.

The system is built across two independently deployable applications:

| Application | Purpose | Default Port |
|---|---|---|
| **Backend** (Node.js + Express) | API server, authentication, vote processing | `4000` |
| **Frontend** (Next.js + React) | Voter portal, results dashboard, admin panel | `3000` |

---

## 🌐 Live Portals

Once deployed, three portals are available:

| Portal | URL Path | Audience |
|---|---|---|
| 🏠 **Homepage** | `/` | Everyone |
| 🗳️ **Voting Portal** | `/vote` | Registered students only |
| 📊 **Live Results** | `/results` | Everyone (public) |
| 🔐 **Admin Panel** | `/admin` | Election administrators only |

---

## ✨ Features

### For Students
- Enter admission number to receive a one-time token by email
- 6-digit OTP verification with 15-minute expiry
- Clean, mobile-friendly ballot with one candidate per position
- Instant confirmation on successful vote
- Cannot vote twice — system rejects second attempts

### For Administrators
- Secure admin login with role-based access (superadmin / admin / observer)
- Create and manage elections with custom opening and closing times
- Add positions (e.g. Guild President, Vice President) and candidates
- Bulk-import students from a CSV file
- Monitor voter turnout in real time
- View the full immutable audit log of all system events
- Manually open or close elections if needed
- Election status transitions automatically every 30 seconds based on server time

### For Observers / Results Dashboard
- Live vote tallies that update instantly without refreshing the page
- Candidate standings per position with animated progress bars
- Voter turnout percentage and comparison against total eligible
- Faculty and regional breakdown of votes cast
- Countdown timer to election close
- Win projection badges based on current pace

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | Fast, SEO-friendly React framework |
| **Styling** | Tailwind CSS | Rapid, consistent UI styling |
| **Backend** | Node.js 20 + Express 5 | Fast, non-blocking JavaScript server |
| **Real-time** | Socket.IO + WebSockets | Instant live results without polling |
| **Database** | PostgreSQL 16 | Strong relational integrity and ACID transactions |
| **Cache** | Redis 7 | Sub-millisecond live tally reads |
| **Auth** | JWT + bcrypt + SHA-256 | Industry-standard secure authentication |
| **Email** | Nodemailer (SMTP) | OTP delivery to student emails |
| **Validation** | Zod | Runtime type-safe request validation |
| **Security** | Helmet, CORS, csurf, rate-limit | Multi-layer attack protection |
| **Containers** | Docker + Docker Compose | Consistent local development |
| **Hosting** | Railway (backend) + Vercel (frontend) | Scalable cloud deployment |

---

## 📁 Project Structure

```
mulembe-voting/
│
├── 📁 backend/
│   ├── 📁 migrations/
│   │   └── 001_schema.sql          # Complete PostgreSQL schema
│   │
│   ├── 📁 scripts/
│   │   ├── seed-admin.js           # Creates the first superadmin account
│   │   ├── seed-voters.js          # Bulk-imports students from CSV
│   │   └── sample-voters.csv       # Example CSV format for student import
│   │
│   ├── 📁 src/
│   │   ├── 📁 db/
│   │   │   ├── pool.js             # PostgreSQL connection pool
│   │   │   └── redis.js            # Redis client with auto-reconnect
│   │   │
│   │   ├── 📁 middleware/
│   │   │   └── auth.js             # JWT guard for admin routes
│   │   │
│   │   ├── 📁 routes/
│   │   │   ├── auth.js             # OTP token request and verification
│   │   │   ├── votes.js            # Ballot casting with integrity checks
│   │   │   ├── results.js          # Live tally, turnout, faculty breakdown
│   │   │   └── admin.js            # Election and voter management
│   │   │
│   │   ├── 📁 services/
│   │   │   ├── email.js            # Nodemailer OTP email templates
│   │   │   ├── jwt.js              # Sign and verify ballot and admin JWTs
│   │   │   └── election.js         # 30-second cron for status auto-transitions
│   │   │
│   │   ├── 📁 sockets/
│   │   │   └── pgNotify.js         # PostgreSQL LISTEN/NOTIFY to Socket.IO bridge
│   │   │
│   │   └── server.js               # Express app — middleware, routes, startup
│   │
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── 📁 frontend/
│   ├── 📁 app/
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css             # Global styles
│   │   ├── page.tsx                # Homepage
│   │   ├── 📁 vote/
│   │   │   └── page.tsx            # 3-step voting flow
│   │   ├── 📁 results/
│   │   │   └── page.tsx            # Live results dashboard
│   │   └── 📁 admin/
│   │       └── page.tsx            # Admin control panel
│   │
│   ├── 📁 lib/
│   │   ├── api.ts                  # Typed API client
│   │   └── socket.ts               # useLiveTally React hook
│   │
│   ├── .env.example
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── next.config.mjs
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 🔄 How Voting Works

```
STEP 1  Student visits /vote and enters admission number
        │
        ▼
STEP 2  Backend checks:
        ✓ Admission number is in the eligible_voters table
        ✓ Election is currently LIVE (server clock, not student clock)
        ✓ Student has not already voted
        ✓ Student has not exceeded 3 token requests in 15 minutes
        │
        ▼
STEP 3  System generates a 6-digit OTP
        Stores SHA-256 hash in database (never the plain number)
        Emails the plain OTP to the student's university email
        │
        ▼
STEP 4  Student enters the 6-digit code from email
        Backend hashes it and compares with stored hash
        If match: issues a 10-minute ballot JWT
        │
        ▼
STEP 5  Student selects one candidate per position
        Clicks Submit Ballot
        │
        ▼
STEP 6  Backend verifies inside a database transaction:
        ✓ Ballot JWT is valid and not expired
        ✓ Election window still open (server clock)
        ✓ Atomically sets has_voted = TRUE where has_voted = FALSE
          (if 0 rows updated, student already voted — rejected)
        ✓ All candidate/position pairs are valid
        ✓ Inserts votes with NO voter_id — anonymous by design
        ✓ Marks OTP token as used
        │
        ▼
STEP 7  Database trigger fires:
        Refreshes the live_tally materialized view
        Sends pg_notify signal
        Socket.IO pushes new tally to all /results viewers instantly
```

---

## 💻 Local Development Setup

### Prerequisites

| Tool | Download | Purpose |
|---|---|---|
| Node.js 20+ | https://nodejs.org (choose LTS) | Runs backend and frontend |
| VS Code | https://code.visualstudio.com | Code editor |
| Docker Desktop | https://docker.com/products/docker-desktop | Runs PostgreSQL and Redis |
| Git | https://git-scm.com | Version control |

Verify installation:
```bash
node --version    # v20.x.x or higher
npm --version     # 10.x.x or higher
docker --version  # Docker version 24.x.x or higher
git --version     # git version 2.x.x
```

### 1. Open the Project

```bash
# Unzip the downloaded file, then open in VS Code:
# File → Open Folder → select the mulembe-voting folder
```

### 2. Install Dependencies

Open VS Code terminal with `Ctrl + `` ` `` and run:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Configure Environment Variables

```bash
cd backend && cp .env.example .env
cd ../frontend && cp .env.example .env.local
```

Fill in `backend/.env` — see the Environment Variables section below.

### 4. Start the Database

```bash
# From the root mulembe-voting folder:
docker-compose up postgres redis -d
```

### 5. Create Tables

```bash
cd backend
npm run migrate
```

### 6. Create Admin Account

```bash
npm run seed:admin
```

Default login: `admin@mulembe.ac.ke` / `ChangeMe@2025!`

> ⚠️ Change this immediately by updating `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` and re-running this command.

### 7. Import Test Students

```bash
npm run seed:voters scripts/sample-voters.csv
```

### 8. Start Both Servers

Open two terminals in VS Code:

```bash
# Terminal 1 — Backend
cd backend && npm run dev
# Server running on port 4000

# Terminal 2 — Frontend
cd frontend && npm run dev
# Ready on http://localhost:3000
```

### 9. Visit the App

| Page | URL |
|---|---|
| Homepage | http://localhost:3000 |
| Voting portal | http://localhost:3000/vote |
| Live results | http://localhost:3000/results |
| Admin panel | http://localhost:3000/admin |
| Health check | http://localhost:4000/health |

---

## 🗄️ Database Tables

| Table | Purpose |
|---|---|
| `eligible_voters` | Pre-authorized students — only these can vote |
| `elections` | Election events with open and close timestamps |
| `positions` | Positions within each election |
| `candidates` | Candidates running for each position |
| `voting_tokens` | Short-lived SHA-256 OTP hashes for 2FA |
| `votes` | Anonymous ballot records — no voter_id column |
| `vote_audit_log` | Immutable event log — insert only, never updated |
| `admin_users` | Admin accounts with role-based permissions |

---

## 🌱 Seeding Data

### Students CSV Format

```csv
admission_no,student_email,full_name,faculty,department,year_of_study,region
MNU/CS/2021/001,john.doe@mulembe.ac.ke,John Doe,Engineering,Computer Science,3,Western
MNU/BS/2022/002,jane.smith@mulembe.ac.ke,Jane Smith,Business,Finance,2,Nairobi
```

Run the import:
```bash
node scripts/seed-voters.js path/to/your-students.csv
```

### Create Elections via SQL (alternative to admin panel)

```sql
INSERT INTO elections (title, opens_at, closes_at, status)
VALUES (
  '2025 Guild Elections',
  '2025-10-01 08:00:00+03',
  '2025-10-01 17:00:00+03',
  'upcoming'
);
```

---

## 🚀 Deployment Guide

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Mulembe Nation University Voting System"
git remote add origin https://github.com/YOURUSERNAME/mulembe-voting.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy Backend to Railway

1. Go to **railway.app** → sign up with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select `mulembe-voting` → set Root Directory to `backend`
4. Add Plugin: **PostgreSQL**
5. Add Plugin: **Redis**
6. Add all environment variables in the Variables tab
7. Deploy → copy your Railway backend URL from Settings → Domains

After deploy, open the Railway **Shell** tab:
```bash
npm run migrate
npm run seed:admin
```

### Step 3 — Deploy Frontend to Vercel

1. Go to **vercel.com** → sign up with GitHub
2. **Add New Project** → import `mulembe-voting`
3. Set **Root Directory** to `frontend`
4. Add environment variables (see table below)
5. Deploy → copy your Vercel URL

### Step 4 — Link Them Together

On Railway → Variables → update:
```
FRONTEND_URL = https://your-app.vercel.app
```

On Vercel → Environment Variables → update:
```
NEXT_PUBLIC_API_URL    = https://your-app.up.railway.app
NEXT_PUBLIC_SOCKET_URL = https://your-app.up.railway.app
```

Redeploy both services.

### Step 5 — Set Election ID

1. Log into `/admin` on your live site
2. Create your election
3. Copy the election UUID
4. Vercel → Environment Variables → set `NEXT_PUBLIC_ELECTION_ID`
5. Redeploy frontend

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host/db` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `long-random-string-here` | JWT signing secret — never share |
| `SMTP_HOST` | `smtp.resend.com` | Email server hostname |
| `SMTP_PORT` | `465` | Email server port |
| `SMTP_SECURE` | `true` | Use TLS |
| `SMTP_USER` | `resend` | SMTP username |
| `SMTP_PASS` | `re_xxxxxxxxx` | SMTP password or API key |
| `SMTP_FROM` | `voting@mulembe.ac.ke` | Sender email address |
| `FRONTEND_URL` | `https://mulembe-voting.vercel.app` | Allowed CORS origin |
| `PORT` | `4000` | Server port |
| `NODE_ENV` | `production` | Environment mode |
| `SEED_ADMIN_EMAIL` | `admin@mulembe.ac.ke` | Admin account email |
| `SEED_ADMIN_PASSWORD` | `StrongPassword!2025` | Admin account password |

### Frontend (`frontend/.env.local`)

| Variable | Example | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-app.up.railway.app` | Backend API URL |
| `NEXT_PUBLIC_SOCKET_URL` | `https://your-app.up.railway.app` | Backend WebSocket URL |
| `NEXT_PUBLIC_ELECTION_ID` | `550e8400-e29b-41d4-a716-446655440000` | Active election UUID |

> 💡 Free SMTP: Sign up at [resend.com](https://resend.com) — 3,000 free emails per month.

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/request-token` | `{ admission_no, election_id }` | `{ message, expires_in_seconds }` |
| `POST` | `/api/auth/verify-token` | `{ admission_no, election_id, token }` | `{ ballot_session, expires_in_seconds }` |

### Voting

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| `POST` | `/api/votes/cast` | `Bearer <ballot_jwt>` | `{ election_id, ballots: [{ position_id, candidate_id }] }` |

### Results (Public)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/results/:id` | Full live tally |
| `GET` | `/api/results/:id/turnout` | Turnout count and percentage |
| `GET` | `/api/results/:id/faculty` | Votes by faculty |
| `GET` | `/api/results/:id/meta` | Election title and status |

### Admin (Requires admin JWT)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Admin login |
| `GET` | `/api/admin/elections` | List all elections |
| `POST` | `/api/admin/elections` | Create election |
| `PATCH` | `/api/admin/elections/:id/status` | Change election status |
| `POST` | `/api/admin/elections/:id/positions` | Add position |
| `POST` | `/api/admin/positions/:id/candidates` | Add candidate |
| `GET` | `/api/admin/voters` | List all voters with status |
| `POST` | `/api/admin/voters/seed` | Bulk import voters |
| `GET` | `/api/admin/audit-log` | View audit log |
| `GET` | `/api/admin/stats/:election_id` | Full election statistics |
| `POST` | `/api/admin/users` | Create admin user (superadmin only) |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Database and Redis connectivity |

---

## 🔐 Security Architecture

| Threat | Protection |
|---|---|
| Fake voters | Pre-authorized list only — no self-registration |
| Double voting | Atomic `UPDATE WHERE has_voted=FALSE` in a transaction |
| Vote tracing | `votes` table has no `voter_id` column — anonymous by design |
| OTP theft | Tokens stored as SHA-256 hashes — plain text only in email |
| Expired sessions | Ballot JWTs expire in 10 minutes |
| Brute force | Redis-backed rate limiting — max 3 OTP requests per 15 minutes |
| Client clock cheating | All time checks use `NOW()` on PostgreSQL server |
| SQL injection | All queries use parameterized statements — no string concatenation |
| CSRF attacks | csurf middleware with httpOnly cookies |
| Weak headers | Helmet.js enforces secure HTTP headers |
| Oversized requests | JSON body limit set to 10KB |
| Audit tampering | Audit log is INSERT-only — no UPDATE or DELETE ever |

---

## 🔧 Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 5432` | PostgreSQL not running | `docker-compose up postgres redis -d` |
| `Cannot find module` | Dependencies missing | `npm install` in backend or frontend |
| `Invalid token` | OTP expired or already used | Request a new token |
| `Election not active` | Wrong status or outside time window | Check admin panel election status |
| CORS error in browser | `FRONTEND_URL` mismatch | Match exactly — no trailing slash |
| Live results not updating | WebSocket config wrong | Check `FRONTEND_URL` on Railway, redeploy |
| Emails not arriving | SMTP config wrong | Check Resend dashboard for delivery logs |
| Port 4000 in use | Another app using the port | Change `PORT=4001` in `.env` |

Check backend health at any time:
```bash
curl http://localhost:4000/health
# { "status": "ok", "db": "connected", "redis": "connected" }
```

---

## ✅ Election Day Checklist

```
□ Backend running — /health returns status: ok
□ Frontend loading at your Vercel URL
□ PostgreSQL and Redis both connected
□ Test email OTP received successfully
□ All students imported — check admin voters tab
□ All positions and candidates added correctly
□ NEXT_PUBLIC_ELECTION_ID set to correct UUID
□ Election status is set to live (or upcoming with correct open time)
□ Admin password changed from default
□ /results URL ready to display on a projector
□ Admin panel open on a separate device for monitoring
```

---

## 📄 License

© 2025 Mulembe Nation University. All rights reserved.

This software was developed exclusively for Mulembe Nation University student guild elections. Unauthorized reproduction or use outside of Mulembe Nation University is prohibited.

---

*For technical support during an active election, contact the Mulembe Nation University IT Department.*
