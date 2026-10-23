# Ayana · 3D Spiritual Travel Marketplace

**Ayana** (अयन) means *journey*. This repo is a complete, working marketplace where customers
walk up to 3D dhams and step through their doors, pick a pilgrimage / yoga / meditation package,
choose a date, and pay online with Razorpay. An admin panel lets you manage packages, dates and bookings.

| | |
|---|---|
| Frontend | React 19, Vite, three.js / React Three Fiber (3D dhams), React Router |
| Backend | Node.js, Express 5, Prisma ORM, Zod, JWT |
| Database | MySQL 8 / MariaDB |
| Payments | Razorpay (UPI, cards, net banking, wallets) + mock mode for local dev |
| Hosting | Hostinger VPS (Nginx + PM2 + MariaDB + Let's Encrypt) |

## 📚 Documentation (read in order)
1. [Project roadmap](docs/01-roadmap.md) – phases, timeline, costs
2. [Architecture: HLD + LLD + tech stack](docs/02-architecture.md)
3. [Database design (ER diagram, tables)](docs/03-database.md)
4. [API reference](docs/04-api.md)
5. [Hosting on Hostinger, step by step](docs/05-hostinger-deployment.md)
6. [**Code walkthrough – every file explained**](docs/06-code-walkthrough.md)
7. [**Cursor → GitHub → Hostinger, and what to buy**](docs/07-cursor-github-hostinger.md)
8. [**Your data, the admin panel and analytics**](docs/08-admin-data-analytics.md)
9. [**Growing: interface, API, database and servers**](docs/09-expansion.md)
10. [**Building the Android app**](docs/10-android-app.md)

## 🚀 Run it locally (in Cursor)

**You need:** [Node.js 20+](https://nodejs.org) and MySQL. No MySQL? Install
[Docker Desktop](https://www.docker.com/products/docker-desktop/) and run `docker compose up -d` in this folder.

Open this folder in Cursor, open the terminal (<kbd>Ctrl</kbd>+<kbd>`</kbd>) and run:

```bash
# 1. Install everything
npm run setup

# 2. Configure the API (defaults work with docker compose)
cp server/.env.example server/.env        # Windows: copy server\.env.example server\.env

# 3. Create tables + demo data (11 packages, 12 destinations, admin user)
npm run db:setup
npm --prefix server run db:sample   # optional: a year of fake bookings for the Analytics tab

# 4. Start the API (terminal 1)
npm run dev:server

# 5. Start the website (terminal 2 – click "+" in the terminal panel)
npm run dev:client
```

Open **http://localhost:5173** 🎉

- Admin login: `admin@ayana.travel` / `Admin@12345` → **Admin** in the top menu.
- Payments start in **mock mode**: the Pay button confirms instantly with no money involved.
  To use real Razorpay test payments, set `PAYMENT_MODE=razorpay` and your `rzp_test_` keys in `server/.env`.
- Browse/edit the database: `cd server && npx prisma studio`.

### Using your own MySQL instead of Docker
```sql
CREATE DATABASE ayana CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ayana'@'localhost' IDENTIFIED BY 'ayana_pass';
GRANT ALL PRIVILEGES ON ayana.* TO 'ayana'@'localhost';
```
Changing the schema later with `npx prisma migrate dev` also needs a "shadow" database, so locally give
that user `GRANT ALL ON *.*` (never do this in production).

## 🗂 Project structure
```
client/   React + 3D frontend   (src/three/dham/ is the 3D temple scene)
server/   Express API            (prisma/schema.prisma is the database)
deploy/   Nginx, PM2, VPS setup, deploy and backup scripts
docs/     Roadmap, architecture, database, API, Hostinger guide
```

## ✏️ Common changes
| I want to… | Edit |
|---|---|
| Change colours / fonts | `client/src/styles.css` (`:root` variables) |
| Add or change a 3D dham | `client/src/three/dham/dhams.js` (list) and `Temple.jsx` (shapes) |
| Add package photos | Admin → Packages → Photos |
| Change home page text | `client/src/pages/Home.jsx` |
| Add a field to packages | `server/prisma/schema.prisma` → `npx prisma migrate dev -n add_field` → admin form + API |
| Change demo data | `server/prisma/seed.js` then `npm run db:setup` |
| Change seat-hold time | `BOOKING_HOLD_MINUTES` in `server/.env` |

## 🌐 Deploy
See **[docs/05-hostinger-deployment.md](docs/05-hostinger-deployment.md)**. Short version, on a Hostinger VPS:
```bash
bash deploy/setup-vps.sh yourdomain.com you@email.com   # once, as root
bash deploy/deploy.sh                                     # every release
```

## 👀 Preview without a server
`cd client && npm run build:demo` builds `client/dist-demo/`, a standalone preview where the API is
simulated in the browser (`src/demo/`). Payments are fake and data stays in the browser's storage.
Use it to show the design to others; it is not the real app.
