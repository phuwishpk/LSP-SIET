"""Path -> minimum role policy (api/auth_roles.py)."""

import pytest

from api.auth_roles import required_role, role_allows


@pytest.mark.parametrize(
    "method, path, expected",
    [
        ("GET", "/api/community/knowledge", None),  # every signed-in user
        ("POST", "/api/community/ask", None),
        ("GET", "/api/notebooks", "teacher"),
        ("GET", "/api/notebooks/notebook:abc", "teacher"),
        ("GET", "/api/transformations", "teacher"),
        ("GET", "/api/credentials", "admin"),
        ("GET", "/api/admin/users", "admin"),
        # settings: staff may read the defaults, only admins may change them
        ("GET", "/api/settings", "teacher"),
        ("HEAD", "/api/settings", "teacher"),
        ("GET", "/api/settings/", "teacher"),
        ("PUT", "/api/settings", "admin"),
        ("POST", "/api/settings", "admin"),
        ("GET", "/api/settings/anything-else", "admin"),
    ],
)
def test_required_role(method, path, expected):
    assert required_role(path, method) == expected


def test_method_defaults_to_get():
    assert required_role("/api/settings") == "teacher"


def test_students_are_still_locked_out_of_settings():
    assert not role_allows("student", required_role("/api/settings", "GET"))
    assert role_allows("teacher", required_role("/api/settings", "GET"))
    assert not role_allows("teacher", required_role("/api/settings", "PUT"))
    assert role_allows("admin", required_role("/api/settings", "PUT"))
