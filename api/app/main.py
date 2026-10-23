"""Ayana API entry point.

Run locally:   uvicorn app.main:app --reload --port 8000
Interactive API docs (try every endpoint in the browser): http://localhost:8000/docs
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import API_ROOT, get_settings
from .errors import register_error_handlers
from .routers import admin, auth, bookings, catalog, payments
from .services.booking import expire_stale_bookings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ayana")
settings = get_settings()


async def expiry_loop():
    """Every 60 seconds, free seats held by unpaid bookings."""
    while True:
        await asyncio.sleep(60)
        try:
            await run_in_threadpool(expire_stale_bookings)
        except Exception:
            log.exception("Seat-expiry job failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.is_production and settings.payment_mode == "mock":
        log.warning("PAYMENT_MODE=mock in production: customers can confirm bookings without paying!")
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    task = asyncio.create_task(expiry_loop())
    log.info("Ayana API ready (payments: %s)", settings.payment_mode)
    yield
    task.cancel()


app = FastAPI(title="Ayana API", version="2.0", lifespan=lifespan,
              docs_url="/docs", redoc_url=None, openapi_url="/api/openapi.json")
register_error_handlers(app)

app.add_middleware(CORSMiddleware, allow_origins=settings.client_urls, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    from .models import utcnow
    from .serializers import iso

    return {"ok": True, "time": iso(utcnow())}


api.include_router(auth.router)
api.include_router(catalog.router)
api.include_router(bookings.router)
api.include_router(payments.router)
api.include_router(admin.router)
# Razorpay webhook: reads the raw body itself, no login
api.add_api_route("/payments/webhook", payments.razorpay_webhook, methods=["POST"], include_in_schema=False)
app.include_router(api)

# Uploaded photos (on the VPS, Nginx serves this folder directly)
settings.upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")

# Optional: serve the built website too (for hosting without Nginx)
if settings.serve_client:
    dist = (API_ROOT.parent / "client" / "dist").resolve()
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            from fastapi import HTTPException

            raise HTTPException(404)
        file = (dist / path).resolve()
        if path and dist in file.parents and file.is_file():
            return FileResponse(file)
        return FileResponse(dist / "index.html")
