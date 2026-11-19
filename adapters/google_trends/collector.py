from __future__ import annotations

import json
import urllib.parse
from typing import Any

from adapters.studio_browser.resilience import (
    StructuralDriftDetector,
    UpstreamCircuitBreaker,
    sanitize_extracted_text,
)
from adapters.studio_browser.session import StudioBrowserSessionManager, detect_auth_or_challenge
from core.errors import AppError, ErrorCode
from core.research.google_trends_models import TrendsQueryItem, TrendsSeriesPoint

_DEFAULT_TRENDS_BREAKER = UpstreamCircuitBreaker(
    "google_trends_collector",
    failure_threshold=3,
    cooldown_seconds=60.0,
)
_DRIFT_DETECTOR = StructuralDriftDetector()


def build_trends_explore_url(
    keyword: str,
    *,
    date_range: str = "today 12-m",
    geo: str = "BR",
    gprop: str = "youtube",
    hl: str = "pt-BR",
) -> str:
    clean_kw = sanitize_extracted_text(keyword, max_len=140)
    params: dict[str, str] = {"date": date_range, "q": clean_kw, "hl": hl}
    if geo and geo.strip().upper() != "GLOBAL":
        params["geo"] = geo.strip().upper()
    if gprop and gprop.strip():
        params["gprop"] = gprop.strip()
    return f"https://trends.google.com/trends/explore?{urllib.parse.urlencode(params)}"


def strip_trends_xssi_prefix(raw_text: str) -> dict[str, Any]:
    """
    Strips Google XSSI prefixes (`)]}',`, `)]}'`, BOM) and parses JSON safely.
    Raises STUDIO_SCHEMA_DRIFT on empty, truncated, or non-object payloads instead of silent failure.
    """
    cleaned = (raw_text or "").lstrip("\ufeff \t\r\n")
    if not cleaned:
        raise AppError(
            ErrorCode.STUDIO_SCHEMA_DRIFT,
            "Payload vazio recebido do endpoint interno do Google Trends.",
            http_status=502,
            retryable=False,
            details={"reason": "EMPTY_TRENDS_PAYLOAD"},
        )
    if cleaned.startswith(")]}'"):
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[-1].lstrip()
        else:
            # Handle inline prefix without newline, e.g. `)]}',{"default":...}`
            idx = cleaned.find("{")
            cleaned = cleaned[idx:] if idx != -1 else ""
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AppError(
            ErrorCode.STUDIO_SCHEMA_DRIFT,
            "JSON corrompido ou prefixo XSSI inesperado no Google Trends.",
            http_status=502,
            retryable=False,
            details={"reason": "CORRUPTED_XSSI_OR_JSON", "error": str(exc)[:160]},
        ) from exc

    if not isinstance(parsed, dict):
        raise AppError(
            ErrorCode.STUDIO_SCHEMA_DRIFT,
            "Envelope raiz do Google Trends nao e um objeto JSON.",
            http_status=502,
            retryable=False,
            details={"reason": "NON_OBJECT_JSON_ROOT"},
        )
    return parsed


def parse_trends_multiline_json(
    raw_text: str,
    *,
    drift_detector: StructuralDriftDetector | None = None,
) -> list[TrendsSeriesPoint]:
    detector = drift_detector or _DRIFT_DETECTOR
    data = strip_trends_xssi_prefix(raw_text)
    assessment = detector.assess_google_trends_payload(
        data,
        widget_kind="multiline",
        raw_len=len(raw_text or ""),
    )
    detector.enforce_no_silent_drift(assessment)

    default_env = data.get("default") if isinstance(data.get("default"), dict) else data
    rows = default_env.get("timelineData")
    if rows is None:
        rows = default_env.get("timeline") or []

    pts: list[TrendsSeriesPoint] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        has_data = row.get("hasData")
        if isinstance(has_data, list) and has_data and has_data[0] is False:
            continue
        vals = row.get("value")
        if isinstance(vals, list) and vals:
            raw_v = vals[0]
        else:
            raw_v = row.get("score", 0.0)
        try:
            val = float(raw_v)
        except (TypeError, ValueError):
            val = 0.0
        time_raw = str(row.get("time", "")).strip()
        ts = int(time_raw) if time_raw.isdigit() else None
        lbl = sanitize_extracted_text(
            row.get("formattedAxisTime") or row.get("formattedTime") or row.get("date") or time_raw,
            max_len=64,
        )
        pts.append(TrendsSeriesPoint(date_label=lbl, value=val, timestamp_sec=ts))
    return pts


def parse_trends_related_json(
    raw_text: str,
    *,
    drift_detector: StructuralDriftDetector | None = None,
) -> list[TrendsQueryItem]:
    detector = drift_detector or _DRIFT_DETECTOR
    data = strip_trends_xssi_prefix(raw_text)
    assessment = detector.assess_google_trends_payload(
        data,
        widget_kind="relatedsearches",
        raw_len=len(raw_text or ""),
    )
    detector.enforce_no_silent_drift(assessment)

    default_env = data.get("default") if isinstance(data.get("default"), dict) else data
    ranked = default_env.get("rankedList")
    if ranked is None:
        ranked = default_env.get("queries") or []

    out: list[TrendsQueryItem] = []
    for idx, block in enumerate(ranked):
        if not isinstance(block, dict):
            continue
        keywords = block.get("rankedKeyword")
        if keywords is None:
            keywords = block.get("items") or []
        # Google Trends rankedList[0] = Top, rankedList[1] = Rising/Breakout
        is_rising_block = idx == 1 or str(block.get("listType", "")).lower() in ("rising", "breakout")
        for kw in keywords:
            if not isinstance(kw, dict):
                continue
            term = sanitize_extracted_text(kw.get("query") or kw.get("term"), max_len=180)
            if not term:
                continue
            fmt = sanitize_extracted_text(kw.get("formattedValue") or kw.get("label"), max_len=64)
            num_val = kw.get("value")
            pct = float(num_val) if isinstance(num_val, (int, float)) and not isinstance(num_val, bool) else None
            fmt_low = fmt.lower()
            is_rising = (
                is_rising_block
                or "breakout" in fmt_low
                or "aumento repentino" in fmt_low
                or "5.000%" in fmt
                or "5,000%" in fmt
                or "+" in fmt
            )
            if is_rising:
                is_bo = (
                    "breakout" in fmt_low
                    or "aumento repentino" in fmt_low
                    or "5.000%" in fmt
                    or "5,000%" in fmt
                    or (pct is not None and pct >= 5000.0)
                )
                gtype = "breakout" if is_bo else "rising"
            else:
                gtype = "top"
            out.append(TrendsQueryItem(term=term, growth_type=gtype, growth_pct=pct, raw_label=fmt))
    return out


class GoogleTrendsPlaywrightCollector:
    """
    Collects 12m, 5y and Related Queries (Top/Rising/Breakout) via Playwright network interception.
    Respects rate limits, never bypasses CAPTCHA/429, detects upstream schema drift,
    and protects session stability via UpstreamCircuitBreaker (RH-04).
    """

    def __init__(
        self,
        session_mgr: StudioBrowserSessionManager | None = None,
        *,
        circuit_breaker: UpstreamCircuitBreaker | None = None,
        drift_detector: StructuralDriftDetector | None = None,
    ) -> None:
        self._session = session_mgr or StudioBrowserSessionManager()
        self._breaker = circuit_breaker or _DEFAULT_TRENDS_BREAKER
        self._drift = drift_detector or _DRIFT_DETECTOR

    def collect(
        self,
        *,
        keyword: str,
        geo: str = "BR",
        gprop: str = "youtube",
        hl: str = "pt-BR",
    ) -> dict[str, Any]:
        self._breaker.before_call()
        self._session.check_rate_limit()
        sync_playwright = self._session._import_playwright_sync()
        profile_dir = self._session.config.resolved_profile_dir
        profile_dir.mkdir(parents=True, exist_ok=True)

        pts_12m: list[TrendsSeriesPoint] = []
        pts_5y: list[TrendsSeriesPoint] = []
        queries: list[TrendsQueryItem] = []
        rate_limited = False
        captured_drift_error: AppError | None = None

        try:
            with sync_playwright() as p:
                ctx = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=self._session.config.headless,
                    viewport={"width": 1366, "height": 860},
                )
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.set_default_timeout(self._session.config.navigation_timeout_ms)

                current_phase = "12m"

                def on_response(resp: Any) -> None:
                    nonlocal rate_limited, pts_12m, pts_5y, queries, captured_drift_error
                    try:
                        u = str(resp.url or "").lower()
                        if resp.status == 429:
                            rate_limited = True
                            return
                        if resp.status == 200 and "/trends/api/widgetdata/multiline" in u:
                            parsed = parse_trends_multiline_json(resp.text(), drift_detector=self._drift)
                            if current_phase == "12m" and parsed:
                                pts_12m = parsed
                            elif current_phase == "5y" and parsed:
                                pts_5y = parsed
                        elif resp.status == 200 and "/trends/api/widgetdata/relatedsearches" in u:
                            queries.extend(parse_trends_related_json(resp.text(), drift_detector=self._drift))
                    except AppError as drift_exc:
                        captured_drift_error = drift_exc
                    except Exception:
                        pass

                page.on("response", on_response)

                for phase, timeframe in (("12m", "today 12-m"), ("5y", "today 5-y")):
                    current_phase = phase
                    target = build_trends_explore_url(keyword, date_range=timeframe, geo=geo, gprop=gprop, hl=hl)
                    page.goto(target, wait_until="domcontentloaded")
                    page.wait_for_timeout(2500)
                    body_text = ""
                    try:
                        body_text = page.locator("body").inner_text(timeout=2000)
                    except Exception:
                        body_text = ""
                    challenge = detect_auth_or_challenge(page.url or "", body_text)
                    if challenge is not None or rate_limited or "error 429" in body_text.lower():
                        ctx.close()
                        raise AppError(
                            ErrorCode.STUDIO_RATE_LIMITED,
                            "Google Trends solicitou verificacao humana ou retornou HTTP 429. Use importacao de CSV manual ou aguarde antes de tentar novamente.",
                            http_status=429,
                            retryable=True,
                            details={
                                "next_action": "Exporte multiTimeline.csv / relatedQueries.csv no Google Trends e use Importar CSV."
                            },
                        )

                ctx.close()

            if captured_drift_error is not None:
                raise captured_drift_error

            self._breaker.record_success()
            return {
                "points_12m": pts_12m,
                "points_5y": pts_5y,
                "related_queries": queries,
                "captured_via": "playwright_json",
            }
        except AppError as exc:
            if exc.code in (ErrorCode.STUDIO_SCHEMA_DRIFT, ErrorCode.STUDIO_RATE_LIMITED):
                self._breaker.record_failure(exc.code.value)
            raise
        except Exception as exc:
            self._breaker.record_failure(type(exc).__name__)
            raise
