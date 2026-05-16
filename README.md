# Mahibere Kidusan Educator

A classroom presentation and quiz tool for substitute teachers and volunteers. When a teacher is absent, any volunteer can log in, pick a topic, present content slides to students, run quizzes, and award stars.

## Tech Stack

- **Frontend**: Next.js (App Router), React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth v5 (credentials-based)
- **Language**: TypeScript

## Features

- **Admin Panel**: Create/edit topics with content slides and quiz questions
- **Presentation Mode**: Slide-by-slide content delivery with navigation
- **Quiz Mode**: Interactive quiz with per-student tracking
- **Star System**: Award stars for correct quiz answers
- **Leaderboard**: Ranked display of student performance
- **Topic Tracking**: Mark topics as taught to avoid repetition
- **Student Management**: Add/remove students (first name + last name)
- **Role-Based Access**: Admin and Volunteer roles with different permissions

### Multi-tenant & teaching context

- **School sites (tenants)**: Data partitioned per site (slug/name); soft-delete support for sites
- **Class & subject**: Topics, students, and quotes scoped to a class and subject; dedicated **Class & subject** flow
- **Common Pool subjects**: Subjects live in a shared tenant-wide pool and are linked to one or many classes via a many-to-many join (`SubjectClass`). Admins curate the pool from `/admin/subjects`; teachers see only the subjects linked to the class they’re teaching.
- **Platform / super-admin**: `SUPER_ADMIN` role, platform area to manage tenants, optional read-only browsing of a chosen school
- **Per-site quotes**: Inspirational quotes tied to each tenant

### Authentication & access

- **Cross-site username login**: Finds the correct school from username (multi-site picker, optional “remember my site”)
- **Volunteer invite sign-in**: `/join` — one-time link + passcode for volunteers without a password
- **System portal**: Entry point for platform operators (separate from school login)
- **Display names**: Session labels such as `volunteer+name` via display name / invite label

### Admin & operations

- **Volunteer access**: Admins generate time-limited invites (TTL), copy link + passcode
- **Activity / audit log**: Admin-visible activity log for important changes (topics, content, invites, etc.)
- **Archive & restore**: Soft-delete and restore flows for tenants and related admin data
- **Subjects & classes**: Manage subjects and classes under a tenant
- **Student bulk import**: Bulk import students (spreadsheet-oriented)

### Content & presentation

- **Richer content blocks**: TEXT, SLIDE, IMAGE, and VIDEO; optional slide theme (JSON); video/embed handling
- **Media uploads**: API for uploading media used in content
- **Jeopardy**: Per-topic Jeopardy board (categories/cells), editor and play mode, optional AI-assisted generation; configurable grid and team count
- **Topic attribution**: Created/updated-by metadata on topics

### Quiz, stars & leaderboard

- **Stars & topics**: Star records associated with topics for clearer per-topic performance
- **Play-mode polish**: Winner splash and related presentation UX around quizzes/Jeopardy

### Students

- **Soft-delete**: Students can be archived/restored (`deletedAt`) instead of only hard-deleted
- **Class-scoped**: Students belong to tenant + class

### Product / UX

- **Dashboard & help**: Dashboard hub and expanded help / user guide
- **Header & context**: Active site and class/subject context in the nav; responsive layout
- **PWA-oriented**: Web app manifest and offline/service-worker shell where enabled
- **Toasts & clipboard**: Toast feedback and copy-to-clipboard for invites and links
- **Access messaging**: Clear screens when a role cannot use a page (e.g. super-admin write limits, volunteer restrictions)

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Docker)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

**Option A: Docker (recommended)**

```bash
docker compose up -d
```

**Option B: Use an existing PostgreSQL instance**

Update `DATABASE_URL` in `.env` to point to your database.

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your database URL and secrets
```

### 4. Run database migrations

```bash
npx prisma migrate dev --name init
```

### 5. Seed default users

```bash
npx prisma db seed
```

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Default Accounts

| Role      | Username    | Password       |
| --------- | ----------- | -------------- |
| Admin     | admin       | admin123       |
| Volunteer | volunteer   | volunteer123   |

> Change these in `.env` before deploying.

## NPM Scripts

| Command              | Description                 |
| -------------------- | --------------------------- |
| `npm run dev`        | Start dev server            |
| `npm run build`      | Build for production        |
| `npm start`          | Start production server     |
| `npm run db:migrate` | Run Prisma migrations       |
| `npm run db:seed`    | Seed default users          |
| `npm run db:reset`   | Reset database + re-seed    |
| `npm run db:studio`  | Open Prisma Studio (DB GUI) |

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth endpoints
│   │   ├── topics/       # Topics CRUD + contents + quizzes
│   │   ├── students/     # Students CRUD
│   │   └── stars/        # Star awards + leaderboard
│   ├── admin/            # Admin pages (topic + content management)
│   ├── present/          # Presentation + quiz flow
│   ├── students/         # Student management page
│   ├── leaderboard/      # Leaderboard page
│   ├── login/            # Login page
│   ├── layout.tsx        # Root layout with nav
│   └── page.tsx          # Home/dashboard
├── components/           # Shared UI components
├── lib/                  # Auth config, Prisma client
└── types/                # TypeScript declarations
prisma/
├── schema.prisma         # Database schema
└── seed.ts               # Seed script
```

## Workflow

1. **Admin** logs in → creates topics → adds content slides → adds quiz questions
2. **Volunteer** logs in → picks an untaught topic → presents slides to class
3. After slides → runs quiz → selects student → student answers → stars awarded
4. Topic marked as "taught" → won't appear in untaught list next time
5. Leaderboard shows cumulative stars across all topics

## Common Pool subjects (architecture)

Subjects are not bound to a single class. They live in a per-tenant pool and are linked to any number of classes via the `SubjectClass` join model:

```
Tenant ── 1:N ── SchoolClass
                          \
                           N:N (via SubjectClass)
                          /
Tenant ── 1:N ── Subject
```

- **Admins** create pool subjects at `/admin/subjects`, then check off the classes each subject is available in.
- **Teachers** open **Class & subject**, pick a class, and only see subjects linked to that class. An admin in the same screen can use **Link from pool** to add more.
- **Topic creation** is gated server-side: `POST /api/topics` rejects a `(classId, subjectId)` pair unless a `SubjectClass` row exists.

Key endpoints:

| Method & path | Purpose |
| --- | --- |
| `GET /api/me/subjects?classId=…` | Subjects linked to a class (teacher view) |
| `GET /api/me/pool/subjects?classId=…` | Full pool with `linkedToCurrentClass` flags |
| `GET /api/admin/subjects` | All pool subjects with their linked classes |
| `POST /api/admin/subjects` | Create a pool subject; optional `classIds` to link immediately |
| `GET /api/admin/subjects/:id/classes` | Editor view: every class plus `linked` flag |
| `PUT /api/admin/subjects/:id/classes` | Sync linked classes (`{ classIds: string[] }`) |
| `GET /api/admin/classes/:id/subjects` | Mirror view for a class |
| `PUT /api/admin/classes/:id/subjects` | Sync linked subjects (`{ subjectIds: string[] }`) |

Schema highlights (`prisma/schema.prisma`):

- `Subject` keeps `tenantId` — pool membership is per tenant, not global.
- `Topic` still carries `classId` + `subjectId` (a topic is taught in exactly one class+subject), but creation now requires the link.
- Migration `20260513230000_add_subject_class_pool` backfills the join from every distinct `(classId, subjectId)` already used by a `Topic`, so existing topics keep working.
