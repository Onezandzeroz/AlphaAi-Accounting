# AlphaAi Accounting

AI-powered bookkeeping for modern businesses. Track transactions, calculate VAT, scan receipts with OCR, manage invoices, and export to SAF-T and Peppol e-invoicing formats. Built for Danish VAT compliance.

## Features

- **Transaction Management** — Record sales and purchases with automatic VAT calculation
- **VAT Reports** — Danish momsafregning with output/input VAT breakdown
- **Invoice System** — Create, manage, and track invoices with auto-numbering
- **Receipt Scanning** — AI-powered OCR (VLM) with Tesseract.js fallback
- **SAF-T Export** — Standard Audit File for Tax (Danish Financial Schema v1.0)
- **OIOUBL/Peppol** — Peppol-compliant e-invoice XML generation
- **Bilingual** — Full Danish/English UI
- **Dark Mode** — Light and dark theme support

## Tech Stack

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) | React framework (App Router) |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) | Styling & components |
| [Prisma](https://www.prisma.io/) + SQLite | Database ORM |
| [Bun](https://bun.sh/) | JavaScript runtime & package manager |
| [Zustand](https://zustand.docs.pmnd.rs/) | Client state management |
| [xmlbuilder2](https://github.com/oozcitak/xmlbuilder2) | XML generation |

## Prerequisites

- **[Bun](https://bun.sh/)** v1.3+ installed ([install guide](https://bun.sh/docs/installation))
- **Git** installed

> **No other environment variables or configuration needed.** The SQLite database path is hardcoded and auto-resolved.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Onezandzeroz/AlphaAi-Bogforingsapp-NEW.git
cd AlphaAi-Bogforingsapp-NEW

# 2. Install dependencies
bun install

# 3. Initialize the database
bun run db:push

# 4. Start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start development server (port 3000, Webpack mode) |
| `bun run dev:direct` | Start dev server without port check |
| `bun run build` | Create optimized production build |
| `bun run start` | Start production server (after build) |
| `bun run start:pm2` | Start with PM2 process manager (VPS) |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Sync Prisma schema to database |
| `bun run db:generate` | Regenerate Prisma Client |
| `bun run db:reset` | Reset database (destroys all data) |
| `bun run kill-port` | Kill process on port 3000 |
| `bun run ports` | Show port 3000-3009 status |

## Project Structure

```
AlphaAi-Bogforingsapp-NEW/
├── prisma/
│   ├── schema.prisma          # Database schema (SQLite)
│   └── db/
│       └── custom.db          # SQLite database (auto-created)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main app page (SPA with routing)
│   │   ├── layout.tsx         # Root layout with fonts
│   │   ├── globals.css        # Global styles & theme variables
│   │   └── api/
│   │       ├── auth/          # Login, register, logout, delete account
│   │       ├── transactions/  # CRUD + CSV/Peppol export
│   │       ├── invoices/      # Invoice CRUD + status management
│   │       ├── company/       # Company info CRUD
│   │       ├── export-saft/   # SAF-T XML generation
│   │       └── ocr/           # AI receipt scanning
│   ├── components/
│   │   ├── auth/              # Login & register forms
│   │   ├── dashboard/         # Dashboard with charts
│   │   ├── transactions/      # Transaction list & form
│   │   ├── invoices/          # Invoice management
│   │   ├── vat-report/        # VAT report page
│   │   ├── exports/           # Export formats page
│   │   ├── layout/            # App layout with sidebar
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── db.ts              # Database client (Prisma)
│   │   ├── auth-store.ts      # Auth state (Zustand)
│   │   ├── language-store.ts  # Language preference (Zustand)
│   │   ├── translations.ts    # DA/EN translations
│   │   ├── ocr-utils.ts       # OCR receipt parsing
│   │   ├── oioubl-generator.ts # OIOUBL XML generator
│   │   └── saft-validator.ts  # SAF-T validation
│   └── hooks/                 # Custom React hooks
├── scripts/
│   ├── dev-server.ts          # Smart dev server launcher
│   └── kill-port.ts           # Port killer (cross-platform)
├── Caddyfile                  # Caddy reverse proxy config
├── ecosystem.config.js        # PM2 process config
├── next.config.ts             # Next.js configuration
└── package.json               # Dependencies & scripts
```

## Database

The app uses **SQLite** with Prisma ORM. The database file is stored at:

```
prisma/db/custom.db
```

This path is automatically resolved by `src/lib/db.ts` — no environment variables needed.

### Common Database Commands

```bash
# Create/update tables after schema changes
bun run db:push

# Regenerate the Prisma Client (after installing)
bun run db:generate

# Reset the database completely (WARNING: deletes all data)
bun run db:reset
```

## Deployment

See [STARTUP.md](./STARTUP.md) for detailed deployment instructions covering:

- Local Windows development
- Local Windows production
- Ubuntu Cloud VPS deployment (with Caddy + PM2)

## Troubleshooting

### Port 3000 is in use

```bash
bun run kill-port        # Kills process on port 3000
```

### Database errors after schema changes

```bash
bun run db:push         # Re-sync schema
bun run db:generate     # Regenerate Prisma Client
```

### Clean install

```bash
# Remove all generated files and reinstall
rm -rf .next node_modules prisma/db/custom.db
bun install
bun run db:push
bun run dev
```

### Turbopack + Prisma error

If you see `Cannot find module '@prisma/client-...'`, ensure the dev server uses Webpack mode:

```bash
bun run dev             # Uses --webpack flag automatically
```

## License

Private repository. All rights reserved.
