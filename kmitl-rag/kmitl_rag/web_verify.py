"""
Web references for KMITL RAG AI: only live pages on kmitl.ac.th.

Gemini's Google Search grounding returns each page as a Google redirect link
(``vertexaisearch.cloud.google.com/grounding-api-redirect/...``) and cannot be
restricted to a domain. So every reference is checked on the server before a
student sees it:

* the redirect is followed by hand (at most ``MAX_HOPS``), and every hop must
  stay on Google's redirect host (first hop only) or on ``kmitl.ac.th`` and its
  subdomains - nothing else is ever requested (no SSRF into the network);
* hosts that resolve to private / loopback / link-local addresses are refused;
* the final page must answer: 2xx, or 401/403/429 (the page is there but blocks
  bots - a student can still open it). 404, 5xx, timeouts → the page does not
  exist → dropped.

The answer text is then rebuilt from Gemini's grounding supports so that only
sentences backed by a surviving KMITL page are shown, each with renumbered
``[Wn]`` markers.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urljoin, urlsplit

from loguru import logger

from siet_platform.cache.service import cache_service

GOOGLE_REDIRECT_HOST = "vertexaisearch.cloud.google.com"
MAX_HOPS = 5
TIMEOUT_SECONDS = 4.0
OK_TTL = 86400
FAIL_TTL = 3600
EXISTS = {401, 403, 429}
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 NungsueLinkCheck/1.0"
)

NOT_FOUND = {
    "th": "ไม่พบข้อมูลจากเว็บไซต์ของ สจล.",
    "en": "No information was found on KMITL websites.",
}
PARTIAL = {
    "th": "บางส่วนไม่พบแหล่งอ้างอิงบนเว็บไซต์ของ สจล. จึงไม่แสดง",
    "en": "Some parts had no reference on KMITL websites and are not shown.",
}

Fetch = Callable[[str], Awaitable[Tuple[int, Optional[str]]]]
Resolve = Callable[[str], Awaitable[Sequence[str]]]


def _lang(language: str) -> str:
    return "en" if (language or "").lower().startswith("en") else "th"


def is_kmitl_host(host: str) -> bool:
    """kmitl.ac.th or one of its subdomains (a bare host name, no port)."""
    host = (host or "").strip().lower().rstrip(".")
    return host == "kmitl.ac.th" or host.endswith(".kmitl.ac.th")


def _is_public(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)


async def _resolve(host: str) -> List[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    return [info[4][0] for info in infos]


async def _fetch(url: str) -> Tuple[int, Optional[str]]:
    """One GET without following redirects; reads no body. TLS errors on KMITL get one retry."""
    import httpx

    async def once(verify: bool) -> Tuple[int, Optional[str]]:
        async with httpx.AsyncClient(
            follow_redirects=False, timeout=TIMEOUT_SECONDS, verify=verify,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"},
        ) as client:
            async with client.stream("GET", url) as response:
                return response.status_code, response.headers.get("location")

    try:
        return await once(True)
    except httpx.ConnectError as exc:
        # Some faculty sites have expired or incomplete certificates; only the
        # status is used, never the content, so one unverified retry is safe.
        if "CERTIFICATE" in str(exc).upper() and is_kmitl_host(urlsplit(url).hostname or ""):
            return await once(False)
        raise


def _hop_allowed(url: str, first: bool) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or parts.port not in (None, 80, 443):
        return False
    host = (parts.hostname or "").lower()
    try:
        ipaddress.ip_address(host)
        return False  # IP literals are never a KMITL page
    except ValueError:
        pass
    return is_kmitl_host(host) or (first and host == GOOGLE_REDIRECT_HOST)


async def _check(url: str, fetch: Fetch, resolve: Resolve) -> Optional[str]:
    current = url
    for hop in range(MAX_HOPS + 1):
        if not _hop_allowed(current, first=hop == 0):
            return None
        host = urlsplit(current).hostname or ""
        if is_kmitl_host(host):
            addresses = await resolve(host)
            if not addresses or not all(_is_public(a) for a in addresses):
                return None
        status, location = await asyncio.wait_for(fetch(current), TIMEOUT_SECONDS + 1)
        if 300 <= status < 400 and location:
            current = urljoin(current, location)
            continue
        if (200 <= status < 300 or status in EXISTS) and is_kmitl_host(host):
            return current
        return None
    return None


def _key(url: str) -> str:
    return "rag:web:url:" + hashlib.sha1(url.encode("utf-8")).hexdigest()


async def verify_url(url: str, *, fetch: Optional[Fetch] = None, resolve: Optional[Resolve] = None) -> Optional[str]:
    """Final URL of a live KMITL page reached from ``url``, or None. Cached (ok 1 day, failed 1 h)."""
    try:
        cached = await cache_service.get_json(_key(url))
    except Exception:
        cached = None
    if isinstance(cached, dict) and "final" in cached:
        return cached["final"] or None
    try:
        final = await _check(url, fetch or _fetch, resolve or _resolve)
    except Exception as exc:  # timeouts, DNS, connection, TLS
        logger.debug(f"web_verify: {url[:80]} failed: {exc}")
        final = None
    try:
        await cache_service.set_json(_key(url), {"final": final or ""}, ttl=OK_TTL if final else FAIL_TTL)
    except Exception:
        pass
    return final


async def verify_sources(sources: Sequence[Dict[str, Any]]) -> Dict[int, str]:
    """``{index: final_url}`` for every source that is a live KMITL page (checked concurrently)."""
    results = await asyncio.gather(*(verify_url(str(s.get("url") or "")) for s in sources), return_exceptions=True)
    return {
        int(s["index"]): final
        for s, final in zip(sources, results)
        if isinstance(final, str) and final
    }


def rebuild_web_text(
    text: str,
    metadata: Optional[Dict[str, Any]],
    chunk_to_index: Dict[int, int],
    kept: Dict[int, str],
    titles: Dict[int, str],
    language: str,
) -> Tuple[str, List[Dict[str, Any]], bool]:
    """
    Keep only the sentences a surviving KMITL page supports, numbered ``[W1..n]``.

    Returns ``(text, sources, removed_any)``. Nothing surviving gives the fixed
    "not found" sentence; something removed adds the fixed "some parts" line.
    """
    lang = _lang(language)
    renumber: Dict[int, int] = {}
    pieces: List[str] = []
    seen: set[str] = set()
    dropped_segments = 0
    for support in (metadata or {}).get("grounding_supports") or []:
        if not isinstance(support, dict):
            continue
        segment = str(((support.get("segment") or {}).get("text")) or "").strip()
        refs = []
        for chunk in support.get("grounding_chunk_indices") or []:
            old = chunk_to_index.get(chunk)
            if old in kept and old not in refs:
                refs.append(old)
        # Gemini's segments quote its own answer; anything else is not shown.
        if not segment or segment in seen or segment not in (text or ""):
            continue
        if not refs:
            dropped_segments += 1  # backed only by pages that are gone or not KMITL
            continue
        seen.add(segment)
        for old in refs:
            renumber.setdefault(old, len(renumber) + 1)
        pieces.append(segment + " " + "".join(f"[W{renumber[old]}]" for old in refs))

    sources = [
        {"index": new, "title": titles.get(old) or (urlsplit(kept[old]).hostname or "kmitl.ac.th"), "url": kept[old]}
        for old, new in sorted(renumber.items(), key=lambda item: item[1])
    ]
    if not pieces:
        return NOT_FOUND[lang], [], True
    rebuilt = " ".join(pieces)
    # A dropped sentence or page counts; connecting words between kept sentences do not.
    removed = dropped_segments > 0 or len(kept) < len(set(chunk_to_index.values()))
    if removed:
        rebuilt = f"{rebuilt}\n\n{PARTIAL[lang]}"
    return rebuilt, sources, removed
