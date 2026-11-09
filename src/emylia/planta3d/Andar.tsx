// Protótipo (visualizador 3D): o modo «Andar» (câmara livre, como quem anda pela divisão). Teclado WASD e setas, Q/E (ou Espaço/C) sobe e desce
// os olhos, Shift corre, roda do rato muda a velocidade; olhar arrastando (rato ou um dedo) ou com pointer lock (duplo clique; Esc sai); no
// telemóvel, um joystick no canto inferior esquerdo. Colisão simples: não sai da divisão nem entra nas peças. As teclas só contam com o 3D em
// foco (clicar nele), por isso a página continua a fazer scroll fora dele.
import { useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ProdutoModelo3D } from "./catalogo3d";
import type { Espaco } from "./modelo";

/** O estado partilhado entre os controlos (HTML) e a câmara (dentro do Canvas). */
export interface EntradaAndar { teclas: Set<string>; joy: { x: number; y: number }; olhar: { dx: number; dy: number }; velocidade: number; olhos: number }
export const novaEntrada = (olhos = 1.6): EntradaAndar => ({ teclas: new Set(), joy: { x: 0, y: 0 }, olhar: { dx: 0, dy: 0 }, velocidade: 1.4, olhos });
const RAIO = 0.22; // o «corpo» de quem anda (m)
const TECLAS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e", " ", "c", "shift"]);

/** O ponto (x, z) cabe aqui? Dentro do polígono das paredes, longe delas e fora das peças (as baixas, como uma base de duche, pisam-se). */
export function podeEstar(espaco: Espaco, modelos: Readonly<Record<string, ProdutoModelo3D>>, x: number, z: number, olhos: number): boolean {
  const pts = espaco.paredes.map((w) => w.a);
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  if (!dentro) return false;
  for (const w of espaco.paredes) {
    const dx = w.b.x - w.a.x, dz = w.b.y - w.a.y, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (z - w.a.y) * dz) / l2));
    if (Math.hypot(x - (w.a.x + t * dx), z - (w.a.y + t * dz)) < RAIO) return false;
  }
  for (const p of espaco.pecas) {
    const m = modelos[p.produtoId]; if (!m) continue;
    const topo = p.altura + m.mockup3d.altura;
    if (topo < 0.15 || p.altura > olhos) continue; // pisa-se (base de duche) ou passa-se por baixo (peça alta na parede)
    const b = (p.rotacao * Math.PI) / 180, dx = x - p.x, dz = z - p.y, lx = dx * Math.cos(b) - dz * Math.sin(b), lz = dx * Math.sin(b) + dz * Math.cos(b);
    if (Math.abs(lx) < p.largura / 2 + RAIO && Math.abs(lz) < p.profundidade / 2 + RAIO) return false;
  }
  return true;
}

/** Um ponto de partida livre: o centro da divisão, ou o primeiro ponto livre numa espiral à volta dele. */
function partida(espaco: Espaco, modelos: Readonly<Record<string, ProdutoModelo3D>>, olhos: number): [number, number] {
  const xs = espaco.paredes.map((w) => w.a.x), zs = espaco.paredes.map((w) => w.a.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  for (let r = 0; r < 4; r += 0.15) for (let k = 0; k < 12; k++) { const x = cx + r * Math.cos(k * 0.52), z = cz + r * Math.sin(k * 0.52); if (podeEstar(espaco, modelos, x, z, olhos)) return [x, z]; }
  return [cx, cz];
}

/** A câmara do modo Andar (dentro do Canvas): lê a entrada a cada frame, move com colisão (desliza ao longo dos obstáculos) e roda o olhar. */
export function CamaraAndar({ espaco, modelos, entrada }: { espaco: Espaco; modelos: Readonly<Record<string, ProdutoModelo3D>>; entrada: { current: EntradaAndar } }) {
  const camera = useThree((s) => s.camera), invalidate = useThree((s) => s.invalidate);
  const ang = useRef({ yaw: 0, pitch: -0.05 }), inicio = useRef(partida(espaco, modelos, entrada.current.olhos));
  useEffect(() => { camera.position.set(inicio.current[0], entrada.current.olhos, inicio.current[1]); invalidate(); }, [camera, entrada, invalidate]);
  // o ciclo de desenho é sob pedido: enquanto houver tecla, joystick ou olhar, pede-se o frame seguinte
  useFrame((_, dt) => {
    const e = entrada.current, t = e.teclas, passo = Math.min(dt, 0.05);
    ang.current.yaw -= e.olhar.dx * 0.0042; ang.current.pitch = Math.max(-1.3, Math.min(1.3, ang.current.pitch - e.olhar.dy * 0.0042)); e.olhar.dx = 0; e.olhar.dy = 0;
    let f = (t.has("w") || t.has("arrowup") ? 1 : 0) - (t.has("s") || t.has("arrowdown") ? 1 : 0) - e.joy.y, l = (t.has("d") || t.has("arrowright") ? 1 : 0) - (t.has("a") || t.has("arrowleft") ? 1 : 0) + e.joy.x;
    const n = Math.hypot(f, l); if (n > 1) { f /= n; l /= n; }
    const v = e.velocidade * (t.has("shift") ? 2.2 : 1) * passo, sy = Math.sin(ang.current.yaw), cy = Math.cos(ang.current.yaw);
    const dx = (-sy * f + cy * l) * v, dz = (-cy * f - sy * l) * v;
    const p = camera.position;
    if (dx || dz) {
      if (podeEstar(espaco, modelos, p.x + dx, p.z + dz, e.olhos)) { p.x += dx; p.z += dz; }
      else if (podeEstar(espaco, modelos, p.x + dx, p.z, e.olhos)) p.x += dx;
      else if (podeEstar(espaco, modelos, p.x, p.z + dz, e.olhos)) p.z += dz;
    }
    const sobe = (t.has("q") || t.has(" ") ? 1 : 0) - (t.has("e") || t.has("c") ? 1 : 0);
    if (sobe) e.olhos = Math.max(0.4, Math.min(espaco.peDireito - 0.1, e.olhos + sobe * passo * 0.8));
    p.y = e.olhos;
    camera.rotation.set(ang.current.pitch, ang.current.yaw, 0, "YXZ");
    if (f || l || sobe || t.size) invalidate();
  });
  return <PerspectiveCamera key="andar" makeDefault fov={72} near={0.05} far={100} />;
}

/** Os controlos HTML por cima do 3D: arrastar para olhar, duplo clique para pointer lock, roda para a velocidade, joystick no telemóvel. */
export function ControlesAndar({ entrada, contentor }: { entrada: { current: EntradaAndar }; contentor: { current: HTMLDivElement | null } }) {
  const arr = useRef<{ id: number; x: number; y: number } | null>(null), joy = useRef<{ id: number; x: number; y: number } | null>(null), botao = useRef<HTMLDivElement>(null);
  const pedir = () => { const c = contentor.current?.querySelector("canvas"); c?.dispatchEvent(new Event("andar")); };
  useEffect(() => {
    const el = contentor.current; if (!el) return;
    const baixo = (ev: KeyboardEvent) => { const k = ev.key.toLowerCase(); if (!TECLAS.has(k)) return; ev.preventDefault(); entrada.current.teclas.add(k); pedir(); };
    const cima = (ev: KeyboardEvent) => { entrada.current.teclas.delete(ev.key.toLowerCase()); };
    const roda = (ev: WheelEvent) => { ev.preventDefault(); entrada.current.velocidade = Math.max(0.4, Math.min(5, entrada.current.velocidade * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))); };
    const rato = (ev: MouseEvent) => { if (document.pointerLockElement === el) { entrada.current.olhar.dx += ev.movementX; entrada.current.olhar.dy += ev.movementY; pedir(); } };
    const duplo = () => { el.requestPointerLock?.(); };
    const sair = () => entrada.current.teclas.clear();
    el.addEventListener("keydown", baixo); el.addEventListener("keyup", cima); el.addEventListener("wheel", roda, { passive: false }); el.addEventListener("dblclick", duplo); el.addEventListener("blur", sair);
    document.addEventListener("mousemove", rato);
    return () => { el.removeEventListener("keydown", baixo); el.removeEventListener("keyup", cima); el.removeEventListener("wheel", roda); el.removeEventListener("dblclick", duplo); el.removeEventListener("blur", sair); document.removeEventListener("mousemove", rato); };
  });
  // arrastar (rato ou um dedo) fora do joystick: olhar
  const descer = (e: RPointerEvent<HTMLDivElement>) => { contentor.current?.focus(); arr.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const mover = (e: RPointerEvent<HTMLDivElement>) => { const a = arr.current; if (!a || a.id !== e.pointerId) return; entrada.current.olhar.dx += e.clientX - a.x; entrada.current.olhar.dy += e.clientY - a.y; a.x = e.clientX; a.y = e.clientY; pedir(); };
  const largar = () => { arr.current = null; };
  // o joystick: o vector do centro ao dedo (até 1)
  const joyDescer = (e: RPointerEvent<HTMLDivElement>) => { e.stopPropagation(); joy.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const joyMover = (e: RPointerEvent<HTMLDivElement>) => {
    const j = joy.current; if (!j || j.id !== e.pointerId) return;
    const dx = (e.clientX - j.x) / 45, dy = (e.clientY - j.y) / 45, n = Math.max(1, Math.hypot(dx, dy));
    entrada.current.joy = { x: dx / n, y: dy / n };
    if (botao.current) botao.current.style.transform = `translate(${(dx / n) * 28}px, ${(dy / n) * 28}px)`;
    pedir();
  };
  const joyLargar = () => { joy.current = null; entrada.current.joy = { x: 0, y: 0 }; if (botao.current) botao.current.style.transform = ""; };
  return (
    <div className="absolute inset-0" style={{ touchAction: "none" }} onPointerDown={descer} onPointerMove={mover} onPointerUp={largar} onPointerCancel={largar}>
      <div role="note" className="pointer-events-none absolute right-2 top-2 rounded bg-black/55 px-2 py-1 text-[12px] leading-tight text-white">
        Andar: WASD ou setas · Shift corre · Q/E sobe e desce · roda: velocidade · arrastar ou duplo clique para olhar (Esc sai)
      </div>
      <div aria-label="Joystick: arrastar para andar" role="application" className="absolute bottom-4 left-4 flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/70 bg-black/25"
        onPointerDown={joyDescer} onPointerMove={joyMover} onPointerUp={joyLargar} onPointerCancel={joyLargar}>
        <div ref={botao} className="h-10 w-10 rounded-full bg-white/80 shadow" />
      </div>
    </div>
  );
}

/** Dentro do Canvas: quando os controlos HTML pedem («andar»), o ciclo sob pedido desenha o frame seguinte. */
export function AcordarAndar() {
  const gl = useThree((s) => s.gl), invalidate = useThree((s) => s.invalidate);
  useEffect(() => { const f = () => invalidate(); gl.domElement.addEventListener("andar", f); return () => gl.domElement.removeEventListener("andar", f); }, [gl, invalidate]);
  return null;
}
