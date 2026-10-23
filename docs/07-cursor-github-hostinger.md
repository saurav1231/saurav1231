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
| Python, Node.js, Git, Docker Desktop | Yes (laptop) | python.org, nodejs.org, git-scm.com, docker.com | Free |
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

1. Install **Python 3.12 or newer** – python.org → Downloads. On Windows tick **"Add python.exe to PATH"**.
2. Install **Node.js LTS** (version 22) – nodejs.org → "LTS". Only needed to build the website.
3. Install **Git** – git-scm.com → download → defaults.
4. Install **Docker Desktop** – it runs MySQL for you. (Or install MySQL directly.)
5. Install **Cursor** – cursor.com → sign in. Accept its offer to install the **Python** extension.
6. Tell Git who you are (Cursor → Terminal → New Terminal):
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

You will use three terminals in Cursor (``Ctrl+` `` opens one, the **+** button adds more).

**Terminal 1 – database and API (Python)**
```bash
docker compose up -d                  # start MySQL
cd api
python -m venv .venv                  # a private folder for this project's Python libraries
source .venv/bin/activate             # Windows: .venv\Scripts\activate   (you'll see "(.venv)" in the prompt)
pip install -r requirements.txt
cp .env.example .env                  # Windows: copy .env.example .env
alembic upgrade head                  # create the tables
python -m scripts.seed                # demo journeys + admin user
python -m scripts.sample_data         # optional: 2 years of sample customers so analytics have data
uvicorn app.main:app --reload --port 8000
```
**Terminal 2 – website**
```bash
cd client
npm install
npm run dev
```
**Terminal 3 – Ayana Insights (analytics)**
```bash
cd analytics
python -m venv .venv
source .venv/bin/activate             # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run Home.py
```
Open http://localhost:5173 (website), http://localhost:8000/docs (try the API) and http://localhost:8501 (Insights).
Admin: `admin@ayana.travel` / `Admin@12345`. In Cursor, choose the interpreter `api/.venv` (bottom-right "Python")
so it understands the code.

Run the tests any time: `cd api && pytest` and `cd analytics && pytest`.

**Using Cursor's AI:** `Ctrl+L` opens chat (ask "explain api/app/services/booking.py" or "add a phone field to
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
The script prints two database addresses – copy both (one for `api/.env`, one for `analytics/.env`).

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
cp api/.env.example api/.env && nano api/.env
```
Fill `api/.env` as shown in [05-hostinger-deployment.md §5.3](05-hostinger-deployment.md) (production values,
`PAYMENT_MODE=razorpay`, your keys, the printed `DATABASE_URL`, a long random `JWT_SECRET`).
**Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your own** – the seed creates the admin account with them (the demo password is for your laptop only).
Save: `Ctrl+O`, `Enter`, `Ctrl+X`. Then the analytics settings:
```bash
cp analytics/.env.example analytics/.env && nano analytics/.env   # paste the printed ANALYTICS_DATABASE_URL
```

```bash
mkdir -p logs
bash deploy/deploy.sh                                  # Python packages, tables, website build
(cd api && .venv/bin/python -m scripts.seed)           # first time only: journeys + your admin user
exit                                                   # back to root
cp /var/www/ayana/deploy/ayana-api.service /var/www/ayana/deploy/ayana-insights.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ayana-api ayana-insights        # start now and after every reboot
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
don't sell and add your own (Admin → Packages). Analytics: **https://yourdomain.com/insights/**.

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
5. Push any change to `main` → GitHub → **Actions** tab shows "Test and deploy" running: *test* runs the API and analytics tests and builds the website,
   *deploy* logs into the VPS and runs `deploy/deploy.sh`. Green tick = live. Red cross = click it to read the error;
   the live site stays on the previous version.

## 7.9 Turn on real payments

1. Razorpay Dashboard → complete **KYC** (business details, bank account, website URL with the policy pages).
2. **Test mode** first: Settings → API Keys → generate `rzp_test_…` keys → put them in `api/.env` → `sudo systemctl restart ayana-api`.
3. Webhooks → Add: URL `https://yourdomain.com/api/payments/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`,
   events `payment.captured`, `payment.failed`, `order.paid`.
4. Make test bookings (test UPI id `success@razorpay`, test cards from Razorpay docs).
5. After KYC approval: generate **Live** keys, add the same webhook in Live mode, update `.env`, reload. You are taking real payments.

## 7.10 Day-to-day on the server

| Task | Command (after `ssh ayana@<VPS IP>`) |
|---|---|
| See API logs | `journalctl -u ayana-api -f` |
| See Insights logs | `journalctl -u ayana-insights -f` |
| Restart | `sudo systemctl restart ayana-api` (or `ayana-insights`) |
| Is it running? | `systemctl status ayana-api` · `curl -s localhost:8000/api/health` |
| Deploy by hand | `cd /var/www/ayana && bash deploy/deploy.sh` |
| Daily backups | `crontab -e` → `30 2 * * * bash /var/www/ayana/deploy/backup-db.sh >> /var/www/ayana/logs/backup.log 2>&1` |
| Disk space | `df -h` |
| Server updates (monthly) | as root: `apt update && apt upgrade -y` |
