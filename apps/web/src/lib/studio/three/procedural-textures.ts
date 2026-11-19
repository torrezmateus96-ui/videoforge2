import * as THREE from "three";

export interface ProceduralTexturePack {
  hubTileAlbedo: THREE.CanvasTexture;
  hubTileRoughness: THREE.CanvasTexture;
  darkMarbleAlbedo: THREE.CanvasTexture;
  boardTableTop: THREE.CanvasTexture;
  serverRackFront: THREE.CanvasTexture;
  analyticsScreen: THREE.CanvasTexture;
  radarScreen: THREE.CanvasTexture;
  growthVaultScreen: THREE.CanvasTexture;
  scriptScreen: THREE.CanvasTexture;
  thumbScreen: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  makeSignTexture: (title: string, subtitle: string, accentCss: string) => THREE.CanvasTexture;
  makeDoorBadgeTexture: (code: string, label: string, accentCss: string) => THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeColorTexture(canvas: HTMLCanvasElement, maxAnisotropy: number, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function finalizeDataTexture(canvas: HTMLCanvasElement, maxAnisotropy: number, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = maxAnisotropy;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTexturePack(renderer: THREE.WebGLRenderer): ProceduralTexturePack {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const created: THREE.Texture[] = [];

  // 1. Platinum Architectural Hub Floor Tile (Albedo + Roughness)
  const tileCanvas = document.createElement("canvas");
  tileCanvas.width = 512;
  tileCanvas.height = 512;
  const tctx = tileCanvas.getContext("2d")!;
  tctx.fillStyle = "#dce3ec";
  tctx.fillRect(0, 0, 512, 512);
  // Subtle micro-architectural stone noise & diagonal chamfers
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const shade = ((x * 7 + y * 13) % 14) - 7;
      const base = 220 + shade;
      tctx.fillStyle = `rgb(${base}, ${base + 5}, ${base + 12})`;
      tctx.fillRect(x + 2, y + 2, 60, 60);
      tctx.strokeStyle = "rgba(148, 163, 184, 0.48)";
      tctx.lineWidth = 2;
      tctx.strokeRect(x + 1, y + 1, 62, 62);
    }
  }
  const hubTileAlbedo = finalizeColorTexture(tileCanvas, maxAniso, [7, 7]);
  created.push(hubTileAlbedo);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rctx = roughCanvas.getContext("2d")!;
  rctx.fillStyle = "#5a5a5a";
  rctx.fillRect(0, 0, 256, 256);
  rctx.strokeStyle = "#b8b8b8";
  rctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 32) {
    rctx.beginPath();
    rctx.moveTo(i, 0);
    rctx.lineTo(i, 256);
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(0, i);
    rctx.lineTo(256, i);
    rctx.stroke();
  }
  const hubTileRoughness = finalizeDataTexture(roughCanvas, maxAniso, [7, 7]);
  created.push(hubTileRoughness);

  // 2. Nero Marquina Veined Dark Marble Floor Texture
  const marbleCanvas = document.createElement("canvas");
  marbleCanvas.width = 512;
  marbleCanvas.height = 512;
  const mctx = marbleCanvas.getContext("2d")!;
  mctx.fillStyle = "#10151f";
  mctx.fillRect(0, 0, 512, 512);
  mctx.strokeStyle = "rgba(226, 232, 240, 0.12)";
  mctx.lineWidth = 2;
  for (let v = 0; v < 14; v++) {
    mctx.beginPath();
    let px = (v * 67) % 512;
    let py = 0;
    mctx.moveTo(px, py);
    for (let s = 0; s < 8; s++) {
      px += ((v * 29 + s * 41) % 60) - 28;
      py += 64;
      mctx.lineTo(px, py);
    }
    mctx.stroke();
  }
  mctx.strokeStyle = "rgba(245, 166, 35, 0.14)";
  mctx.lineWidth = 1.2;
  mctx.beginPath();
  mctx.moveTo(40, 0);
  mctx.bezierCurveTo(180, 170, 290, 310, 470, 512);
  mctx.stroke();
  const darkMarbleAlbedo = finalizeColorTexture(marbleCanvas, maxAniso, [3, 3]);
  created.push(darkMarbleAlbedo);

  // 3. Executive Board Room Stadium Table Top (Black Marble + Gold Inlay + Emblem)
  const btCanvas = document.createElement("canvas");
  btCanvas.width = 512;
  btCanvas.height = 1024;
  const bctx = btCanvas.getContext("2d")!;
  bctx.fillStyle = "#111622";
  bctx.fillRect(0, 0, 512, 1024);
  // Subtle marble veins
  bctx.strokeStyle = "rgba(255,255,255,0.09)";
  bctx.lineWidth = 2;
  for (let k = 0; k < 10; k++) {
    bctx.beginPath();
    bctx.moveTo((k * 73) % 512, 0);
    bctx.bezierCurveTo(120 + k * 22, 340, 390 - k * 25, 680, ((k * 137) + 90) % 512, 1024);
    bctx.stroke();
  }
  // Gold stadium inner pinstripe
  bctx.strokeStyle = "#d49b38";
  bctx.lineWidth = 6;
  bctx.beginPath();
  bctx.roundRect(42, 46, 428, 932, 190);
  bctx.stroke();
  // Central DarkForge Hexagon/Triangle Emblem
  bctx.save();
  bctx.translate(256, 512);
  bctx.strokeStyle = "rgba(245, 166, 35, 0.82)";
  bctx.lineWidth = 5;
  bctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    const rx = Math.cos(a) * 62;
    const ry = Math.sin(a) * 62;
    if (i === 0) bctx.moveTo(rx, ry);
    else bctx.lineTo(rx, ry);
  }
  bctx.closePath();
  bctx.stroke();
  bctx.fillStyle = "rgba(245, 166, 35, 0.22)";
  bctx.fill();
  bctx.fillStyle = "#f5a623";
  bctx.beginPath();
  bctx.moveTo(0, -34);
  bctx.lineTo(30, 22);
  bctx.lineTo(-30, 22);
  bctx.closePath();
  bctx.fill();
  bctx.restore();
  const boardTableTop = finalizeColorTexture(btCanvas, maxAniso);
  created.push(boardTableTop);

  // 4. Server Rack LED Matrix Front Panel
  const srCanvas = document.createElement("canvas");
  srCanvas.width = 256;
  srCanvas.height = 512;
  const sctx = srCanvas.getContext("2d")!;
  sctx.fillStyle = "#0b1018";
  sctx.fillRect(0, 0, 256, 512);
  for (let row = 18; row < 494; row += 22) {
    sctx.fillStyle = "#161f2e";
    sctx.fillRect(16, row, 224, 15);
    for (let col = 26; col < 226; col += 16) {
      const pick = (row * 3 + col * 7) % 11;
      if (pick < 4) {
        sctx.fillStyle = pick === 0 ? "#38bdf8" : pick === 1 ? "#22c55e" : "#f59e0b";
        sctx.fillRect(col, row + 4, 7, 5);
      } else {
        sctx.fillStyle = "#1e293b";
        sctx.fillRect(col, row + 4, 7, 5);
      }
    }
  }
  const serverRackFront = finalizeColorTexture(srCanvas, maxAniso);
  created.push(serverRackFront);

  // 5. Specialized Monitor / Wall Display Screens
  const makeScreen = (
    bg: string,
    accent: string,
    header: string,
    metrics: Array<[string, string]>,
    mode: "bars" | "radar" | "growth" | "script" | "thumb"
  ) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 288;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 288);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 276);

    ctx.fillStyle = accent;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText(header, 24, 40);

    metrics.forEach(([k, v], idx) => {
      const y = 84 + idx * 44;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 17px system-ui, sans-serif";
      ctx.fillText(k, 24, y);
      ctx.fillStyle = "#4ade80";
      ctx.font = "700 20px monospace";
      ctx.fillText(v, 165, y);
    });

    if (mode === "growth" || mode === "bars") {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(280, 236);
      ctx.lineTo(332, 196);
      ctx.lineTo(378, 206);
      ctx.lineTo(430, 134);
      ctx.lineTo(478, 78);
      ctx.stroke();
      for (let b = 0; b < 5; b++) {
        const bh = 42 + b * 28;
        ctx.fillStyle = "rgba(34, 197, 94, 0.34)";
        ctx.fillRect(284 + b * 40, 248 - bh, 26, bh);
      }
    } else if (mode === "radar") {
      ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
      ctx.lineWidth = 2.5;
      [34, 64, 92].forEach((r) => {
        ctx.beginPath();
        ctx.arc(382, 156, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.fillStyle = "#f59e0b";
      [
        [356, 122],
        [418, 134],
        [392, 192],
      ].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (mode === "script") {
      for (let ln = 0; ln < 7; ln++) {
        ctx.fillStyle = ln === 0 ? "#f5a623" : "rgba(226, 232, 240, 0.45)";
        ctx.fillRect(272, 72 + ln * 26, ln % 2 === 0 ? 204 : 156, 12);
      }
    } else if (mode === "thumb") {
      ctx.fillStyle = "#1e1b4b";
      ctx.fillRect(274, 68, 206, 126);
      ctx.fillStyle = "#f5a623";
      ctx.beginPath();
      ctx.arc(412, 130, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText("PONTO ZERO", 288, 232);
    }

    const t = finalizeColorTexture(c, maxAniso);
    created.push(t);
    return t;
  };

  const analyticsScreen = makeScreen(
    "#071318",
    "#38bdf8",
    "OAUTH TELEMETRY · SYNC",
    [
      ["CTR BASE", "SYNC"],
      ["RETENÇÃO", "30s+"],
      ["INTEGRIDADE", "100%"],
    ],
    "bars"
  );
  const radarScreen = makeScreen(
    "#081420",
    "#22d3ee",
    "OUTLIER COHORT RADAR",
    [
      ["PARES", "APROV."],
      ["MEDIANA", "LIMPA"],
      ["SIMILAR.", "<0.70"],
    ],
    "radar"
  );
  const growthVaultScreen = makeScreen(
    "#081814",
    "#34d399",
    "LAUNCH & HUMAN GATE",
    [
      ["POTENCIAL", "+28.4%"],
      ["RETORNO", "+34.7%"],
      ["AUTO-PUB", "OFF"],
    ],
    "growth"
  );
  const scriptScreen = makeScreen(
    "#141218",
    "#f5a623",
    "HOOK 0-30s · ESTRUTURA",
    [
      ["ATO I", "PROVA"],
      ["ATO II", "RUPTURA"],
      ["LOOPS", "ATIVOS"],
    ],
    "script"
  );
  const thumbScreen = makeScreen(
    "#120f24",
    "#a78bfa",
    "2-ELEMENT CONTRAST LAB",
    [
      ["ELEMENTOS", "MAX 2"],
      ["REPETIÇÃO", "0%"],
      ["MOBILE", "160x90"],
    ],
    "thumb"
  );

  // 6. Soft Radial Contact Shadow
  const shCanvas = document.createElement("canvas");
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext("2d")!;
  const grad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.68)");
  grad.addColorStop(0.55, "rgba(0, 0, 0, 0.28)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.0)");
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeColorTexture(shCanvas, maxAniso);
  created.push(contactShadow);

  const makeSignTexture = (title: string, subtitle: string, accentCss: string) => {
    const c = document.createElement("canvas");
    c.width = 768;
    c.height = 192;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0d121c";
    ctx.fillRect(0, 0, 768, 192);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 752, 176);

    // Accent bar on left
    ctx.fillStyle = accentCss;
    ctx.fillRect(26, 36, 14, 120);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 46px system-ui, sans-serif";
    ctx.fillText(title.slice(0, 26), 58, 96);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText(subtitle.toUpperCase().slice(0, 38), 58, 142);

    const tex = finalizeColorTexture(c, maxAniso);
    created.push(tex);
    return tex;
  };

  const makeDoorBadgeTexture = (code: string, label: string, accentCss: string) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 384;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#121824";
    ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 232, 360);

    // Glowing hexagon icon frame
    ctx.save();
    ctx.translate(128, 148);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      const rx = Math.cos(a) * 56;
      const ry = Math.sin(a) * 56;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 34px monospace";
    ctx.fillText(code, 0, 2);
    ctx.restore();

    ctx.fillStyle = accentCss;
    ctx.textAlign = "center";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText(label.toUpperCase().slice(0, 14), 128, 258);

    const tex = finalizeColorTexture(c, maxAniso);
    created.push(tex);
    return tex;
  };

  return {
    hubTileAlbedo,
    hubTileRoughness,
    darkMarbleAlbedo,
    boardTableTop,
    serverRackFront,
    analyticsScreen,
    radarScreen,
    growthVaultScreen,
    scriptScreen,
    thumbScreen,
    contactShadow,
    makeSignTexture,
    makeDoorBadgeTexture,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
