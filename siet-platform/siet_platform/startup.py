"""
What the SIET platform adds to the API lifespan (open-notebook emits
``app.startup`` after its own migrations and ``app.shutdown`` on the way out).

Startup, in this order: the KMITL SurrealDB migrations (k-track, fatal on
failure like the core ones), the MariaDB schema, the library reaper, the seed
accounts (admin1, student1-5) with their welcome points and the community demo
data, then the answer-cache tuner and circuit breaker.
"""

import os

from loguru import logger

from open_notebook import extensions
from siet_platform import migrations
from siet_platform.auth_jwt import jwt_auth_enabled


async def run_migrations() -> None:
    ran = await migrations.run_pending()
    if ran:
        logger.success(f"SIET migrations applied: {', '.join(f'k{n}' for n in ran)}")


async def on_startup() -> None:
    # Community / point-wallet schema (idempotent) – must run before seeding.
    try:
        from siet_platform.schema import ensure_schema

        await ensure_schema()
    except Exception as exc:
        logger.error(f"Community MariaDB schema setup failed: {exc}")

    # Library documents whose background ingestion died with the last process.
    try:
        from siet_platform.library import reap_stuck_documents

        await reap_stuck_documents()
    except Exception as exc:
        logger.warning(f"Library reaper skipped: {exc}")

    # Seed: 1 admin + 5 students on MariaDB startup.
    # Set WORKSPACE_SEED_ADMIN=false to disable.
    try:
        from siet_platform.users import (
            USER_ROLE_ADMIN,
            USER_ROLE_STUDENT,
            UserAlreadyExists,
            create as create_user,
            get_by_username,
            update_password,
            verify_password,
        )

        seed_enabled = os.getenv("WORKSPACE_SEED_ADMIN", "true").lower() not in {
            "0",
            "false",
            "no",
        }
        if seed_enabled and jwt_auth_enabled():
            seed_users = [
                {
                    "username": "admin1",
                    "password": os.getenv("WORKSPACE_SEED_ADMIN_PASSWORD", "admin1"),
                    "display_name": "Administrator",
                    "role": USER_ROLE_ADMIN,
                },
                {
                    "username": "student1",
                    "password": "student1",
                    "display_name": "Student 1",
                    "role": USER_ROLE_STUDENT,
                },
                {
                    "username": "student2",
                    "password": "student2",
                    "display_name": "Student 2",
                    "role": USER_ROLE_STUDENT,
                },
                {
                    "username": "student3",
                    "password": "student3",
                    "display_name": "Student 3",
                    "role": USER_ROLE_STUDENT,
                },
                {
                    "username": "student4",
                    "password": "student4",
                    "display_name": "Student 4",
                    "role": USER_ROLE_STUDENT,
                },
                {
                    "username": "student5",
                    "password": "student5",
                    "display_name": "Student 5",
                    "role": USER_ROLE_STUDENT,
                },
            ]
            for u in seed_users:
                seed_password = u["password"]
                existing = await get_by_username(u["username"])
                if existing is None:
                    try:
                        await create_user(**u)
                        logger.success(f"Seeded user '{u['username']}'")
                    except UserAlreadyExists:
                        pass
                    except Exception as exc:
                        logger.warning(f"Failed to seed user '{u['username']}': {exc}")
                elif existing.id and not verify_password(seed_password, existing.password_hash):
                    await update_password(existing.id, seed_password)
                    logger.success(f"Updated seeded user '{u['username']}'")

            # Demo data for the community: welcome allowance + sample course rooms.
            try:
                from siet_platform import points as community_points

                for u in seed_users:
                    seeded = await get_by_username(u["username"])
                    if seeded is not None:
                        await community_points.ensure_welcome(seeded)
                # Categories + sample courses: siet_community.catalog listens.
                await extensions.emit("siet.seed_demo_data")
            except Exception as exc:
                logger.warning(f"Community seed skipped: {exc}")
    except Exception as exc:
        logger.debug(f"Skipping default user seed: {exc}")

    # Phase 5: start the periodic tuner only when explicitly enabled. The
    # singleton remains available while disabled so hot-path threshold reads
    # transparently fall back to static defaults.
    try:
        from siet_platform.cache.threshold_tuner import start_tuner_if_enabled

        await start_tuner_if_enabled()
    except Exception as exc:
        logger.warning(f"Adaptive threshold tuner failed to start safely: {exc}")

    # Phase 6.5: load persisted circuit-breaker state on startup
    try:
        from siet_platform.cache.circuit_breaker import init_circuit_breaker

        await init_circuit_breaker()
    except Exception as exc:
        logger.warning(f"Circuit breaker init failed safely: {exc}")


async def on_shutdown() -> None:
    try:
        from siet_platform.cache.threshold_tuner import stop_tuner

        await stop_tuner()
    except Exception as exc:
        logger.debug(f"Adaptive threshold tuner shutdown skipped: {exc}")

    # Close the Redis connection
    try:
        from siet_platform.cache.redis_client import redis_client

        await redis_client.close()
        logger.info("Redis connection closed")
    except Exception:
        pass
