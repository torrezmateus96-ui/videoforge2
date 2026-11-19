import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const webRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(webRoot, "src");

const moduleCache = new Map();

function loadTsModule(filePath) {
  const normalized = path.resolve(filePath);
  if (moduleCache.has(normalized)) return moduleCache.get(normalized);
  const source = fs.readFileSync(normalized, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  moduleCache.set(normalized, mod.exports);
  const localRequire = (spec) => {
    if (spec.startsWith(".")) {
      const candidates = [
        path.resolve(path.dirname(normalized), `${spec}.ts`),
        path.resolve(path.dirname(normalized), `${spec}.tsx`),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return loadTsModule(c);
      }
    }
    return require(spec);
  };
  const fn = new Function("exports", "require", "module", outputText);
  fn(mod.exports, localRequire, mod);
  moduleCache.set(normalized, mod.exports);
  return mod.exports;
}

function walkTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  // =========================================================================
  // 1. Architecture & Complexity Budget
  // =========================================================================
  const pagePath = path.join(srcRoot, "app", "page.tsx");
  const pageSrc = fs.readFileSync(pagePath, "utf8");
  const pageLines = pageSrc.split(/\r?\n/).length;

  assert.ok(pageLines < 260, `page.tsx exceeded 260-line budget: ${pageLines} lines`);
  assert.ok(!pageSrc.includes("useState("), "page.tsx root shell must contain 0 local useState hooks");
  assert.ok(pageSrc.includes('import dynamic from "next/dynamic"'), "page.tsx must use next/dynamic");

  const dynamicCount = (pageSrc.match(/dynamic\(/g) || []).length;
  assert.equal(dynamicCount, 14, `Expected 14 lazy-loaded dynamic() modules in page.tsx, got ${dynamicCount}`);

  const expectedSections = [
    "AgentsFleetSection.tsx",
    "DashboardSection.tsx",
    "ReportsSection.tsx",
    "ChannelsSection.tsx",
    "AnalyticsSection.tsx",
    "ResearchSection.tsx",
    "OpportunitiesSection.tsx",
    "CalendarSection.tsx",
    "BriefsSection.tsx",
    "KnowledgeSection.tsx",
    "ProductionSection.tsx",
    "JobsSection.tsx",
    "SettingsSection.tsx",
  ];
  for (const secFile of expectedSections) {
    const p = path.join(srcRoot, "components", "sections", secFile);
    assert.ok(fs.existsSync(p), `Missing modular section file: ${secFile}`);
  }

  // =========================================================================
  // 2. Security Scan (XSS, Dangerous Globals, Zero Inline Styles in Shell/Sections)
  // =========================================================================
  const allSrcFiles = walkTsFiles(srcRoot);
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(f, "utf8");
    assert.ok(!content.includes("dangerouslySetInnerHTML"), `XSS sink dangerouslySetInnerHTML forbidden in ${f}`);
    assert.ok(!/\beval\s*\(/.test(content), `eval() forbidden in ${f}`);
    assert.ok(!content.includes("window.alert("), `window.alert() forbidden in ${f}`);
    if (f.includes(`${path.sep}sections${path.sep}`) || f.includes(`${path.sep}shell${path.sep}`) || f === pagePath) {
      assert.ok(!content.includes("window.open("), `window.open() forbidden in modular UI file ${f}`);
      assert.ok(!content.includes("style={{"), `Inline style={{}} forbidden in new modular UI file ${f}`);
    }
  }

  // =========================================================================
  // 3. Stress Test: 2,000 Rapid Operations Across Sandbox Store & Studio Reducer
  // =========================================================================
  const { createSandboxStore, SANDBOX_ACCESS_TOKEN } = loadTsModule(path.join(srcRoot, "lib", "local-sandbox-api.ts"));
  const { NAV_ITEMS, mapErrorToNotice } = loadTsModule(path.join(srcRoot, "lib", "navigation.ts"));
  const { ApiClientError } = loadTsModule(path.join(srcRoot, "lib", "api.ts"));
  const { applyStudioEvent } = loadTsModule(path.join(srcRoot, "lib", "studio", "reducer.ts"));

  assert.equal(NAV_ITEMS.length, 14);

  const store = createSandboxStore();
  const t0 = performance.now();

  const createdWs = await store.createWorkspace(SANDBOX_ACCESS_TOKEN, "Stress Workspace", "stress-ws");
  const wsId = createdWs.workspace.id;
  const createdCh = await store.createChannel(SANDBOX_ACCESS_TOKEN, wsId, {
    display_name: "Canal Stress",
    handle: "@canalstress",
    profile: { niche: "Documentario", editorial_theme: "Tema v1" },
  });
  const chId = createdCh.channel.id;

  const orchTopo = await store.getOrchestratorTopology(SANDBOX_ACCESS_TOKEN, wsId);
  assert.equal(orchTopo.master.total_leads, 12);
  assert.equal(orchTopo.master.total_subagents, 40);
  const orchExec = await store.executeOrchestratorMission(SANDBOX_ACCESS_TOKEN, wsId, {
    objective: "Executar frota completa de agentes e subagentes do projeto",
    scope: "full_project",
    channel_id: chId,
  });
  assert.equal(orchExec.report.executed_steps.length, 40);
  assert.equal(orchExec.report.requires_human_publish, true);
  assert.equal(orchExec.report.auto_publish_enabled, false);

  // Honest unsynced analytics check (absence != zero)
  const chAnalytics = await store.getChannelAnalytics(SANDBOX_ACCESS_TOKEN, wsId, chId);
  assert.equal(chAnalytics.metrics[0].availability, "unknown");
  assert.equal(chAnalytics.metrics[0].value_num, null);

  let snap = await store.getStudioSnapshot(SANDBOX_ACCESS_TOKEN, wsId, chId);
  assert.equal(snap.agents.length, 8);
  assert.equal(snap.rooms.length, 6);
  assert.equal(snap.metrics_panel.availability, "unknown");

  let ops = 0;
  for (let i = 0; i < 500; i += 1) {
    // 1) Idempotent job enqueue + deduplication check
    const r1 = await store.enqueueJob(
      SANDBOX_ACCESS_TOKEN,
      wsId,
      { job_type: "stress.check", payload: { idx: i }, total_steps: 2 },
      `idem-key-${i % 100}`
    );
    if (i >= 100) {
      assert.equal(r1.deduplicated, true);
    }
    ops += 1;

    // 2) Profile version / opportunity / brief cycle every 10th iteration
    if (i % 10 === 0) {
      await store.updateProfile(SANDBOX_ACCESS_TOKEN, wsId, chId, {
        niche: "Documentario",
        editorial_theme: `Tema v${i + 2}`,
        change_summary: `Ciclo ${i}`,
      });
      const opp = await store.generateOpportunities(SANDBOX_ACCESS_TOKEN, wsId, {
        channel_id: chId,
        topic_hint: `Hipotese ${i}`,
        target_format: "long",
      });
      const br = await store.createBrief(SANDBOX_ACCESS_TOKEN, wsId, {
        opportunity_id: opp.opportunity.id,
        title: `Brief ${i}`,
        hook: "Hook 0-15s",
        angle: "Angulo documental",
      });
      await store.approveBrief(SANDBOX_ACCESS_TOKEN, wsId, br.brief.id);
      const pi = await store.createProductionIntent(
        SANDBOX_ACCESS_TOKEN,
        wsId,
        br.brief.id,
        `prod-idem-${br.brief.id}`
      );
      assert.equal(pi.deduplicated, false);
      ops += 5;
    }

    // 3) 2.5D Studio reducer rapid event stream
    snap = applyStudioEvent(snap, {
      id: i + 1,
      workspace_id: wsId,
      channel_id: chId,
      run_id: `run-${i}`,
      content_item_id: null,
      agent_key: NAV_ITEMS[i % NAV_ITEMS.length].id === "studio" ? "dados" : "pesquisa",
      seq: i + 1,
      event_type: i % 2 === 0 ? "progress" : "completed",
      summary: `Evento ${i}`,
      payload: { progress: 65, stage_label: "Analisando" },
      created_at: new Date().toISOString(),
    });
    ops += 2;
  }

  // Pad remaining fast navigation/query ops to exceed 2,000 operations
  while (ops < 2000) {
    await store.listJobs(SANDBOX_ACCESS_TOKEN, wsId);
    ops += 1;
  }

  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 600, `2,000-op stress test exceeded budget: ${elapsedMs.toFixed(2)}ms`);

  const versions = await store.listProfileVersions(SANDBOX_ACCESS_TOKEN, wsId, chId);
  assert.equal(versions.items.length, 51); // 1 initial + 50 immutable updates

  // =========================================================================
  // 4. Client Chaos Engineering (Error Mapping, Forbidden Tenant, Unapproved Brief)
  // =========================================================================
  const chaosErrors = [
    new ApiClientError(503, {
      code: "SUPABASE_UNAVAILABLE",
      message: "Banco indisponivel",
      retryable: true,
      details: { next_action: "Reconectar" },
    }),
    new ApiClientError(403, {
      code: "WORKSPACE_FORBIDDEN",
      message: "Tenant cruzado bloqueado",
      retryable: false,
    }),
    new ApiClientError(409, {
      code: "VERSION_CONFLICT",
      message: "Conflito de versao otimista",
      retryable: false,
    }),
    new ApiClientError(502, {
      code: "STUDIO_SCHEMA_DRIFT",
      message: "Upstream DOM mudou",
      retryable: false,
    }),
    new TypeError("Failed to fetch"),
  ];

  const notices = chaosErrors.map((e) => mapErrorToNotice(e));
  assert.equal(notices[0].kind, "err");
  assert.equal(notices[0].nextAction, "Reconectar");
  assert.equal(notices[1].kind, "err");
  assert.equal(notices[2].kind, "warn");
  assert.equal(notices[3].code, "STUDIO_SCHEMA_DRIFT");
  assert.equal(notices[4].code, "UNEXPECTED_ERROR");

  // Cross-workspace access throws WORKSPACE_FORBIDDEN
  await assert.rejects(
    () => store.listChannels(SANDBOX_ACCESS_TOKEN, "ws-foreign-unauthorized"),
    (err) => err.status === 403 && err.envelope.code === "WORKSPACE_FORBIDDEN"
  );

  // Unapproved DRAFT brief cannot create production intent
  const draftBrief = await store.createBrief(SANDBOX_ACCESS_TOKEN, wsId, {
    opportunity_id: "opp-1",
    title: "Draft Nao Aprovado",
    hook: "Hook",
    angle: "Angulo",
  });
  await assert.rejects(
    () => store.createProductionIntent(SANDBOX_ACCESS_TOKEN, wsId, draftBrief.brief.id, "illegal-draft-intent"),
    (err) => err.status === 409 && err.envelope.code === "VERSION_CONFLICT"
  );

  console.log(
    JSON.stringify({
      ok: true,
      page_lines: pageLines,
      dynamic_chunks: dynamicCount,
      stress_ops: ops,
      elapsed_ms: Number(elapsedMs.toFixed(2)),
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
