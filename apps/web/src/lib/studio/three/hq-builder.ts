import * as THREE from "three";
import type { RoomKey, StudioRoomState } from "../types";
import {
  BOARD_ROOM_CENTER,
  BOARD_ROOM_RADIUS,
  BOARD_ROOM_SEATS,
  STUDIO_3D_WINGS,
  type WingBlueprint,
} from "./hq-blueprint";
import type { ProceduralTexturePack } from "./procedural-textures";

export const RAYCAST_LAYER = 1;

export interface RoomVisualHandles {
  roomKey: RoomKey;
  group: THREE.Group;
  accentStripMat: THREE.MeshStandardMaterial;
  doorBeaconMat: THREE.MeshStandardMaterial;
  baseAccentHex: number;
}

export interface BuiltHQScene {
  root: THREE.Group;
  roomHandles: Map<RoomKey, RoomVisualHandles>;
  clickableProxies: THREE.Object3D[];
  crystalCore: THREE.Mesh;
  ringLightHalo: THREE.Mesh;
  onAirLampMat: THREE.MeshStandardMaterial;
  updateRoomStates: (rooms: StudioRoomState[], selectedRoom: RoomKey | null) => void;
  dispose: () => void;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

export function buildArchitecturalHQ(
  textures: ProceduralTexturePack,
  channelName: string,
  isSoftwareGl: boolean
): BuiltHQScene {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const clickableProxies: THREE.Object3D[] = [];
  const roomHandles = new Map<RoomKey, RoomVisualHandles>();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared PBR Materials (varied roughness >= 0.25 across adjacent architectural surfaces)
  const darkVoidFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x070a10,
      roughness: 0.92,
      metalness: 0.08,
    })
  );
  const slateWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2533,
      roughness: 0.68,
      metalness: 0.24,
    })
  );
  const obsidianTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f141e,
      roughness: 0.36,
      metalness: 0.62,
    })
  );
  const brushedBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd49b3b,
      roughness: 0.22,
      metalness: 0.88,
    })
  );
  const brushedTitaniumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.3,
      metalness: 0.78,
    })
  );
  const cognacLeatherMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa66a38,
      roughness: 0.62,
      metalness: 0.08,
    })
  );
  const taskChairDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.12,
    })
  );
  const walnutWoodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4a3222,
      roughness: 0.54,
      metalness: 0.06,
    })
  );
  const darkDeskMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161d29,
      roughness: 0.42,
      metalness: 0.35,
    })
  );
  const hubPlatinumMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.hubTileAlbedo,
      roughnessMap: textures.hubTileRoughness,
      roughness: 0.44,
      metalness: 0.12,
    })
  );
  const darkMarbleFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.darkMarbleAlbedo,
      roughness: 0.24,
      metalness: 0.22,
    })
  );
  const whiteLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xeef6ff,
      emissiveIntensity: 1.25,
      roughness: 0.2,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const warmSconceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
  );
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2d6a4f,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  const foliageLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x40916c,
      roughness: 0.72,
      metalness: 0.02,
    })
  );
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const proxyInvisibleMat = trackMat(
    new THREE.MeshBasicMaterial({
      visible: false,
    })
  );

  // Reusable helper builders (3–8 part composite props grounded at y=0)
  const sharedPlaneGeo = trackGeo(new THREE.PlaneGeometry(1, 1));
  const sharedBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const sharedCylGeo = trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
  const sharedSphereGeo = trackGeo(new THREE.SphereGeometry(0.5, 14, 12));

  function addContactShadow(parent: THREE.Object3D, x: number, z: number, sx: number, sz: number, y = 0.025) {
    const m = new THREE.Mesh(sharedPlaneGeo, contactShadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.set(sx, sz, 1);
    parent.add(m);
  }

  function createExecutiveChair(isCognac: boolean): THREE.Group {
    const g = new THREE.Group();
    const upholstery = isCognac ? cognacLeatherMat : taskChairDarkMat;
    const frameMat = isCognac ? brushedBrassMat : brushedTitaniumMat;

    // 1. Base star + stem
    const base = new THREE.Mesh(sharedCylGeo, frameMat);
    base.scale.set(0.52, 0.05, 0.52);
    base.position.y = 0.03;
    g.add(base);

    const stem = new THREE.Mesh(sharedCylGeo, frameMat);
    stem.scale.set(0.08, 0.38, 0.08);
    stem.position.y = 0.22;
    g.add(stem);

    // 2. Seat cushion
    const seat = new THREE.Mesh(sharedBoxGeo, upholstery);
    seat.scale.set(0.58, 0.1, 0.56);
    seat.position.y = 0.44;
    seat.castShadow = !isSoftwareGl;
    g.add(seat);

    // 3. Contoured tall backrest
    const back = new THREE.Mesh(sharedBoxGeo, upholstery);
    back.scale.set(0.54, 0.68, 0.1);
    back.position.set(0, 0.8, -0.24);
    back.rotation.x = -0.08;
    back.castShadow = !isSoftwareGl;
    g.add(back);

    // 4. Dual metal armrests
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(sharedBoxGeo, frameMat);
      arm.scale.set(0.05, 0.22, 0.38);
      arm.position.set(side * 0.3, 0.58, -0.02);
      g.add(arm);
    }
    addContactShadow(g, 0, 0, 0.85, 0.85, 0.015);
    return g;
  }

  function createPlanter(): THREE.Group {
    const g = new THREE.Group();
    const potGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.22, 0.54, 12));
    const pot = new THREE.Mesh(potGeo, obsidianTrimMat);
    pot.position.y = 0.27;
    pot.castShadow = !isSoftwareGl;
    g.add(pot);

    const rim = new THREE.Mesh(sharedCylGeo, brushedBrassMat);
    rim.scale.set(0.68, 0.04, 0.68);
    rim.position.y = 0.54;
    g.add(rim);

    // Multi-sphere lush foliage cluster
    const clusters: Array<[number, number, number, number, THREE.Material]> = [
      [0, 0.78, 0, 0.54, foliageMat],
      [-0.16, 0.68, 0.12, 0.38, foliageLightMat],
      [0.18, 0.72, -0.1, 0.4, foliageLightMat],
      [0.04, 0.98, 0.04, 0.36, foliageMat],
    ];
    for (const [cx, cy, cz, sc, mat] of clusters) {
      const leaf = new THREE.Mesh(sharedSphereGeo, mat);
      leaf.position.set(cx, cy, cz);
      leaf.scale.set(sc, sc * 1.18, sc);
      leaf.castShadow = !isSoftwareGl;
      g.add(leaf);
    }
    addContactShadow(g, 0, 0, 0.9, 0.9, 0.015);
    return g;
  }

  function createWorkstationDesk(screenTex: THREE.CanvasTexture, dualMonitors = true): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(sharedBoxGeo, darkDeskMat);
    top.scale.set(2.1, 0.08, 0.95);
    top.position.y = 0.74;
    top.castShadow = !isSoftwareGl;
    top.receiveShadow = !isSoftwareGl;
    g.add(top);

    for (const side of [-0.92, 0.92]) {
      const leg = new THREE.Mesh(sharedBoxGeo, brushedTitaniumMat);
      leg.scale.set(0.08, 0.72, 0.82);
      leg.position.set(side, 0.36, 0);
      g.add(leg);
    }

    const screenMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissiveMap: screenTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.72,
        roughness: 0.22,
        metalness: 0.1,
      })
    );

    const offsets = dualMonitors ? [-0.48, 0.48] : [0];
    offsets.forEach((ox, idx) => {
      const stand = new THREE.Mesh(sharedCylGeo, brushedTitaniumMat);
      stand.scale.set(0.07, 0.28, 0.07);
      stand.position.set(ox, 0.9, -0.22);
      g.add(stand);

      const bezel = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
      bezel.scale.set(0.88, 0.52, 0.04);
      bezel.position.set(ox, 1.12, -0.2);
      bezel.rotation.y = dualMonitors ? (idx === 0 ? 0.16 : -0.16) : 0;
      g.add(bezel);

      const scr = new THREE.Mesh(sharedPlaneGeo, screenMat);
      scr.scale.set(0.82, 0.46, 1);
      scr.position.set(ox, 1.12, -0.175);
      scr.rotation.y = bezel.rotation.y;
      g.add(scr);
    });

    const kb = new THREE.Mesh(sharedBoxGeo, brushedTitaniumMat);
    kb.scale.set(0.46, 0.02, 0.16);
    kb.position.set(0, 0.79, 0.16);
    g.add(kb);

    addContactShadow(g, 0, 0, 2.4, 1.2, 0.015);
    return g;
  }

  // =========================================================================
  // 1. Outer Obsidian Ground Plane & Radial Platinum Hub Atrium
  // =========================================================================
  const ground = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(90, 90)), darkVoidFloorMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = !isSoftwareGl;
  root.add(ground);

  // Star/Octagonal Platinum Hub Floor connecting Center Rotunda + 5 Wings + N/S Portals
  const hubShape = new THREE.Shape();
  const hubPts: Array<[number, number]> = [
    [-2.8, -11.2],
    [2.8, -11.2],
    [4.4, -7.2],
    [9.4, -5.2],
    [9.8, -1.8],
    [7.8, 0.4],
    [9.6, 3.2],
    [8.8, 6.8],
    [3.8, 7.6],
    [2.6, 11.2],
    [-2.6, 11.2],
    [-4.2, 8.2],
    [-9.2, 6.6],
    [-9.8, 2.6],
    [-10.2, -1.6],
    [-9.2, -5.8],
    [-4.4, -7.2],
  ];
  hubPts.forEach(([hx, hz], idx) => {
    // Shape is extruded in XY then rotated -PI/2 around X (so shape Y = -Z)
    if (idx === 0) hubShape.moveTo(hx, -hz);
    else hubShape.lineTo(hx, -hz);
  });
  hubShape.closePath();

  const hubGeo = trackGeo(
    new THREE.ExtrudeGeometry(hubShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
  );
  const hubMesh = new THREE.Mesh(hubGeo, hubPlatinumMat);
  hubMesh.rotation.x = -Math.PI / 2;
  hubMesh.position.y = -0.06;
  hubMesh.receiveShadow = !isSoftwareGl;
  root.add(hubMesh);

  // Glowing Recessed White LED Strip outlining every edge of the Platinum Hub!
  for (let i = 0; i < hubPts.length; i++) {
    const [x1, z1] = hubPts[i];
    const [x2, z2] = hubPts[(i + 1) % hubPts.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const strip = new THREE.Mesh(sharedBoxGeo, whiteLedMat);
    strip.scale.set(len, 0.025, 0.11);
    strip.position.set((x1 + x2) / 2, 0.095, (z1 + z2) / 2);
    strip.rotation.y = -Math.atan2(dz, dx);
    root.add(strip);
  }

  // =========================================================================
  // 2. North Monumental Entrance ("DARKFORGE · AGENT ORGANIZATION") & South Plinth
  // =========================================================================
  const northPortal = new THREE.Group();
  northPortal.position.set(0, 0, -11.9);
  root.add(northPortal);

  const monolithCore = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
  monolithCore.scale.set(5.6, 4.4, 0.9);
  monolithCore.position.y = 2.2;
  monolithCore.castShadow = !isSoftwareGl;
  northPortal.add(monolithCore);

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(sharedBoxGeo, slateWallMat);
    fin.scale.set(1.2, 4.0, 1.5);
    fin.position.set(side * 3.1, 2.0, 0.45);
    fin.rotation.y = side * -0.26;
    fin.castShadow = !isSoftwareGl;
    northPortal.add(fin);

    const sconce = new THREE.Mesh(sharedBoxGeo, warmSconceMat);
    sconce.scale.set(0.16, 0.55, 0.14);
    sconce.position.set(side * 2.35, 1.55, 0.5);
    northPortal.add(sconce);

    const plant = createPlanter();
    plant.position.set(side * 3.55, 0.08, 1.45);
    northPortal.add(plant);
  }

  // Glowing Architectural Apex Triangle Logo on North Monument
  const apexRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef3c7,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    })
  );
  const apexTriGeo = trackGeo(new THREE.ConeGeometry(0.68, 1.15, 3));
  const apexTri = new THREE.Mesh(apexTriGeo, apexRingMat);
  apexTri.position.set(0, 3.35, 0.52);
  apexTri.rotation.y = Math.PI;
  northPortal.add(apexTri);

  const northSignTex = textures.makeSignTexture(
    "AGENT ORGANIZATION",
    channelName || "DARKFORGE CHANNEL OS",
    "#f5a623"
  );
  const northSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: northSignTex,
      emissiveMap: northSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    })
  );
  const northSign = new THREE.Mesh(sharedPlaneGeo, northSignMat);
  northSign.scale.set(4.1, 1.05, 1);
  northSign.position.set(0, 1.85, 0.47);
  northPortal.add(northSign);

  // South Strategy Plinth ("ESTRATÉGIA · EXECUÇÃO · IMPACTO")
  const southPlinth = new THREE.Group();
  southPlinth.position.set(0, 0, 11.55);
  root.add(southPlinth);

  const southBase = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
  southBase.scale.set(4.2, 0.45, 2.2);
  southBase.position.y = 0.24;
  southPlinth.add(southBase);

  const southTotem = new THREE.Mesh(sharedBoxGeo, slateWallMat);
  southTotem.scale.set(2.5, 2.1, 0.7);
  southTotem.position.set(0, 1.35, -0.15);
  southTotem.rotation.x = -0.12;
  southTotem.castShadow = !isSoftwareGl;
  southPlinth.add(southTotem);

  const southSignTex = textures.makeSignTexture(
    "ESTRATÉGIA · EXECUÇÃO",
    "IMPACTO EDITORIAL AUDITADO",
    "#38bdf8"
  );
  const southSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: southSignTex,
      emissiveMap: southSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.58,
      roughness: 0.3,
    })
  );
  const southSign = new THREE.Mesh(sharedPlaneGeo, southSignMat);
  southSign.scale.set(2.25, 0.62, 1);
  southSign.position.set(0, 1.45, 0.22);
  southSign.rotation.x = -0.12;
  southPlinth.add(southSign);

  for (const side of [-1, 1]) {
    const p = createPlanter();
    p.position.set(side * 1.7, 0.45, 0.2);
    southPlinth.add(p);
  }

  // =========================================================================
  // 3. Central Panoramic Glass Board Room ("mesa_agentes")
  // =========================================================================
  const boardGroup = new THREE.Group();
  boardGroup.position.set(BOARD_ROOM_CENTER.x, 0, BOARD_ROOM_CENTER.z);
  root.add(boardGroup);

  const boardFloor = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(BOARD_ROOM_RADIUS, BOARD_ROOM_RADIUS + 0.14, 0.16, 48)),
    darkMarbleFloorMat
  );
  boardFloor.position.y = 0.08;
  boardFloor.receiveShadow = !isSoftwareGl;
  boardGroup.add(boardFloor);

  // Glowing Gold Perimeter Ring around the Board Room
  const boardAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
      roughness: 0.22,
      metalness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const boardFloorRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(BOARD_ROOM_RADIUS - 0.06, BOARD_ROOM_RADIUS + 0.14, 64)),
    boardAccentMat
  );
  boardFloorRing.rotation.x = -Math.PI / 2;
  boardFloorRing.position.y = 0.17;
  boardGroup.add(boardFloorRing);

  // Stadium Black Marble Conference Table (ExtrudeGeometry + Dual Pedestals)
  const tableShape = createRoundedRectShape(2.9, 5.2, 1.35);
  const tableGeo = trackGeo(
    new THREE.ExtrudeGeometry(tableShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    })
  );
  // Normalize UVs to [0..1] so procedural boardTableTop maps cleanly
  tableGeo.computeBoundingBox();
  const bb = tableGeo.boundingBox!;
  const uvAttr = tableGeo.attributes.uv;
  const posAttr = tableGeo.attributes.position;
  for (let i = 0; i < uvAttr.count; i++) {
    const u = (posAttr.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    const v = (posAttr.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;

  const boardTableMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.boardTableTop,
      roughness: 0.18,
      metalness: 0.25,
    })
  );
  const tableMesh = new THREE.Mesh(tableGeo, boardTableMat);
  tableMesh.rotation.x = -Math.PI / 2;
  tableMesh.position.y = 0.78;
  tableMesh.castShadow = !isSoftwareGl;
  tableMesh.receiveShadow = !isSoftwareGl;
  boardGroup.add(tableMesh);

  for (const pz of [-1.45, 1.45]) {
    const ped = new THREE.Mesh(sharedCylGeo, obsidianTrimMat);
    ped.scale.set(0.95, 0.62, 0.95);
    ped.position.set(0, 0.46, pz);
    boardGroup.add(ped);

    const brassCollar = new THREE.Mesh(sharedCylGeo, brushedBrassMat);
    brassCollar.scale.set(1.08, 0.06, 1.08);
    brassCollar.position.set(0, 0.2, pz);
    boardGroup.add(brassCollar);
  }
  addContactShadow(boardGroup, 0, 0, 3.8, 6.2, 0.175);

  // 10 Executive Cognac Leather Chairs around the Conference Table
  BOARD_ROOM_SEATS.forEach((s) => {
    const ch = createExecutiveChair(true);
    ch.position.set(s.pos.x, 0.16, s.pos.z);
    ch.rotation.y = s.yaw;
    boardGroup.add(ch);
  });

  // 4 Interior Planters inside the Rotunda
  [
    [-4.2, -2.1],
    [4.2, -2.1],
    [-4.2, 2.1],
    [4.2, 2.1],
  ].forEach(([px, pz]) => {
    const pl = createPlanter();
    pl.position.set(px, 0.16, pz);
    boardGroup.add(pl);
  });

  // Curved Panoramic Glass Wall Segments (leaving North & South doorways open) + Mullions + Crown Ring
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe,
      roughness: 0.08,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.28 : 0.96,
      ior: 1.52,
      thickness: 0.35,
      clearcoat: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  for (const arcStart of [0.22, Math.PI + 0.22]) {
    const glassArc = trackGeo(
      new THREE.CylinderGeometry(
        BOARD_ROOM_RADIUS - 0.04,
        BOARD_ROOM_RADIUS - 0.04,
        2.95,
        28,
        1,
        true,
        arcStart,
        Math.PI - 0.44
      )
    );
    const glassWall = new THREE.Mesh(glassArc, glassMat);
    glassWall.position.y = 1.64;
    glassWall.renderOrder = 8;
    boardGroup.add(glassWall);
  }

  // Vertical Anodized Steel Mullions & Brushed Brass Top Crown Ring
  const mullionCount = 12;
  for (let m = 0; m < mullionCount; m++) {
    const angle = (m / mullionCount) * Math.PI * 2;
    // Skip exact North & South doorway centers
    if (Math.abs(Math.sin(angle)) < 0.22) continue;
    const mul = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    mul.scale.set(0.1, 3.02, 0.12);
    mul.position.set(Math.sin(angle) * BOARD_ROOM_RADIUS, 1.66, Math.cos(angle) * BOARD_ROOM_RADIUS);
    mul.rotation.y = angle;
    boardGroup.add(mul);
  }

  const crownTorus = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(BOARD_ROOM_RADIUS, 0.075, 12, 64)),
    brushedBrassMat
  );
  crownTorus.rotation.x = Math.PI / 2;
  crownTorus.position.y = 3.14;
  boardGroup.add(crownTorus);

  // Raycast Proxy for Board Room
  const boardProxy = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(BOARD_ROOM_RADIUS, BOARD_ROOM_RADIUS, 2.6, 24)),
    proxyInvisibleMat
  );
  boardProxy.position.set(BOARD_ROOM_CENTER.x, 1.3, BOARD_ROOM_CENTER.z);
  boardProxy.layers.set(RAYCAST_LAYER);
  boardProxy.userData = { kind: "room", roomKey: "mesa_agentes" as RoomKey };
  root.add(boardProxy);
  clickableProxies.push(boardProxy);

  roomHandles.set("mesa_agentes", {
    roomKey: "mesa_agentes",
    group: boardGroup,
    accentStripMat: boardAccentMat,
    doorBeaconMat: boardAccentMat,
    baseAccentHex: STUDIO_3D_WINGS.mesa_agentes.accentHex,
  });

  // =========================================================================
  // 4. Five Surrounding Cutaway Architectural Specialist Wings
  // =========================================================================
  let crystalCoreMesh: THREE.Mesh | null = null;
  let ringLightHaloMesh: THREE.Mesh | null = null;
  const onAirLampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    })
  );

  function buildWingShell(wing: WingBlueprint): {
    wingGroup: THREE.Group;
    interiorOrigin: THREE.Group;
  } {
    const wg = new THREE.Group();
    wg.position.set(wing.center.x, 0, wing.center.z);
    wg.rotation.y = wing.rotationY;
    root.add(wg);

    const { width: w, depth: d, wallHeight: h } = wing.size;

    // Raised Beveled Plinth + Interior Floor
    const plinth = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    plinth.scale.set(w + 0.35, 0.22, d + 0.35);
    plinth.position.y = 0.11;
    plinth.receiveShadow = !isSoftwareGl;
    wg.add(plinth);

    const floor = new THREE.Mesh(sharedBoxGeo, darkMarbleFloorMat);
    floor.scale.set(w, 0.04, d);
    floor.position.y = 0.23;
    floor.receiveShadow = !isSoftwareGl;
    wg.add(floor);

    // Glowing Perimeter Accent Strip
    const accentMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: wing.accentHex,
        emissive: wing.accentHex,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    const frontAccent = new THREE.Mesh(sharedBoxGeo, accentMat);
    frontAccent.scale.set(w + 0.2, 0.04, 0.08);
    frontAccent.position.set(0, 0.24, d / 2 + 0.12);
    wg.add(frontAccent);

    // Back Wall + Outer Side Wall (Cutaway toward camera & center hub so 100% of interior is visible!)
    const isLeftWing = wing.center.x < 0;
    const backWall = new THREE.Mesh(sharedBoxGeo, slateWallMat);
    backWall.scale.set(w + 0.2, h, 0.26);
    backWall.position.set(0, 0.22 + h / 2, -d / 2);
    backWall.castShadow = !isSoftwareGl;
    backWall.receiveShadow = !isSoftwareGl;
    wg.add(backWall);

    const outerSideWall = new THREE.Mesh(sharedBoxGeo, slateWallMat);
    outerSideWall.scale.set(0.26, h, d + 0.2);
    outerSideWall.position.set(isLeftWing ? -w / 2 : w / 2, 0.22 + h / 2, 0);
    outerSideWall.castShadow = !isSoftwareGl;
    wg.add(outerSideWall);

    // Low Half-Wall Curb facing the Hub for architectural framing
    const hubSideCurb = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    hubSideCurb.scale.set(0.22, 0.72, d * 0.55);
    hubSideCurb.position.set(isLeftWing ? w / 2 : -w / 2, 0.58, -d * 0.18);
    wg.add(hubSideCurb);

    // Top Architectural Fascia Header Beam + Procedural Illuminated Room Sign
    const fasciaBeam = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    fasciaBeam.scale.set(w + 0.3, 0.62, 0.42);
    fasciaBeam.position.set(0, 0.22 + h + 0.22, -d / 2 + 0.08);
    wg.add(fasciaBeam);

    const signTex = textures.makeSignTexture(wing.fasciaTitle, wing.subtitle, wing.accentCss);
    const signMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.68,
        roughness: 0.25,
      })
    );
    const signMesh = new THREE.Mesh(sharedPlaneGeo, signMat);
    signMesh.scale.set(w * 0.72, 0.54, 1);
    signMesh.position.set(0, 0.22 + h + 0.22, -d / 2 + 0.3);
    wg.add(signMesh);

    // Hub-Facing Architectural Doorway Assembly (positioned in world space at wing.doorWorld!)
    const doorAssembly = new THREE.Group();
    doorAssembly.position.set(wing.doorWorld.x, 0.08, wing.doorWorld.z);
    doorAssembly.rotation.y = wing.doorRotationY;
    root.add(doorAssembly);

    const doorFrame = new THREE.Mesh(sharedBoxGeo, slateWallMat);
    doorFrame.scale.set(1.55, 2.55, 0.34);
    doorFrame.position.y = 1.28;
    doorFrame.castShadow = !isSoftwareGl;
    doorAssembly.add(doorFrame);

    const doorBadgeTex = textures.makeDoorBadgeTexture(wing.doorCode, wing.wingNumber, wing.accentCss);
    const doorLeafMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: doorBadgeTex,
        emissiveMap: doorBadgeTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.58,
        roughness: 0.32,
        metalness: 0.4,
      })
    );
    const doorLeaf = new THREE.Mesh(sharedPlaneGeo, doorLeafMat);
    doorLeaf.scale.set(1.18, 2.15, 1);
    doorLeaf.position.set(0, 1.22, 0.18);
    doorAssembly.add(doorLeaf);

    const handle = new THREE.Mesh(sharedBoxGeo, brushedBrassMat);
    handle.scale.set(0.05, 0.32, 0.06);
    handle.position.set(0.42, 1.15, 0.2);
    doorAssembly.add(handle);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: wing.accentHex,
        emissive: wing.accentHex,
        emissiveIntensity: 1.1,
        roughness: 0.2,
      })
    );
    const topBeacon = new THREE.Mesh(sharedBoxGeo, beaconMat);
    topBeacon.scale.set(1.2, 0.08, 0.12);
    topBeacon.position.set(0, 2.48, 0.18);
    doorAssembly.add(topBeacon);

    const doorPlant = createPlanter();
    doorPlant.position.set(isLeftWing ? -1.15 : 1.15, 0, 0.28);
    doorAssembly.add(doorPlant);

    // Invisible Raycast Proxy for the entire Wing
    const proxy = new THREE.Mesh(sharedBoxGeo, proxyInvisibleMat);
    proxy.scale.set(w, 2.8, d);
    proxy.position.set(wing.center.x, 1.4, wing.center.z);
    proxy.rotation.y = wing.rotationY;
    proxy.layers.set(RAYCAST_LAYER);
    proxy.userData = { kind: "room", roomKey: wing.key };
    root.add(proxy);
    clickableProxies.push(proxy);

    const interior = new THREE.Group();
    interior.position.y = 0.25;
    wg.add(interior);

    roomHandles.set(wing.key, {
      roomKey: wing.key,
      group: wg,
      accentStripMat: accentMat,
      doorBeaconMat: beaconMat,
      baseAccentHex: wing.accentHex,
    });

    return { wingGroup: wg, interiorOrigin: interior };
  }

  // --- WING 1: SALA DE DADOS (Server Racks + Dual Green Analytics Consoles) ---
  {
    const { interiorOrigin } = buildWingShell(STUDIO_3D_WINGS.sala_dados);
    const rackMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.serverRackFront,
        emissiveMap: textures.serverRackFront,
        emissive: 0xffffff,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.55,
      })
    );
    for (let r = 0; r < 4; r++) {
      const rx = -2.1 + r * 1.38;
      const rackBody = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
      rackBody.scale.set(1.12, 2.45, 0.85);
      rackBody.position.set(rx, 1.23, -1.95);
      rackBody.castShadow = !isSoftwareGl;
      interiorOrigin.add(rackBody);

      const rackFace = new THREE.Mesh(sharedPlaneGeo, rackMat);
      rackFace.scale.set(0.98, 2.28, 1);
      rackFace.position.set(rx, 1.23, -1.51);
      interiorOrigin.add(rackFace);
    }
    const desk = createWorkstationDesk(textures.analyticsScreen, true);
    desk.position.set(0.2, 0, 0.55);
    desk.rotation.y = Math.PI;
    interiorOrigin.add(desk);

    const chair = createExecutiveChair(false);
    chair.position.set(0.2, 0, 1.35);
    chair.rotation.y = Math.PI;
    interiorOrigin.add(chair);
  }

  // --- WING 2: PESQUISA & RADAR (Outlier Radar Wall + Archive Shelves + Analyst Station) ---
  {
    const { interiorOrigin } = buildWingShell(STUDIO_3D_WINGS.pesquisa);
    const radarWallMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.radarScreen,
        emissiveMap: textures.radarScreen,
        emissive: 0xffffff,
        emissiveIntensity: 0.78,
        roughness: 0.2,
      })
    );
    const wallFrame = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    wallFrame.scale.set(3.8, 1.95, 0.12);
    wallFrame.position.set(0.35, 1.65, -2.45);
    interiorOrigin.add(wallFrame);

    const wallScr = new THREE.Mesh(sharedPlaneGeo, radarWallMat);
    wallScr.scale.set(3.58, 1.76, 1);
    wallScr.position.set(0.35, 1.65, -2.38);
    interiorOrigin.add(wallScr);

    // Archive Dossier Shelving on left wall
    const shelf = new THREE.Mesh(sharedBoxGeo, walnutWoodMat);
    shelf.scale.set(0.55, 2.3, 3.2);
    shelf.position.set(-2.65, 1.15, -0.3);
    shelf.castShadow = !isSoftwareGl;
    interiorOrigin.add(shelf);

    const desk = createWorkstationDesk(textures.radarScreen, true);
    desk.position.set(0.35, 0, 0.4);
    desk.rotation.y = Math.PI;
    interiorOrigin.add(desk);

    const chair = createExecutiveChair(false);
    chair.position.set(0.35, 0, 1.22);
    chair.rotation.y = Math.PI;
    interiorOrigin.add(chair);
  }

  // --- WING 3: ESTRATÉGIA & PUBLICAÇÃO (CFO-Style Growth Display + Armored Vault Safe + Desk) ---
  {
    const { interiorOrigin } = buildWingShell(STUDIO_3D_WINGS.estrategia_publicacao);
    const growthMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.growthVaultScreen,
        emissiveMap: textures.growthVaultScreen,
        emissive: 0xffffff,
        emissiveIntensity: 0.75,
        roughness: 0.22,
      })
    );
    const chartFrame = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    chartFrame.scale.set(3.6, 1.85, 0.12);
    chartFrame.position.set(-0.9, 1.65, -2.52);
    interiorOrigin.add(chartFrame);

    const chartScr = new THREE.Mesh(sharedPlaneGeo, growthMat);
    chartScr.scale.set(3.4, 1.68, 1);
    chartScr.position.set(-0.9, 1.65, -2.45);
    interiorOrigin.add(chartScr);

    // Heavy Armored Vault Safe with Spoked Brass Wheel (Human Gate Symbol)
    const vaultGroup = new THREE.Group();
    vaultGroup.position.set(1.85, 0, -1.75);
    interiorOrigin.add(vaultGroup);

    const vaultBox = new THREE.Mesh(sharedBoxGeo, slateWallMat);
    vaultBox.scale.set(1.55, 1.75, 1.25);
    vaultBox.position.y = 0.88;
    vaultBox.castShadow = !isSoftwareGl;
    vaultGroup.add(vaultBox);

    const vaultDoor = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    vaultDoor.scale.set(1.26, 1.46, 0.12);
    vaultDoor.position.set(0, 0.88, 0.64);
    vaultGroup.add(vaultDoor);

    const wheelRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.32, 0.04, 10, 28)),
      brushedTitaniumMat
    );
    wheelRing.position.set(-0.12, 0.88, 0.74);
    vaultGroup.add(wheelRing);

    for (let sp = 0; sp < 3; sp++) {
      const spoke = new THREE.Mesh(sharedBoxGeo, brushedBrassMat);
      spoke.scale.set(0.62, 0.035, 0.035);
      spoke.position.set(-0.12, 0.88, 0.74);
      spoke.rotation.z = (sp * Math.PI) / 3;
      vaultGroup.add(spoke);
    }

    const desk = createWorkstationDesk(textures.growthVaultScreen, false);
    desk.position.set(-0.55, 0, 0.65);
    desk.rotation.y = 0.25;
    interiorOrigin.add(desk);

    const chair = createExecutiveChair(true);
    chair.position.set(-0.75, 0, -0.15);
    chair.rotation.y = 0.25;
    interiorOrigin.add(chair);
  }

  // --- WING 4: ESTÚDIO DE PRODUÇÃO / GRAVAÇÃO (Glowing Ring Light + Cinema Camera + Boom Mic) ---
  {
    const { interiorOrigin } = buildWingShell(STUDIO_3D_WINGS.gravacao);
    // Warm Walnut Acoustic Slat Wall Panels
    for (let s = 0; s < 12; s++) {
      const slat = new THREE.Mesh(sharedBoxGeo, walnutWoodMat);
      slat.scale.set(0.28, 2.75, 0.08);
      slat.position.set(-2.6 + s * 0.46, 1.42, -2.68);
      interiorOrigin.add(slat);
    }

    // ON AIR Studio Lamp on Back Wall
    const onAirHousing = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    onAirHousing.scale.set(0.95, 0.34, 0.14);
    onAirHousing.position.set(2.15, 2.55, -2.62);
    interiorOrigin.add(onAirHousing);

    const onAirFace = new THREE.Mesh(sharedBoxGeo, onAirLampMat);
    onAirFace.scale.set(0.84, 0.24, 0.06);
    onAirFace.position.set(2.15, 2.55, -2.54);
    interiorOrigin.add(onAirFace);

    // Glowing Circular LED Ring Light on Tripod
    const ringStand = new THREE.Group();
    ringStand.position.set(-1.35, 0, -0.85);
    ringStand.rotation.y = 0.48;
    interiorOrigin.add(ringStand);

    const pole = new THREE.Mesh(sharedCylGeo, obsidianTrimMat);
    pole.scale.set(0.08, 1.75, 0.08);
    pole.position.y = 0.88;
    ringStand.add(pole);

    const ringMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff7ed,
        emissiveIntensity: 1.85,
        roughness: 0.15,
      })
    );
    ringLightHaloMesh = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.48, 0.065, 14, 36)),
      ringMat
    );
    ringLightHaloMesh.position.y = 1.88;
    ringStand.add(ringLightHaloMesh);

    // 3D Cinema Camera on Tripod Rig
    const camGroup = new THREE.Group();
    camGroup.position.set(-0.35, 0, -1.15);
    camGroup.rotation.y = 0.32;
    interiorOrigin.add(camGroup);

    const camTripod = new THREE.Mesh(sharedCylGeo, brushedTitaniumMat);
    camTripod.scale.set(0.1, 1.25, 0.1);
    camTripod.position.y = 0.62;
    camGroup.add(camTripod);

    const camBody = new THREE.Mesh(sharedBoxGeo, obsidianTrimMat);
    camBody.scale.set(0.36, 0.28, 0.52);
    camBody.position.y = 1.32;
    camGroup.add(camBody);

    const camLens = new THREE.Mesh(sharedCylGeo, brushedBrassMat);
    camLens.scale.set(0.22, 0.28, 0.22);
    camLens.rotation.x = Math.PI / 2;
    camLens.position.set(0, 1.32, 0.36);
    camGroup.add(camLens);

    const desk = createWorkstationDesk(textures.scriptScreen, true);
    desk.position.set(0.85, 0, 0.45);
    desk.rotation.y = -0.35;
    interiorOrigin.add(desk);

    const chair = createExecutiveChair(true);
    chair.position.set(1.1, 0, 1.25);
    chair.rotation.y = Math.PI - 0.35;
    interiorOrigin.add(chair);
  }

  // --- WING 5: DESIGN & THUMBNAIL (Glowing Holo Crystal Pedestal + Contrast Grading Suite) ---
  {
    const { interiorOrigin } = buildWingShell(STUDIO_3D_WINGS.design_thumbnail);

    // Stepped Circular Pedestal + Prismatic Glowing Crystalline Core (inspired by bottom-right core in ref!)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(1.55, 0, 0.65);
    interiorOrigin.add(coreGroup);

    const step1 = new THREE.Mesh(sharedCylGeo, obsidianTrimMat);
    step1.scale.set(2.1, 0.16, 2.1);
    step1.position.y = 0.08;
    coreGroup.add(step1);

    const step2 = new THREE.Mesh(sharedCylGeo, slateWallMat);
    step2.scale.set(1.55, 0.18, 1.55);
    step2.position.y = 0.24;
    coreGroup.add(step2);

    const coreRingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x3b82f6,
        emissiveIntensity: 1.45,
        roughness: 0.2,
      })
    );
    const coreRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.68, 0.04, 12, 36)),
      coreRingMat
    );
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.y = 0.35;
    coreGroup.add(coreRing);

    const crystalMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        emissive: 0x6366f1,
        emissiveIntensity: 0.95,
        roughness: 0.08,
        metalness: 0.15,
        transmission: isSoftwareGl ? 0 : 0.72,
        transparent: true,
        opacity: isSoftwareGl ? 0.85 : 0.96,
        ior: 1.9,
        clearcoat: 1.0,
      })
    );
    crystalCoreMesh = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.62, 0)),
      crystalMat
    );
    crystalCoreMesh.position.y = 1.18;
    crystalCoreMesh.scale.set(0.85, 1.45, 0.85);
    coreGroup.add(crystalCoreMesh);

    const desk = createWorkstationDesk(textures.thumbScreen, true);
    desk.position.set(-1.15, 0, -0.55);
    desk.rotation.y = 0.35;
    interiorOrigin.add(desk);

    const chair = createExecutiveChair(false);
    chair.position.set(-1.4, 0, 0.25);
    chair.rotation.y = Math.PI + 0.35;
    interiorOrigin.add(chair);
  }

  const updateRoomStates = (rooms: StudioRoomState[], selectedRoom: RoomKey | null) => {
    const byKey = new Map(rooms.map((r) => [r.room_key, r]));
    roomHandles.forEach((handle, rKey) => {
      const st = byKey.get(rKey);
      const isSelected = selectedRoom === rKey;
      const hasAlert = Boolean(st && (st.failed > 0 || st.blocked > 0));
      const isWorking = Boolean(st && st.working > 0);

      let hex = handle.baseAccentHex;
      let intensity = 0.75;
      if (hasAlert) {
        hex = 0xef4444;
        intensity = 1.45;
      } else if (isSelected) {
        hex = 0xfbbf24;
        intensity = 1.55;
      } else if (isWorking) {
        hex = 0xf59e0b;
        intensity = 1.35;
      }
      handle.accentStripMat.color.setHex(hex);
      handle.accentStripMat.emissive.setHex(hex);
      handle.accentStripMat.emissiveIntensity = intensity;
      handle.doorBeaconMat.color.setHex(hex);
      handle.doorBeaconMat.emissive.setHex(hex);
      handle.doorBeaconMat.emissiveIntensity = intensity + 0.15;
    });

    const grav = byKey.get("gravacao");
    const isRecLive = Boolean(grav && grav.working > 0);
    onAirLampMat.emissiveIntensity = isRecLive ? 1.85 : 0.32;
  };

  return {
    root,
    roomHandles,
    clickableProxies,
    crystalCore: crystalCoreMesh!,
    ringLightHalo: ringLightHaloMesh!,
    onAirLampMat,
    updateRoomStates,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
