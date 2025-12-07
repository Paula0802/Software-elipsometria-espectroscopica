# Wrapper module to allow running `uvicorn main:app` from inside the `src/` folder.
# It simply re-exports the FastAPI `app` defined in `backend.main`.

from backend.main import app  # noqa: F401
