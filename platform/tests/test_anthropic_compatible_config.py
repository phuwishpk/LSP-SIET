"""Chat model resolution must not fall back from an Anthropic-compatible endpoint (#1347).

These two tests lived in the podcast test module and cover code the chat path
still uses (``ModelManager.get_model`` / ``resolve_anthropic_compatible_config``).
"""

from unittest.mock import AsyncMock, patch

import pytest

from siet_core.ai.models import Model
from siet_core.exceptions import ConfigurationError


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["missing_key", "missing_url", "rejected_url"])
async def test_chat_rejects_invalid_compatible_environment(monkeypatch, invalid):
    from siet_core.ai.models import ModelManager

    monkeypatch.setenv(
        "ANTHROPIC_COMPATIBLE_API_KEY", "" if invalid == "missing_key" else "test-key"
    )
    monkeypatch.setenv(
        "ANTHROPIC_COMPATIBLE_BASE_URL",
        "" if invalid == "missing_url" else "https://rejected.example.invalid",
    )
    monkeypatch.setenv("ANTHROPIC_API_KEY", "unrelated-official-key")
    model = Model(
        id="model:environment",
        name="compatible-model",
        provider="anthropic_compatible",
        type="language",
    )
    validator = AsyncMock(
        side_effect=ValueError("URL rejected") if invalid == "rejected_url" else None
    )
    with (
        patch.object(Model, "get", AsyncMock(return_value=model)),
        patch("siet_core.ai.key_provider.provision_provider_keys", AsyncMock()),
        patch("siet_core.ai.models.validate_url", validator),
        patch("siet_core.ai.models.AIFactory.create_language") as factory,
    ):
        with pytest.raises(ConfigurationError):
            await ModelManager().get_model("model:environment", max_tokens=2048)
    factory.assert_not_called()
    if invalid == "rejected_url":
        validator.assert_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["api_key", "base_url"])
@pytest.mark.parametrize("via_override", [False, True], ids=["config", "override"])
async def test_compatible_config_rejects_explicit_none(field, via_override):
    from siet_core.ai.models import resolve_anthropic_compatible_config

    config: dict[str, str | None] = {
        "api_key": "test-compatible-key",
        "base_url": "https://compatible.example.invalid",
    }
    overrides: dict[str, str | None] = {}
    if via_override:
        overrides[field] = None
    else:
        config[field] = None

    with (
        patch("siet_core.ai.models.validate_url", AsyncMock()) as validator,
        pytest.raises(ConfigurationError, match="require a base URL and API key"),
    ):
        await resolve_anthropic_compatible_config(config, **overrides)
    validator.assert_not_awaited()
