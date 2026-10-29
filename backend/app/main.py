import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.errors import ApiError
from app.routers import admin, auth, billing, concierge, itineraries, matching, me, meta, places

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("app")
settings = get_settings()

app = FastAPI(title=f"{settings.app_name} API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
}


@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError):
    return JSONResponse({"detail": exc.detail, "code": exc.code}, status_code=exc.status_code)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        {"detail": exc.detail, "code": CODES.get(exc.status_code, "error")}, status_code=exc.status_code
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse(
        {
            "detail": f"Champ invalide : {field} — {first.get('msg', '')}".strip(),
            "code": "validation_error",
            "errors": [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()],
        },
        status_code=422,
    )


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception(
        "Erreur non gérée sur %s %s", request.method, request.url.path
    )  # pas de corps de requête dans les logs
    return JSONResponse({"detail": "Erreur interne", "code": "internal_error"}, status_code=500)


Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")  # photos envoyées (stockage local)

for r in (
    meta.router,
    places.router,
    auth.router,
    me.router,
    itineraries.router,
    concierge.router,
    billing.router,
    admin.router,
    matching.router,
):
    app.include_router(r, prefix="/api/v1")
