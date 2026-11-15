"""
Credentials encrypted under the old key setting still decrypt.

Stored API keys are encrypted with a Fernet key derived from the operator's
encryption-key setting. Renaming the setting to LSP_SIET_ENCRYPTION_KEY must not
change the key, or every stored credential becomes unreadable.
"""

import pytest

from siet_core.utils import encryption as enc

OLD = "OPEN_NOTEBOOK_ENCRYPTION_KEY"
NEW = "LSP_SIET_ENCRYPTION_KEY"


def _use_only(monkeypatch, **names: str) -> None:
    """Set exactly these encryption-key variables and drop every cached key."""
    for name in (OLD, NEW, f"{OLD}_FILE", f"{NEW}_FILE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in names.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(enc, "_ENCRYPTION_KEY", None)
    monkeypatch.setattr(enc, "_FERNET", None)
    monkeypatch.setattr(enc, "_FERNET_LEGACY", None)


@pytest.fixture(autouse=True)
def fast_kdf(monkeypatch):
    # Same derivation on both sides of each test; the cost is not under test.
    monkeypatch.setattr(enc, "PBKDF2_ITERATIONS", 1_000)


def test_credentials_decrypt_with_old_key_name(monkeypatch):
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k")
    stored = enc.encrypt_value("sk-live-credential")

    # A fresh process: the key is read again, and only the old name is set.
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k")

    assert enc.decrypt_value(stored) == "sk-live-credential"


def test_credentials_encrypted_under_the_old_name_decrypt_after_renaming(monkeypatch):
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k")
    stored = enc.encrypt_value("sk-live-credential")

    _use_only(monkeypatch, LSP_SIET_ENCRYPTION_KEY="k")

    assert enc.decrypt_value(stored) == "sk-live-credential"


def test_credentials_old_key_name_through_a_docker_secret_file(monkeypatch, tmp_path):
    secret = tmp_path / "encryption_key"
    secret.write_text("k\n")
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k")
    stored = enc.encrypt_value("sk-live-credential")

    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY_FILE=str(secret))

    assert enc.decrypt_value(stored) == "sk-live-credential"
