"""
Run these tests from open-notebook/ with its virtualenv (see `make test-backend`):
the package imports open_notebook and api, which live there.
"""

import os
import sys
from pathlib import Path

# Same bootstrap as open-notebook/tests/conftest.py: no password gate, .env loaded,
# open-notebook/ importable.
os.environ["OPEN_NOTEBOOK_PASSWORD"] = ""

from dotenv import load_dotenv

open_notebook_root = Path(__file__).resolve().parents[2] / "open-notebook"
dotenv_path = open_notebook_root / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

sys.path.insert(0, str(open_notebook_root))
