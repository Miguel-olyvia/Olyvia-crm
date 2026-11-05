// Protótipo (visualizador 3D): a cena three.js (react-three-fiber 8 + drei 9, compatíveis com o React 18). Carrega-se com React.lazy, por isso o
// three só entra no pacote ao abrir o visualizador. Recebe o espaço (modelo.ts) e os produtos do catálogo com o mockup de cada um (catalogo3d.ts);
// cada mockup é geometria paramétrica com a dimensão real do produto. Se o produto tiver `mockup3d.url` (GLB), carrega-se esse modelo e a
// geometria paramétrica fica de reserva. Sem sombras (o protótipo não precisa) e com o ciclo de desenho sob pedido (frameloop demand).
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { MaterialMockup, ParamsMockup, ProdutoModelo3D } from "./catalogo3d";
import { ehModeloTorneira, construirTorneira } from "./modelosHtml/torneiras";
import { libertarMateriais } from "./modelosHtml/util";
import { construirLavaLoica, ehModeloLavaLoica } from "./modelosHtml";
import { construirPlaca, ehModeloPlaca } from "./modelosHtml/placas";
import { comprimento, normalInterior, trocosDeParede, type Abertura, type Espaco, type OpcoesPeca, type Parede, type PecaProduto } from "./modelo";
import { revestimentoDe, type Revestimento } from "./revestimentos";

export type Vista3D = "cima" | "3d" | "pessoa";
export interface Visualizador3DProps {
  espaco: Espaco;
  /** Os produtos usados no espaço, por id. */
  modelos: Readonly<Record<string, ProdutoModelo3D>>;
  vista: Vista3D;
  teto: boolean;
  etiquetas: boolean;
  descricao: string;
  /** a peça escolhida (a mesma da planta) e como escolher outra clicando nela */
  selecionada: string | null;
  onSelecionar: (id: string | null) => void;
}

type V3 = [number, number, number];

/* ------------------------------------------------------------------ texturas procedurais (canvas, sem ficheiros) */
const cacheTexturas = new Map<string, THREE.CanvasTexture>();
/** O lado, em metros, que uma repetição da textura cobre. */
const ladoTextura = (r: Revestimento): number => (r.tipo === "madeira" ? r.modulo * 4 : r.modulo);

function texturaBase(r: Revestimento): THREE.CanvasTexture | null {
  if (r.tipo === "tinta") return null;
  const guardada = cacheTexturas.get(r.id);
  if (guardada) return guardada;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = r.cor;
  g.fillRect(0, 0, 256, 256);
  if (r.tipo === "azulejo") {
    g.strokeStyle = r.junta ?? "#bbb";
    g.lineWidth = 8;
    g.strokeRect(0, 0, 256, 256);
  } else {
    const sombras = [0.0, -0.08, 0.06, -0.04];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = sombras[i] >= 0 ? `rgba(255,255,255,${sombras[i]})` : `rgba(0,0,0,${-sombras[i]})`;
      g.fillRect(0, i * 64, 256, 64);
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.08)";
      for (let k = 0; k < 6; k++) { const y = i * 64 + 8 + k * 9 + ((i * 7 + k * 3) % 5); g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + ((k % 2) * 2 - 1)); g.stroke(); }
      g.strokeStyle = "rgba(0,0,0,0.3)";
      const x = (i * 97) % 256; g.beginPath(); g.moveTo(x, i * 64); g.lineTo(x, i * 64 + 64); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cacheTexturas.set(r.id, t);
  return t;
}

/** Um material do revestimento para uma superfície de `w`×`h` metros (a textura repete-se por metro, não esticada). */
function useRevestimento(r: Revestimento, w: number, h: number): THREE.MeshStandardMaterial {
  const mat = useMemo(() => {
    const base = texturaBase(r);
    const m = new THREE.MeshStandardMaterial({ color: base ? "#ffffff" : r.cor, roughness: r.tipo === "azulejo" ? 0.35 : 0.8, side: THREE.DoubleSide });
    if (base) {
      const t = base.clone();
      t.needsUpdate = true;
      const l = ladoTextura(r);
      t.repeat.set(Math.max(0.1, w / l), Math.max(0.1, h / l));
      m.map = t;
    }
    return m;
  }, [r, w, h]);
  useEffect(() => () => { mat.map?.dispose(); mat.dispose(); }, [mat]);
  return mat;
}

/* ------------------------------------------------------------------ pequenas peças */
const Caixa = ({ p, s, cor, r = 0.6 }: { p: V3; s: V3; cor: string; r?: number }) => (
  <mesh position={p}><boxGeometry args={s} /><meshStandardMaterial color={cor} roughness={r} /></mesh>
);
/** Um cilindro achatado em elipse: raio 0,5 em x e z, escalado para `ex` × `ez`. */
const Elipse = ({ p, ex, ez, h, cor, topo = 0.5 }: { p: V3; ex: number; ez: number; h: number; cor: string; topo?: number }) => (
  <mesh position={p} scale={[ex, 1, ez]}><cylinderGeometry args={[topo, 0.5, h, 28]} /><meshStandardMaterial color={cor} roughness={0.25} /></mesh>
);
/** As frentes (portas) de um móvel, com puxadores, na face de +z. */
function Frentes({ w, h, d, n, cor, y0 = 0, vertical = false }: { w: number; h: number; d: number; n: number; cor: string; y0?: number; vertical?: boolean }) {
  const folga = 0.006, lw = (w - folga * (n + 1)) / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + folga + lw / 2 + i * (lw + folga);
        const hx = x + (i % 2 === 0 ? lw / 2 - 0.03 : -lw / 2 + 0.03);
        return (
          <group key={i}>
            <Caixa p={[x, y0 + h / 2, d / 2 + 0.009]} s={[lw, h - 0.01, 0.018]} cor={cor} r={0.5} />
            <Caixa p={[hx, vertical ? y0 + h * 0.5 : y0 + h - 0.05, d / 2 + 0.03]} s={vertical ? [0.015, 0.14, 0.02] : [0.12, 0.012, 0.02]} cor="#8a8a8a" r={0.3} />
          </group>
        );
      })}
    </>
  );
}

/** O material de um acabamento. Sem mapa de ambiente, o metal puro fica escuro: limita-se o metalness para o acabamento se ver. */
function Material({ cor, mat }: { cor: string; mat?: MaterialMockup }) {
  return <meshStandardMaterial color={cor} roughness={mat?.roughness ?? 0.4} metalness={Math.min(mat?.metalness ?? 0, 0.6)} side={THREE.DoubleSide} />;
}

/** O modelo detalhado portado do HTML (em mm; aqui a 0,001): corpo, bica e comando reais. As geometrias pesadas vêm de cache; o acabamento muda só os materiais. */
function ModeloHtml({ modelo, acab, opc, z0 }: { modelo: string; acab: string; opc?: OpcoesPeca; z0: number }) {
  const t = useMemo(() => (ehModeloTorneira(modelo) ? construirTorneira(modelo, acab, { bica: opc?.bica, extraido: opc?.extraido ? 1 : 0 }) : null), [modelo, acab, opc?.bica, opc?.extraido]);
  useEffect(() => () => { if (t) libertarMateriais(t.materiais); }, [t]);
  return t ? <group position={[0, 0, z0]} scale={0.001}><primitive object={t.grupo} /></group> : null;
}

/** O lava-loiça detalhado do HTML (Velar, Lody, Ambar): o topo do rebordo à altura `h` do mockup, as cubas para baixo. */
function ModeloLavaLoicaHtml({ modelo, acab, opc, h }: { modelo: string; acab: string; opc?: OpcoesPeca; h: number }) {
  const t = useMemo(() => (ehModeloLavaLoica(modelo) ? construirLavaLoica(modelo, acab, { tampas: opc?.tampas, reverso: opc?.reverso }) : null), [modelo, acab, opc?.tampas, opc?.reverso]);
  useEffect(() => () => { t?.materiais.forEach((m) => m.dispose()); }, [t]);
  return t ? <group position={[0, h, 0]} scale={0.001}><primitive object={t.grupo} /></group> : null;
}

/** A placa detalhada do HTML (queimadores, grelhas e manípulos; vidro com bordo): a base é o plano de apoio na bancada. */
function ModeloPlacaHtml({ modelo, acab }: { modelo: string; acab: string }) {
  const t = useMemo(() => (ehModeloPlaca(modelo) ? construirPlaca(modelo, acab) : null), [modelo, acab]);
  useEffect(() => () => { t?.materiais.forEach((m) => m.dispose()); }, [t]);
  return t ? <group scale={0.001}><primitive object={t.grupo} /></group> : null;
}

/** Uma torneira de cozinha: base, coluna e bica em tubo (extraível com cabeça, monocomando, abatível ou com flexível de silicone), ao longo de uma curva. */
function TorneiraCozinha({ w, d, h, cor, mat, p }: { w: number; d: number; h: number; cor: string; mat?: MaterialMockup; p: Extract<ParamsMockup, { k: "torneira" }> }) {
  const z0 = -d / 2 + p.base / 2;
  const curva = useMemo(() => {
    const H = h, a = p.alcance, s = p.saida;
    const pts: [number, number, number][] = p.estilo === "monocomando"
      ? [[0, 0, 0], [0, H * 0.7, 0], [0, H * 0.96, 0.02], [0, H, a * 0.4], [0, H * 0.99, a * 0.8], [0, s + 0.03, a]]
      : p.estilo === "abativel"
        ? [[0, 0, 0], [0, H * 0.55, 0], [0, H * 0.9, 0.02], [0, H, a * 0.35], [0, H * 0.96, a * 0.75], [0, s + 0.04, a]]
        : [[0, 0, 0], [0, H * 0.72, 0], [0, H * 0.95, 0.03], [0, H, a * 0.3], [0, H * 0.97, a * 0.72], [0, s + 0.1, a]];
    return new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z0 + z)));
  }, [h, p, z0]);
  const geo = useMemo(() => new THREE.TubeGeometry(curva, 28, p.estilo === "monocomando" ? 0.012 : 0.015, 12, false), [curva, p.estilo]);
  useEffect(() => () => geo.dispose(), [geo]);
  const fim = curva.getPoint(1), silicone = p.estilo === "cira";
  return (
    <>
      <Elipse p={[0, 0.006, z0]} ex={p.base} ez={p.base} h={0.012} cor={cor} />
      <mesh geometry={geo}><Material cor={silicone ? "#151618" : cor} mat={silicone ? { metalness: 0, roughness: 0.5 } : mat} /></mesh>
      {p.estilo !== "monocomando" && <Elipse p={[0, fim.y - 0.03, fim.z]} ex={0.034} ez={0.034} h={0.09} cor={cor} />}
      {p.estilo === "abativel" ? <Caixa p={[0, h * 0.5, z0 - 0.005]} s={[0.012, 0.1, 0.012]} cor={cor} r={0.3} /> : <Caixa p={[0.045, 0.1, z0]} s={[0.07, 0.014, 0.014]} cor={cor} r={0.3} />}
      <mesh position={[0, 0.001, 0]} visible={false}><boxGeometry args={[w, 0.002, d]} /></mesh>
    </>
  );
}

/** Uma chapa com furos (tampo e rebordo de lava-loiça): extrusão de um rectângulo com buracos, deitada. O buraco `z` do plano vira o `y` da forma (invertido). */
function ChapaComFuros({ w, d, esp, y, furos, cor, mat }: { w: number; d: number; esp: number; y: number; furos: { x: number; z: number; w: number; d: number }[]; cor: string; mat?: MaterialMockup }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
    for (const f of furos) {
      const b = new THREE.Path(), x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, y0 = -f.z - f.d / 2, y1 = -f.z + f.d / 2;
      b.moveTo(x0, y0); b.lineTo(x0, y1); b.lineTo(x1, y1); b.lineTo(x1, y0); b.lineTo(x0, y0);
      s.holes.push(b);
    }
    return new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false });
  }, [w, d, esp, furos]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}><Material cor={cor} mat={mat} /></mesh>;
}

/** Um lava-loiça: rebordo com os furos das cubas, cubas rebaixadas (paredes e fundo) com ralo, e o escorredor com ranhuras. */
function LavaLoica({ w, d, h, cor, mat, p }: { w: number; d: number; h: number; cor: string; mat?: MaterialMockup; p: Extract<ParamsMockup, { k: "lava_loica" }> }) {
  const furos = useMemo(() => p.cubas.map((c) => ({ x: c.x - w / 2 + c.w / 2, z: c.z - d / 2 + c.d / 2, w: c.w, d: c.d })), [p.cubas, w, d]);
  const fim = Math.max(...p.cubas.map((c) => c.x + c.w));
  const ranhuras = p.escorredor ? Math.max(0, Math.floor((w - fim - 0.06) / 0.022)) : 0;
  const t = 0.003;
  return (
    <>
      <ChapaComFuros w={w} d={d} esp={0.012} y={h - 0.012} furos={furos} cor={cor} mat={mat} />
      {p.cubas.map((c, i) => {
        const f = furos[i], base = h - c.prof;
        return (
          <group key={i}>
            <mesh position={[f.x, base + c.prof / 2, f.z + c.d / 2 - t / 2]}><boxGeometry args={[c.w, c.prof, t]} /><Material cor={cor} mat={mat} /></mesh>
            <mesh position={[f.x, base + c.prof / 2, f.z - c.d / 2 + t / 2]}><boxGeometry args={[c.w, c.prof, t]} /><Material cor={cor} mat={mat} /></mesh>
            <mesh position={[f.x - c.w / 2 + t / 2, base + c.prof / 2, f.z]}><boxGeometry args={[t, c.prof, c.d]} /><Material cor={cor} mat={mat} /></mesh>
            <mesh position={[f.x + c.w / 2 - t / 2, base + c.prof / 2, f.z]}><boxGeometry args={[t, c.prof, c.d]} /><Material cor={cor} mat={mat} /></mesh>
            <mesh position={[f.x, base, f.z]}><boxGeometry args={[c.w, t * 1.5, c.d]} /><Material cor={cor} mat={mat} /></mesh>
            <Elipse p={[f.x, base + 0.004, f.z - c.d * 0.2]} ex={0.07} ez={0.07} h={0.006} cor="#3a3f43" />
          </group>
        );
      })}
      {Array.from({ length: ranhuras }, (_, i) => <Caixa key={i} p={[-w / 2 + fim + 0.04 + i * 0.022, h + 0.001, 0]} s={[0.008, 0.003, d * 0.78]} cor="#8d9396" r={0.4} />)}
    </>
  );
}

/** Uma placa: vidro (indução e radiante, com as zonas) ou inox/vidro com queimadores, grelhas e manípulos (gás). A base do mockup é a face de cima do tampo. */
function Placa({ w, d, cor, mat, p }: { w: number; d: number; cor: string; mat?: MaterialMockup; p: Extract<ParamsMockup, { k: "placa" }> }) {
  const e = Math.max(0.004, p.espessura), gas = p.tipo === "gas";
  return (
    <>
      <mesh position={[0, e / 2, 0]}><boxGeometry args={[w, e, d]} /><Material cor={cor} mat={mat} /></mesh>
      {!gas && p.queimadores.map(([x, z, r], i) => <Elipse key={i} p={[x, e + 0.001, z]} ex={r * 2} ez={r * 2} h={0.002} cor={p.tipo === "induction" ? "#3a3f44" : "#8a2f26"} />)}
      {gas && p.queimadores.map(([x, z, r], i) => (
        <group key={i}>
          <Elipse p={[x, e + 0.01, z]} ex={r * 2} ez={r * 2} h={0.02} cor="#23272a" />
          <Elipse p={[x, e + 0.022, z]} ex={r * 1.2} ez={r * 1.2} h={0.006} cor="#6b7075" />
          <Caixa p={[x, e + 0.045, z]} s={[r * 2.4, 0.008, 0.008]} cor="#1d2022" r={0.5} />
          <Caixa p={[x, e + 0.045, z]} s={[0.008, 0.008, r * 2.4]} cor="#1d2022" r={0.5} />
        </group>
      ))}
      {gas && p.manipulos.map((x, i) => <Elipse key={i} p={[Math.max(-w / 2 + 0.02, Math.min(w / 2 - 0.02, x)), e + 0.012, d / 2 - 0.025]} ex={0.032} ez={0.032} h={0.024} cor="#2b2f33" />)}
    </>
  );
}
/** O mockup paramétrico de um tipo, com a pegada `w` (largura) × `d` (profundidade) e a altura `h`. Frente para +z, costas em -z, base em y=0. */
function Parametrico({ tipo, w, d, h, cor, mat, params, recortes, opc }: { tipo: ProdutoModelo3D["tipo"]; w: number; d: number; h: number; cor: string; mat?: MaterialMockup; params?: ParamsMockup; recortes?: { x: number; z: number; w: number; d: number }[]; opc?: OpcoesPeca }) {
  const bola = (hb: number, zc: number, prof: number) => (
    <>
      <Elipse p={[0, hb * 0.35, zc]} ex={w * 0.8} ez={prof * 0.9} h={hb * 0.7} cor={cor} topo={0.42} />
      <Elipse p={[0, hb + 0.015, zc]} ex={w} ez={prof} h={0.03} cor="#fbfbfa" />
    </>
  );
  switch (tipo) {
    case "base_duche":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.4} />
          <mesh position={[0, h + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w - 0.08, d - 0.08]} /><meshStandardMaterial color="#cfd8dd" roughness={0.3} /></mesh>
          <Elipse p={[0, h + 0.004, 0]} ex={0.08} ez={0.08} h={0.006} cor="#555a5e" />
        </>
      );
    case "banheira": {
      const t = Math.min(0.07, w / 6, d / 4), fundo = Math.min(0.2, h / 2);
      return (
        <>
          <Caixa p={[0, fundo / 2, 0]} s={[w, fundo, d]} cor={cor} r={0.3} />
          <Caixa p={[0, h / 2, d / 2 - t / 2]} s={[w, h, t]} cor={cor} r={0.3} />
          <Caixa p={[0, h / 2, -d / 2 + t / 2]} s={[w, h, t]} cor={cor} r={0.3} />
          <Caixa p={[w / 2 - t / 2, h / 2, 0]} s={[t, h, d - 2 * t]} cor={cor} r={0.3} />
          <Caixa p={[-w / 2 + t / 2, h / 2, 0]} s={[t, h, d - 2 * t]} cor={cor} r={0.3} />
          <mesh position={[0, h * 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w - 2 * t, d - 2 * t]} /><meshStandardMaterial color="#bcd7e6" transparent opacity={0.45} /></mesh>
          <Elipse p={[w / 2 - 0.15, fundo + 0.003, 0]} ex={0.07} ez={0.07} h={0.006} cor="#555a5e" />
        </>
      );
    }
    case "sanita": {
      // cuvete, tampa e depósito com botão
      const hb = Math.min(0.42, h), prof = Math.max(0.2, d - 0.2), ht = Math.max(hb + 0.2, h);
      return (
        <>
          <Caixa p={[0, (0.18 + ht) / 2, -d / 2 + 0.1]} s={[w * 0.95, ht - 0.18, 0.2]} cor={cor} r={0.3} />
          <Elipse p={[0, ht + 0.005, -d / 2 + 0.1]} ex={0.09} ez={0.05} h={0.01} cor="#cfd6da" />
          <Elipse p={[0, hb * 0.35, 0.1]} ex={w * 0.8} ez={prof * 0.9} h={hb * 0.7} cor={cor} topo={0.42} />
          <Elipse p={[0, hb + 0.02, 0.1]} ex={w} ez={prof} h={0.04} cor="#fbfbfa" />
        </>
      );
    }
    case "sanita_suspensa": {
      // cuvete suspensa com o depósito embutido (a placa de comando na parede)
      const hb = Math.min(0.42, h), prof = Math.max(0.2, d - 0.1);
      return (
        <>
          <Caixa p={[0, 0.55, -d / 2 + 0.03]} s={[w * 1.05, 1.1, 0.06]} cor="#eef0f1" r={0.4} />
          <Elipse p={[0, 0.82, -d / 2 + 0.065]} ex={0.1} ez={0.03} h={0.02} cor="#cfd6da" />
          <Elipse p={[0, hb * 0.5, 0.04]} ex={w * 0.85} ez={prof * 0.9} h={hb} cor={cor} topo={0.42} />
          <Elipse p={[0, hb + 0.02, 0.04]} ex={w} ez={prof} h={0.04} cor="#fbfbfa" />
        </>
      );
    }
    case "bide":
      return (
        <>
          {bola(h, 0.05, d * 0.9)}
          <Elipse p={[0, h + 0.033, 0.05]} ex={w * 0.6} ez={d * 0.5} h={0.006} cor="#cdd5d9" />
          <Elipse p={[0, h + 0.07, -d * 0.35]} ex={0.04} ez={0.04} h={0.08} cor="#9aa0a4" />
        </>
      );
    case "lavatorio": {
      // lavatório com coluna
      const hb = h - 0.16;
      return (
        <>
          <Elipse p={[0, hb / 2, -d * 0.2]} ex={0.16} ez={0.14} h={hb} cor={cor} />
          <Caixa p={[0, h - 0.09, -d / 2 + 0.04]} s={[w, 0.18, 0.08]} cor={cor} r={0.3} />
          <Elipse p={[0, h - 0.09, 0.02]} ex={w} ez={d * 0.95} h={0.18} cor={cor} topo={0.5} />
          <Elipse p={[0, h - 0.005, 0.03]} ex={w * 0.78} ez={d * 0.7} h={0.01} cor="#e3e8ea" />
          <Elipse p={[0, h + 0.07, -d * 0.35]} ex={0.03} ez={0.03} h={0.14} cor="#9aa0a4" />
        </>
      );
    }
    case "movel_lavatorio": {
      const hb = Math.max(0.2, h - 0.05);
      return (
        <>
          <Caixa p={[0, hb / 2, 0]} s={[w, hb, d]} cor={cor} r={0.55} />
          <Frentes w={w} h={hb} d={d} n={w > 0.55 ? 2 : 1} cor={cor} />
          <Caixa p={[0, hb + 0.02, 0]} s={[w + 0.02, 0.04, d + 0.02]} cor="#eceae6" r={0.3} />
          <Elipse p={[0, hb + 0.045, 0.02]} ex={w * 0.7} ez={d * 0.7} h={0.012} cor="#f6f8f8" />
          <Elipse p={[0, hb + 0.1, -d * 0.3]} ex={0.03} ez={0.03} h={0.1} cor="#9aa0a4" />
        </>
      );
    }
    case "espelho":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, Math.max(d, 0.02)]} cor="#2b2f33" r={0.4} />
          <Caixa p={[0, h / 2, Math.max(d, 0.02) / 2 + 0.001]} s={[w - 0.05, h - 0.05, 0.004]} cor="#cfe3ee" r={0.05} />
        </>
      );
    case "armario_espelho":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.5} />
          <Caixa p={[0, h / 2, d / 2 + 0.003]} s={[w - 0.04, h - 0.04, 0.006]} cor="#cfe3ee" r={0.05} />
        </>
      );
    case "torneira":
      return (
        <>
          <Elipse p={[0, 0.03, -d / 2 + 0.03]} ex={0.05} ez={0.05} h={0.06} cor={cor} />
          <Caixa p={[0, 0.07, 0]} s={[0.025, 0.025, d * 0.8]} cor={cor} r={0.2} />
        </>
      );
    case "toalheiro": {
      const n = Math.max(3, Math.round(h / 0.1));
      return (
        <>
          <Caixa p={[-w / 2 + 0.015, h / 2, 0]} s={[0.03, h, d]} cor={cor} r={0.35} />
          <Caixa p={[w / 2 - 0.015, h / 2, 0]} s={[0.03, h, d]} cor={cor} r={0.35} />
          {Array.from({ length: n }, (_, i) => <Caixa key={i} p={[0, 0.05 + i * ((h - 0.1) / (n - 1)), 0]} s={[w - 0.04, 0.022, 0.03]} cor={cor} r={0.35} />)}
        </>
      );
    }
    case "radiador": {
      const n = Math.max(4, Math.round(w / 0.06));
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.4} />
          {Array.from({ length: n }, (_, i) => <Caixa key={i} p={[-w / 2 + (i + 0.5) * (w / n), h / 2, d / 2 + 0.002]} s={[0.006, h - 0.04, 0.004]} cor="#c9c9c6" r={0.5} />)}
        </>
      );
    }
    case "prateleira":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, Math.max(h, 0.025), d]} cor={cor} r={0.6} />
          <Caixa p={[-w * 0.35, -0.04, -d * 0.1]} s={[0.02, 0.08, d * 0.8]} cor="#7a7f84" r={0.4} />
          <Caixa p={[w * 0.35, -0.04, -d * 0.1]} s={[0.02, 0.08, d * 0.8]} cor="#7a7f84" r={0.4} />
        </>
      );
    case "quadro":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, Math.max(d, 0.02)]} cor="#3a3a3a" r={0.5} />
          <Caixa p={[0, h / 2, Math.max(d, 0.02) / 2 + 0.001]} s={[w - 0.06, h - 0.06, 0.004]} cor={cor} r={0.8} />
          <Caixa p={[0, h * 0.35, Math.max(d, 0.02) / 2 + 0.004]} s={[w - 0.06, (h - 0.06) * 0.3, 0.002]} cor="#f1d9a3" r={0.8} />
        </>
      );
    case "candeeiro":
      return (
        <>
          <Caixa p={[0, h / 2, -d / 2 + 0.01]} s={[0.08, 0.08, 0.02]} cor="#6b6f73" r={0.4} />
          <Elipse p={[0, h / 2, -d / 2 + 0.1]} ex={w * 0.9} ez={d * 0.9} h={h * 0.7} cor={cor} topo={0.3} />
        </>
      );
    case "coluna_duche":
      return (
        <>
          <Elipse p={[0, h / 2, -d / 2 + 0.02]} ex={0.035} ez={0.035} h={h} cor={cor} />
          <Caixa p={[0, h * 0.45, -d / 2 + 0.04]} s={[0.14, 0.14, 0.07]} cor="#b8bdc1" r={0.25} />
          <Elipse p={[0, h - 0.01, 0.05]} ex={0.22} ez={0.22} h={0.02} cor={cor} />
        </>
      );
    case "resguardo":
      return (
        <>
          <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, Math.max(d, 0.008)]} /><meshStandardMaterial color="#bcd9ea" transparent opacity={0.3} roughness={0.05} /></mesh>
          <Caixa p={[0, 0.015, 0]} s={[w, 0.03, 0.03]} cor="#9aa0a4" r={0.3} />
          <Caixa p={[0, h - 0.015, 0]} s={[w, 0.03, 0.03]} cor="#9aa0a4" r={0.3} />
        </>
      );
    case "roupeiro":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.55} />
          <Frentes w={w} h={h - 0.02} d={d} n={Math.max(2, Math.round(w / 0.5))} cor={cor} y0={0.01} vertical />
        </>
      );
    case "cama":
      return (
        <>
          <Caixa p={[0, h * 0.25, 0]} s={[w, h * 0.5, d]} cor="#8b7355" r={0.7} />
          <Caixa p={[0, h * 0.5 + h * 0.25, 0.02]} s={[w - 0.04, h * 0.5, d - 0.08]} cor="#e8e6e1" r={0.9} />
          <Caixa p={[0, h * 1.1, -d / 2 + 0.03]} s={[w, h * 2.2, 0.06]} cor="#8b7355" r={0.7} />
          <Caixa p={[0, h + 0.07, -d / 2 + 0.25]} s={[Math.max(0.3, w * 0.35), 0.1, 0.4]} cor="#f7f5f0" r={0.9} />
        </>
      );
    case "secretaria":
      return (
        <>
          <Caixa p={[0, h - 0.015, 0]} s={[w, 0.03, d]} cor={cor} r={0.6} />
          <Caixa p={[-w / 2 + 0.02, (h - 0.03) / 2, 0]} s={[0.04, h - 0.03, d - 0.04]} cor={cor} r={0.6} />
          <Caixa p={[w / 2 - w * 0.15, (h - 0.03) / 2, 0]} s={[w * 0.3, h - 0.03, d - 0.04]} cor={cor} r={0.6} />
          <Caixa p={[w / 2 - w * 0.15, h * 0.45, d / 2 - 0.018]} s={[w * 0.28, h * 0.25, 0.012]} cor="#a58a68" r={0.5} />
          <Caixa p={[0, h * 0.55, -d / 2 + 0.02]} s={[w * 0.6, h * 0.4, 0.02]} cor={cor} r={0.6} />
        </>
      );
    case "sofa":
      return (
        <>
          <Caixa p={[0, h * 0.2, 0]} s={[w, h * 0.4, d]} cor="#5d6975" r={0.9} />
          {[-1, 0, 1].map((k) => <Caixa key={k} p={[k * ((w - 0.3) / 3), h * 0.45, 0.06]} s={[(w - 0.3) / 3 - 0.01, h * 0.15, d - 0.25]} cor={cor} r={0.9} />)}
          <Caixa p={[0, h * 0.65, -d / 2 + 0.1]} s={[w, h * 0.7, 0.2]} cor={cor} r={0.9} />
          <Caixa p={[-w / 2 + 0.075, h * 0.35, 0]} s={[0.15, h * 0.7, d]} cor="#5d6975" r={0.9} />
          <Caixa p={[w / 2 - 0.075, h * 0.35, 0]} s={[0.15, h * 0.7, d]} cor="#5d6975" r={0.9} />
        </>
      );
    case "mesa":
      return (
        <>
          <Caixa p={[0, h - 0.02, 0]} s={[w, 0.04, d]} cor={cor} r={0.55} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <Caixa key={i} p={[sx * (w / 2 - 0.06), (h - 0.04) / 2, sz * (d / 2 - 0.06)]} s={[0.06, h - 0.04, 0.06]} cor="#8e7352" r={0.6} />)}
        </>
      );
    case "bancada": {
      const hb = Math.max(0.2, h - 0.04);
      return (
        <>
          <Caixa p={[0, hb / 2, -0.01]} s={[w, hb, d - 0.02]} cor="#d8d3c8" r={0.6} />
          <Frentes w={w} h={hb} d={d - 0.02} n={Math.max(1, Math.round(w / 0.6))} cor="#d8d3c8" />
          <Caixa p={[0, hb + 0.02, 0]} s={[w, 0.04, d]} cor={cor} r={0.3} />
        </>
      );
    }
    case "frigorifico":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.3} />
          <Caixa p={[0, h * 0.36, d / 2 + 0.004]} s={[w, 0.012, 0.008]} cor="#4b4f53" r={0.3} />
          <Caixa p={[w / 2 - 0.05, h * 0.6, d / 2 + 0.03]} s={[0.02, h * 0.3, 0.03]} cor="#8a8a8a" r={0.3} />
          <Caixa p={[w / 2 - 0.05, h * 0.2, d / 2 + 0.03]} s={[0.02, h * 0.15, 0.03]} cor="#8a8a8a" r={0.3} />
        </>
      );
    case "fogao":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.35} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <Elipse key={i} p={[sx * w * 0.22, h + 0.005, sz * d * 0.22]} ex={w * 0.28} ez={d * 0.28} h={0.01} cor="#1f2326" />)}
          <Caixa p={[0, h * 0.38, d / 2 + 0.006]} s={[w * 0.8, h * 0.45, 0.012]} cor="#2b2f33" r={0.15} />
          <Caixa p={[0, h * 0.66, d / 2 + 0.02]} s={[w * 0.6, 0.014, 0.02]} cor="#8a8a8a" r={0.3} />
        </>
      );
    case "eletro":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.35} />
          <Caixa p={[0, h * 0.45, d / 2 + 0.006]} s={[w * 0.8, h * 0.5, 0.012]} cor="#2b2f33" r={0.15} />
          <Caixa p={[0, h * 0.82, d / 2 + 0.02]} s={[w * 0.6, 0.012, 0.02]} cor="#8a8a8a" r={0.3} />
        </>
      );
    case "torneira_cozinha":
      if (params?.k === "torneira" && params.html) return <ModeloHtml modelo={params.html.modelo} acab={params.html.acab} opc={opc} z0={-d / 2 + params.base / 2} />;
      return params?.k === "torneira" ? <TorneiraCozinha w={w} d={d} h={h} cor={cor} mat={mat} p={params} /> : <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} />;
    case "lava_loica":
      if (params?.k === "lava_loica" && params.html) return <ModeloLavaLoicaHtml modelo={params.html.modelo} acab={params.html.acab} opc={opc} h={h} />;
      return params?.k === "lava_loica" ? <LavaLoica w={w} d={d} h={h} cor={cor} mat={mat} p={params} /> : <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} />;
    case "placa":
      if (params?.k === "placa" && params.html) return <ModeloPlacaHtml modelo={params.html.modelo} acab={params.html.acab} />;
      return params?.k === "placa" ? <Placa w={w} d={d} cor={cor} mat={mat} p={params} /> : <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} />;
    case "tampo":
      return <ChapaComFuros w={w} d={d} esp={params?.k === "tampo" ? params.espessura : 0.012} y={0} furos={recortes ?? []} cor={cor} mat={mat} />;
    case "lavatorio_pousar":
      return (
        <>
          <Elipse p={[0, h * 0.5, 0]} ex={w} ez={d} h={h} cor={cor} topo={0.46} />
          <Elipse p={[0, h + 0.001, 0]} ex={w * 0.8} ez={d * 0.74} h={0.004} cor="#d9e0e3" />
          <Elipse p={[0, h + 0.004, -d * 0.2]} ex={0.04} ez={0.04} h={0.008} cor="#555a5e" />
        </>
      );
    case "sifao":
      return null;
    case "armario_alto":
    case "coluna":
    case "movel":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.55} />
          <Frentes w={w} h={h} d={d} n={w > 0.5 ? 2 : 1} cor={cor} />
        </>
      );
    default:
      return <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} />;
  }
}

/* ------------------------------------------------------------------ um GLB opcional por produto, com o paramétrico de reserva */
class Reserva extends Component<{ reserva: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  render() { return this.state.falhou ? this.props.reserva : this.props.children; }
}
function ModeloGLB({ url, w, d, h }: { url: string; w: number; d: number; h: number }) {
  const { scene } = useGLTF(url);
  const copia = useMemo(() => {
    const c = scene.clone(true);
    const caixa = new THREE.Box3().setFromObject(c), tam = caixa.getSize(new THREE.Vector3()), centro = caixa.getCenter(new THREE.Vector3());
    const k = new THREE.Vector3(w / (tam.x || 1), h / (tam.y || 1), d / (tam.z || 1));
    c.position.set(-centro.x * k.x, -caixa.min.y * k.y, -centro.z * k.z);
    c.scale.copy(k);
    const g = new THREE.Group();
    g.add(c);
    return g;
  }, [scene, w, d, h]);
  return <primitive object={copia} />;
}

function Peca({ p, m, etiquetas, selecionada, onSel }: { p: PecaProduto; m: ProdutoModelo3D; etiquetas: boolean; selecionada: boolean; onSel: (id: string) => void }) {
  const { tipo, altura, cor, url } = m.mockup3d;
  const reserva = <Parametrico tipo={tipo} w={p.largura} d={p.profundidade} h={altura} cor={cor} mat={m.mockup3d.material} params={m.mockup3d.params} recortes={p.recortes} opc={p.opc} />;
  const nf = (n: number) => Math.round(n * 100).toString();
  const base = p.altura; // altura da base ao chão (peças de parede e peças sobre a bancada)
  return (
    <group position={[p.x, base, p.y]} rotation={[0, (p.rotacao * Math.PI) / 180, 0]} onClick={(e) => { e.stopPropagation(); onSel(p.id); }}>
      <group scale={[p.espelhada ? -1 : 1, 1, 1]}>
        {url ? <Reserva reserva={reserva}><Suspense fallback={reserva}><ModeloGLB url={url} w={p.largura} d={p.profundidade} h={altura} /></Suspense></Reserva> : reserva}
      </group>
      {selecionada && (
        <mesh position={[0, altura / 2, 0]}><boxGeometry args={[p.largura + 0.04, altura + 0.04, p.profundidade + 0.04]} /><meshBasicMaterial color="#7c3aed" wireframe /></mesh>
      )}
      {(etiquetas || selecionada) && (
        <Html position={[0, Math.max(altura, 0.3) + 0.12, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] leading-tight text-white ${selecionada ? "bg-violet-700" : "bg-black/75"}`}>
            {p.nome ?? m.nome}<br />{nf(p.largura)}×{nf(p.profundidade)}×{nf(altura)} cm{p.montagem === "parede" ? ` · a ${nf(p.altura)} cm do chão` : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ paredes, aberturas, chão e tecto */
function ParedeCena({ parede, indice, espaco }: { parede: Parede; indice: number; espaco: Espaco }) {
  const c = comprimento(parede), esp = parede.espessura;
  const rev = revestimentoDe("parede", espaco.revestimentos.parede);
  const mat = useRevestimento(rev, c, espaco.peDireito);
  const trocos = useMemo(() => trocosDeParede(parede, espaco.aberturas, espaco.peDireito), [parede, espaco.aberturas, espaco.peDireito]);
  const n = normalInterior(espaco.paredes, indice);
  const ang = -Math.atan2(parede.b.y - parede.a.y, parede.b.x - parede.a.x);
  // o interior fica à direita ou à esquerda conforme o sentido do contorno: a espessura vai para fora
  const zFora = -(n.x * -(parede.b.y - parede.a.y) + n.y * (parede.b.x - parede.a.x)) / (c || 1) * (esp / 2);
  // a parede entre a câmara e o interior esconde-se (senão a vista 3D só mostra as costas das paredes): só olha-se para dentro
  const grupo = useRef<THREE.Group>(null);
  const meio = { x: (parede.a.x + parede.b.x) / 2, z: (parede.a.y + parede.b.y) / 2 };
  useFrame(({ camera }) => {
    if (grupo.current) grupo.current.visible = (-n.x) * (camera.position.x - meio.x) + (-n.y) * (camera.position.z - meio.z) <= 0.05;
  });
  return (
    <group ref={grupo} position={[parede.a.x, 0, parede.a.y]} rotation={[0, ang, 0]}>
      {trocos.map((t, i) => (
        <mesh key={i} position={[(t.de + t.ate) / 2, (t.z0 + t.z1) / 2, zFora]} material={mat}>
          <boxGeometry args={[t.ate - t.de, t.z1 - t.z0, esp]} />
        </mesh>
      ))}
      {espaco.aberturas.filter((a) => a.parede === parede.id).map((a) => <AberturaCena key={a.id} a={a} esp={esp} z={zFora} />)}
    </group>
  );
}
function AberturaCena({ a, esp, z }: { a: Abertura; esp: number; z: number }) {
  const x = a.posicao + a.largura / 2, aro = 0.05, e = esp + 0.02;
  const cor = a.tipo === "porta" ? "#a98467" : "#f1f1ee";
  return (
    <group position={[x, 0, z]}>
      <Caixa p={[-a.largura / 2 + aro / 2, a.peitoril + a.altura / 2, 0]} s={[aro, a.altura, e]} cor={cor} />
      <Caixa p={[a.largura / 2 - aro / 2, a.peitoril + a.altura / 2, 0]} s={[aro, a.altura, e]} cor={cor} />
      <Caixa p={[0, a.peitoril + a.altura - aro / 2, 0]} s={[a.largura, aro, e]} cor={cor} />
      {a.tipo === "janela" ? (
        <>
          <Caixa p={[0, a.peitoril + aro / 2, 0]} s={[a.largura, aro, e]} cor={cor} />
          <mesh position={[0, a.peitoril + a.altura / 2, 0]}><boxGeometry args={[a.largura - 2 * aro, a.altura - 2 * aro, 0.01]} /><meshStandardMaterial color="#bcd9ea" transparent opacity={0.35} roughness={0.1} /></mesh>
          <Caixa p={[0, a.peitoril + a.altura / 2, 0]} s={[0.025, a.altura - 2 * aro, 0.03]} cor={cor} />
        </>
      ) : (
        <>
          <Caixa p={[0, (a.altura - aro) / 2, 0]} s={[a.largura - 2 * aro, a.altura - aro, 0.04]} cor="#c19a76" r={0.6} />
          <Caixa p={[a.largura / 2 - aro - 0.08, a.altura * 0.48, 0.035]} s={[0.12, 0.02, 0.03]} cor="#9a9a9a" r={0.3} />
        </>
      )}
    </group>
  );
}

function Superficies({ espaco, teto }: { espaco: Espaco; teto: boolean }) {
  const contorno = useMemo(() => espaco.paredes.map((p) => p.a), [espaco.paredes]);
  const geo = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(contorno.map((q) => new THREE.Vector2(q.x, -q.y)))), [contorno]);
  useEffect(() => () => geo.dispose(), [geo]);
  const rev = revestimentoDe("pavimento", espaco.revestimentos.pavimento);
  const mat = useRevestimento(rev, 1, 1);
  return (
    <>
      <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} />
      {teto && <mesh geometry={geo} position={[0, espaco.peDireito, 0]} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial color="#fafafa" side={THREE.DoubleSide} /></mesh>}
    </>
  );
}

/* ------------------------------------------------------------------ câmaras */
function Camaras({ vista, espaco }: { vista: Vista3D; espaco: Espaco }) {
  const { size } = useThree();
  const caixa = useMemo(() => {
    const xs = espaco.paredes.map((p) => p.a.x), ys = espaco.paredes.map((p) => p.a.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cz: (y0 + y1) / 2, maior: Math.max(x1 - x0, y1 - y0, 1) };
  }, [espaco.paredes]);
  const { cx, cz, maior } = caixa, pe = espaco.peDireito;
  if (vista === "cima") {
    const zoom = Math.min(size.width, size.height) / (maior * 1.3);
    return (
      <>
        <OrthographicCamera key="cima" makeDefault position={[cx, 30, cz]} up={[0, 0, -1]} zoom={zoom} near={0.1} far={80} />
        <OrbitControls key="oc-cima" makeDefault target={[cx, 0, cz]} enableRotate={false} />
      </>
    );
  }
  if (vista === "pessoa") {
    return (
      <>
        <PerspectiveCamera key="pessoa" makeDefault position={[cx, 1.6, cz + 0.01]} fov={72} near={0.05} far={100} />
        <OrbitControls key="oc-pessoa" makeDefault target={[cx, 1.6, cz]} enablePan={false} enableZoom={false} rotateSpeed={-0.45} minDistance={0.01} maxDistance={0.01} />
      </>
    );
  }
  const d = maior * 1.1 + 1.5;
  return (
    <>
      <PerspectiveCamera key="3d" makeDefault position={[cx + d, d * 0.9, cz + d]} fov={45} near={0.1} far={200} />
      <OrbitControls key="oc-3d" makeDefault target={[cx, pe / 3, cz]} maxPolarAngle={Math.PI / 2.02} minDistance={1} maxDistance={maior * 4 + 6} />
    </>
  );
}

/** O ambiente de estúdio do HTML: caixas de luz cozidas num mapa de reflexos (sem descarregar nada). É isto que dá o aspecto metálico; sem ele o metal fica baço. */
function EstudioAmbiente() {
  const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene), invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const estudio = new THREE.Scene(); estudio.background = new THREE.Color("#aaa9a5");
    const caixa = (w: number, h: number, x: number, y: number, z: number, cor: string, k: number) => {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.001, h * 0.001), new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(k), side: THREE.DoubleSide }));
      o.position.set(x * 0.001, y * 0.001, z * 0.001); o.lookAt(0, 0.18, 0.09); estudio.add(o);
    };
    caixa(340, 1000, 480, 310, 330, "#ffffff", 3.5); caixa(180, 1000, -510, 360, 230, "#fffdf3", 2.3); caixa(320, 550, 0, 740, -150, "#ffffff", 3); caixa(100, 900, -140, 290, -500, "#434643", 0.45);
    caixa(300, 800, 450, 240, -460, "#353a37", 0.42); caixa(1200, 400, 0, -260, 0, "#d8d6ce", 0.9); caixa(100, 900, 150, 350, 540, "#ffffff", 1.5);
    const pmrem = new THREE.PMREMGenerator(gl), alvo = pmrem.fromScene(estudio, 0.02, 0.0001, 3);
    scene.environment = alvo.texture; scene.environmentIntensity = 1.05; invalidate();
    estudio.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    pmrem.dispose();
    return () => { scene.environment = null; alvo.dispose(); };
  }, [gl, scene, invalidate]);
  return null;
}

export default function Visualizador3D({ espaco, modelos, vista, teto, etiquetas, descricao, selecionada, onSelecionar }: Visualizador3DProps) {
  return (
    <div role="img" aria-label={descricao} className="h-full w-full touch-none">
      <Canvas frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true }} onPointerMissed={() => onSelecionar(null)}>
        <color attach="background" args={["#eef0f2"]} />
        <EstudioAmbiente />
        <hemisphereLight args={["#ffffff", "#8a8f95", 1.0]} />
        <directionalLight position={[4, 8, 5]} intensity={1.1} />
        <Camaras vista={vista} espaco={espaco} />
        <Superficies espaco={espaco} teto={teto && vista !== "cima"} />
        {espaco.paredes.map((p, i) => <ParedeCena key={p.id} parede={p} indice={i} espaco={espaco} />)}
        {espaco.pecas.map((p) => { const m = modelos[p.produtoId]; return m ? <Peca key={p.id} p={p} m={m} etiquetas={etiquetas} selecionada={selecionada === p.id} onSel={onSelecionar} /> : null; })}
      </Canvas>
    </div>
  );
}
