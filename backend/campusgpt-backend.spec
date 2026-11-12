# PyInstaller spec for the CampusGPT backend bundled into the desktop app.
# Build from backend/:   venv\Scripts\pyinstaller campusgpt-backend.spec --noconfirm
# Output:                backend/dist/campusgpt-backend/campusgpt-backend.exe
#
# NOTE: backend/.env is deliberately NOT bundled — Electron supplies config via
# environment variables so no API key ever ships inside the installer.

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

PROJECT_ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

datas, binaries, hiddenimports = [], [], []

# Packages with data files, native libs, or dynamic imports PyInstaller can't see.
for pkg in ("chromadb", "onnxruntime", "tiktoken", "tiktoken_ext", "pymupdf", "fitz",
            "langchain_google_genai", "google.genai", "sse_starlette"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("app")
hiddenimports += collect_submodules("pipeline")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("passlib.handlers")
hiddenimports += [
    "langchain_community.vectorstores.chroma",
    "langchain_text_splitters",
    "email_validator",
    "jose.backends.cryptography_backend",
    "tiktoken_ext.openai_public",
]

a = Analysis(
    ["run_server.py"],
    pathex=[SPECPATH, PROJECT_ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "pytest", "chromadb.test"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="campusgpt-backend",
    console=True,  # Electron hides the window (windowsHide) and captures stdout/stderr
    upx=False,
)

coll = COLLECT(exe, a.binaries, a.datas, name="campusgpt-backend", upx=False)
