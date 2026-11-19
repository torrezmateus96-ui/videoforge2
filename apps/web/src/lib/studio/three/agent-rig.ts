import * as THREE from "three";
import type { AgentKey, AgentVisualStatus, StudioAgentState } from "../types";
import { AGENT_WARDROBES, resolveAgent3DWorldPosition, type Vec3Tuple } from "./hq-blueprint";
import { RAYCAST_LAYER } from "./hq-builder";
import type { ProceduralTexturePack } from "./procedural-textures";

export interface AgentRigInstance {
  agentKey: AgentKey;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  haloMat: THREE.MeshStandardMaterial;
  proxyMesh: THREE.Mesh;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentYaw: number;
  targetYaw: number;
  status: AgentVisualStatus;
  enabled: boolean;
  phaseOffset: number;
}

export interface AgentRigFleet {
  group: THREE.Group;
  rigs: Map<AgentKey, AgentRigInstance>;
  clickableProxies: THREE.Object3D[];
  syncAgents: (agents: StudioAgentState[], selectedAgent: AgentKey | null) => void;
  tickKinematics: (delta: number, elapsed: number) => void;
  getHeadWorldPosition: (agentKey: AgentKey, out: THREE.Vector3) => boolean;
  dispose: () => void;
}

function statusHaloHex(status: AgentVisualStatus, enabled: boolean, isSelected: boolean): number {
  if (isSelected) return 0xfbbf24;
  if (!enabled || status === "disabled") return 0x475569;
  switch (status) {
    case "done":
      return 0x22c55e;
    case "working":
      return 0xf59e0b;
    case "waiting_approval":
    case "needs_review":
    case "waiting_input":
      return 0x38bdf8;
    case "failed":
    case "blocked":
    case "no_signal":
      return 0xef4444;
    default:
      return 0x94a3b8;
  }
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export function buildAgentRigFleet(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean
): AgentRigFleet {
  const group = new THREE.Group();
  const rigs = new Map<AgentKey, AgentRigInstance>();
  const clickableProxies: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared geometries for articulated 11-part executive/specialist characters
  const shoeGeo = trackGeo(new THREE.BoxGeometry(0.13, 0.08, 0.22));
  const legGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.056, 0.62, 10));
  const torsoGeo = trackGeo(new THREE.CylinderGeometry(0.21, 0.17, 0.64, 12));
  const shirtVGeo = trackGeo(new THREE.ConeGeometry(0.09, 0.28, 4));
  const tieGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.34, 0.03));
  const armGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.045, 0.54, 10));
  const headGeo = trackGeo(new THREE.SphereGeometry(0.155, 16, 14));
  const hairCapGeo = trackGeo(new THREE.SphereGeometry(0.163, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58));
  const tabletGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.28, 0.025));
  const haloGeo = trackGeo(new THREE.RingGeometry(0.32, 0.42, 32));
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(0.95, 0.95));
  const proxyGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 1.95, 10));

  const shoeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.25 })
  );
  const tabletMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.6,
    })
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.58,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const proxyMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));

  const agentKeys = Object.keys(AGENT_WARDROBES) as AgentKey[];
  agentKeys.forEach((agentKey, idx) => {
    const spec = AGENT_WARDROBES[agentKey];
    const rigRoot = new THREE.Group();
    rigRoot.position.set(0, 0.24, 0);
    group.add(rigRoot);

    const suitMat = trackMat(
      new THREE.MeshStandardMaterial({ color: spec.suitHex, roughness: 0.58, metalness: 0.14 })
    );
    const trouserMat = trackMat(
      new THREE.MeshStandardMaterial({ color: spec.suitHex, roughness: 0.66, metalness: 0.08 })
    );
    const shirtMat = trackMat(
      new THREE.MeshStandardMaterial({ color: spec.shirtHex, roughness: 0.72, metalness: 0.04 })
    );
    const tieMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: spec.tieHex,
        emissive: spec.tieHex,
        emissiveIntensity: 0.2,
        roughness: 0.34,
        metalness: 0.35,
      })
    );
    const skinMat = trackMat(
      new THREE.MeshStandardMaterial({ color: spec.skinHex, roughness: 0.64, metalness: 0.02 })
    );
    const hairMat = trackMat(
      new THREE.MeshStandardMaterial({ color: spec.hairHex, roughness: 0.78, metalness: 0.05 })
    );
    const haloMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        emissive: 0x94a3b8,
        emissiveIntensity: 0.95,
        roughness: 0.25,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );

    // 1. Contact Shadow + Grounded Status Halo Ring
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.015;
    rigRoot.add(sh);

    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.025;
    rigRoot.add(halo);

    const bodyPivot = new THREE.Group();
    rigRoot.add(bodyPivot);

    // 2. Articulated Left & Right Legs + Dress Shoes (pivoted at hip y = 0.68)
    const makeLeg = (xOff: number) => {
      const hip = new THREE.Group();
      hip.position.set(xOff, 0.68, 0);
      const legMesh = new THREE.Mesh(legGeo, trouserMat);
      legMesh.position.y = -0.31;
      legMesh.castShadow = !isSoftwareGl;
      hip.add(legMesh);

      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0, -0.64, 0.04);
      hip.add(shoe);
      bodyPivot.add(hip);
      return hip;
    };
    const leftLeg = makeLeg(-0.1);
    const rightLeg = makeLeg(0.1);

    // 3. Tailored Suit Torso + Shirt Collar + Role Tie/Lapel Accent
    const torso = new THREE.Mesh(torsoGeo, suitMat);
    torso.position.y = 1.0;
    torso.scale.set(1.05, 1, 0.76);
    torso.castShadow = !isSoftwareGl;
    bodyPivot.add(torso);

    const shirtV = new THREE.Mesh(shirtVGeo, shirtMat);
    shirtV.position.set(0, 1.18, 0.125);
    shirtV.rotation.x = Math.PI;
    bodyPivot.add(shirtV);

    const tie = new THREE.Mesh(tieGeo, tieMat);
    tie.position.set(0, 1.04, 0.152);
    bodyPivot.add(tie);

    // 4. Articulated Left & Right Arms + Executive Portfolio Tablet
    const makeArm = (xOff: number, withTablet: boolean) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(xOff, 1.26, 0);
      const sleeve = new THREE.Mesh(armGeo, suitMat);
      sleeve.position.y = -0.25;
      sleeve.castShadow = !isSoftwareGl;
      shoulder.add(sleeve);

      const hand = new THREE.Mesh(headGeo, skinMat);
      hand.scale.set(0.32, 0.32, 0.32);
      hand.position.y = -0.54;
      shoulder.add(hand);

      if (withTablet) {
        const tab = new THREE.Mesh(tabletGeo, tabletMat);
        tab.position.set(0.04, -0.5, 0.11);
        tab.rotation.x = -0.55;
        shoulder.add(tab);
      }
      bodyPivot.add(shoulder);
      return shoulder;
    };
    const leftArm = makeArm(-0.26, false);
    const rightArm = makeArm(0.26, idx % 2 === 0);

    // 5. Sculpted Head + Hair + Role Accessory (Glasses / Studio Headset)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.48, 0);
    bodyPivot.add(headGroup);

    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = !isSoftwareGl;
    headGroup.add(headMesh);

    const hairMesh = new THREE.Mesh(hairCapGeo, hairMat);
    hairMesh.position.y = 0.02;
    hairMesh.rotation.x = -0.18;
    headGroup.add(hairMesh);

    if (spec.accessory === "glasses" || spec.accessory === "visor_clip") {
      const rim = new THREE.Mesh(tieGeo, tieMat);
      rim.scale.set(3.8, 0.14, 1.2);
      rim.position.set(0, 0.02, 0.148);
      headGroup.add(rim);
    } else if (spec.accessory === "headset") {
      const band = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.165, 0.018, 8, 20, Math.PI)),
        tieMat
      );
      band.position.y = 0.02;
      headGroup.add(band);
    }

    // 6. Raycast Proxy Cylinder on RAYCAST_LAYER
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.position.y = 0.98;
    proxy.layers.set(RAYCAST_LAYER);
    proxy.userData = { kind: "agent", agentKey };
    rigRoot.add(proxy);
    clickableProxies.push(proxy);

    const defaultPlacement = resolveAgent3DWorldPosition(
      {
        agent_key: agentKey,
        room_key:
          agentKey === "dados"
            ? "sala_dados"
            : agentKey === "pesquisa"
              ? "pesquisa"
              : agentKey === "edicao"
                ? "gravacao"
                : agentKey === "thumbnail"
                  ? "design_thumbnail"
                  : agentKey === "publicacao"
                    ? "estrategia_publicacao"
                    : "mesa_agentes",
        status: "idle",
        enabled: true,
      },
      idx % 3,
      idx
    );

    const startVec = new THREE.Vector3(defaultPlacement.position.x, 0.24, defaultPlacement.position.z);
    rigRoot.position.copy(startVec);
    rigRoot.rotation.y = defaultPlacement.yaw;

    rigs.set(agentKey, {
      agentKey,
      root: rigRoot,
      bodyPivot,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      headGroup,
      haloMat,
      proxyMesh: proxy,
      currentPos: startVec.clone(),
      targetPos: startVec.clone(),
      currentYaw: defaultPlacement.yaw,
      targetYaw: defaultPlacement.yaw,
      status: "idle",
      enabled: true,
      phaseOffset: idx * 0.85,
    });
  });

  const syncAgents = (agents: StudioAgentState[], selectedAgent: AgentKey | null) => {
    const slotCounters: Record<string, number> = {};
    const seen = new Set<AgentKey>();

    agents.forEach((agent, idx) => {
      const rig = rigs.get(agent.agent_key);
      if (!rig) return;
      seen.add(agent.agent_key);
      rig.root.visible = true;
      rig.status = agent.status;
      rig.enabled = agent.enabled;

      const slot = slotCounters[agent.room_key] ?? 0;
      slotCounters[agent.room_key] = slot + 1;
      const placement = resolveAgent3DWorldPosition(agent, slot, idx);
      const baseFloorY = placement.targetRoom === "mesa_agentes" ? 0.16 : 0.25;
      rig.targetPos.set(placement.position.x, baseFloorY, placement.position.z);
      rig.targetYaw = placement.yaw;

      const hex = statusHaloHex(agent.status, agent.enabled, selectedAgent === agent.agent_key);
      rig.haloMat.color.setHex(hex);
      rig.haloMat.emissive.setHex(hex);
      rig.haloMat.emissiveIntensity =
        selectedAgent === agent.agent_key ? 1.65 : agent.status === "working" ? 1.4 : 0.85;
    });

    // If snapshot hasn't loaded agents yet, keep default squad visible in executive standby
    if (agents.length > 0) {
      rigs.forEach((rig, key) => {
        if (!seen.has(key)) rig.root.visible = false;
      });
    } else {
      rigs.forEach((rig) => {
        rig.root.visible = true;
      });
    }
  };

  // Pre-allocated math helpers — zero allocations inside tickKinematics!
  const _moveDelta = new THREE.Vector3();

  const tickKinematics = (delta: number, elapsed: number) => {
    const dt = Math.min(0.05, Math.max(0.001, delta));
    rigs.forEach((rig) => {
      if (!rig.root.visible) return;

      _moveDelta.subVectors(rig.targetPos, rig.currentPos);
      const dist = _moveDelta.length();

      if (dist > 0.015) {
        // Smooth walking glide along hub corridors
        const stepFactor = 1 - Math.exp(-4.2 * dt);
        rig.currentPos.lerp(rig.targetPos, stepFactor);
        rig.root.position.copy(rig.currentPos);

        const moveYaw = Math.atan2(_moveDelta.x, _moveDelta.z);
        rig.currentYaw = dampAngle(rig.currentYaw, moveYaw, 9.0, dt);
        rig.root.rotation.y = rig.currentYaw;

        const stride = Math.sin(elapsed * 9.5 + rig.phaseOffset) * Math.min(0.55, dist * 0.8);
        rig.leftLeg.rotation.x = stride;
        rig.rightLeg.rotation.x = -stride;
        rig.leftArm.rotation.x = -stride * 0.8;
        rig.rightArm.rotation.x = stride * 0.8;
        rig.bodyPivot.position.y = Math.abs(Math.sin(elapsed * 9.5 + rig.phaseOffset)) * 0.035;
      } else {
        rig.currentPos.copy(rig.targetPos);
        rig.root.position.copy(rig.currentPos);
        rig.currentYaw = dampAngle(rig.currentYaw, rig.targetYaw, 7.5, dt);
        rig.root.rotation.y = rig.currentYaw;

        rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0, 10, dt);
        rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, 0, 10, dt);
        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0, 10, dt);

        if (rig.status === "working" && rig.enabled) {
          // Active executive/analyst typing & conversing kinematics
          rig.leftArm.rotation.x = -0.45 + Math.sin(elapsed * 6.2 + rig.phaseOffset) * 0.14;
          rig.rightArm.rotation.x = -0.45 + Math.cos(elapsed * 6.2 + rig.phaseOffset) * 0.14;
          rig.headGroup.rotation.y = Math.sin(elapsed * 2.1 + rig.phaseOffset) * 0.16;
        } else if (rig.status === "waiting_approval") {
          // Deliberating in the Board Room ("talking with each other")
          rig.leftArm.rotation.x = -0.25 + Math.sin(elapsed * 2.8 + rig.phaseOffset) * 0.12;
          rig.rightArm.rotation.x = -0.52;
          rig.headGroup.rotation.y = Math.sin(elapsed * 1.7 + rig.phaseOffset) * 0.24;
        } else {
          // Subtle lifelike idle breathing & conversation glance
          rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, -0.06, 6, dt);
          rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, -0.22, 6, dt);
          rig.headGroup.rotation.y = Math.sin(elapsed * 0.9 + rig.phaseOffset) * 0.12;
        }
      }
    });
  };

  const getHeadWorldPosition = (agentKey: AgentKey, out: THREE.Vector3): boolean => {
    const rig = rigs.get(agentKey);
    if (!rig || !rig.root.visible) return false;
    out.copy(rig.root.position);
    out.y += 1.92;
    return true;
  };

  return {
    group,
    rigs,
    clickableProxies,
    syncAgents,
    tickKinematics,
    getHeadWorldPosition,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function vec3ToThree(v: Vec3Tuple, target: THREE.Vector3): THREE.Vector3 {
  return target.set(v.x, v.y, v.z);
}
