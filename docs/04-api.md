# 4. REST API Reference

Base URL: `https://<your-domain>/api` (local: `http://localhost:8000/api`).

The API is **Python FastAPI** (`api/`). Open **http://localhost:8000/docs** to see every endpoint with its fields and try
them from the browser (click *Authorize* and paste a token from `/api/auth/login` for the protected ones).
All bodies are JSON. Authenticated routes need `Authorization: Bearer <token>`.
Errors look like `{ "error": "message", "details": { "field": ["problem"] } }`.
Amounts are in **paise** (₹1 = 100).

## Auth
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | – | `{ name, email, password, phone? }` | `{ token, user }` |
| POST | `/auth/login` | – | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | user | – | `{ user }` |

## Catalog (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/destinations` | All destinations with `packageCount` (used by the dham chips on the home page) |
| GET | `/categories` | `[{ name, count }]` |
| GET | `/packages` | Query: `search, category, destination (slug), minPrice, maxPrice (₹), maxDays, featured=true, sort=popular\|price_asc\|price_desc\|duration\|newest, page, limit` → `{ packages, page, total, totalPages }` |
| GET | `/packages/:slug` | Package + destination + itinerary + upcoming departures (`seatsLeft`, `price`) + reviews |
| POST | `/packages/:slug/reviews` | user with a CONFIRMED booking; `{ rating 1-5, comment }` |

## Bookings (user)
| Method | Path | Body / notes |
|---|---|---|
| POST | `/bookings` | `{ packageSlug, departureId, travelers, contactName, contactPhone, specialRequests? }` → `201 { booking }` (status PENDING, seats held). `409` if not enough seats |
| GET | `/bookings/me` | My bookings, newest first |
| GET | `/bookings/:id` | One booking (owner or admin) |
| POST | `/bookings/:id/cancel` | Only PENDING bookings; releases seats |

## Payments
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/payments/config` | – | `{ mode: "mock"\|"razorpay", keyId }` |
| POST | `/payments/order` | user | `{ bookingId }` → `{ orderId, amount, currency, keyId, prefill, ... }` |
| POST | `/payments/verify` | user | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → `{ booking }` (CONFIRMED) |
| POST | `/payments/webhook` | Razorpay signature | Set in Razorpay Dashboard → Webhooks. Events: `payment.captured`, `order.paid`, `payment.failed` |

## Admin (role ADMIN)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | Revenue, counts by status, latest bookings |
| GET | `/admin/packages` | All packages incl. hidden, with departures & itinerary |
| POST | `/admin/packages` | Create. Body: `slug, title, summary, description, category, durationDays, pricePerPerson (paise), destinationId, imageUrl?, highlights[], inclusions[], exclusions[], itinerary[{title,description}], isFeatured, isActive, maxGroupSize` |
| PUT | `/admin/packages/:id` | Replace (same body) |
| DELETE | `/admin/packages/:id` | Soft delete (hide) |
| POST | `/admin/packages/:id/departures` | `{ startDate: "2026-12-01", seatsTotal, priceOverride? }` |
| PATCH | `/admin/departures/:id` | Any of the above + `isActive` |
| POST | `/admin/destinations` | `{ slug, name, state?, description, latitude, longitude }` |
| GET | `/admin/bookings?status=CONFIRMED` | Latest 200 bookings with customer and payment info |
| GET | `/admin/analytics?months=12` | Summary numbers, revenue by month, top packages, by destination/category, booking outcomes, seats filled next 60 days |
| GET | `/admin/export/bookings.csv` | All bookings as CSV (Excel) |
| POST | `/admin/packages/:id/images` | `multipart/form-data`, field `images` (up to 12 files, 15 MB each, JPG/PNG/WEBP/AVIF) → resized to WEBP |
| PUT | `/admin/packages/:id/images/order` | `{ ids: [...] }` new order; first = cover |
| PATCH | `/admin/images/:id` | `{ alt }` |
| DELETE | `/admin/images/:id` | Removes the photo and its files |

Photos are served at `/uploads/packages/<packageId>/<name>.webp` (and `-thumb.webp`).

## Example: full flow with curl

```bash
API=http://localhost:8000/api
TOKEN=$(curl -s -X POST $API/auth/register -H 'content-type: application/json' \
  -d '{"name":"Asha","email":"asha@example.com","password":"password123"}' | jq -r .token)
DEP=$(curl -s $API/packages/golden-temple-seva | jq -r '.package.departures[0].id')
BOOKING=$(curl -s -X POST $API/bookings -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"packageSlug\":\"golden-temple-seva\",\"departureId\":\"$DEP\",\"travelers\":2,\"contactName\":\"Asha\",\"contactPhone\":\"9999999999\"}" | jq -r .booking.id)
curl -s -X POST $API/payments/order -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"bookingId\":\"$BOOKING\"}"
```
