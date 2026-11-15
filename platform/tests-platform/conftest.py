"""
Run these tests from platform/ with its virtualenv (see `make test-backend`):
the package imports siet_core and api, which live there.
"""

import os
import sys
from pathlib import Path

# Same bootstrap as platform/tests/conftest.py: no password gate, .env loaded,
# platform/ importable.
os.environ["LSP_SIET_PASSWORD"] = ""
os.environ["OPEN_NOTEBOOK_PASSWORD"] = ""  # the old name is a fallback: blank it too

from dotenv import load_dotenv

platform_root = Path(__file__).resolve().parents[1]
dotenv_path = platform_root / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

sys.path.insert(0, str(platform_root))
