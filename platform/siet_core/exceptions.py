class SietError(Exception):
    """Base exception class for LSP-SIET errors."""

    pass


class DatabaseOperationError(SietError):
    """Raised when a database operation fails."""

    pass


class UnsupportedTypeException(SietError):
    """Raised when an unsupported type is provided."""

    pass


class InvalidInputError(SietError):
    """Raised when invalid input is provided."""

    pass


class NotFoundError(SietError):
    """Raised when a requested resource is not found."""

    pass


class AuthenticationError(SietError):
    """Raised when there's an authentication problem."""

    pass


class ConfigurationError(SietError):
    """Raised when there's a configuration problem."""

    pass


class ExternalServiceError(SietError):
    """Raised when an external service (e.g., AI model) fails."""

    pass


class IncompleteGenerationError(ExternalServiceError):
    """The model returned truncated or empty output; do not retry automatically."""

    pass


class ContextLengthExceededError(ExternalServiceError):
    """Content exceeds the model's context window. Retrying sends the same
    oversized payload, so background commands must not retry this."""

    pass


class RateLimitError(SietError):
    """Raised when a rate limit is exceeded."""

    pass


class FileOperationError(SietError):
    """Raised when a file operation fails."""

    pass


class NetworkError(SietError):
    """Raised when a network operation fails."""

    pass


class NoTranscriptFound(SietError):
    """Raised when no transcript is found for a video."""

    pass
