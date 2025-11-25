from fastapi import FastAPI

from app.api.routes import health
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="AutoRouter API",
        version=settings.version,
    )
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
