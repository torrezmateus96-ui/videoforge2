from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from core.errors import AppError, ErrorCode

_YT_ID_STRICT_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YT_URL_ID_RE = re.compile(r"(?:watch\?v=|youtu\.be/|shorts/|/video/)([A-Za-z0-9_-]{11})")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+")
_WHITESPACE_RE = re.compile(r"\s+")
_DANGEROUS_URI_PREFIXES = ("javascript:", "vbscript:", "data:", "file:", "blob:")
_ALLOWED_YT_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "studio.youtube.com",
}

_EXPLICIT_EMPTY_PHRASES = (
    "no results",
    "not enough data",
    "no matching videos",
    "try searching for something else",
    "sem dados suficientes",
    "não há dados suficientes",
    "nao ha dados suficientes",
    "nenhum resultado",
    "sin resultados",
    "sin datos suficientes",
)

STUDIO_DOM_SELECTOR_CHAIN_V2: tuple[dict[str, str], ...] = (
    {
        "layer": "v1_explicit_data_block",
        "selector": "[data-block='top-searches'], [data-block='content-gaps']",
        "target": "search_term",
    },
    {
        "layer": "v2_ytcp_custom_elements",
        "selector": "ytcp-research-search-term-row, ytcp-trends-term-row, ytcp-inspiration-term-card, ytcd-research-query-item",
        "target": "search_term",
    },
    {
        "layer": "v3_semantic_aria_listitems",
        "selector": "[role='listitem'][data-term], [role='row'][data-query], [aria-label*='search term' i], [aria-label*='termo de pesquisa' i]",
        "target": "search_term",
    },
    {
        "layer": "v4_canonical_video_anchors",
        "selector": "a[href*='watch?v='], a[href*='/shorts/'], a[href*='youtu.be/'], [data-video-id]",
        "target": "video",
    },
)


def sanitize_extracted_text(raw: Any, *, max_len: int = 280) -> str:
    """Strips control chars, neutralizes script/URI payloads, and caps length."""
    if raw is None:
        return ""
    txt = str(raw)
    txt = _CONTROL_CHARS_RE.sub(" ", txt)
    txt = _WHITESPACE_RE.sub(" ", txt).strip()
    lowered = txt.lower()
    if any(lowered.startswith(prefix) for prefix in _DANGEROUS_URI_PREFIXES):
        return ""
    txt = txt.replace("<script", "").replace("</script>", "")
    if len(txt) > max_len:
        return txt[:max_len].rstrip()
    return txt


def sanitize_youtube_video_url(
    raw_url: str | None,
    fallback_video_id: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Validates untrusted DOM href / video_id and returns (video_id, canonical_watch_url).
    Rejects javascript:/data:/file: URIs and non-YouTube domains when host is present.
    """
    candidate_url = (raw_url or "").strip()
    if candidate_url:
        lower = candidate_url.lower()
        if any(lower.startswith(prefix) for prefix in _DANGEROUS_URI_PREFIXES):
            return None, None
        parsed = urllib.parse.urlparse(candidate_url)
        if parsed.scheme and parsed.scheme.lower() not in ("http", "https"):
            return None, None
        if parsed.netloc:
            host = parsed.netloc.split(":")[0].lower()
            if host not in _ALLOWED_YT_HOSTS:
                return None, None

    if fallback_video_id:
        clean_fb = str(fallback_video_id).strip()
        if _YT_ID_STRICT_RE.match(clean_fb):
            return clean_fb, f"https://www.youtube.com/watch?v={clean_fb}"

    if candidate_url:
        match = _YT_URL_ID_RE.search(candidate_url)
        if match:
            vid = match.group(1)
            if _YT_ID_STRICT_RE.match(vid):
                return vid, f"https://www.youtube.com/watch?v={vid}"

    return None, None


def compute_structure_fingerprint(
    payloads: list[Any],
    dom_landmarks: list[str] | None = None,
    *,
    max_depth: int = 4,
) -> str:
    """Computes a deterministic SHA-256 fingerprint of observed JSON key paths & DOM landmarks."""
    paths: set[str] = set()

    def collect_paths(node: Any, prefix: str, depth: int) -> None:
        if depth > max_depth or len(paths) >= 512:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                key_name = str(k)[:64]
                cur = f"{prefix}.{key_name}" if prefix else key_name
                paths.add(cur)
                collect_paths(v, cur, depth + 1)
        elif isinstance(node, list) and node:
            paths.add(f"{prefix}[]")
            for sample in node[:3]:
                collect_paths(sample, f"{prefix}[]", depth + 1)

    for item in payloads[:10]:
        collect_paths(item, "", 0)

    canonical = json.dumps(
        {
            "json_paths": sorted(paths),
            "dom_landmarks": sorted(set(dom_landmarks or []))[:64],
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


class DriftVerdict(StrEnum):
    EXTRACTED_OK = "EXTRACTED_OK"
    EMPTY_LEGITIMATE = "EMPTY_LEGITIMATE"
    DRIFT_DETECTED = "DRIFT_DETECTED"


@dataclass(frozen=True)
class DriftAssessment:
    verdict: DriftVerdict
    source: str
    structure_fingerprint: str
    reason: str
    raw_byte_estimate: int


class StructuralDriftDetector:
    """
    Distinguishes legitimate empty search states from silent upstream DOM/JSON schema drift.
    Enforces DarkForge invariant: 'Absence of parsed entities on non-empty upstream payload != 0 demand'.
    """

    def is_explicit_empty_text(self, text: str | None) -> bool:
        lower = (text or "").strip().lower()
        if not lower:
            return False
        return any(phrase in lower for phrase in _EXPLICIT_EMPTY_PHRASES)

    def _json_has_explicit_empty_marker(self, payloads: list[dict[str, Any]]) -> bool:
        for payload in payloads:
            raw_str = json.dumps(payload, ensure_ascii=False).lower()
            if any(phrase in raw_str for phrase in _EXPLICIT_EMPTY_PHRASES):
                return True
            if '"emptystate"' in raw_str or '"noresultsrenderer"' in raw_str:
                return True
        return False

    def assess_studio_extraction(
        self,
        *,
        captured_json: list[dict[str, Any]],
        dom_cards: list[dict[str, Any]],
        body_text: str = "",
        dom_landmarks: list[str] | None = None,
        extracted_terms_count: int,
        extracted_videos_count: int,
    ) -> DriftAssessment:
        fp = compute_structure_fingerprint(captured_json, dom_landmarks)
        json_bytes = sum(len(json.dumps(p, ensure_ascii=False)) for p in captured_json)
        body_bytes = len((body_text or "").encode("utf-8"))
        total_bytes = json_bytes + body_bytes

        if extracted_terms_count > 0 or extracted_videos_count > 0:
            return DriftAssessment(
                verdict=DriftVerdict.EXTRACTED_OK,
                source="studio_trends",
                structure_fingerprint=fp,
                reason="ENTITIES_EXTRACTED",
                raw_byte_estimate=total_bytes,
            )

        if self.is_explicit_empty_text(body_text) or self._json_has_explicit_empty_marker(captured_json):
            return DriftAssessment(
                verdict=DriftVerdict.EMPTY_LEGITIMATE,
                source="studio_trends",
                structure_fingerprint=fp,
                reason="EXPLICIT_EMPTY_STATE_MARKER",
                raw_byte_estimate=total_bytes,
            )

        # Non-trivial intercepted JSON or DOM body without recognized empty markers and 0 parsed entities => DRIFT!
        body_lower = (body_text or "").lower()
        suspicious_dom_signals = any(
            sig in body_lower
            for sig in ("views", "visualizações", "visualizacoes", "assistido", "watched by", "watch?v=", "pesquisas")
        )
        if captured_json and json_bytes >= 80:
            return DriftAssessment(
                verdict=DriftVerdict.DRIFT_DETECTED,
                source="studio_network_json",
                structure_fingerprint=fp,
                reason="UPSTREAM_SCHEMA_OR_DOM_DRIFT",
                raw_byte_estimate=total_bytes,
            )
        if dom_cards or suspicious_dom_signals or body_bytes >= 512:
            return DriftAssessment(
                verdict=DriftVerdict.DRIFT_DETECTED,
                source="studio_shadow_dom",
                structure_fingerprint=fp,
                reason="UPSTREAM_SCHEMA_OR_DOM_DRIFT",
                raw_byte_estimate=total_bytes,
            )

        return DriftAssessment(
            verdict=DriftVerdict.EMPTY_LEGITIMATE,
            source="studio_trends",
            structure_fingerprint=fp,
            reason="MINIMAL_EMPTY_DOCUMENT",
            raw_byte_estimate=total_bytes,
        )

    def assess_google_trends_payload(
        self,
        data: Any,
        *,
        widget_kind: str,
        raw_len: int,
    ) -> DriftAssessment:
        fp = compute_structure_fingerprint([data] if isinstance(data, dict) else [])
        if not isinstance(data, dict):
            return DriftAssessment(
                verdict=DriftVerdict.DRIFT_DETECTED,
                source=f"google_trends_{widget_kind}",
                structure_fingerprint=fp,
                reason="UPSTREAM_SCHEMA_OR_DOM_DRIFT",
                raw_byte_estimate=raw_len,
            )

        default_env = data.get("default")
        if isinstance(default_env, dict):
            expected_key = "timelineData" if widget_kind == "multiline" else "rankedList"
            alt_key = "timeline" if widget_kind == "multiline" else "queries"
            rows = default_env.get(expected_key)
            if rows is None:
                rows = default_env.get(alt_key)
            if isinstance(rows, list):
                verdict = DriftVerdict.EXTRACTED_OK if len(rows) > 0 else DriftVerdict.EMPTY_LEGITIMATE
                return DriftAssessment(
                    verdict=verdict,
                    source=f"google_trends_{widget_kind}",
                    structure_fingerprint=fp,
                    reason="VALID_DEFAULT_ENVELOPE" if rows else "EMPTY_TIMELINE_OR_RANKED_LIST",
                    raw_byte_estimate=raw_len,
                )

        # Fallback v2 top-level envelope check
        v2_key = "timelineData" if widget_kind == "multiline" else "rankedList"
        if isinstance(data.get(v2_key), list):
            rows = data[v2_key]
            return DriftAssessment(
                verdict=DriftVerdict.EXTRACTED_OK if rows else DriftVerdict.EMPTY_LEGITIMATE,
                source=f"google_trends_{widget_kind}",
                structure_fingerprint=fp,
                reason="VALID_V2_FLAT_ENVELOPE",
                raw_byte_estimate=raw_len,
            )

        return DriftAssessment(
            verdict=DriftVerdict.DRIFT_DETECTED,
            source=f"google_trends_{widget_kind}",
            structure_fingerprint=fp,
            reason="UPSTREAM_SCHEMA_OR_DOM_DRIFT",
            raw_byte_estimate=raw_len,
        )

    def enforce_no_silent_drift(self, assessment: DriftAssessment) -> None:
        if assessment.verdict == DriftVerdict.DRIFT_DETECTED:
            raise AppError(
                ErrorCode.STUDIO_SCHEMA_DRIFT,
                f"Mudanca estrutural detectada no upstream ({assessment.source}). Zero silencioso bloqueado.",
                http_status=502,
                retryable=False,
                details={
                    "reason": assessment.reason,
                    "source": assessment.source,
                    "structure_fingerprint": assessment.structure_fingerprint,
                    "raw_byte_estimate": assessment.raw_byte_estimate,
                    "next_action": "Atualize os seletores/schemas do adaptador ou use importacao manual de CSV.",
                },
            )


class CircuitState(StrEnum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class UpstreamCircuitBreaker:
    """
    Thread-safe Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
    protecting browser scrapers against repeated DOM drift, 429s, or upstream instability.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60.0,
        half_open_max_calls: int = 1,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if cooldown_seconds <= 0:
            raise ValueError("cooldown_seconds must be > 0")
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.half_open_max_calls = max(1, half_open_max_calls)
        self._clock = clock or time.monotonic

        self._lock = threading.Lock()
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._total_failures = 0
        self._total_rejections = 0
        self._opened_at: float | None = None
        self._last_failure_reason: str = ""
        self._half_open_in_flight = 0

    def before_call(self) -> CircuitState:
        now = self._clock()
        with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed = now - (self._opened_at or now)
                if elapsed >= self.cooldown_seconds:
                    self._state = CircuitState.HALF_OPEN
                    self._half_open_in_flight = 1
                    return self._state
                self._total_rejections += 1
                retry_after = max(0.01, round(self.cooldown_seconds - elapsed, 2))
                raise AppError(
                    ErrorCode.STUDIO_CIRCUIT_OPEN,
                    f"Circuito '{self.name}' aberto devido a falhas repetidas ({self._last_failure_reason}).",
                    http_status=503,
                    retryable=True,
                    details={
                        "circuit": self.name,
                        "state": CircuitState.OPEN.value,
                        "retry_after_seconds": retry_after,
                        "last_failure_reason": self._last_failure_reason,
                    },
                )

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_in_flight >= self.half_open_max_calls:
                    self._total_rejections += 1
                    raise AppError(
                        ErrorCode.STUDIO_CIRCUIT_OPEN,
                        f"Circuito '{self.name}' em teste HALF_OPEN; aguarde sonda concluir.",
                        http_status=503,
                        retryable=True,
                        details={
                            "circuit": self.name,
                            "state": CircuitState.HALF_OPEN.value,
                            "retry_after_seconds": 1.0,
                        },
                    )
                self._half_open_in_flight += 1
                return self._state

            return self._state

    def record_success(self) -> None:
        with self._lock:
            self._state = CircuitState.CLOSED
            self._consecutive_failures = 0
            self._opened_at = None
            self._half_open_in_flight = 0
            self._last_failure_reason = ""

    def record_failure(self, reason: str = "UPSTREAM_FAILURE") -> None:
        now = self._clock()
        with self._lock:
            self._consecutive_failures += 1
            self._total_failures += 1
            self._last_failure_reason = str(reason)[:160]
            self._half_open_in_flight = 0
            if self._state == CircuitState.HALF_OPEN or self._consecutive_failures >= self.failure_threshold:
                self._state = CircuitState.OPEN
                self._opened_at = now

    def reset(self) -> None:
        self.record_success()

    @property
    def stats(self) -> dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "consecutive_failures": self._consecutive_failures,
                "total_failures": self._total_failures,
                "total_rejections": self._total_rejections,
                "last_failure_reason": self._last_failure_reason,
            }
