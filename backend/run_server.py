"""
run_server.py — Entry point for the bundled (PyInstaller) backend used by the
desktop app. Electron launches it with a free port and passes configuration
(GOOGLE_API_KEY, JWT_SECRET, CAMPUSGPT_DATA_DIR, CHROMA_PERSIST_DIR) through
environment variables.

Usage:
    campusgpt-backend.exe --port 8765
    python run_server.py --port 8765        (same thing, unbundled)
"""

import argparse
import multiprocessing
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="CampusGPT backend server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    # Make `pipeline` importable when running unbundled from backend/.
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    import uvicorn
    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
