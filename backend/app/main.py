from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
from app.core.config import get_settings
from app.core.db import init_db
from app.api import solar, demand, vpp, grid, panels, misc, auth

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title="Smart energy optimization and demand response", version="1.0.0",
                  description="Smart energy optimization and demand-response platform (VPP decision loop).",
                  openapi_tags=[
                      {"name": "solar"}, {"name": "demand"}, {"name": "vpp"},
                      {"name": "grid"}, {"name": "panels"}, {"name": "ledger"},
                  ])
    origins = [o.strip() for o in settings.cors_origins.split(",")]
    app.add_middleware(CORSMiddleware, allow_origins=origins + ["*"],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        rid = str(uuid.uuid4())[:8]
        try:
            resp = await call_next(request)
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": str(e), "request_id": rid})
        resp.headers["X-Request-ID"] = rid
        return resp

    @app.on_event("startup")
    def _startup():
        init_db()
        from app.core.security import ensure_default_users
        ensure_default_users()
        # warm models (train on synthetic, cache artifacts)
        try:
            from app.ml.solar import forecast_solar
            from app.ml.demand import forecast_demand
            forecast_solar(23.8, 90.4, 50.0, 6, 0)
            forecast_demand("bd-dhaka", 6, 100.0, [18, 19, 20], 0)
        except Exception:
            pass

    prefix = settings.api_v1
    app.include_router(solar.router, prefix=prefix)
    app.include_router(demand.router, prefix=prefix)
    app.include_router(vpp.router, prefix=prefix)
    app.include_router(grid.router, prefix=prefix)
    app.include_router(panels.router, prefix=prefix)
    app.include_router(misc.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix)

    from pathlib import Path as _Path
    dist = _Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if (dist / "index.html").exists():
        # Production (e.g. Render): single service serves the built SPA.
        # API/docs routes above take precedence; everything else falls through here.
        from fastapi.responses import FileResponse
        from fastapi.staticfiles import StaticFiles
        assets = dist / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            try:
                resolved = (dist / path).resolve()
                base = dist.resolve()
                if resolved != base and base not in resolved.parents:
                    raise RuntimeError("outside dist")
            except RuntimeError:
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            if resolved.is_file():
                return FileResponse(resolved)
            return FileResponse(dist / "index.html")
    else:
        # Local dev: vite serves the frontend; API root stays JSON.
        @app.get("/", tags=["health"])
        def root():
            return {"app": "Smart energy optimization and demand response", "docs": "/docs", "api": prefix}

    return app


app = create_app()
