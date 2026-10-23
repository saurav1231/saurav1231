# 10. Building the Ayana Android app

The app will use the **same API and database** as the website, so a booking made on the phone appears instantly in
the admin panel. The only question is how much of the website code we reuse.

## 10.1 Three ways to build it

| | A. TWA / PWA wrapper | **B. Capacitor (recommended first)** | C. React Native (Expo) |
|---|---|---|---|
| What it is | The website in a full-screen Chrome window, listed on Play Store | Your React website packaged inside a real Android app, with access to phone features | A separate app written with native screens |
| Code reused from the website | 100 % | ~90 % (same React pages and 3D scene) | API, business rules and ideas; screens are rewritten |
| Push notifications, UPI apps, offline | Limited | Yes (plugins) | Yes |
| Feel | Website-like | Close to native | Fully native |
| Time for one developer | 2–4 days | **2–4 weeks** | 2–3 months |
| Later iPhone app | No | Same code, small changes | Same code |

**Recommendation:** start with **Capacitor**. It reuses the React code in `client/`, ships fast, and supports push
notifications and Razorpay's native UPI flow. Move to React Native only if the app needs heavy native features later.

## 10.2 What changes in the backend first

1. **API versioning**: serve routes at `/api/v1` too ([09-expansion.md §9.2](09-expansion.md)) – apps on people's
   phones can't be updated instantly, so the API must stay backward-compatible.
2. **CORS**: Capacitor's Android web view uses the origin `https://localhost`. Add it to `CLIENT_URL`:
   `CLIENT_URL=https://yourdomain.com,https://localhost`.
3. **Longer logins**: add refresh tokens (`POST /api/v1/auth/refresh`) so customers stay logged in for months.
4. **Push notifications**: `DeviceToken` table + `POST /api/v1/devices`; send "Booking confirmed", "Your yatra starts tomorrow" via Firebase Cloud Messaging.
5. **Phone OTP login** (recommended for India): `POST /api/v1/auth/otp/send` and `/verify` using MSG91 or Twilio.
6. **App version check**: `GET /api/v1/app-config` returns the minimum supported app version, so you can ask users to update.

## 10.3 Step by step with Capacitor

On your laptop, in the `client` folder:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init Ayana travel.ayana.app --web-dir dist
npx cap add android
```

Create `client/.env.app`:
```env
VITE_API_URL=https://yourdomain.com/api
```
Add to `client/package.json` scripts: `"build:app": "vite build --mode app && npx cap sync android"`.

Code changes (ask Cursor to do each one, using this doc as context):
1. **Router**: use `HashRouter` in the app build (like the preview uses `MemoryRouter`) – in `main.jsx`.
2. **Photos**: already handled – `mediaUrl()` prefixes `/uploads/...` with the API domain when `VITE_API_URL` is set.
3. **Payments**: install a Razorpay Capacitor plugin (`capacitor-razorpay`) so UPI apps (GPay, PhonePe, Paytm) open
   natively. In `Checkout.jsx`, when running inside the app (`Capacitor.isNativePlatform()`), call the plugin with the
   same `orderId`/`keyId` and send its response to `/payments/verify` exactly as today.
4. **Login storage**: use `@capacitor/preferences` instead of `localStorage` for the token.
5. **Push**: `@capacitor/push-notifications` + a Firebase project (free); register the token with `POST /api/v1/devices`.
6. **Back button & links**: `@capacitor/app` to handle Android back; Android App Links so `https://yourdomain.com/packages/kedarnath` opens in the app.
7. **3D on low-end phones**: lower quality automatically – `dpr={[1, 1.25]}`, fewer stars/diyas, or show a still
   image of the dhams when `navigator.hardwareConcurrency <= 4`.
8. **App icon & splash**: `npx @capacitor/assets generate` from a 1024×1024 logo.

Build and test:
```bash
npm run build:app
npx cap open android        # opens Android Studio
```
In Android Studio: plug in your phone (USB debugging on) → ▶ Run. Test booking, payment (Razorpay test mode), push.

## 10.4 Publish on Google Play

1. **Google Play Console** account – US$25 once, with ID verification (can take a few days).
2. Android Studio → **Build → Generate Signed Bundle** → create an upload key (**back it up safely** – you need it for every update) → produces an `.aab` file.
3. Play Console → Create app → fill store listing (title, description, screenshots, feature graphic), **privacy policy URL**,
   **Data safety** form (you collect name, email, phone, payment status), content rating, target audience.
4. Upload to **Internal testing** → test with your team → **Closed testing** (new personal developer accounts must run a
   closed test with testers for some days before production – check Play Console's current requirement) → **Production**.
5. Each update: raise `versionCode` in `android/app/build.gradle`, build a new `.aab`, upload.

## 10.5 Timeline

| Week | Work |
|---|---|
| 1 | API v1 + CORS + refresh tokens; Capacitor setup; app runs on a phone |
| 2 | Razorpay native plugin, push notifications, OTP login, icons/splash |
| 3 | Testing on 3–4 real phones (low and high end), Play Console listing, internal testing |
| 4 | Closed testing → production release |

iPhone later: `npm install @capacitor/ios && npx cap add ios`, build on a Mac with Xcode, Apple developer account (US$99/year).
