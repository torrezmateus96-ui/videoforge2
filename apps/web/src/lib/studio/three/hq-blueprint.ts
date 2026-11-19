import type { AgentKey, AgentVisualStatus, RoomKey, StudioAgentState } from "../types";

export type CameraPresetKey =
  | "overview"
  | "boardroom"
  | "sala_dados"
  | "pesquisa"
  | "estrategia_publicacao"
  | "gravacao"
  | "design_thumbnail";

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CameraPresetSpec {
  key: CameraPresetKey;
  label: string;
  shortLabel: string;
  roomKey?: RoomKey;
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export interface WingBlueprint {
  key: RoomKey;
  wingNumber: string;
  fasciaTitle: string;
  subtitle: string;
  doorCode: string;
  accentHex: number;
  accentCss: string;
  center: Vec3Tuple;
  size: { width: number; depth: number; wallHeight: number };
  rotationY: number;
  doorWorld: Vec3Tuple;
  doorRotationY: number;
  labelAnchorWorld: Vec3Tuple;
  workstations: Array<{ pos: Vec3Tuple; yaw: number }>;
}

export interface AgentWardrobeSpec {
  agentKey: AgentKey;
  roleBadge: string;
  suitHex: number;
  shirtHex: number;
  tieHex: number;
  hairHex: number;
  skinHex: number;
  accessory: "glasses" | "headset" | "visor_clip" | "none";
}

export const BOARD_ROOM_CENTER: Vec3Tuple = { x: 0, y: 0, z: 0.35 };
export const BOARD_ROOM_RADIUS = 5.35;

/**
 * 10 cadeiras executivas ao redor da mesa elíptica central de mármore preto (Board Room).
 */
export const BOARD_ROOM_SEATS: Array<{ pos: Vec3Tuple; yaw: number }> = [
  { pos: { x: 0.0, y: 0, z: -3.25 }, yaw: 0 },
  { pos: { x: 2.15, y: 0, z: -2.55 }, yaw: -0.62 },
  { pos: { x: 2.85, y: 0, z: -0.95 }, yaw: -1.35 },
  { pos: { x: 2.85, y: 0, z: 0.85 }, yaw: -1.78 },
  { pos: { x: 2.15, y: 0, z: 2.55 }, yaw: -2.45 },
  { pos: { x: 0.0, y: 0, z: 3.45 }, yaw: Math.PI },
  { pos: { x: -2.15, y: 0, z: 2.55 }, yaw: 2.45 },
  { pos: { x: -2.85, y: 0, z: 0.85 }, yaw: 1.78 },
  { pos: { x: -2.85, y: 0, z: -0.95 }, yaw: 1.35 },
  { pos: { x: -2.15, y: 0, z: -2.55 }, yaw: 0.62 },
];

/**
 * Arquitetura Hub-and-Spoke inspirada em uma sede executiva de organização de agentes:
 * - Rotunda central panorâmica de vidro ("BOARD ROOM / MESA DE AGENTES")
 * - 5 alas especializadas recortadas ao redor do átrio de platina iluminado por LEDs.
 */
export const STUDIO_3D_WINGS: Record<RoomKey, WingBlueprint> = {
  mesa_agentes: {
    key: "mesa_agentes",
    wingNumber: "HUB",
    fasciaTitle: "BOARD ROOM · AGENTES",
    subtitle: "Deliberação, Roteiro & Títulos",
    doorCode: "HQ",
    accentHex: 0xf5a623,
    accentCss: "#f5a623",
    center: { x: 0, y: 0, z: 0.35 },
    size: { width: 10.7, depth: 10.7, wallHeight: 3.15 },
    rotationY: 0,
    doorWorld: { x: 0, y: 0, z: 5.55 },
    doorRotationY: 0,
    labelAnchorWorld: { x: 0, y: 3.55, z: -4.65 },
    workstations: [
      { pos: { x: -2.55, y: 0, z: -0.85 }, yaw: 1.38 },
      { pos: { x: 2.55, y: 0, z: -0.85 }, yaw: -1.38 },
      { pos: { x: 0.0, y: 0, z: -2.95 }, yaw: 0 },
    ],
  },
  sala_dados: {
    key: "sala_dados",
    wingNumber: "01",
    fasciaTitle: "1. SALA DE DADOS",
    subtitle: "Server Rack & Analytics OAuth",
    doorCode: "</>",
    accentHex: 0x38bdf8,
    accentCss: "#38bdf8",
    center: { x: -11.4, y: 0, z: -6.4 },
    size: { width: 6.8, depth: 5.6, wallHeight: 3.25 },
    rotationY: 0.24,
    doorWorld: { x: -7.55, y: 0, z: -4.35 },
    doorRotationY: 0.98,
    labelAnchorWorld: { x: -11.6, y: 3.65, z: -8.6 },
    workstations: [
      { pos: { x: -11.1, y: 0, z: -5.55 }, yaw: Math.PI + 0.24 },
      { pos: { x: -12.6, y: 0, z: -5.9 }, yaw: Math.PI + 0.24 },
    ],
  },
  pesquisa: {
    key: "pesquisa",
    wingNumber: "02",
    fasciaTitle: "2. PESQUISA & RADAR",
    subtitle: "Coorte de Referência & Outliers",
    doorCode: "RAD",
    accentHex: 0x22d3ee,
    accentCss: "#22d3ee",
    center: { x: -12.8, y: 0, z: 0.55 },
    size: { width: 6.4, depth: 5.4, wallHeight: 3.25 },
    rotationY: 0.04,
    doorWorld: { x: -9.15, y: 0, z: 0.55 },
    doorRotationY: Math.PI / 2,
    labelAnchorWorld: { x: -13.2, y: 3.6, z: -1.65 },
    workstations: [
      { pos: { x: -12.4, y: 0, z: 0.45 }, yaw: -Math.PI / 2 },
      { pos: { x: -13.5, y: 0, z: 1.65 }, yaw: Math.PI },
    ],
  },
  estrategia_publicacao: {
    key: "estrategia_publicacao",
    wingNumber: "03",
    fasciaTitle: "3. ESTRATÉGIA & PUBLICAÇÃO",
    subtitle: "Cofre Editorial & Gate Humano",
    doorCode: "PUB",
    accentHex: 0x34d399,
    accentCss: "#34d399",
    center: { x: -10.9, y: 0, z: 7.45 },
    size: { width: 6.8, depth: 5.6, wallHeight: 3.25 },
    rotationY: -0.24,
    doorWorld: { x: -7.25, y: 0, z: 5.25 },
    doorRotationY: 2.15,
    labelAnchorWorld: { x: -11.2, y: 3.6, z: 5.15 },
    workstations: [
      { pos: { x: -10.6, y: 0, z: 7.35 }, yaw: -0.8 },
      { pos: { x: -12.2, y: 0, z: 8.1 }, yaw: -0.4 },
    ],
  },
  gravacao: {
    key: "gravacao",
    wingNumber: "04",
    fasciaTitle: "4. ESTÚDIO DE PRODUÇÃO",
    subtitle: "Ring Light, Câmera & Edição",
    doorCode: "REC",
    accentHex: 0xfb923c,
    accentCss: "#fb923c",
    center: { x: 11.4, y: 0, z: -5.4 },
    size: { width: 7.0, depth: 5.8, wallHeight: 3.25 },
    rotationY: -0.22,
    doorWorld: { x: 7.55, y: 0, z: -3.55 },
    doorRotationY: -1.02,
    labelAnchorWorld: { x: 11.6, y: 3.65, z: -7.75 },
    workstations: [
      { pos: { x: 11.15, y: 0, z: -4.85 }, yaw: 0.9 },
      { pos: { x: 12.75, y: 0, z: -5.5 }, yaw: -0.35 },
    ],
  },
  design_thumbnail: {
    key: "design_thumbnail",
    wingNumber: "05",
    fasciaTitle: "5. DESIGN & THUMBNAIL",
    subtitle: "Contraste Visual & Núcleo Holo",
    doorCode: "THB",
    accentHex: 0xa78bfa,
    accentCss: "#a78bfa",
    center: { x: 11.3, y: 0, z: 5.6 },
    size: { width: 7.0, depth: 6.0, wallHeight: 3.25 },
    rotationY: 0.22,
    doorWorld: { x: 7.45, y: 0, z: 3.95 },
    doorRotationY: -2.05,
    labelAnchorWorld: { x: 11.5, y: 3.6, z: 3.25 },
    workstations: [
      { pos: { x: 10.65, y: 0, z: 5.25 }, yaw: 0.55 },
      { pos: { x: 12.55, y: 0, z: 6.35 }, yaw: -0.75 },
    ],
  },
};

export const CAMERA_PRESETS: Record<CameraPresetKey, CameraPresetSpec> = {
  overview: {
    key: "overview",
    label: "Visão Geral HQ",
    shortLabel: "HQ Geral",
    position: { x: 0, y: 21.5, z: 21.8 },
    target: { x: 0, y: 0.4, z: 0.6 },
  },
  boardroom: {
    key: "boardroom",
    label: "Board Room Central",
    shortLabel: "Board Room",
    roomKey: "mesa_agentes",
    position: { x: 0.2, y: 9.6, z: 10.8 },
    target: { x: 0, y: 0.9, z: 0.35 },
  },
  sala_dados: {
    key: "sala_dados",
    label: "1. Sala de Dados",
    shortLabel: "1. Dados",
    roomKey: "sala_dados",
    position: { x: -7.8, y: 8.4, z: 1.2 },
    target: { x: -11.4, y: 1.1, z: -6.2 },
  },
  pesquisa: {
    key: "pesquisa",
    label: "2. Pesquisa & Radar",
    shortLabel: "2. Pesquisa",
    roomKey: "pesquisa",
    position: { x: -6.8, y: 8.0, z: 6.8 },
    target: { x: -12.8, y: 1.1, z: 0.55 },
  },
  estrategia_publicacao: {
    key: "estrategia_publicacao",
    label: "3. Estratégia & Publicação",
    shortLabel: "3. Publicação",
    roomKey: "estrategia_publicacao",
    position: { x: -5.8, y: 8.4, z: 14.2 },
    target: { x: -10.9, y: 1.1, z: 7.45 },
  },
  gravacao: {
    key: "gravacao",
    label: "4. Estúdio de Produção",
    shortLabel: "4. Produção",
    roomKey: "gravacao",
    position: { x: 7.8, y: 8.4, z: 2.0 },
    target: { x: 11.4, y: 1.1, z: -5.3 },
  },
  design_thumbnail: {
    key: "design_thumbnail",
    label: "5. Design & Thumbnail",
    shortLabel: "5. Thumbnail",
    roomKey: "design_thumbnail",
    position: { x: 6.8, y: 8.4, z: 13.0 },
    target: { x: 11.3, y: 1.1, z: 5.6 },
  },
};

export const AGENT_WARDROBES: Record<AgentKey, AgentWardrobeSpec> = {
  dados: {
    agentKey: "dados",
    roleBadge: "DATA",
    suitHex: 0x162438,
    shirtHex: 0xe2e8f0,
    tieHex: 0x38bdf8,
    hairHex: 0x1c1917,
    skinHex: 0xe0b18c,
    accessory: "glasses",
  },
  pesquisa: {
    agentKey: "pesquisa",
    roleBadge: "RADAR",
    suitHex: 0x1e293b,
    shirtHex: 0xf1f5f9,
    tieHex: 0x22d3ee,
    hairHex: 0x3b2314,
    skinHex: 0xd49b72,
    accessory: "glasses",
  },
  estrategia: {
    agentKey: "estrategia",
    roleBadge: "LEAD",
    suitHex: 0x171923,
    shirtHex: 0xf8fafc,
    tieHex: 0xf5a623,
    hairHex: 0x27272a,
    skinHex: 0xe7bc98,
    accessory: "none",
  },
  titulos: {
    agentKey: "titulos",
    roleBadge: "COPY",
    suitHex: 0x2c221e,
    shirtHex: 0xfef3c7,
    tieHex: 0xf59e0b,
    hairHex: 0x451a03,
    skinHex: 0xc68b63,
    accessory: "glasses",
  },
  roteiro: {
    agentKey: "roteiro",
    roleBadge: "SCRIPT",
    suitHex: 0x262b36,
    shirtHex: 0xf8fafc,
    tieHex: 0xfbbf24,
    hairHex: 0x18181b,
    skinHex: 0xdfa882,
    accessory: "none",
  },
  thumbnail: {
    agentKey: "thumbnail",
    roleBadge: "THUMB",
    suitHex: 0x251e38,
    shirtHex: 0xf3e8ff,
    tieHex: 0xa78bfa,
    hairHex: 0x2e1065,
    skinHex: 0xe5b895,
    accessory: "visor_clip",
  },
  edicao: {
    agentKey: "edicao",
    roleBadge: "PROD",
    suitHex: 0x1b2b30,
    shirtHex: 0xecfeff,
    tieHex: 0xfb923c,
    hairHex: 0x1f2937,
    skinHex: 0xba7d57,
    accessory: "headset",
  },
  publicacao: {
    agentKey: "publicacao",
    roleBadge: "GATE",
    suitHex: 0x142622,
    shirtHex: 0xecfdf5,
    tieHex: 0x34d399,
    hairHex: 0x292524,
    skinHex: 0xdca47e,
    accessory: "none",
  },
};

export interface Agent3DPlacement {
  position: Vec3Tuple;
  yaw: number;
  targetRoom: RoomKey;
  posture: "desk" | "doorway" | "boardroom";
  isActiveMotion: boolean;
}

export function resolveAgent3DWorldPosition(
  agent: Pick<StudioAgentState, "agent_key" | "room_key" | "status" | "enabled">,
  slotIndex = 0,
  agentIndex = 0
): Agent3DPlacement {
  const wing = STUDIO_3D_WINGS[agent.room_key] ?? STUDIO_3D_WINGS.mesa_agentes;
  const status: AgentVisualStatus = !agent.enabled ? "disabled" : agent.status;

  if (status === "waiting_approval" || (agent.room_key === "mesa_agentes" && status !== "queued")) {
    const seatIdx =
      status === "waiting_approval"
        ? (agentIndex * 3 + 1) % BOARD_ROOM_SEATS.length
        : (slotIndex * 3) % BOARD_ROOM_SEATS.length;
    const seat = BOARD_ROOM_SEATS[seatIdx];
    return {
      position: {
        x: BOARD_ROOM_CENTER.x + seat.pos.x * 1.18,
        y: 0,
        z: BOARD_ROOM_CENTER.z + seat.pos.z * 1.12,
      },
      yaw: seat.yaw,
      targetRoom: "mesa_agentes",
      posture: "boardroom",
      isActiveMotion: status === "working" || status === "waiting_approval",
    };
  }

  if (status === "queued") {
    return {
      position: {
        x: wing.doorWorld.x * 0.86,
        y: 0,
        z: wing.doorWorld.z * 0.86,
      },
      yaw: wing.doorRotationY + Math.PI,
      targetRoom: wing.key,
      posture: "doorway",
      isActiveMotion: false,
    };
  }

  const ws = wing.workstations[slotIndex % wing.workstations.length] ?? {
    pos: wing.center,
    yaw: 0,
  };
  return {
    position: { x: ws.pos.x, y: 0, z: ws.pos.z },
    yaw: ws.yaw,
    targetRoom: wing.key,
    posture: "desk",
    isActiveMotion: status === "working",
  };
}

export function presetForRoom(roomKey: RoomKey): CameraPresetKey {
  switch (roomKey) {
    case "mesa_agentes":
      return "boardroom";
    case "sala_dados":
      return "sala_dados";
    case "pesquisa":
      return "pesquisa";
    case "estrategia_publicacao":
      return "estrategia_publicacao";
    case "gravacao":
      return "gravacao";
    case "design_thumbnail":
      return "design_thumbnail";
  }
}
