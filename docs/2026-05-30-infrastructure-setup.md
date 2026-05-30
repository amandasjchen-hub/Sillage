# 2026-05-30 — Infrastructure Setup & Migration off Lovable

**Author:** Amanda Chen (founder)  
**Session:** Initial Claude Code setup

---

## Context

Sillage was originally built using Lovable, a no-code/AI web app builder. It was working and published, but Amanda wanted full ownership of the codebase and database in order to:
1. Have direct control over the product and data
2. Work with Claude Code for more powerful development
3. Eventually publish on the iOS App Store (which requires React Native, not a web app)

---

## Decisions Made

### 1. Moved off Lovable → Claude Code
**Decision:** Stop using Lovable as the primary development environment and move to Claude Code locally.  
**Why:** Lovable abstracts away too much for complex features, charges monthly fees, and cannot help with mobile app conversion. Claude Code gives full control.  
**Tradeoff:** Requires more technical setup, but gives full ownership.

### 2. Kept the existing codebase (React + Vite + TypeScript + Tailwind)
**Decision:** Did not rewrite the app — used the code Lovable generated.  
**Why:** The code was solid and already had all the core features built. Rewriting would have been wasted effort.

### 3. Migrated to own Supabase project
**Decision:** Set up a new Supabase project (ID: hkpftnxftlnanntnnvcg) under Amanda's personal account instead of using Lovable's managed Supabase.  
**Why:** Lovable owns the original Supabase project (ID: nxlfdfjbnmswrofimcow) and Amanda had no direct access to it. Full data ownership requires owning the database.  
**Tradeoff:** Lost existing data (perfume collection, diary entries). Acceptable because the app is still early and data can be re-entered.

### 4. Set up Google OAuth independently
**Decision:** Created a Google Cloud project called "Sillage" and configured OAuth credentials directly.  
**Why:** Lovable was routing Google login through their own servers. Moving off Lovable meant this needed to be set up independently.  
**How:** Google Cloud Console → OAuth consent screen → Web client → added Supabase callback URL.

### 5. Replaced Lovable auth with direct Supabase auth
**Decision:** Removed `@lovable.dev/cloud-auth-js` and replaced `lovable.auth.signInWithOAuth()` with `supabase.auth.signInWithOAuth()` in `src/pages/Auth.tsx`.  
**Why:** The Lovable auth library routed login through Lovable's servers, causing 404 errors when running independently.

### 6. Deployed to Vercel
**Decision:** Used Vercel (free tier) for hosting instead of Lovable's hosting.  
**Why:** Free, fast, and integrates directly with GitHub. Every push to GitHub can auto-deploy.  
**Live URL:** https://sillage-delta.vercel.app

### 7. Started a docs/ folder for company history
**Decision:** All major decisions documented in this folder going forward.  
**Why:** Amanda's vision is to build Sillage into a company. Documenting decisions from day one means any future employee, investor, or developer can trace the full history of why things are the way they are.

---

## Tech Stack (as of 2026-05-30)

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Google OAuth |
| Hosting | Vercel |
| Source control | GitHub (amandasjchen-hub/Sillage) |
| Local dev | Claude Code + npm run dev |

---

## Accounts & Access

| Service | Account | Notes |
|---------|---------|-------|
| GitHub | amandasjchen-hub | Source of truth for all code |
| Supabase | amandasjchen-hub's Org | Project ID: hkpftnxftlnanntnnvcg |
| Vercel | amanda-chen-s-projects | Deploys from GitHub |
| Google Cloud | amandasjchen@gmail.com | OAuth for login |

---

## Future Plans

- **App Store:** Convert to React Native for iOS/Android publication
- **Custom domain:** Replace sillage-delta.vercel.app with a real domain
- **Logo/favicon:** Custom Sillage branding (placeholder as of today)
- **Data import:** Potentially recover original perfume data from Lovable's Supabase via their support team
