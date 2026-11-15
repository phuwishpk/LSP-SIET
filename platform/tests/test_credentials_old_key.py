"""
Credentials encrypted under the old key setting still decrypt.

Stored API keys are encrypted with a Fernet key derived from the operator's
encryption-key setting. Renaming the setting to LSP_SIET_ENCRYPTION_KEY must not
change the key, or every stored credential becomes unreadable.
"""

import pytest
from loguru import logger

from api import main as api_main
from siet_core import env as env_module
from siet_core.exceptions import ConfigurationError
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


# --- two different keys under the two names: no winner (R39) ---------------------------------


def test_both_key_names_with_different_values_refuse_instead_of_choosing(monkeypatch):
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="old-key", LSP_SIET_ENCRYPTION_KEY="new-key")

    with pytest.raises(ConfigurationError) as raised:
        enc.get_secret_from_env(NEW)
    message = str(raised.value)
    assert NEW in message and OLD in message and "different values" in message
    assert "old-key" not in message and "new-key" not in message  # names only, never the secret
    with pytest.raises(ConfigurationError):
        enc.encrypt_value("sk-live-credential")


def test_both_key_names_with_the_same_value_are_fine(monkeypatch):
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k", LSP_SIET_ENCRYPTION_KEY="k")

    assert enc.get_secret_from_env(NEW) == "k"
    assert enc.decrypt_value(enc.encrypt_value("sk-live-credential")) == "sk-live-credential"


def test_a_blank_new_key_name_next_to_the_old_one_is_fine(monkeypatch):
    # .env.example carries `LSP_SIET_ENCRYPTION_KEY=`: copied next to the real old line it is not a conflict
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="k", LSP_SIET_ENCRYPTION_KEY="")

    assert enc.get_secret_from_env(NEW) == "k"


def test_key_files_under_the_two_names_count_as_their_values(monkeypatch, tmp_path):
    old_file, new_file = tmp_path / "old", tmp_path / "new"
    old_file.write_text("old-key\n")
    new_file.write_text("new-key\n")
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY_FILE=str(old_file), LSP_SIET_ENCRYPTION_KEY_FILE=str(new_file))
    with pytest.raises(ConfigurationError):
        enc.get_secret_from_env(NEW)

    new_file.write_text("old-key\n")  # the same key through both secrets
    assert enc.get_secret_from_env(NEW) == "old-key"
    # one name by file, the other by plain variable
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="plain", LSP_SIET_ENCRYPTION_KEY_FILE=str(new_file))
    with pytest.raises(ConfigurationError):
        enc.get_secret_from_env(NEW)


def test_the_jwt_secret_fallback_does_not_pick_a_key_either(monkeypatch):
    """With no JWT_SECRET the login token is signed with the encryption key: same rule."""
    from siet_platform import auth_jwt

    monkeypatch.delenv("JWT_SECRET", raising=False)
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="old-key", LSP_SIET_ENCRYPTION_KEY="new-key")

    with pytest.raises(ConfigurationError):
        auth_jwt.get_jwt_secret()


@pytest.mark.asyncio
async def test_the_api_refuses_to_start_with_two_different_keys(monkeypatch):
    _use_only(monkeypatch, OPEN_NOTEBOOK_ENCRYPTION_KEY="old-key", LSP_SIET_ENCRYPTION_KEY="new-key")

    async def never(*_a, **_k):  # the refusal comes before the database is touched
        raise AssertionError("startup went on to the migrations")

    monkeypatch.setattr(api_main, "_run_database_migrations", never)
    with pytest.raises(ConfigurationError, match="both set, with different values"):
        async with api_main.lifespan(None):  # type: ignore[arg-type]
            pass


def test_other_settings_with_two_values_only_warn(monkeypatch):
    """The password (and every other renamed setting) keeps working; the log says which name wins."""
    messages: list[str] = []
    handler = logger.add(lambda m: messages.append(m.record["message"]), level="WARNING")
    try:
        monkeypatch.setattr(env_module, "_warned", set())
        monkeypatch.setenv("LSP_SIET_PASSWORD", "new-pass")
        monkeypatch.setenv("OPEN_NOTEBOOK_PASSWORD", "old-pass")
        assert enc.get_secret_from_env("LSP_SIET_PASSWORD") == "new-pass"
    finally:
        logger.remove(handler)
    assert any("LSP_SIET_PASSWORD wins" in m for m in messages), messages
