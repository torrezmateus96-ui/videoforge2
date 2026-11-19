"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { getStatusLabelPt } from "@/lib/studio/studio-layout";
import { buildAgentRigFleet, type AgentRigFleet } from "@/lib/studio/three/agent-rig";
import {
  AGENT_WARDROBES,
  CAMERA_PRESETS,
  presetForRoom,
  STUDIO_3D_WINGS,
  type CameraPresetKey,
} from "@/lib/studio/three/hq-blueprint";
import {
  buildArchitecturalHQ,
  RAYCAST_LAYER,
  type BuiltHQScene,
} from "@/lib/studio/three/hq-builder";
import { createProceduralTexturePack } from "@/lib/studio/three/procedural-textures";
import type { AgentKey, RoomKey, StudioAgentState, StudioRoomState } from "@/lib/studio/types";

interface StudioStageProps {
  channelName?: string;
  rooms: StudioRoomState[];
  agents: StudioAgentState[];
  selectedRoom: RoomKey | null;
  selectedAgent: AgentKey | null;
  loading: boolean;
  error: string | null;
  hudOverlay?: React.ReactNode;
  onSelectRoom: (roomKey: RoomKey, triggerEl?: HTMLButtonElement | null) => void;
  onSelectAgent: (agentKey: AgentKey) => void;
  onRetryLoad?: () => void;
}

// Pre-allocated math helpers at module scope — zero GC allocations in render loop
const _projVec = new THREE.Vector3();
const _headWorldVec = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();

const ROOM_ORDER: RoomKey[] = [
  "mesa_agentes",
  "sala_dados",
  "pesquisa",
  "estrategia_publicacao",
  "gravacao",
  "design_thumbnail",
];

const CAMERA_PRESET_LIST: CameraPresetKey[] = [
  "overview",
  "boardroom",
  "sala_dados",
  "pesquisa",
  "estrategia_publicacao",
  "gravacao",
  "design_thumbnail",
];

function detectSoftwareWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probeCanvas = document.createElement("canvas");
    const gl = probeCanvas.getContext("webgl2") || probeCanvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function statusTone(status: StudioAgentState["status"]): "ok" | "warn" | "err" | "muted" {
  switch (status) {
    case "done":
      return "ok";
    case "working":
    case "needs_review":
    case "waiting_approval":
    case "waiting_input":
      return "warn";
    case "failed":
    case "blocked":
    case "no_signal":
      return "err";
    default:
      return "muted";
  }
}

function AgentSvgIcon({ agentKey }: { agentKey: AgentKey }) {
  switch (agentKey) {
    case "dados":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 16V10M8 16V4M13 16V8M18 16V6" strokeLinecap="round" />
        </svg>
      );
    case "pesquisa":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5" />
          <path d="M12.5 12.5L17 17" strokeLinecap="round" />
        </svg>
      );
    case "estrategia":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 15L8 10L12 13L17 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 6H17V10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "titulos":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 9V4H8L16 12L11 17L3 9Z" strokeLinejoin="round" />
          <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
      );
    case "roteiro":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="4" y="3" width="12" height="14" rx="2" />
          <path d="M7 7H13M7 10H13M7 13H10" strokeLinecap="round" />
        </svg>
      );
    case "thumbnail":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <circle cx="7.5" cy="8" r="1.4" />
          <path d="M4 15L8.5 10.5L12 14L14.5 11.5L17 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "edicao":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="5" width="14" height="11" rx="2" />
          <path d="M8.5 8.5L13 10.5L8.5 12.5V8.5Z" fill="currentColor" />
        </svg>
      );
    case "publicacao":
      return (
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 8H17M7 2.5V5.5M13 2.5V5.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function StudioStage({
  channelName,
  rooms,
  agents,
  selectedRoom,
  selectedAgent,
  loading,
  error,
  hudOverlay,
  onSelectRoom,
  onSelectAgent,
  onRetryLoad,
}: StudioStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const roomMarkerRefs = useRef<Map<RoomKey, HTMLButtonElement>>(new Map());
  const agentMarkerRefs = useRef<Map<AgentKey, HTMLButtonElement>>(new Map());

  // Mutable scene controllers stored in refs so React UI updates never recreate WebGL context
  const hqSceneRef = useRef<BuiltHQScene | null>(null);
  const agentFleetRef = useRef<AgentRigFleet | null>(null);
  const cameraGoalRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(
      CAMERA_PRESETS.overview.position.x,
      CAMERA_PRESETS.overview.position.y,
      CAMERA_PRESETS.overview.position.z
    ),
    target: new THREE.Vector3(
      CAMERA_PRESETS.overview.target.x,
      CAMERA_PRESETS.overview.target.y,
      CAMERA_PRESETS.overview.target.z
    ),
  });
  const lightingRigRef = useRef<{
    renderer: THREE.WebGLRenderer;
    keyLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    boardPointLight: THREE.PointLight;
    controls: OrbitControls;
    isSoftwareGl: boolean;
  } | null>(null);

  const callbacksRef = useRef({ onSelectRoom, onSelectAgent });
  callbacksRef.current = { onSelectRoom, onSelectAgent };

  const [activePreset, setActivePreset] = useState<CameraPresetKey>("overview");
  const [lightingMode, setLightingMode] = useState<"executive" | "midnight">("executive");
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showHudDrawer, setShowHudDrawer] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [webglFallback, setWebglFallback] = useState<string | null>(null);

  const flyToPreset = useCallback((presetKey: CameraPresetKey) => {
    const p = CAMERA_PRESETS[presetKey];
    setActivePreset(presetKey);
    cameraGoalRef.current.pos.set(p.position.x, p.position.y, p.position.z);
    cameraGoalRef.current.target.set(p.target.x, p.target.y, p.target.z);
    cameraGoalRef.current.active = true;
  }, []);

  // Sync selectedRoom camera focus smoothly when user selects a room
  useEffect(() => {
    if (selectedRoom) {
      flyToPreset(presetForRoom(selectedRoom));
    }
  }, [selectedRoom, flyToPreset]);

  // Keyboard shortcut 'H' for Cinema / Zen Mode (collapses HUD & bottom dock)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "h" || e.key === "H") {
        setDockCollapsed((prev) => !prev);
        setShowHudDrawer(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Sync rooms & agents into the live 3D scene without re-creating WebGLRenderer
  useEffect(() => {
    hqSceneRef.current?.updateRoomStates(rooms, selectedRoom);
  }, [rooms, selectedRoom]);

  useEffect(() => {
    agentFleetRef.current?.syncAgents(agents, selectedAgent);
  }, [agents, selectedAgent]);

  // Sync lighting atmosphere & auto-orbit
  useEffect(() => {
    const rig = lightingRigRef.current;
    if (!rig) return;
    if (lightingMode === "executive") {
      rig.renderer.toneMappingExposure = 1.14;
      rig.keyLight.intensity = 2.15;
      rig.hemiLight.intensity = 0.95;
      rig.boardPointLight.intensity = 1.6;
    } else {
      rig.renderer.toneMappingExposure = 0.96;
      rig.keyLight.intensity = 1.35;
      rig.hemiLight.intensity = 0.55;
      rig.boardPointLight.intensity = 2.2;
    }
    rig.controls.autoRotate = !rig.isSoftwareGl && autoOrbit;
  }, [lightingMode, autoOrbit]);

  // Initialize Three.js WebGL Scene ONCE in dedicated isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    const viewportEl = viewportRef.current;
    if (!mountEl || !viewportEl) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFallback("WebGL indisponível neste dispositivo. Use os controles de salas abaixo.");
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = Math.max(320, viewportEl.clientWidth);
    const initH = Math.max(240, viewportEl.clientHeight);
    renderer.setSize(initW, initH);
    mountEl.innerHTML = "";
    mountEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a10);
    scene.fog = new THREE.FogExp2(0x070a10, 0.0125);

    // Mandatory Studio Environment Reflection (RoomEnvironment + PMREM)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.25, 120);
    camera.position.set(
      CAMERA_PRESETS.overview.position.x,
      CAMERA_PRESETS.overview.position.y,
      CAMERA_PRESETS.overview.position.z
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(
      CAMERA_PRESETS.overview.target.x,
      CAMERA_PRESETS.overview.target.y,
      CAMERA_PRESETS.overview.target.z
    );
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 7.5;
    controls.maxDistance = 38;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.autoRotateSpeed = 0.55;
    controls.update();

    // Cancel scripted camera preset transition immediately when user grabs OrbitControls
    const onControlStart = () => {
      cameraGoalRef.current.active = false;
    };
    controls.addEventListener("start", onControlStart);

    // Balanced 3-Point Architectural Studio Rig + Interior Board Room Chandelier
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.95);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 2.15);
    keyLight.position.set(14, 24, 16);
    keyLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 65;
      keyLight.shadow.camera.left = -22;
      keyLight.shadow.camera.right = 22;
      keyLight.shadow.camera.top = 22;
      keyLight.shadow.camera.bottom = -22;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.95);
    rimLight.position.set(-16, 15, -18);
    scene.add(rimLight);

    const boardPointLight = new THREE.PointLight(0xfbbf24, 1.6, 18, 1.8);
    boardPointLight.position.set(0, 3.2, 0.35);
    scene.add(boardPointLight);

    // Build Procedural PBR Textures, Architectural HQ Wings, and 8 Articulated Agents
    const textures = createProceduralTexturePack(renderer);
    const builtHQ = buildArchitecturalHQ(textures, channelName || "DARKFORGE HQ", isSoftwareGl);
    scene.add(builtHQ.root);
    hqSceneRef.current = builtHQ;

    const agentFleet = buildAgentRigFleet(textures, isSoftwareGl);
    scene.add(agentFleet.group);
    agentFleetRef.current = agentFleet;

    builtHQ.updateRoomStates(rooms, selectedRoom);
    agentFleet.syncAgents(agents, selectedAgent);

    lightingRigRef.current = {
      renderer,
      keyLight,
      hemiLight,
      boardPointLight,
      controls,
      isSoftwareGl,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // High-Performance Raycasting restricted to RAYCAST_LAYER (Layer 1)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(RAYCAST_LAYER);
    const allProxies = [...builtHQ.clickableProxies, ...agentFleet.clickableProxies];

    let downClientX = 0;
    let downClientY = 0;
    let lastHoverTime = 0;

    const onCanvasPointerDown = (ev: PointerEvent) => {
      downClientX = ev.clientX;
      downClientY = ev.clientY;
    };

    const onCanvasPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 55) return;
      lastHoverTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(allProxies, false);
      renderer.domElement.style.cursor = hits.length > 0 ? "pointer" : "grab";
    };

    const onCanvasPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - downClientX, ev.clientY - downClientY);
      if (moved > 6) return; // User was orbiting/panning, not clicking
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      _pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointerNdc, camera);
      const hits = raycaster.intersectObjects(allProxies, false);
      if (hits.length === 0) return;

      const hitData = hits[0].object.userData as {
        kind?: "room" | "agent";
        roomKey?: RoomKey;
        agentKey?: AgentKey;
      };
      if (hitData.kind === "agent" && hitData.agentKey) {
        callbacksRef.current.onSelectAgent(hitData.agentKey);
      } else if (hitData.kind === "room" && hitData.roomKey) {
        callbacksRef.current.onSelectRoom(hitData.roomKey, roomMarkerRefs.current.get(hitData.roomKey) ?? null);
      }
    };

    const domCanvas = renderer.domElement;
    domCanvas.addEventListener("pointerdown", onCanvasPointerDown);
    domCanvas.addEventListener("pointermove", onCanvasPointerMove);
    domCanvas.addEventListener("pointerup", onCanvasPointerUp);

    // WebGL Context Lost / Restored Safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFallback("Contexto gráfico 3D em recuperação…");
    };
    const onContextRestored = () => {
      setWebglFallback(null);
    };
    domCanvas.addEventListener("webglcontextlost", onContextLost);
    domCanvas.addEventListener("webglcontextrestored", onContextRestored);

    // Responsive ResizeObserver
    let width = initW;
    let height = initH;
    const resizeObs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextW = Math.max(320, Math.round(entry.contentRect.width));
      const nextH = Math.max(240, Math.round(entry.contentRect.height));
      if (nextW === width && nextH === height) return;
      width = nextW;
      height = nextH;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObs.observe(viewportEl);

    // Software-WebGL Safe Paced Animation Loop (afterDraw fenceSync when isSoftwareGl)
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === "function") {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 6);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 6);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function projectMarkers() {
      // 1. Project Architectural Room Plaques
      ROOM_ORDER.forEach((rKey) => {
        const btn = roomMarkerRefs.current.get(rKey);
        if (!btn) return;
        const anchor = STUDIO_3D_WINGS[rKey].labelAnchorWorld;
        _projVec.set(anchor.x, anchor.y, anchor.z).project(camera);
        const visible = _projVec.z > -1 && _projVec.z < 1;
        if (!visible) {
          btn.style.opacity = "0";
          btn.style.pointerEvents = "none";
          return;
        }
        const sx = ((_projVec.x + 1) * 0.5) * width;
        const sy = ((-_projVec.y + 1) * 0.5) * height;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      });

      // 2. Project Specialist Agent Floating Nameplates
      agentMarkerRefs.current.forEach((btn, aKey) => {
        const ok = agentFleet.getHeadWorldPosition(aKey, _headWorldVec);
        if (!ok) {
          btn.style.opacity = "0";
          btn.style.pointerEvents = "none";
          return;
        }
        _projVec.copy(_headWorldVec).project(camera);
        if (_projVec.z <= -1 || _projVec.z >= 1) {
          btn.style.opacity = "0";
          btn.style.pointerEvents = "none";
          return;
        }
        const sx = ((_projVec.x + 1) * 0.5) * width;
        const sy = ((-_projVec.y + 1) * 0.5) * height;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      });
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.elapsedTime;

      // Smooth exponential damping for camera preset glides
      const goal = cameraGoalRef.current;
      if (goal.active) {
        const step = 1 - Math.exp(-5.2 * delta);
        camera.position.lerp(goal.pos, step);
        controls.target.lerp(goal.target, step);
        if (
          camera.position.distanceToSquared(goal.pos) < 0.004 &&
          controls.target.distanceToSquared(goal.target) < 0.004
        ) {
          camera.position.copy(goal.pos);
          controls.target.copy(goal.target);
          goal.active = false;
        }
      }

      controls.update();

      // Subtle architectural core & agent kinematics
      builtHQ.crystalCore.rotation.y = elapsed * 0.55;
      builtHQ.crystalCore.position.y = 1.18 + Math.sin(elapsed * 1.8) * 0.06;
      agentFleet.tickKinematics(delta, elapsed);

      renderer.render(scene, camera);
      projectMarkers();

      if (isSoftwareGl) afterDraw(tick);
      else frameId = window.requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObs.disconnect();
      controls.removeEventListener("start", onControlStart);
      controls.dispose();
      domCanvas.removeEventListener("pointerdown", onCanvasPointerDown);
      domCanvas.removeEventListener("pointermove", onCanvasPointerMove);
      domCanvas.removeEventListener("pointerup", onCanvasPointerUp);
      domCanvas.removeEventListener("webglcontextlost", onContextLost);
      domCanvas.removeEventListener("webglcontextrestored", onContextRestored);
      agentFleet.dispose();
      builtHQ.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      hqSceneRef.current = null;
      agentFleetRef.current = null;
      lightingRigRef.current = null;
    };
    // Intentionally mounted once so React state updates never destroy the WebGL canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roomStateByKey = new Map(rooms.map((r) => [r.room_key, r]));
  const workingCount = agents.filter((a) => a.enabled && a.status === "working").length;
  const approvalCount = agents.filter((a) => a.enabled && a.status === "waiting_approval").length;

  return (
    <div className="studio-stage-shell">
      <div
        ref={viewportRef}
        className="studio-3d-viewport"
        aria-label="Sede Arquitetônica 3D Interativa dos Agentes"
      >
        {/* Dedicated empty ref container for Three.js WebGL canvas */}
        <div ref={canvasMountRef} className="studio-webgl-mount" />

        {/* Projected Semantic DOM Layer (Room Plaques + Agent Nameplates) */}
        <div
          className={`studio-projected-layer ${!showLabels || dockCollapsed ? "is-labels-hidden" : ""}`}
        >
          {ROOM_ORDER.map((rKey) => {
            const wing = STUDIO_3D_WINGS[rKey];
            const state = roomStateByKey.get(rKey);
            const isSelected = selectedRoom === rKey;
            const isUnavailable = Boolean(state && state.agents === 0 && state.disabled_agents > 0);
            const hasAlert = Boolean(state && (state.failed > 0 || state.blocked > 0));

            return (
              <button
                key={rKey}
                ref={(el) => {
                  if (el) roomMarkerRefs.current.set(rKey, el);
                  else roomMarkerRefs.current.delete(rKey);
                }}
                type="button"
                data-room-key={rKey}
                className={[
                  "studio-3d-room-plaque",
                  isSelected ? "is-selected" : "",
                  isUnavailable ? "is-disabled" : "",
                  hasAlert ? "is-alert" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`${wing.fasciaTitle} — clique para abrir sala`}
                aria-expanded={isSelected}
                onClick={(e) => onSelectRoom(rKey, e.currentTarget)}
              >
                <span className="studio-3d-room-wing">{wing.wingNumber}</span>
                <span className="studio-3d-room-name">{wing.fasciaTitle}</span>
                {state && !isUnavailable && state.working > 0 && (
                  <span className="studio-3d-room-stat warn">{state.working} ativo</span>
                )}
                {state && !isUnavailable && state.awaiting_human > 0 && (
                  <span className="studio-3d-room-stat info">{state.awaiting_human} gate</span>
                )}
                {hasAlert && state && (
                  <span className="studio-3d-room-stat err">{state.blocked + state.failed} alerta</span>
                )}
              </button>
            );
          })}

          {agents.map((agent) => {
            const tone = statusTone(agent.status);
            const isSelected = selectedAgent === agent.agent_key;
            const wardrobe = AGENT_WARDROBES[agent.agent_key];

            return (
              <button
                key={agent.channel_agent_id}
                ref={(el) => {
                  if (el) agentMarkerRefs.current.set(agent.agent_key, el);
                  else agentMarkerRefs.current.delete(agent.agent_key);
                }}
                type="button"
                data-agent-key={agent.agent_key}
                data-agent-status={agent.status}
                className={[
                  "studio-3d-agent-tag",
                  `tone-${tone}`,
                  isSelected ? "is-selected" : "",
                  !agent.enabled ? "is-disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`${agent.display_name} (${agent.agent_key}): ${getStatusLabelPt(agent.status)}`}
                onClick={() => onSelectAgent(agent.agent_key)}
              >
                <span className={`studio-3d-agent-swatch tone-${tone}`} aria-hidden="true" />
                <span className="studio-3d-agent-icon">
                  <AgentSvgIcon agentKey={agent.agent_key} />
                </span>
                <span className="studio-3d-agent-label">{agent.display_name}</span>
                <span className="studio-3d-agent-role">{wardrobe?.roleBadge ?? agent.agent_key.toUpperCase()}</span>
                {agent.status === "working" && agent.progress !== null && (
                  <span className="studio-3d-agent-pct tabular-nums">{Math.round(agent.progress * 100)}%</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Minimal Top-Left Spec Header + Optional Collapsible Telemetry Drawer (Never blocks center 3D scene!) */}
        {!dockCollapsed && (
          <div className="studio-3d-topbar">
            <div className="studio-3d-brand-badge">
              <span className="studio-3d-apex-mark" aria-hidden="true">▲</span>
              <div>
                <div className="studio-3d-brand-title">
                  {channelName ? `${channelName.toUpperCase()} · AGENT HQ` : "DARKFORGE · AGENT ORGANIZATION"}
                </div>
                <div className="studio-3d-brand-meta tabular-nums">
                  6 Alas 3D · {agents.length || 8} Especialistas
                  {workingCount > 0 ? ` · ${workingCount} em execução` : ""}
                  {approvalCount > 0 ? ` · ${approvalCount} no Board Room` : ""}
                </div>
              </div>
            </div>

            {hudOverlay && (
              <button
                type="button"
                className={`studio-3d-hud-toggle ${showHudDrawer ? "is-open" : ""}`}
                onClick={() => setShowHudDrawer((v) => !v)}
                aria-expanded={showHudDrawer}
              >
                {showHudDrawer ? "▴ Recolher Telemetria" : "▾ Telemetria & Oportunidade"}
              </button>
            )}
          </div>
        )}

        {hudOverlay && showHudDrawer && !dockCollapsed && (
          <div className="studio-3d-hud-drawer">{hudOverlay}</div>
        )}

        {/* Unified Collapsible Bottom Control Dock (Zero Side-Panel Occlusion!) */}
        <div className={`studio-3d-bottom-dock-wrap ${dockCollapsed ? "is-collapsed" : ""}`}>
          <button
            type="button"
            className="studio-3d-dock-handle"
            onClick={() => setDockCollapsed((v) => !v)}
            title="Alternar Modo Cinema (Tecla H)"
          >
            {dockCollapsed ? "▴ Mostrar Controles 3D [H]" : "▾ Modo Cinema [H]"}
          </button>

          <div className="studio-3d-bottom-dock" role="toolbar" aria-label="Câmeras e atmosfera do Estúdio 3D">
            <div className="studio-3d-dock-group">
              {CAMERA_PRESET_LIST.map((presetKey) => {
                const preset = CAMERA_PRESETS[presetKey];
                return (
                  <button
                    key={presetKey}
                    type="button"
                    className={`studio-3d-dock-btn ${activePreset === presetKey ? "is-active" : ""}`}
                    onClick={() => flyToPreset(presetKey)}
                  >
                    {preset.shortLabel}
                  </button>
                );
              })}
            </div>

            <div className="studio-3d-dock-divider" aria-hidden="true" />

            <div className="studio-3d-dock-group">
              <button
                type="button"
                className={`studio-3d-dock-btn ${lightingMode === "midnight" ? "is-active" : ""}`}
                onClick={() => setLightingMode((m) => (m === "executive" ? "midnight" : "executive"))}
                title="Alternar iluminação arquitetônica"
              >
                {lightingMode === "executive" ? "Luz: Executiva" : "Luz: Noturna"}
              </button>
              <button
                type="button"
                className={`studio-3d-dock-btn ${autoOrbit ? "is-active" : ""}`}
                onClick={() => setAutoOrbit((v) => !v)}
                title="Rotação orbital suave ao redor do Board Room"
              >
                {autoOrbit ? "Órbita: ON" : "Órbita"}
              </button>
              <button
                type="button"
                className={`studio-3d-dock-btn ${showLabels ? "is-active" : ""}`}
                onClick={() => setShowLabels((v) => !v)}
                title="Mostrar ou ocultar placas flutuantes"
              >
                Placas
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="studio-stage-overlay-msg" role="status" aria-live="polite">
            <div className="studio-skeleton-bar" />
            <span>Sincronizando estado real da sede 3D…</span>
          </div>
        )}

        {!loading && error && (
          <div className="studio-stage-overlay-msg is-error" role="alert">
            <strong>Falha ao carregar o estúdio</strong>
            <span>{error}</span>
            {onRetryLoad && (
              <button type="button" className="btn primary" onClick={onRetryLoad}>
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {webglFallback && (
          <div className="studio-stage-overlay-msg" role="status">
            <strong>Modo de Segurança Gráfico</strong>
            <span>{webglFallback}</span>
          </div>
        )}
      </div>

      {/* Mobile Accessible Room + Agent List (< 768px) */}
      <div className="studio-mobile-list" aria-label="Lista de salas e agentes do estúdio">
        {ROOM_ORDER.map((rKey) => {
          const wing = STUDIO_3D_WINGS[rKey];
          const state = roomStateByKey.get(rKey);
          const roomAgents = agents.filter((a) => a.room_key === rKey);
          const isUnavailable = Boolean(state && state.agents === 0 && state.disabled_agents > 0);

          return (
            <section key={rKey} className="studio-mobile-room-card">
              <div className="studio-mobile-room-head">
                <button
                  type="button"
                  className="studio-mobile-room-btn"
                  onClick={(e) => onSelectRoom(rKey, e.currentTarget)}
                >
                  <strong>{wing.fasciaTitle}</strong>
                  <span className="muted">
                    {isUnavailable ? "Módulo indisponível" : `${roomAgents.filter((a) => a.enabled).length} agentes`}
                  </span>
                </button>
              </div>
              <div className="studio-mobile-agents">
                {roomAgents.length === 0 ? (
                  <span className="muted">Sem agentes nesta ala</span>
                ) : (
                  roomAgents.map((agent) => (
                    <button
                      key={agent.channel_agent_id}
                      type="button"
                      className={`studio-mobile-agent-chip tone-${statusTone(agent.status)}`}
                      onClick={() => onSelectAgent(agent.agent_key)}
                    >
                      <AgentSvgIcon agentKey={agent.agent_key} />
                      <span>{agent.display_name}</span>
                      <span className="studio-chip-status">{getStatusLabelPt(agent.status)}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
