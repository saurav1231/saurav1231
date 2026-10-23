# Start here – Ayana in one page

Everything about Ayana lives in this repository: the website, the API, the database design, the deployment scripts and
the explanations. This page answers the main questions briefly and points to the detailed guide for each.

![Ayana home page with five 3D dhams](screenshots/home-3d-dhams.png)

## What has been built

| Part | What it does | Where |
|---|---|---|
| 3D entrance | Five dhams at dusk (Kedarnath, Kashi Vishwanath, Jagannath Puri, Golden Temple, Rameswaram). Hover walks you to the door and the doors open; click flies through it to that dham's journeys. Phones see one dham at a time with arrows. | `client/src/three/dham/` |
| Marketplace | Journey listing with filters, package page with photos, itinerary, reviews and booking panel | `client/src/pages/` |
| Booking & payment | Seats held for 30 minutes, Razorpay payment (UPI, cards, net banking), signature check, webhook backup | `server/src/services/bookingService.js`, `paymentService.js` |
| Accounts | Register / login, my bookings, reviews after a trip | `server/src/routes/auth.js`, `bookings.js` |
| Admin panel | Overview, Analytics, Bookings, Packages (edit, photos, dates) and Excel export | `client/src/pages/Admin.jsx`, `AdminAnalytics.jsx` |
| Database | 9 tables in MySQL | `server/prisma/schema.prisma` |
| Hosting | Hostinger VPS scripts, Nginx, PM2, backups, auto-deploy from GitHub | `deploy/`, `.github/workflows/deploy.yml` |

| Hover a dham | Phone view | Admin analytics |
|---|---|---|
| ![Golden Temple doors open](screenshots/hover-golden-temple.png) | ![Phone view](screenshots/phone-view.png) | ![Analytics](screenshots/admin-analytics.png) |

## Guides

| # | Guide | Read it when you want to… |
|---|---|---|
| 01 | [Roadmap](01-roadmap.md) | see the phases, timeline and running costs |
| 02 | [Architecture (HLD + LLD + tech stack)](02-architecture.md) | understand how the system is designed |
| 03 | [Database design](03-database.md) | see the tables and how they connect |
| 04 | [API reference](04-api.md) | see every endpoint the website and app use |
| 05 | [Hostinger hosting reference](05-hostinger-deployment.md) | server layout and production settings |
| 06 | [**Code walkthrough – every file explained**](06-code-walkthrough.md) | understand or change any piece of code |
| 07 | [**Cursor → GitHub → Hostinger, and what to buy**](07-cursor-github-hostinger.md) | go from your laptop to a live website |
| 08 | [**Your data, admin panel and analytics**](08-admin-data-analytics.md) | know where data is stored and how to analyse it |
| 09 | [**Growing: interface, API, database, servers**](09-expansion.md) | add partner operators, languages, more traffic |
| 10 | [**Android app**](10-android-app.md) | build and publish the mobile app |

## Quick answers

**How do I run it?** Install Node.js, Git, Docker Desktop and Cursor, open this folder in Cursor and follow the
[README](../README.md) – four commands, then open http://localhost:5173. → [Guide 07 §7.2–7.4](07-cursor-github-hostinger.md)

**How does code reach the live site?** Edit in Cursor → commit & push to GitHub → on every push to `main`, GitHub
Actions logs into your Hostinger VPS and runs `deploy/deploy.sh`. Set up once with three secrets. → [Guide 07 §7.8](07-cursor-github-hostinger.md)

**What do I need to buy?** A domain (≈ ₹500–1,500/year) and a Hostinger KVM 2 VPS (≈ ₹600–1,000/month). Razorpay is free
to open and charges ≈ 2 % per payment. SSL, GitHub and Cursor's free plan cost nothing. Google Play is US$25 once for the
Android app. Roughly ₹10–15k for the first year. Check current prices. → [Guide 07 §7.1](07-cursor-github-hostinger.md)

**Where is the data?** In a MySQL database on your VPS (customers, packages, bookings, payments, reviews); photos in
`server/uploads` on the VPS; card/UPI details stay with Razorpay. Daily backups of both. → [Guide 08 §8.1](08-admin-data-analytics.md)

**How does the admin see it?** `yourdomain.com/admin`: Overview, Bookings, Packages, Analytics (revenue by month, top
journeys, destinations, conversion, repeat customers, seats filled) and Excel export. Advanced: database apps or Metabase
through an SSH tunnel. → [Guide 08 §8.2–8.4](08-admin-data-analytics.md)

**How do I add real photos?** Admin → Packages → **Photos** → *Add photos*. The first photo is the cover. → [Guide 08 §8.5](08-admin-data-analytics.md)

**What changes when we expand?** Partner operators (multi-vendor) need `Vendor`, `Payout`, `Coupon`, `Refund`,
`Traveler`, `PackageTranslation` tables, a partner portal, `/api/v1` versioning, roles and Razorpay Route for
commission splits. Servers grow from one VPS to CDN + object storage + separate database. → [Guide 09](09-expansion.md)

**How do we build the Android app?** Wrap the existing React site with Capacitor (≈ 90 % code reuse, 2–4 weeks), same
API and database, Razorpay native UPI plugin, push notifications, then publish on Google Play. → [Guide 10](10-android-app.md)

## Preview without a server

`cd client && npm run build:demo` builds a stand-alone preview (`client/dist-demo/`) where the API is simulated in the
browser with sample data. Use it to show the design to others; payments are fake and data stays in the browser.
