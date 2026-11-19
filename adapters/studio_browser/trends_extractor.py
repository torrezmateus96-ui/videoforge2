from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from adapters.studio_browser.resilience import (
    STUDIO_DOM_SELECTOR_CHAIN_V2,
    StructuralDriftDetector,
    UpstreamCircuitBreaker,
    sanitize_extracted_text,
    sanitize_youtube_video_url,
)
from adapters.studio_browser.session import (
    StudioBrowserSessionManager,
    build_studio_research_url,
    detect_auth_or_challenge,
)
from core.errors import AppError, ErrorCode
from core.research.studio_models import (
    AudienceInterestLevel,
    StudioExtractionResult,
    StudioSearchTerm,
    StudioTrendsFilter,
    StudioVideoCandidate,
    normalize_interest_level,
)

_YT_ID_RE = re.compile(r"(?:watch\?v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})")
_MAX_JSON_WALK_DEPTH = 36

_DEFAULT_STUDIO_BREAKER = UpstreamCircuitBreaker(
    "youtube_studio_trends",
    failure_threshold=3,
    cooldown_seconds=60.0,
)


def _extract_text_value(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        if isinstance(raw.get("content"), str):
            return raw["content"]
        if isinstance(raw.get("simpleText"), str):
            return raw["simpleText"]
        runs = raw.get("runs")
        if isinstance(runs, list):
            return "".join(str(r.get("text", "")) for r in runs if isinstance(r, dict))
    return ""


def parse_compact_int(raw: Any) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    if isinstance(raw, dict):
        raw = _extract_text_value(raw)
    text = str(raw or "").strip().lower().replace(",", ".")
    if not text:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(mil|mi|m|k)?", text)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2) or ""
    if unit in ("k", "mil"):
        val *= 1_000
    elif unit in ("m", "mi"):
        val *= 1_000_000
    return int(val)


def parse_days_ago(raw: Any) -> int | None:
    if isinstance(raw, dict):
        raw = _extract_text_value(raw)
    txt = str(raw or "").strip().lower()
    if not txt:
        return None
    m = re.search(r"(\d+)\s*(dia|day|semana|week|m[eê]s|month|ano|year|hora|hour)", txt)
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2)
    if unit.startswith(("hora", "hour")):
        return 0
    if unit.startswith(("dia", "day")):
        return n
    if unit.startswith(("semana", "week")):
        return n * 7
    if unit.startswith(("m",)):
        return n * 30
    if unit.startswith(("ano", "year")):
        return n * 365
    return None


def _parse_lockup_view_model(node: dict[str, Any]) -> StudioVideoCandidate | None:
    """Supports modern YouTube / Studio `lockupViewModel` schema."""
    lockup = node.get("lockupViewModel")
    if not isinstance(lockup, dict):
        return None
    vid_raw = lockup.get("contentId")
    vid_id, canonical_url = sanitize_youtube_video_url(None, str(vid_raw) if vid_raw else None)
    if not vid_id or not canonical_url:
        return None

    meta = (lockup.get("metadata") or {}).get("lockupMetadataViewModel") or {}
    title = sanitize_extracted_text(_extract_text_value(meta.get("title")) or vid_id, max_len=240)

    channel_name = "Canal Desconhecido"
    views: int | None = None
    days_ago: int | None = None
    watched_flag = False

    content_meta = (meta.get("metadata") or {}).get("contentMetadataViewModel") or {}
    rows = content_meta.get("metadataRows") or []
    part_texts: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for part in row.get("metadataParts") or []:
            if isinstance(part, dict):
                t = _extract_text_value(part.get("text"))
                if t:
                    part_texts.append(t)

    for idx, pt in enumerate(part_texts):
        low = pt.lower()
        if any(tok in low for tok in ("watched by your viewers", "assistido pelo seu p")):
            watched_flag = True
        elif any(tok in low for tok in ("view", "visualiza")):
            parsed_v = parse_compact_int(pt)
            if parsed_v is not None:
                views = parsed_v
        elif parse_days_ago(pt) is not None:
            days_ago = parse_days_ago(pt)
        elif idx == 0 and channel_name == "Canal Desconhecido":
            channel_name = sanitize_extracted_text(pt, max_len=120) or "Canal Desconhecido"

    return StudioVideoCandidate(
        external_video_id=vid_id,
        canonical_url=canonical_url,
        title=title or vid_id,
        external_channel_id=None,
        channel_name=channel_name,
        public_views=views,
        published_at_iso=None,
        published_days_ago=days_ago,
        watched_by_my_viewers=watched_flag,
    )


def parse_studio_network_payloads(
    payloads: list[dict[str, Any]],
) -> tuple[list[StudioSearchTerm], list[StudioVideoCandidate]]:
    """
    Extracts Top Searches, Audience Interest, Content Gaps & Videos from Studio internal JSON payloads.
    Supports classic renderers, grid/compact/reel renderers, and modern lockupViewModel / termViewModel schemas.
    """
    terms_by_key: dict[tuple[str, str], StudioSearchTerm] = {}
    videos_by_id: dict[str, StudioVideoCandidate] = {}

    def walk(node: Any, depth: int = 0) -> None:
        if depth > _MAX_JSON_WALK_DEPTH:
            return
        if isinstance(node, list):
            for item in node:
                walk(item, depth + 1)
            return
        if not isinstance(node, dict):
            return

        # Modern lockupViewModel branch
        if "lockupViewModel" in node:
            lockup_candidate = _parse_lockup_view_model(node)
            if lockup_candidate is not None:
                videos_by_id[lockup_candidate.external_video_id] = lockup_candidate

        # 1. Search term candidate (classic + v2 termViewModel)
        term_raw = (
            node.get("searchTerm")
            or node.get("query")
            or node.get("term")
            or node.get("topicTitle")
            or node.get("keywordText")
        )
        term_text = sanitize_extracted_text(_extract_text_value(term_raw), max_len=180)
        interest_raw = (
            node.get("audienceInterestLevel")
            or node.get("searchVolumeTier")
            or node.get("interestLevel")
            or _extract_text_value(node.get("volumeBadgeText"))
        )
        has_term_marker = bool(
            interest_raw
            or "contentGap" in node
            or "isContentGap" in node
            or "blockType" in node
            or "isGapQuery" in node
        )
        if term_text and has_term_marker:
            is_gap = bool(
                node.get("isContentGap")
                or node.get("contentGap")
                or node.get("isGapQuery")
                or node.get("blockType") == "content_gap"
            )
            block = "content_gap" if is_gap else "top_search"
            lvl = normalize_interest_level(str(interest_raw or "medium"))
            terms_by_key[(term_text.lower(), block)] = StudioSearchTerm(
                term=term_text,
                block_type=block,
                audience_interest=lvl,
                is_hypothesis=is_gap,
                gap_note="Lacuna indicada pelo YouTube Studio Trends; validar volume antes de produzir." if is_gap else "",
                weekly_views_gt_1000=bool(node.get("weeklyViewsGt1000", True)),
            )

        # 2. Video candidate (classic videoRenderer / gridVideoRenderer / compactVideoRenderer / reelItemRenderer)
        vid_raw = node.get("videoId") or node.get("externalVideoId")
        vid_id, canonical_url = sanitize_youtube_video_url(
            str(node.get("navigationUrl") or "") if node.get("navigationUrl") else None,
            str(vid_raw) if isinstance(vid_raw, str) else None,
        )
        if vid_id and canonical_url:
            title_val = (
                _extract_text_value(node.get("title"))
                or _extract_text_value(node.get("headline"))
                or vid_id
            )
            clean_title = sanitize_extracted_text(title_val, max_len=240) or vid_id
            ch_id_raw = node.get("channelId") or node.get("externalChannelId")
            ch_id = sanitize_extracted_text(ch_id_raw, max_len=64) if ch_id_raw else None
            ch_name_raw = (
                _extract_text_value(node.get("channelTitle"))
                or _extract_text_value(node.get("channelName"))
                or _extract_text_value(node.get("longBylineText"))
                or _extract_text_value(node.get("shortBylineText"))
                or "Canal Desconhecido"
            )
            ch_name = sanitize_extracted_text(ch_name_raw, max_len=120) or "Canal Desconhecido"
            views = parse_compact_int(
                node.get("viewCount")
                or node.get("viewCountText")
                or node.get("shortViewCountText")
                or node.get("views")
            )
            pub_text = _extract_text_value(node.get("publishedTimeText")) or node.get("publishedAt")
            watched_flag = bool(
                node.get("watchedByYourViewers")
                or node.get("watchedByMyViewers")
                or node.get("watched_by_my_viewers")
            )
            videos_by_id[vid_id] = StudioVideoCandidate(
                external_video_id=vid_id,
                canonical_url=canonical_url,
                title=clean_title,
                external_channel_id=ch_id or None,
                channel_name=ch_name,
                public_views=views,
                published_at_iso=str(node.get("publishedAt")) if node.get("publishedAt") else None,
                published_days_ago=parse_days_ago(pub_text) if pub_text else None,
                watched_by_my_viewers=watched_flag,
            )

        for val in node.values():
            if isinstance(val, (dict, list)):
                walk(val, depth + 1)

    for p in payloads:
        walk(p, 0)
    return list(terms_by_key.values()), list(videos_by_id.values())


def parse_studio_dom_cards(
    cards: list[dict[str, Any]],
) -> tuple[list[StudioSearchTerm], list[StudioVideoCandidate]]:
    """Parses normalized Shadow-DOM card dicts captured from YouTube Studio UI with URL/XSS sanitization."""
    terms: list[StudioSearchTerm] = []
    videos: list[StudioVideoCandidate] = []
    seen_terms: set[tuple[str, str]] = set()
    seen_videos: set[str] = set()

    for c in cards:
        if not isinstance(c, dict):
            continue
        kind = str(c.get("kind", "")).lower()
        if kind in ("top_search", "content_gap"):
            t = sanitize_extracted_text(c.get("term"), max_len=180)
            if not t:
                continue
            key = (t.lower(), kind)
            if key in seen_terms:
                continue
            seen_terms.add(key)
            is_gap = kind == "content_gap"
            terms.append(
                StudioSearchTerm(
                    term=t,
                    block_type=kind,
                    audience_interest=normalize_interest_level(c.get("interest")),
                    is_hypothesis=is_gap,
                    gap_note="Lacuna (Content gap) a validar contra volume real." if is_gap else "",
                )
            )
        elif kind == "video":
            vid_id, canonical_url = sanitize_youtube_video_url(
                str(c.get("url") or ""),
                str(c.get("video_id") or "") if c.get("video_id") else None,
            )
            if not vid_id or not canonical_url or vid_id in seen_videos:
                continue
            seen_videos.add(vid_id)
            clean_title = sanitize_extracted_text(c.get("title"), max_len=240) or vid_id
            clean_channel = sanitize_extracted_text(c.get("channel_name") or "Canal", max_len=120) or "Canal"
            ch_id = sanitize_extracted_text(c.get("channel_id"), max_len=64) if c.get("channel_id") else None
            videos.append(
                StudioVideoCandidate(
                    external_video_id=vid_id,
                    canonical_url=canonical_url,
                    title=clean_title,
                    external_channel_id=ch_id or None,
                    channel_name=clean_channel,
                    public_views=parse_compact_int(c.get("views")),
                    published_days_ago=parse_days_ago(c.get("published_text")),
                    watched_by_my_viewers=bool(c.get("watched_by_my_viewers", False)),
                )
            )
    return terms, videos


_SHADOW_DOM_COLLECT_JS = """
() => {
  const results = [];
  function walkShadow(root) {
    if (!root) return [];
    let nodes = Array.from(root.querySelectorAll('*'));
    for (const el of nodes) {
      if (el.shadowRoot) {
        nodes = nodes.concat(walkShadow(el.shadowRoot));
      }
    }
    return nodes;
  }
  const all = walkShadow(document);
  for (const el of all) {
    const tag = (el.tagName || '').toLowerCase();
    const txt = (el.innerText || '').trim();
    const dataBlock = el.getAttribute('data-block') || '';
    const dataTerm = el.getAttribute('data-term') || el.getAttribute('data-query') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const role = el.getAttribute('role') || '';

    // Layer 1-3: Explicit data-block, ytcp/ytcd custom elements, or semantic ARIA listitems
    const isTermElement = (
      tag.includes('research-search-term') ||
      tag.includes('trends-term') ||
      tag.includes('inspiration-term') ||
      tag.includes('research-query-item') ||
      dataBlock === 'top-searches' ||
      dataBlock === 'content-gaps' ||
      ((role === 'listitem' || role === 'row') && Boolean(dataTerm)) ||
      /(search term|termo de pesquisa)/i.test(ariaLabel)
    );
    if (isTermElement && (txt || dataTerm)) {
      const combined = (txt || dataTerm).trim();
      const lower = combined.toLowerCase();
      const isGap = dataBlock === 'content-gaps' || lower.includes('content gap') || lower.includes('lacuna');
      const lines = combined.split(/\\n+/).map(s => s.trim()).filter(Boolean);
      results.push({
        kind: isGap ? 'content_gap' : 'top_search',
        term: dataTerm || lines[0] || '',
        interest: lines.find(l => /(muito alto|very high|alto|high|m[eé]dio|medium|baixo|low)/i.test(l)) || ''
      });
    }

    // Layer 4: Canonical video links or [data-video-id] cards
    const dataVid = el.getAttribute('data-video-id') || '';
    const href = (tag === 'a' && el.href) ? el.href : '';
    if ((href && (href.includes('watch?v=') || href.includes('/shorts/') || href.includes('youtu.be/'))) || dataVid) {
      const container = el.closest('ytcp-video-row, ytcd-card, ytd-lockup-view-model, [role="listitem"], article, div');
      const parentText = (container?.innerText || txt || '').toLowerCase();
      results.push({
        kind: 'video',
        url: href,
        video_id: dataVid || undefined,
        title: (txt.split('\\n')[0] || dataVid || '').trim(),
        views: parentText,
        published_text: parentText,
        watched_by_my_viewers: parentText.includes('watched by your viewers') || parentText.includes('assistido pelo seu p')
      });
    }
  }
  return results;
}
"""


class StudioTrendsExtractor:
    """
    Executes assisted YouTube Studio Trends extraction via Playwright (SP-11, ADR-017, RH-04).
    Combines multi-schema JSON interception, multi-layer Shadow-DOM traversal,
    StructuralDriftDetector (zero silent failure), and UpstreamCircuitBreaker.
    """

    selector_chain = STUDIO_DOM_SELECTOR_CHAIN_V2

    def __init__(
        self,
        session_mgr: StudioBrowserSessionManager | None = None,
        *,
        circuit_breaker: UpstreamCircuitBreaker | None = None,
        drift_detector: StructuralDriftDetector | None = None,
    ) -> None:
        self._session = session_mgr or StudioBrowserSessionManager()
        self._breaker = circuit_breaker or _DEFAULT_STUDIO_BREAKER
        self._drift = drift_detector or StructuralDriftDetector()

    def extract(
        self,
        *,
        external_channel_id: str | None,
        filters: StudioTrendsFilter,
    ) -> StudioExtractionResult:
        self._breaker.before_call()
        self._session.check_rate_limit()
        sync_playwright = self._session._import_playwright_sync()
        profile_dir = self._session.config.resolved_profile_dir
        if not profile_dir.exists():
            raise AppError(
                ErrorCode.STUDIO_AUTH_REQUIRED,
                "Sessao persistente do YouTube Studio nao inicializada. Abra a janela de login manual primeiro.",
                http_status=412,
                retryable=True,
                details={"next_action": "Clique em 'Abrir Login YouTube Studio' para autenticar manualmente."},
            )

        target_url = build_studio_research_url(external_channel_id)
        captured_json: list[dict[str, Any]] = []
        body_text = ""
        dom_cards: list[dict[str, Any]] = []

        try:
            with sync_playwright() as p:
                ctx = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=self._session.config.headless,
                    viewport={"width": 1366, "height": 860},
                )
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.set_default_timeout(self._session.config.navigation_timeout_ms)

                def on_response(resp: Any) -> None:
                    try:
                        u = str(resp.url or "").lower()
                        if any(tok in u for tok in ("youtubei", "research", "inspiration", "trends")) and resp.status == 200:
                            ctype = (resp.headers or {}).get("content-type", "")
                            if "json" in ctype:
                                parsed_body = resp.json()
                                if isinstance(parsed_body, dict):
                                    captured_json.append(parsed_body)
                    except Exception:
                        pass

                page.on("response", on_response)
                page.goto(target_url, wait_until="domcontentloaded")
                page.wait_for_timeout(1500)

                cur_url = page.url or ""
                try:
                    body_text = page.locator("body").inner_text(timeout=3000)
                except Exception:
                    body_text = ""
                challenge = detect_auth_or_challenge(cur_url, body_text)
                if challenge is not None:
                    ctx.close()
                    raise AppError(
                        ErrorCode.STUDIO_AUTH_REQUIRED,
                        f"Autenticacao ou verificacao humana necessaria no YouTube Studio ({challenge}).",
                        http_status=412,
                        retryable=True,
                        details={
                            "reason": challenge,
                            "next_action": "Execute login manual na janela do Studio (zero bypass de CAPTCHA/2FA).",
                        },
                    )

                try:
                    search_input = page.locator(
                        "input[type='search'], input[aria-label*='Search'], input[aria-label*='Pesquisar'], [role='searchbox']"
                    ).first
                    if search_input.count() > 0:
                        search_input.click()
                        search_input.fill(filters.broad_topic)
                        search_input.press("Enter")
                        page.wait_for_timeout(2500)
                except Exception:
                    pass

                if filters.only_watched_by_my_viewers:
                    try:
                        chip = page.get_by_text(re.compile(r"Watched by|Assistido pelo seu", re.IGNORECASE)).first
                        if chip.count() > 0:
                            chip.click()
                            page.wait_for_timeout(1200)
                    except Exception:
                        pass

                try:
                    dom_cards = page.evaluate(_SHADOW_DOM_COLLECT_JS) or []
                except Exception:
                    dom_cards = []
                ctx.close()

            net_terms, net_videos = parse_studio_network_payloads(captured_json)
            dom_terms, dom_videos = parse_studio_dom_cards(dom_cards)

            merged_terms = {(t.term.lower(), t.block_type): t for t in (dom_terms + net_terms)}
            merged_videos = {v.external_video_id: v for v in (dom_videos + net_videos)}

            # Enforce zero silent failure on upstream DOM/JSON drift BEFORE post-filtering
            assessment = self._drift.assess_studio_extraction(
                captured_json=captured_json,
                dom_cards=dom_cards,
                body_text=body_text,
                extracted_terms_count=len(merged_terms),
                extracted_videos_count=len(merged_videos),
            )
            self._drift.enforce_no_silent_drift(assessment)

            filtered_terms = [
                t
                for t in merged_terms.values()
                if t.audience_interest == AudienceInterestLevel.UNKNOWN
                or t.audience_interest.rank >= filters.min_interest.rank
            ]
            filtered_videos = [
                v
                for v in merged_videos.values()
                if (not filters.only_watched_by_my_viewers or v.watched_by_my_viewers)
                and (
                    filters.upload_window_days is None
                    or v.published_days_ago is None
                    or v.published_days_ago <= filters.upload_window_days
                )
            ]

            self._breaker.record_success()

            limitations: list[str] = [
                "Content gaps no Studio sao tratados como hipoteses editorialmente nao validadas (podem indicar baixo volume).",
                f"Structure fingerprint: {assessment.structure_fingerprint}",
            ]
            if not captured_json:
                limitations.append("Nenhuma resposta JSON youtubei interceptada; extracao baseada em DOM/Shadow DOM.")

            return StudioExtractionResult(
                broad_topic=filters.broad_topic,
                terms=filtered_terms,
                videos=filtered_videos,
                captured_via="hybrid" if (captured_json and dom_cards) else ("network_json" if captured_json else "dom"),
                limitations=limitations,
            )
        except AppError as exc:
            if exc.code in (ErrorCode.STUDIO_SCHEMA_DRIFT, ErrorCode.STUDIO_RATE_LIMITED):
                self._breaker.record_failure(exc.code.value)
            raise
        except Exception as exc:
            self._breaker.record_failure(type(exc).__name__)
            raise


def extraction_fingerprint(result: StudioExtractionResult) -> str:
    raw = json.dumps(
        {
            "topic": result.broad_topic,
            "terms": [t.term for t in result.terms],
            "videos": [v.external_video_id for v in result.videos],
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
