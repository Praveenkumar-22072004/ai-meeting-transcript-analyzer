import os

import uvicorn
from dotenv import load_dotenv

load_dotenv()


def main():
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    # Railway passes port via $PORT
    port = int(os.getenv("PORT", os.getenv("BACKEND_PORT", "8000")))
    reload = os.getenv("RELOAD", "false").lower() in ("true", "1", "yes")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()
