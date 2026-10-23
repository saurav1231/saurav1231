"""Errors become JSON like {"error": "message", "details": {...}} - the shape the website expects."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("ayana")


class HttpError(Exception):
    def __init__(self, status: int, message: str, details: dict | None = None):
        self.status, self.message, self.details = status, message, details


def bad_request(msg, details=None):
    return HttpError(400, msg, details)


def unauthorized(msg="Please log in"):
    return HttpError(401, msg)


def forbidden(msg="Not allowed"):
    return HttpError(403, msg)


def not_found(msg="Not found"):
    return HttpError(404, msg)


def conflict(msg):
    return HttpError(409, msg)


def register_error_handlers(app: FastAPI):
    @app.exception_handler(HttpError)
    async def _http_error(_req: Request, exc: HttpError):
        body = {"error": exc.message}
        if exc.details:
            body["details"] = exc.details
        return JSONResponse(body, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError):
        details: dict[str, list[str]] = {}
        for err in exc.errors():
            field = str(err["loc"][-1]) if err.get("loc") else "body"
            details.setdefault(field, []).append(err["msg"].removeprefix("Value error, "))
        return JSONResponse({"error": "Invalid input", "details": details}, status_code=400)

    @app.exception_handler(IntegrityError)
    async def _integrity(_req: Request, exc: IntegrityError):
        if "Duplicate entry" in str(exc.orig):
            return JSONResponse({"error": "Already exists"}, status_code=409)
        log.exception("Database integrity error")
        return JSONResponse({"error": "Invalid data"}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _starlette(req: Request, exc: StarletteHTTPException):
        msg = f"Route not found: {req.method} {req.url.path}" if exc.status_code == 404 else str(exc.detail)
        return JSONResponse({"error": msg}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_req: Request, exc: Exception):
        log.exception("Unexpected error", exc_info=exc)
        return JSONResponse({"error": "Something went wrong. Please try again."}, status_code=500)
