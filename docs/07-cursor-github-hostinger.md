# 7. From Cursor → GitHub → Hostinger → Live website

This is the full path your code takes, and the purchases you need on the way.

```mermaid
flowchart LR
  L["Your laptop<br/>Cursor + local copy"] -- "git push" --> G["GitHub<br/>(code storage + history)"]
  G -- "GitHub Actions<br/>on every push to main" --> V["Hostinger VPS<br/>runs deploy.sh"]
  V --> W["https://yourdomain.com<br/>live for customers"]
```

You write and test on your laptop, save each step to GitHub, and GitHub updates the live server for you.

---

## 7.1 What to buy (and what is free)

| Item | Needed? | Where | Approx. cost* |
|---|---|---|---|
| **Domain name** (e.g. `ayanajourneys.com` or `.in`) | Yes | Hostinger → Domains | ₹500 – 1,500 / year |
| **Hostinger VPS – KVM 2** (2 vCPU, 8 GB RAM, 100 GB disk) | Yes | Hostinger → VPS | ₹600 – 1,000 / month on a 12–24 month plan |
| Razorpay account | Yes | razorpay.com | Free to open; ~2 % per payment (+GST on the fee), ~3 % for international cards |
| SSL certificate (https) | Yes | Let's Encrypt (installed by our script) | Free |
| GitHub account (private repo) | Yes | github.com | Free |
| Cursor editor | Yes | cursor.com | Free plan works; Pro ≈ US$20 / month for more AI usage |
| Node.js, Git, Docker Desktop | Yes (laptop) | nodejs.org, git-scm.com, docker.com | Free |
| Professional email (hello@yourdomain.com) | Recommended | Hostinger Email or Google Workspace | ≈ ₹100 – 250 per mailbox / month |
| Google Play developer account | For the Android app | play.google.com/console | US$25 once |
| Apple developer account | Only for an iPhone app | developer.apple.com | US$99 / year |
| Uptime monitoring, Google Analytics | Recommended | uptimerobot.com, analytics.google.com | Free |
| Photographer / 3D artist / logo | Optional | – | depends |

\*Prices change often and depend on offers – check the current price before paying.
**Business paperwork** (talk to your CA): GST registration (tour operators usually charge 5 % GST), a current bank account for
Razorpay settlements, PAN, and the policy pages Razorpay asks for (Terms, Privacy, Refund & Cancellation, Contact).

**Total to go live:** roughly ₹10,000 – 15,000 for the first year (VPS + domain), plus Razorpay fees per booking.

---

## 7.2 Set up your laptop (once)

1. Install **Node.js LTS** (version 22) – nodejs.org → "LTS" → install with defaults.
2. Install **Git** – git-scm.com → download → defaults.
3. Install **Docker Desktop** – it runs MySQL for you. (Or install MySQL directly.)
4. Install **Cursor** – cursor.com → sign in.
5. Tell Git who you are (Cursor → Terminal → New Terminal):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

## 7.3 Give Ayana its own GitHub repository (recommended)

The code currently sits in `saurav1231/saurav1231`. That name is special on GitHub: its README shows on your public
profile page. Give Ayana its own **private** repository:

1. github.com → **+** → **New repository** → name `ayana` → **Private** → *don't* add a README → Create.
2. In Cursor: **File → Open Folder** → pick an empty folder, then in the terminal:
   ```bash
   git clone https://github.com/saurav1231/saurav1231.git ayana
   cd ayana
   git checkout claude/ayana-travel-marketplace-o19uk8
   git checkout -b main                     # this becomes your live branch
   git remote set-url origin https://github.com/saurav1231/ayana.git
   git push -u origin main
   ```
   Cursor will ask you to sign in to GitHub the first time – accept.
3. **File → Open Folder → ayana**. You now see all the files on the left.

## 7.4 Run it on your laptop

In Cursor's terminal (``Ctrl+` ``):
```bash
docker compose up -d                 # start MySQL
npm run setup                        # install libraries (takes a few minutes)
cp server/.env.example server/.env   # Windows: copy server\.env.example server\.env
npm run db:setup                     # tables + demo packages + admin user
npm --prefix server run db:sample    # optional: fake bookings so Analytics has data
npm run dev:server                   # terminal 1 – API on :4000
npm run dev:client                   # terminal 2 – website on :5173
```
Open http://localhost:5173. Admin: `admin@ayana.travel` / `Admin@12345`.

**Using Cursor's AI:** `Ctrl+L` opens chat (ask "explain server/src/services/bookingService.js" or "add a phone field to
the register form"), `Ctrl+K` edits the selected code, type `@` to point it at a file or a doc such as `@docs/06-code-walkthrough.md`.
Always run the site and click through the change before you commit it.

## 7.5 Saving your work to GitHub (every day)

Cursor's **Source Control** panel (the branch icon on the left):
1. You see every changed file. Click a file to see exactly what changed.
2. Type a message ("Add Hindi descriptions to Kedarnath") → **Commit**.
3. Click **Sync Changes** (or run `git push`). Your code is now safe on GitHub.

**Branches – keep the live site safe**
- `main` = what customers see. Every push to `main` goes live automatically (section 7.8).
- For bigger changes: bottom-left branch name → **Create new branch** (`feature/coupons`) → work and push →
  on GitHub open a **Pull Request** → review the changes → **Merge** into `main` → it deploys.
- Made a mistake on the live site? On GitHub open the bad commit → **Revert** → merge. The previous version goes live again.

## 7.6 Buy and prepare Hostinger

1. **Domain**: hPanel → Domains → search → buy.
2. **VPS**: hPanel → VPS → **KVM 2** → choose a location near your customers (India/Asia) → OS: **Ubuntu 24.04** (plain).
   Set a strong root password. Copy the **IP address**.
3. **Point the domain** at the VPS: hPanel → Domains → your domain → **DNS / Nameservers** → DNS records:
   `A @ → <VPS IP>` and `A www → <VPS IP>` (delete other A records for @ and www). Wait 15 min – a few hours.

## 7.7 First install on the server

In Cursor's terminal on your laptop (inside the `ayana` folder):
```bash
scp deploy/setup-vps.sh root@<VPS IP>:/root/     # copy the setup script to the server (type the root password)
ssh root@<VPS IP>
bash /root/setup-vps.sh yourdomain.com you@email.com
```
The script prints a `DATABASE_URL` – copy it.

**Let the server read your private repo (deploy key)** – still on the server:
```bash
su - ayana
ssh-keygen -t ed25519 -C "ayana-vps" -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```
Copy the printed line → GitHub repo → **Settings → Deploy keys → Add deploy key** → paste → *Allow write access: off* → Add.
```bash
git clone git@github.com:saurav1231/ayana.git /var/www/ayana
cd /var/www/ayana
cp server/.env.example server/.env && nano server/.env
```
Fill `server/.env` as shown in [05-hostinger-deployment.md §4](05-hostinger-deployment.md) (production values,
`PAYMENT_MODE=razorpay`, your keys, the printed `DATABASE_URL`, a long random `JWT_SECRET`).
**Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your own** – the seed creates the admin account with them (the demo password is for your laptop only).
Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
bash deploy/deploy.sh          # install, create tables, build site, start API
cd server && npm run db:seed && cd ..   # first time only: demo packages + admin user
exit                           # back to root
pm2 startup systemd -u ayana --hp /home/ayana   # copy-paste the command it prints
```
Then Nginx + HTTPS (as root):
```bash
cp /var/www/ayana/deploy/nginx.conf /etc/nginx/sites-available/ayana
sed -i 's/ayana.travel/yourdomain.com/g' /etc/nginx/sites-available/ayana
ln -sf /etc/nginx/sites-available/ayana /etc/nginx/sites-enabled/ayana
rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com -m you@email.com --agree-tos -n
```
Open **https://yourdomain.com** – your site is live. Log in with your admin email, then hide the demo packages you
don't sell and add your own (Admin → Packages).

## 7.8 Automatic deploys from GitHub (do once)

So that every push to `main` updates the server by itself:

1. On your **laptop** make a key just for GitHub Actions:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -N "" -f ayana_deploy
   ```
   This creates `ayana_deploy` (private) and `ayana_deploy.pub` (public).
2. Put the public half on the server: `ssh root@<VPS IP>` then
   `nano /home/ayana/.ssh/authorized_keys` → paste the content of `ayana_deploy.pub` on a new line → save.
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `VPS_HOST` = VPS IP
   - `VPS_USER` = `ayana`
   - `VPS_SSH_KEY` = the full content of the private file `ayana_deploy`
4. Delete the two key files from your laptop's project folder (never commit them).
5. Push any change to `main` → GitHub → **Actions** tab shows "Deploy to Hostinger" running: *build* checks the code,
   *deploy* logs into the VPS and runs `deploy/deploy.sh`. Green tick = live. Red cross = click it to read the error;
   the live site stays on the previous version.

## 7.9 Turn on real payments

1. Razorpay Dashboard → complete **KYC** (business details, bank account, website URL with the policy pages).
2. **Test mode** first: Settings → API Keys → generate `rzp_test_…` keys → put them in `server/.env` → `pm2 reload ayana-api`.
3. Webhooks → Add: URL `https://yourdomain.com/api/payments/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`,
   events `payment.captured`, `payment.failed`, `order.paid`.
4. Make test bookings (test UPI id `success@razorpay`, test cards from Razorpay docs).
5. After KYC approval: generate **Live** keys, add the same webhook in Live mode, update `.env`, reload. You are taking real payments.

## 7.10 Day-to-day on the server

| Task | Command (after `ssh ayana@<VPS IP>`) |
|---|---|
| See API logs | `pm2 logs ayana-api` |
| Restart API | `pm2 reload ayana-api` |
| Is it running? | `pm2 status` · `curl -s localhost:4000/api/health` |
| Deploy by hand | `cd /var/www/ayana && bash deploy/deploy.sh` |
| Daily backups | `crontab -e` → `30 2 * * * bash /var/www/ayana/deploy/backup-db.sh >> /var/www/ayana/logs/backup.log 2>&1` |
| Disk space | `df -h` |
| Server updates (monthly) | as root: `apt update && apt upgrade -y` |
