"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Chess, type Square } from "chess.js";
import { cboardOf, readPrefs, useCartoonPrefs, type Cam } from "@/lib/cartoonPrefs";
import { getAudio } from "@/lib/sfx";

// 3D-доска с мультяшными фигурами. Настоящие шахматные правила (chess.js): ходы, взятия, рокировка, мат.
// Камера: перетаскивание поворачивает, колесо мыши и щипок приближают.

type Color = "w" | "b";
type PType = "p" | "n" | "b" | "r" | "q" | "k";
type View = "top" | "tilt" | "black" | "tiltb";
type Status = { turn: Color; check: boolean; over: string; last: string };
type Face = { eyes: THREE.Object3D[]; smile: THREE.Mesh | null; open: THREE.Mesh };
type Piece = {
  color: Color; type: PType; square: Square; group: THREE.Group; body: THREE.Group; face: Face; shadow: THREE.Mesh;
  phase: number; x: number; z: number; baseYaw: number; hopT: number | null; wowUntil: number; wow: boolean; checked: boolean;
  tw: { t0: number; D: number; fx: number; fz: number; tx: number; tz: number } | null; dying: number | null;
};
type LastMove = { from: string; to: string } | null;
type Ctl = { setView: (v: View) => void; newGame: () => void; setFen: (fen: string, last: LastMove) => void };
/** Параметры для настоящей партии. Без fen доска играет сама с собой (страница /cartoon-3d/). */
export type Board3DProps = {
  fen?: string;
  orientation?: "white" | "black";
  lastMove?: LastMove;
  disabled?: boolean;
  mute?: boolean; // без звука (просмотр истории партии)
  cam?: Cam; // вид камеры в партии: сверху, под углом 30°, с другой стороны
  onMove?: (from: string, to: string, promotion?: string) => void;
};

const S = 1.5;
const TEAM: Record<Color, { robe: number; acc: number; hat: number; trim: number; hair: number; beard: number }> = {
  w: { robe: 0xfff1d6, acc: 0xff7a3d, hat: 0xffbf1f, trim: 0xff4d6d, hair: 0xffcf4d, beard: 0xf4f1ff },
  b: { robe: 0x3b2f6a, acc: 0xff4d6d, hat: 0x2a2438, trim: 0x4dc3ff, hair: 0x2a1f3d, beard: 0xb7b3c9 },
};
const SKIN = 0xffd6b5;
const GEMS = [0xff4d6d, 0x4dc3ff, 0x6be36b, 0xff9f1c, 0xb36bff];
const BASE_VIEWS: Record<View, [number, number, number]> = { top: [0, 0.4, 21], tilt: [0.52, 0.95, 19], tiltb: [Math.PI + 0.52, 0.95, 19], black: [Math.PI, 0.5, 21] };

const sqXZ = (sq: string) => ({ x: (sq.charCodeAt(0) - 97 - 3.5) * S, z: (8 - Number(sq[1]) - 3.5) * S });
const toSq = (c: number, r: number) => (String.fromCharCode(97 + c) + (8 - r)) as Square;

const OUTLINE = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  vertexShader: "void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*0.032,1.0);}",
  fragmentShader: "void main(){gl_FragColor=vec4(0.30,0.14,0.28,1.0);}",
});
const phong = (c: number, sh = 50) => new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x777777 });
const mk = (geo: THREE.BufferGeometry, c: number, outline = true, sh = 50) => {
  const m = new THREE.Mesh(geo, phong(c, sh));
  if (outline) m.add(new THREE.Mesh(geo, OUTLINE));
  return m;
};
const bas = (c: number) => new THREE.MeshBasicMaterial({ color: c });
const lathe = (pts: number[][], c: number) => mk(new THREE.LatheGeometry(pts.map((a) => new THREE.Vector2(a[0], a[1])), 36), c);
const ell = (r: number, sx: number, sy: number, sz: number, c: number, x: number, y: number, z: number, outline = true) => {
  const m = mk(new THREE.SphereGeometry(r, 22, 14), c, outline);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m;
};
const ringM = (r: number, t: number, c: number, y: number) => {
  const m = mk(new THREE.TorusGeometry(r, t, 10, 28), c); m.rotation.x = Math.PI / 2; m.position.y = y; return m;
};

function addFace(head: THREE.Object3D, r: number): Face {
  const eyes: THREE.Object3D[] = [];
  ([-1, 1] as const).forEach((s) => {
    const g = new THREE.Group(); g.position.set(s * r * 0.37, r * 0.16, r * 0.84);
    const w = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 22, 16), bas(0xffffff)); w.scale.set(1, 1.2, 0.55);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 18, 14), bas(0x6b3a1c)); ir.position.set(0, -r * 0.03, r * 0.11); ir.scale.set(1, 1.1, 0.5);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 14, 10), bas(0x1b1030)); pu.position.set(0, -r * 0.03, r * 0.16);
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 10, 8), bas(0xffffff)); h1.position.set(-r * 0.08, r * 0.1, r * 0.22);
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.035, 8, 8), bas(0xffffff)); h2.position.set(r * 0.08, -r * 0.1, r * 0.22);
    g.add(w, ir, pu, h1, h2); head.add(g); eyes.push(g);
    const br = new THREE.Mesh(new THREE.TorusGeometry(r * 0.27, r * 0.045, 8, 16, Math.PI * 0.8), bas(0x6b4a3a));
    br.position.set(s * r * 0.37, r * 0.66, r * 0.78); br.rotation.z = Math.PI * 0.1; head.add(br);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(r * 0.19, 10, 8), bas(0xff8fa3)); ch.scale.set(1.2, 0.7, 0.4); ch.position.set(s * r * 0.65, -r * 0.23, r * 0.74); head.add(ch);
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(r * 0.23, r * 0.05, 8, 20, Math.PI), bas(0x5a1f2e));
  smile.rotation.z = Math.PI; smile.position.set(0, -r * 0.32, r * 0.97); head.add(smile);
  const open = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 14, 10), bas(0x7a1f3d));
  open.scale.set(1, 1.25, 0.5); open.position.set(0, -r * 0.42, r * 0.94); open.visible = false; head.add(open);
  return { eyes, smile, open };
}
const mkHead = (body: THREE.Object3D, y: number, r: number) => {
  const h = mk(new THREE.SphereGeometry(r, 32, 24), SKIN, true, 10);
  h.material.specular.set(0x1a1a1a); h.position.y = y; body.add(h); return h;
};
const crownOn = (head: THREE.Object3D, P: (typeof TEAM)["w"], y: number, rr: number, n: number) => {
  const cr = new THREE.Group(); cr.position.y = y; head.add(cr);
  cr.add(mk(new THREE.CylinderGeometry(rr * 0.74, rr * 0.8, 0.28, 22), P.hat, true, 100));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = mk(new THREE.ConeGeometry(0.11, 0.32, 10), P.hat, true, 100);
    sp.position.set(Math.sin(a) * rr * 0.65, 0.29, Math.cos(a) * rr * 0.65); cr.add(sp);
    cr.add(ell(0.055, 1, 1, 1, GEMS[i % 5], Math.sin(a) * rr * 0.65, 0.48, Math.cos(a) * rr * 0.65, false));
  }
  cr.add(ell(0.09, 1, 1, 0.7, 0xff4d6d, 0, 0, rr * 0.8, false));
};

function buildModel(color: Color, type: PType): { group: THREE.Group; body: THREE.Group; face: Face } {
  const P = TEAM[color], group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const puck = new THREE.Group();
  puck.add(lathe([[0, 0], [0.66, 0], [0.72, 0.06], [0.72, 0.16], [0.64, 0.24], [0, 0.24]], P.robe));
  puck.add(ringM(0.66, 0.055, P.trim, 0.22));
  body.add(puck);
  let face: Face;
  if (type === "p") {
    body.add(lathe([[0, 0.2], [0.52, 0.2], [0.4, 0.5], [0.28, 1.05], [0.26, 1.22], [0, 1.22]], P.robe));
    body.add(ringM(0.3, 0.08, P.acc, 1.22)); body.add(ringM(0.46, 0.05, P.acc, 0.55));
    const h = mkHead(body, 1.78, 0.58); face = addFace(h, 0.58);
    if (color === "w") {
      const cap = mk(new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), P.hat, true, 80);
      cap.position.y = 0.1; cap.rotation.x = -0.2; h.add(cap); h.add(ell(0.11, 1, 1, 1, 0xffd23f, 0, 0.7, -0.06));
    } else {
      h.add(ringM(0.6, 0.075, P.acc, 0.26));
      h.add(mk(new THREE.SphereGeometry(0.605, 24, 10, 0, Math.PI * 2, 1.85, 1.29), 0x2b2438));
      const t = mk(new THREE.ConeGeometry(0.09, 0.5, 8), P.acc); t.position.set(0.55, 0.22, -0.34); t.rotation.z = -1.2; h.add(t);
    }
  } else if (type === "r") {
    body.add(lathe([[0, 0.2], [0.56, 0.2], [0.5, 0.55], [0.44, 1.15], [0.55, 1.2], [0.55, 1.3], [0, 1.3]], P.robe));
    body.add(ringM(0.5, 0.06, P.acc, 0.75));
    const h = mkHead(body, 1.9, 0.58); face = addFace(h, 0.58);
    const tw = mk(new THREE.CylinderGeometry(0.6, 0.6, 0.36, 20), P.hat, true, 80); tw.position.y = 0.5; h.add(tw);
    h.add(ringM(0.61, 0.05, P.acc, 0.5));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, m = mk(new THREE.BoxGeometry(0.22, 0.22, 0.18), P.hat, true, 80);
      m.position.set(Math.sin(a) * 0.54, 0.78, Math.cos(a) * 0.54); m.rotation.y = a; h.add(m);
    }
  } else if (type === "b") {
    body.add(lathe([[0, 0.2], [0.52, 0.2], [0.4, 0.55], [0.3, 1.3], [0.27, 1.48], [0, 1.48]], P.robe));
    const st = mk(new THREE.BoxGeometry(0.2, 1, 0.06), P.acc); st.position.set(0, 0.85, 0.29); body.add(st);
    body.add(ringM(0.3, 0.07, P.acc, 1.48));
    const h = mkHead(body, 2.0, 0.58); face = addFace(h, 0.58);
    const mi = mk(new THREE.ConeGeometry(0.5, 0.95, 24), P.hat, true, 80); mi.position.y = 0.7; h.add(mi);
    h.add(ringM(0.44, 0.07, P.acc, 0.33));
    const c1 = mk(new THREE.BoxGeometry(0.08, 0.34, 0.08), P.acc, false), c2 = mk(new THREE.BoxGeometry(0.24, 0.08, 0.08), P.acc, false);
    c1.position.y = 1.32; c2.position.y = 1.36; h.add(c1, c2);
  } else if (type === "q") {
    body.add(lathe([[0, 0.2], [0.6, 0.2], [0.5, 0.6], [0.34, 1.4], [0.28, 1.6], [0, 1.6]], P.robe));
    body.add(ringM(0.36, 0.07, P.acc, 1.55)); body.add(ringM(0.5, 0.05, P.acc, 0.7));
    const h = mkHead(body, 2.1, 0.58); face = addFace(h, 0.58);
    h.add(ell(0.62, 1.05, 1.25, 0.7, P.hair, 0, -0.28, -0.22));
    const fr = mk(new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), P.hair); fr.position.y = 0.05; h.add(fr);
    crownOn(h, P, 0.62, 0.5, 5);
    ([-1, 1] as const).forEach((s) => h.add(ell(0.08, 1, 1, 1, P.acc, s * 0.62, -0.24, 0.05)));
  } else if (type === "k") {
    body.add(lathe([[0, 0.2], [0.56, 0.2], [0.46, 0.6], [0.32, 1.5], [0.29, 1.72], [0, 1.72]], P.robe));
    body.add(ringM(0.34, 0.08, P.acc, 1.72)); body.add(ringM(0.48, 0.05, P.acc, 0.75));
    body.add(ell(0.1, 1, 1, 0.6, 0xff4d6d, 0, 0.75, 0.5));
    const h = mkHead(body, 2.3, 0.62); face = addFace(h, 0.62);
    h.add(ell(0.4, 0.95, 1.2, 0.6, P.beard, 0, -0.66, 0.32));
    ([-1, 1] as const).forEach((s) => { const m = ell(0.12, 1.6, 0.65, 0.7, P.beard, s * 0.16, -0.28, 0.62); m.rotation.z = -s * 0.3; h.add(m); });
    crownOn(h, P, 0.7, 0.55, 5);
  } else {
    body.add(lathe([[0, 0.2], [0.5, 0.2], [0.42, 0.55], [0.32, 1.0], [0, 1.0]], P.robe));
    body.add(ringM(0.46, 0.06, P.acc, 0.6));
    const neck = mk(new THREE.SphereGeometry(0.42, 20, 16), P.robe); neck.scale.set(0.85, 1.6, 0.85); neck.position.set(-0.04, 1.12, 0); neck.rotation.z = -0.25; body.add(neck);
    const head = new THREE.Group(); head.position.set(0.12, 1.75, 0); body.add(head);
    head.add(ell(0.44, 1.05, 0.95, 0.8, P.robe, 0, 0, 0));
    head.add(ell(0.3, 1.2, 0.8, 0.78, P.robe, 0.46, -0.22, 0));
    ([-1, 1] as const).forEach((s) => {
      const ear = mk(new THREE.ConeGeometry(0.11, 0.34, 10), P.robe); ear.position.set(-0.08, 0.48, s * 0.16); ear.rotation.z = 0.15; head.add(ear);
      const ie = mk(new THREE.ConeGeometry(0.05, 0.2, 8), 0xff8fa3, false); ie.position.set(-0.06, 0.46, s * 0.18); ie.rotation.z = 0.15; head.add(ie);
    });
    [[-0.35, -0.58], [-0.4, -0.3], [-0.33, 0], [-0.22, 0.26], [-0.06, 0.46]].forEach(([x, y]) => head.add(ell(0.14, 1, 1, 1, P.acc, x, y + 0.05, 0)));
    const eyes: THREE.Object3D[] = [];
    ([-1, 1] as const).forEach((s) => {
      const eg = new THREE.Group(); eg.position.set(0.15, 0.1, s * 0.32);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), bas(0xffffff)); w.scale.set(1, 1.15, 0.55);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), bas(0x6b3a1c)); ir.position.set(0.02, -0.01, s * 0.05); ir.scale.set(1, 1.1, 0.5);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), bas(0x1b1030)); pu.position.set(0.03, -0.01, s * 0.07);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), bas(0xffffff)); hl.position.set(-0.01, 0.05, s * 0.09);
      eg.add(w, ir, pu, hl); head.add(eg); eyes.push(eg);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), bas(0xff8fa3)); ch.scale.set(1, 0.7, 0.4); ch.position.set(0.32, -0.17, s * 0.3); head.add(ch);
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), bas(0x3a1f3a)); n.position.set(0.75, -0.1, s * 0.1); head.add(n);
      const sm = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 14, Math.PI), bas(0x5a1f2e)); sm.rotation.z = Math.PI; sm.position.set(0.52, -0.3, s * 0.21); head.add(sm);
    });
    const open = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), bas(0x7a1f3d)); open.scale.set(1.3, 1, 1); open.position.set(0.62, -0.38, 0); open.visible = false; head.add(open);
    face = { eyes, smile: null, open };
  }
  return { group, body, face };
}

const yawOf = (color: Color, type: PType) => (type === "n" ? (color === "w" ? Math.PI / 2 : -Math.PI / 2) : color === "w" ? Math.PI : 0);

/** Короткий звук хода, как у плоской доски */
function beep() {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 220; o.type = "triangle";
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.1);
  } catch { /* звук необязателен */ }
}

const VIEW_LABELS: [View, string][] = [["top", "Сверху"], ["tilt", "Под углом 30°"], ["black", "Со стороны чёрных"]];

/** Камера в партии: «мой» вид зависит от того, за кого вы играете */
function camView(cam: Cam | undefined, orientation: "white" | "black" | undefined): View {
  const black = orientation === "black";
  if (cam === "tilt") return black ? "tiltb" : "tilt";
  if (cam === "far") return black ? "top" : "black";
  return black ? "black" : "top";
}

export default function Board3D(props: Board3DProps = {}) {
  const propsRef = useRef<Board3DProps>(props);
  propsRef.current = props;
  const controlled = props.fen !== undefined;
  const [, setPrefs] = useCartoonPrefs();
  const firstFen = useRef(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<Ctl | null>(null);
  const [view, setViewState] = useState<View>(camView(props.cam, props.orientation));
  const [err, setErr] = useState(false);
  const [st, setSt] = useState<Status>({ turn: "w", check: false, over: "", last: "" });

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    if (!box || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { setErr(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xcfeaff, 0xffd9a0, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(4, 9, 6); scene.add(sun);

    /* доска: цвета клеток берём из настроек игрока (по умолчанию «Бирюза») */
    const cb = cboardOf(readPrefs().cboard);
    const light = new THREE.Color(cb.light).getHex(), dark = new THREE.Color(cb.dark).getHex();
    const ped = mk(new THREE.BoxGeometry(8 * S + 1, 0.5, 8 * S + 1), 0xb3622b); ped.position.y = -0.42; scene.add(ped);
    const cells: THREE.Mesh[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const m = mk(new THREE.BoxGeometry(S - 0.02, 0.3, S - 0.02), (r + c) % 2 ? dark : light, false, 20);
      const sq = toSq(c, r), p = sqXZ(sq);
      m.position.set(p.x, -0.15, p.z); m.userData.sq = sq; scene.add(m); cells.push(m);
    }
    const fw = 8 * S + 0.4;
    ([[0, -fw / 2, fw + 0.45, 0.45], [0, fw / 2, fw + 0.45, 0.45], [-fw / 2, 0, 0.45, fw], [fw / 2, 0, 0.45, fw]] as number[][]).forEach((a) => {
      const m = mk(new THREE.BoxGeometry(a[2], 0.42, a[3]), 0xe59a3d); m.position.set(a[0], -0.08, a[1]); scene.add(m);
    });
    const marks = new THREE.Group(); scene.add(marks);
    const lastG = new THREE.Group(); scene.add(lastG);
    const showLast = (lm: LastMove) => {
      while (lastG.children.length) { const c = lastG.children[0] as THREE.Mesh; lastG.remove(c); c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      if (!lm) return;
      [lm.from, lm.to].forEach((sq) => {
        if (!/^[a-h][1-8]$/.test(sq)) return;
        const q = sqXZ(sq);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.08, S - 0.08), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5 }));
        m.rotation.x = -Math.PI / 2; m.position.set(q.x, 0.03, q.z); lastG.add(m);
      });
    };
    const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff7a3d }));
    selRing.rotation.x = Math.PI / 2; selRing.position.y = 0.06; selRing.visible = false; scene.add(selRing);

    /* игра */
    const startFen = propsRef.current.fen;
    let chess = new Chess();
    if (startFen) { try { chess = new Chess(startFen); } catch { chess = new Chess(); } }
    let pieces: Piece[] = [];
    let selected: Square | null = null;
    let targets = new Map<string, boolean>();
    let over = "";

    const makePiece = (color: Color, type: PType, sq: Square, phase: number): Piece => {
      const m = buildModel(color, type), p = sqXZ(sq);
      m.group.scale.setScalar(0.7); m.group.position.set(p.x, 0, p.z); scene.add(m.group);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x3a2a60, transparent: true, opacity: 0.3 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(p.x, 0.012, p.z); scene.add(shadow);
      const pc: Piece = { color, type, square: sq, group: m.group, body: m.body, face: m.face, shadow, phase, x: p.x, z: p.z, baseYaw: yawOf(color, type), hopT: null, wowUntil: 0, wow: false, checked: false, tw: null, dying: null };
      m.group.userData.piece = pc;
      m.group.traverse((o) => { o.userData.piece = pc; });
      return pc;
    };
    const disposeObj = (o: THREE.Object3D) => {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mat && mat !== OUTLINE) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
      });
    };
    const removePiece = (p: Piece) => { scene.remove(p.group); scene.remove(p.shadow); disposeObj(p.group); p.shadow.geometry.dispose(); (p.shadow.material as THREE.Material).dispose(); };
    const clearMarks = () => { while (marks.children.length) { const c = marks.children[0] as THREE.Mesh; marks.remove(c); c.geometry.dispose(); (c.material as THREE.Material).dispose(); } };
    const resetSelection = () => { selected = null; targets = new Map(); selRing.visible = false; clearMarks(); };
    const pieceAt = (sq: string) => pieces.find((p) => p.square === sq && p.dying === null);
    const sync = () => {
      const turn = chess.turn(), check = chess.inCheck();
      pieces.forEach((p) => { p.checked = check && p.type === "k" && p.color === turn && p.dying === null; });
      let msg = "";
      if (chess.isCheckmate()) msg = turn === "w" ? "Мат. Победили чёрные" : "Мат. Победили белые";
      else if (chess.isDraw() || chess.isStalemate()) msg = "Ничья";
      over = msg;
      const hist = chess.history();
      setSt({ turn, check, over: msg, last: hist.length ? hist[hist.length - 1] : "" });
    };
    const rebuild = (next: Chess) => {
      pieces.forEach(removePiece); pieces = []; resetSelection();
      chess = next;
      chess.board().forEach((row, r) => row.forEach((cell, c) => { if (cell) pieces.push(makePiece(cell.color, cell.type as PType, toSq(c, r), pieces.length * 0.9)); }));
      sync();
    };
    const slide = (p: Piece, sq: Square) => {
      const t = sqXZ(sq); const now = performance.now();
      p.tw = { t0: now, D: 750, fx: p.x, fz: p.z, tx: t.x, tz: t.z }; p.square = sq; p.wowUntil = now + 800;
    };
    const applyMove = (from: Square, to: Square, promo = "q") => {
      const mover = pieceAt(from); if (!mover) return;
      let mv;
      try { mv = chess.move({ from, to, promotion: promo }); } catch { resetSelection(); return; }
      resetSelection();
      if (mv.captured) {
        const capSq = (mv.flags.includes("e") ? to[0] + from[1] : to) as string;
        const v = pieces.find((p) => p.square === capSq && p !== mover && p.dying === null);
        if (v) v.dying = performance.now();
      }
      if (mv.promotion) {
        const np = makePiece(mover.color, "q", from, mover.phase);
        const idx = pieces.indexOf(mover); removePiece(mover); pieces[idx] = np; slide(np, to);
      } else slide(mover, to);
      if (mv.flags.includes("k")) { const rk = pieceAt("h" + from[1]); if (rk) slide(rk, ("f" + from[1]) as Square); }
      if (mv.flags.includes("q")) { const rk = pieceAt("a" + from[1]); if (rk) slide(rk, ("d" + from[1]) as Square); }
      sync();
    };
    /* свой ход: в настоящей партии отдаём ход наружу (правила и сервер проверяет страница партии), в одиночной игре ходим сами */
    const doMove = (from: Square, to: Square) => {
      const cb = propsRef.current;
      if (cb.fen !== undefined) {
        const pc = pieceAt(from);
        const promo = pc && pc.type === "p" && (to[1] === "8" || to[1] === "1") ? "q" : undefined;
        resetSelection();
        cb.onMove?.(from, to, promo);
      } else applyMove(from, to);
    };
    const newGame = () => { rebuild(new Chess()); showLast(null); };
    /* позиция пришла снаружи: если это один ход от нашей — показываем его анимацией, иначе собираем доску заново */
    const setFen = (fen: string, last: LastMove) => {
      const key = (f: string) => f.split(" ").slice(0, 2).join(" ");
      if (key(fen) === key(chess.fen())) { showLast(last); return; }
      let found: { from: Square; to: Square; promotion?: string } | null = null;
      try {
        for (const m of chess.moves({ verbose: true })) {
          const t = new Chess(chess.fen()); t.move({ from: m.from, to: m.to, promotion: m.promotion });
          if (key(t.fen()) === key(fen)) { found = { from: m.from, to: m.to, promotion: m.promotion }; break; }
        }
      } catch { found = null; }
      if (found) applyMove(found.from, found.to, found.promotion || "q");
      else { try { rebuild(new Chess(fen)); } catch { /* неверная позиция: оставляем как есть */ } }
      showLast(last);
    };
    const onSquare = (sq: Square) => {
      if (over || propsRef.current.disabled) return;
      if (selected && targets.has(sq)) { doMove(selected, sq); return; }
      const here = pieceAt(sq);
      if (here && here.color === chess.turn() && !here.tw && (propsRef.current.fen === undefined || here.color === (propsRef.current.orientation === "black" ? "b" : "w"))) {
        resetSelection(); selected = sq; here.hopT = performance.now(); here.wowUntil = performance.now() + 900;
        const p = sqXZ(sq); selRing.position.set(p.x, 0.06, p.z); selRing.visible = true;
        chess.moves({ square: sq, verbose: true }).forEach((m) => {
          const cap = !!m.captured; targets.set(m.to, cap);
          const q = sqXZ(m.to);
          const mesh = cap
            ? new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff4d6d }))
            : new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.85 }));
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(q.x, 0.05, q.z); marks.add(mesh);
        });
      } else resetSelection();
    };

    /* камера */
    const tg = new THREE.Vector3(0, 0.2, 0);
    let az = 0, pol = 0.4, R = 21, aspect = 4 / 3;
    const goalFor = (v: View): [number, number, number] => { const b = BASE_VIEWS[v]; return [b[0], b[1], b[2] * Math.max(1, 1.33 / aspect)]; };
    const view0: View = camView(propsRef.current.cam, propsRef.current.orientation);
    let goal = goalFor(view0);
    const resize = () => {
      const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(box); resize(); goal = goalFor(view0); az = goal[0]; pol = goal[1]; R = goal[2];

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const pick = (e: PointerEvent): Square | null => {
      const b = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(pieces.filter((p) => p.dying === null).map((p) => p.group), true)[0];
      if (hit) { const pc = hit.object.userData.piece as Piece | undefined; if (pc) return pc.square; }
      const ch = ray.intersectObjects(cells, false)[0];
      return ch ? (ch.object.userData.sq as Square) : null;
    };
    const ptrs = new Map<number, { x: number; y: number }>(); let moved = 0;
    const dist = () => { const a = Array.from(ptrs.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    const zoomBy = (k: number) => { goal = [goal[0], goal[1], Math.max(8, Math.min(30, goal[2] * k))]; };
    const onDown = (e: PointerEvent) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) moved = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; };
    const onMove = (e: PointerEvent) => {
      const prev = ptrs.get(e.pointerId); if (!prev) return;
      if (ptrs.size === 2) { const d0 = dist(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); const d1 = dist(); if (d1 > 0) zoomBy(d0 / d1); moved += 99; return; }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y; moved += Math.abs(dx) + Math.abs(dy);
      az -= dx * 0.007; pol = Math.max(0.3, Math.min(1.35, pol - dy * 0.005)); goal = [az, pol, goal[2]];
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      const had = ptrs.delete(e.pointerId); canvas.style.cursor = "grab";
      if (had && ptrs.size === 0 && moved < 6) { const sq = pick(e); if (sq) onSquare(sq); else resetSelection(); }
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(1 + e.deltaY * 0.001); };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const applyMood = (p: Piece, w: boolean) => { p.wow = w; if (p.face.smile) p.face.smile.visible = !w; p.face.open.visible = w; p.face.eyes.forEach((e) => e.scale.setScalar(w ? 1.12 : 1)); };

    let raf = 0, alive = true;
    const loop = (ms: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const t = ms / 1000; selRing.rotation.z = t * 2;
      for (const p of pieces.slice()) {
        let y = Math.sin(t * 2.2 + p.phase) * 0.03, sq = 1 + Math.sin(t * 2.2 + p.phase) * 0.018, scale = 0.7;
        if (p.hopT !== null) { const k = (ms - p.hopT) / 650; if (k >= 1) p.hopT = null; else { y += Math.sin(Math.PI * k) * 0.6; sq *= 1 + Math.sin(Math.PI * k) * 0.06; } }
        if (p.tw) {
          const k = Math.min(1, (ms - p.tw.t0) / p.tw.D), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          p.x = p.tw.fx + (p.tw.tx - p.tw.fx) * e; p.z = p.tw.fz + (p.tw.tz - p.tw.fz) * e; y += Math.sin(Math.PI * k) * 1.2;
          if (k >= 1) { p.tw = null; p.hopT = ms; }
        }
        if (p.dying !== null) {
          const k = (ms - p.dying) / 500; y += Math.sin(Math.PI * Math.min(1, k)) * 0.8; scale = 0.7 * Math.max(0, 1 - k);
          if (k >= 1) { removePiece(p); pieces = pieces.filter((x) => x !== p); continue; }
        }
        p.group.position.set(p.x, y, p.z); p.group.scale.setScalar(Math.max(0.001, scale));
        p.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        p.shadow.position.set(p.x, 0.012, p.z); const sc = Math.max(0.55, 1 - y * 0.35) * (scale / 0.7); p.shadow.scale.set(sc, sc, sc);
        const wowNow = p.checked || ms < p.wowUntil + 0;
        if (wowNow !== p.wow) applyMood(p, wowNow);
        if (!wowNow) p.face.eyes.forEach((e) => { e.scale.y = (t + p.phase) % 4.4 < 0.12 ? 0.1 : 1; });
        p.group.rotation.y = p.baseYaw + Math.sin(t * 1.2 + p.phase) * 0.1;
      }
      az += (goal[0] - az) * 0.08; pol += (goal[1] - pol) * 0.08; R += (goal[2] - R) * 0.08;
      camera.position.set(tg.x + R * Math.sin(pol) * Math.sin(az), tg.y + R * Math.cos(pol), tg.z + R * Math.sin(pol) * Math.cos(az));
      camera.lookAt(tg);
      renderer.render(scene, camera);
    };

    rebuild(chess); showLast(propsRef.current.lastMove ?? null);
    raf = requestAnimationFrame(loop);
    ctl.current = { setView: (v) => { goal = goalFor(v); }, newGame, setFen };

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); ctl.current = null;
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp); canvas.removeEventListener("wheel", onWheel);
      pieces.forEach(removePiece); clearMarks();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && mat !== OUTLINE) mat.dispose(); });
      renderer.dispose();
    };
  }, []);

  /* новая позиция из партии */
  useEffect(() => {
    if (props.fen === undefined) return;
    ctl.current?.setFen(props.fen, props.lastMove ?? null);
    if (firstFen.current) firstFen.current = false;
    else if (!props.mute) beep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.lastMove?.from, props.lastMove?.to]);
  /* смена стороны (играем чёрными) */
  useEffect(() => {
    if (props.fen === undefined) return;
    const v = camView(props.cam, props.orientation);
    setViewState(v); ctl.current?.setView(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.orientation, props.cam]);

  const choose = (v: View) => { setViewState(v); ctl.current?.setView(v); };
  const turnText = st.over || (st.turn === "w" ? "Ход белых" : "Ход чёрных") + (st.check ? ". Шах!" : "");
  const btn = (on: boolean) => "rounded-full border-2 px-4 py-2 text-sm font-bold shadow " + (on ? "border-orange-500 bg-orange-500 text-white" : "border-white bg-white/80 text-slate-900");

  return (
    <div className={controlled ? "w-full max-w-[560px] mx-auto" : "w-full"}>
      {!controlled && <div className="mb-3 flex flex-wrap gap-2">
        {VIEW_LABELS.map(([v, label]) => <button key={v} type="button" className={btn(view === v)} aria-pressed={view === v} onClick={() => choose(v)}>{label}</button>)}
        {!controlled && <button type="button" className={btn(false)} onClick={() => ctl.current?.newGame()}>Новая партия</button>}
        {controlled && <button type="button" className={btn(false)} onClick={() => setPrefs({ view3d: false })}>Плоская доска</button>}
      </div>}
      <div ref={boxRef} className={"relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-white shadow-lg" + (controlled ? "" : " sm:aspect-[4/3]")} style={{ background: "linear-gradient(#7cc8ff,#cdeeff 60%,#fff6e0)" }}>
        <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: "none", cursor: "grab" }} aria-label="Трёхмерная шахматная доска с мультяшными фигурами" />
        {err && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-slate-900">3D не запустилось на этом устройстве. Попробуйте другой браузер.</div>}
      </div>
      {!controlled && <p className="mt-2 text-sm font-bold" role="status" aria-live="polite">{turnText}{st.last && !st.over ? " · последний ход " + st.last : ""}</p>}
      {!controlled && <p className="mt-1 text-xs opacity-70">Нажмите на фигуру, затем на подсвеченную клетку. Перетащите сцену, чтобы повернуть камеру, колесо мыши приближает.</p>}
    </div>
  );
}
