from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import threading
import pytest

from adapters.google_trends.collector import (
    parse_trends_multiline_json,
    parse_trends_related_json,
    strip_trends_xssi_prefix,
)
from adapters.studio_browser.resilience import (
    STUDIO_DOM_SELECTOR_CHAIN_V2,
    CircuitState,
    DriftVerdict,
    StructuralDriftDetector,
    UpstreamCircuitBreaker,
    compute_structure_fingerprint,
    sanitize_extracted_text,
    sanitize_youtube_video_url,
)
from adapters.studio_browser.session import detect_auth_or_challenge
from adapters.studio_browser.trends_extractor import (
    parse_studio_dom_cards,
    parse_studio_network_payloads,
)
from core.errors import AppError, ErrorCode


class TestRH04ScraperDriftCircuitChaos:
    """
    Gate G-RH04 Validation Suite:
    1. Functional & Multi-Schema: lockupViewModel, gridVideoRenderer, inline XSSI, v2 flat Trends envelopes, legitimate empty states.
    2. Security: XSS / javascript: / data: / non-YouTube SSRF URL rejection, oversized string clamping, zero CAPTCHA/2FA bypass.
    3. Concurrent Stress: 300 parallel deep JSON parses + multi-threaded UpstreamCircuitBreaker state machine transitions.
    4. Chaos Engineering: Hostile DOM/JSON mutations (15KB unknown schema, truncated JSON, renamed CSS classes) NEVER return silent zero.
    """

    def test_functional_multi_schema_studio_and_trends_fallbacks(self) -> None:
        # 1. Modern YouTube Studio lockupViewModel + v2 termViewModel
        modern_payload = [
            {
                "header": {"inspirationTab": "v2"},
                "items": [
                    {
                        "keywordText": {"content": "documentarios geopolitica"},
                        "volumeBadgeText": {"content": "Muito alto"},
                        "isGapQuery": False,
                    },
                    {
                        "keywordText": {"content": "rotas comerciais antigas"},
                        "volumeBadgeText": {"content": "Alto"},
                        "isGapQuery": True,
                    },
                    {
                        "lockupViewModel": {
                            "contentId": "AbCdEf12345",
                            "metadata": {
                                "lockupMetadataViewModel": {
                                    "title": {"content": "O Imperio Maritimo Esquecido"},
                                    "metadata": {
                                        "contentMetadataViewModel": {
                                            "metadataRows": [
                                                {"metadataParts": [{"text": {"content": "Arquivo Global"}}]},
                                                {
                                                    "metadataParts": [
                                                        {"text": {"content": "450 mil visualizações"}},
                                                        {"text": {"content": "há 4 dias"}},
                                                        {"text": {"content": "Assistido pelo seu público"}},
                                                    ]
                                                },
                                            ]
                                        }
                                    },
                                }
                            },
                        }
                    },
                    {
                        "reelItemRenderer": {
                            "videoId": "ShOrTs98765",
                            "headline": {"simpleText": "Mapa em 60 Segundos"},
                            "shortViewCountText": {"simpleText": "1.2M views"},
                        }
                    },
                ],
            }
        ]

        terms, videos = parse_studio_network_payloads(modern_payload)
        assert len(terms) == 2
        gap_terms = [t for t in terms if t.block_type == "content_gap"]
        assert len(gap_terms) == 1 and gap_terms[0].term == "rotas comerciais antigas"
        assert len(videos) == 2
        lockup_vid = next(v for v in videos if v.external_video_id == "AbCdEf12345")
        assert lockup_vid.title == "O Imperio Maritimo Esquecido"
        assert lockup_vid.channel_name == "Arquivo Global"
        assert lockup_vid.public_views == 450_000
        assert lockup_vid.published_days_ago == 4
        assert lockup_vid.watched_by_my_viewers is True

        # 2. Inline XSSI prefix without newline + flat v2 Trends envelope + legitimate empty envelope
        inline_xssi = ')]}\',{"timelineData":[{"time":"1740000000","date":"2026-02","score":91}]}'
        pts = parse_trends_multiline_json(inline_xssi)
        assert len(pts) == 1 and pts[0].value == 91.0

        empty_valid_trends = ")]}',\n" + json.dumps({"default": {"timelineData": []}})
        assert parse_trends_multiline_json(empty_valid_trends) == []

        # 3. Legitimate empty Studio state ("Sem dados suficientes") is NOT flagged as drift
        detector = StructuralDriftDetector()
        legit_empty = detector.assess_studio_extraction(
            captured_json=[{"messageRenderer": {"text": "Sem dados suficientes para esta pesquisa"}}],
            dom_cards=[],
            body_text="Sem dados suficientes para exibir resultados.",
            extracted_terms_count=0,
            extracted_videos_count=0,
        )
        assert legit_empty.verdict == DriftVerdict.EMPTY_LEGITIMATE
        detector.enforce_no_silent_drift(legit_empty)  # Must NOT raise

        assert len(STUDIO_DOM_SELECTOR_CHAIN_V2) >= 4

    def test_security_xss_url_sanitization_and_zero_bypass(self) -> None:
        # Malicious DOM cards from compromised/hostile third-party page content
        hostile_cards = [
            {
                "kind": "video",
                "url": "javascript:alert(document.cookie)//watch?v=EvilId12345",
                "title": "<script>fetch('https://evil.example')</script>Hack",
            },
            {
                "kind": "video",
                "url": "https://evil-phishing.example.com/watch?v=Phish123456",
                "title": "SSRF / Phishing Host",
            },
            {
                "kind": "video",
                "url": "data:text/html,<script>alert(1)</script>",
                "video_id": "../etc/passwd",
                "title": "Traversal",
            },
            {
                "kind": "video",
                "url": "https://www.youtube.com/shorts/ValidId1234",
                "title": "Titulo Seguro\x00\x07<script>bad</script> " + ("X" * 600),
            },
            {
                "kind": "top_search",
                "term": "javascript:void(0)",
                "interest": "high",
            },
        ]

        terms, videos = parse_studio_dom_cards(hostile_cards)
        assert terms == []  # javascript: URI rejected as search term
        assert len(videos) == 1
        assert videos[0].external_video_id == "ValidId1234"
        assert videos[0].canonical_url == "https://www.youtube.com/watch?v=ValidId1234"
        assert "<script" not in videos[0].title
        assert "\x00" not in videos[0].title
        assert len(videos[0].title) <= 240

        assert sanitize_youtube_video_url("file:///etc/hosts", None) == (None, None)
        assert sanitize_extracted_text("data:text/html;base64,PHNjcmlwdD4=") == ""

        # Anti-bypass: CAPTCHA, 2FA, and Google login redirects ALWAYS trigger explicit challenge reason
        assert detect_auth_or_challenge("https://accounts.google.com/v3/signin", "") == "google_login_required"
        assert detect_auth_or_challenge("https://studio.youtube.com/channel/UC123/research", "Please complete reCAPTCHA") == "challenge_or_auth_detected:recaptcha"

    def test_stress_300_concurrent_deep_trees_and_circuit_breaker_atomicity(self) -> None:
        fake_now = [1000.0]
        clock_lock = threading.Lock()

        def clock() -> float:
            with clock_lock:
                return fake_now[0]

        breaker = UpstreamCircuitBreaker(
            "stress_scraper_circuit",
            failure_threshold=4,
            cooldown_seconds=30.0,
            half_open_max_calls=1,
            clock=clock,
        )

        # Build deep nested JSON tree (depth 45 > _MAX_JSON_WALK_DEPTH=36 to also stress recursion guard)
        def make_deep_payload(idx: int) -> dict:
            vid = f"Vid{idx:08d}"[:11]
            leaf: dict = {
                "videoId": vid,
                "title": {"runs": [{"text": f"Stress Video {idx}"}]},
                "viewCountText": {"simpleText": "85K views"},
            }
            deep: dict = {"ignored": "bottom"}
            for _ in range(45):
                deep = {"nested": deep}
            return {"root": [leaf, deep, {"searchTerm": f"termo {idx}", "audienceInterestLevel": "HIGH"}]}

        def worker(i: int) -> tuple[int, int]:
            state = breaker.before_call()
            assert state == CircuitState.CLOSED
            terms, videos = parse_studio_network_payloads([make_deep_payload(i)])
            breaker.record_success()
            return len(terms), len(videos)

        with ThreadPoolExecutor(max_workers=24) as pool:
            results = list(pool.map(worker, range(300)))

        assert len(results) == 300
        assert all(t == 1 and v == 1 for t, v in results)
        assert breaker.stats["state"] == "CLOSED"

        # Trip circuit breaker under concurrent failures
        for _ in range(4):
            breaker.record_failure("STUDIO_SCHEMA_DRIFT")
        assert breaker.stats["state"] == "OPEN"

        # 50 parallel threads hit OPEN circuit -> ALL 50 fail-fast with STUDIO_CIRCUIT_OPEN
        def hit_open(_: int) -> str:
            try:
                breaker.before_call()
                return "ALLOWED"
            except AppError as exc:
                return exc.code.value

        with ThreadPoolExecutor(max_workers=20) as pool:
            open_outcomes = list(pool.map(hit_open, range(50)))
        assert all(code == ErrorCode.STUDIO_CIRCUIT_OPEN.value for code in open_outcomes)

        # Advance clock past cooldown -> exactly 1 probe thread enters HALF_OPEN, others get rejected!
        with clock_lock:
            fake_now[0] += 31.0

        barrier = threading.Barrier(16)

        def race_half_open(_: int) -> str:
            barrier.wait()
            try:
                st = breaker.before_call()
                return st.value
            except AppError as exc:
                return exc.code.value

        with ThreadPoolExecutor(max_workers=16) as pool:
            probe_outcomes = list(pool.map(race_half_open, range(16)))

        assert probe_outcomes.count("HALF_OPEN") == 1
        assert probe_outcomes.count(ErrorCode.STUDIO_CIRCUIT_OPEN.value) == 15

        # Probe succeeds -> transitions cleanly back to CLOSED
        breaker.record_success()
        assert breaker.stats["state"] == "CLOSED"

    def test_chaos_silent_upstream_schema_mutation_and_truncated_json_never_return_silent_zero(self) -> None:
        detector = StructuralDriftDetector()

        # Chaos Case 1: YouTube renames all internal keys in a 16KB HTTP 200 payload
        mutated_yt_payload = {
            "ytStudioV99Envelope": {
                "unrecognizedSectionList": [
                    {"mysteryCardNode": {"opaqueIdentifier": f"item_{i}", "metricBlob": "999_999"}}
                    for i in range(180)
                ]
            }
        }
        assert len(json.dumps(mutated_yt_payload)) > 10_000
        terms, videos = parse_studio_network_payloads([mutated_yt_payload])
        assert terms == [] and videos == []

        assessment = detector.assess_studio_extraction(
            captured_json=[mutated_yt_payload],
            dom_cards=[],
            body_text="YouTube Studio Inspiration v99",
            extracted_terms_count=len(terms),
            extracted_videos_count=len(videos),
        )
        assert assessment.verdict == DriftVerdict.DRIFT_DETECTED
        assert len(assessment.structure_fingerprint) == 24
        with pytest.raises(AppError) as exc_info:
            detector.enforce_no_silent_drift(assessment)
        assert exc_info.value.code == ErrorCode.STUDIO_SCHEMA_DRIFT
        assert exc_info.value.http_status == 502

        # Chaos Case 2: Google Trends renames `default.timelineData` -> `v3Payload.seriesBlob`
        mutated_trends_raw = ")]}',\n" + json.dumps({"v3Payload": {"seriesBlob": [1, 2, 3]}})
        with pytest.raises(AppError) as trends_drift_exc:
            parse_trends_multiline_json(mutated_trends_raw)
        assert trends_drift_exc.value.code == ErrorCode.STUDIO_SCHEMA_DRIFT

        mutated_related_raw = ")]}',\n" + json.dumps({"v3Payload": {"unknownQueries": []}})
        with pytest.raises(AppError) as rel_drift_exc:
            parse_trends_related_json(mutated_related_raw)
        assert rel_drift_exc.value.code == ErrorCode.STUDIO_SCHEMA_DRIFT

        # Chaos Case 3: Truncated mid-flight JSON & empty response on HTTP 200
        with pytest.raises(AppError) as trunc_exc:
            strip_trends_xssi_prefix(")]}',\n{\"default\": {\"timelineData\": [{\"time\": \"1700")
        assert trunc_exc.value.code == ErrorCode.STUDIO_SCHEMA_DRIFT

        with pytest.raises(AppError) as empty_exc:
            strip_trends_xssi_prefix("   ")
        assert empty_exc.value.code == ErrorCode.STUDIO_SCHEMA_DRIFT

        # Structure fingerprint stability check
        fp1 = compute_structure_fingerprint([mutated_yt_payload])
        fp2 = compute_structure_fingerprint([mutated_yt_payload])
        assert fp1 == fp2
