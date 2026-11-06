// Protótipo (visualizador 3D): a cena three.js (react-three-fiber 8 + drei 9, compatíveis com o React 18). Carrega-se com React.lazy, por isso o
// three só entra no pacote ao abrir o visualizador. Recebe o espaço (modelo.ts) e os produtos do catálogo com o mockup de cada um (catalogo3d.ts);
// cada mockup é geometria paramétrica com a dimensão real do produto. Se o produto tiver `mockup3d.url` (GLB), carrega-se esse modelo e a
// geometria paramétrica fica de reserva. Sem sombras (o protótipo não precisa) e com o ciclo de desenho sob pedido (frameloop demand).
import { Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { MaterialMockup, ParamsMockup, ProdutoModelo3D } from "./catalogo3d";
import { ehModeloTorneira, construirTorneira } from "./modelosHtml/torneiras";
import { libertarMateriais } from "./modelosHtml/util";
import { construirLavaLoica, ehModeloLavaLoica } from "./modelosHtml";
import { construirPlaca, ehModeloPlaca } from "./modelosHtml/placas";
import { construirBancada } from "./modelosHtml/bancada3d";
import { VELAR_SPECS } from "./modelosHtml/lavaLoicas";
import { USAR_GLB, lerGlb, montarModelo, reterGlb, soltarGlb, urlDoModeloHtml, type FamiliaGlb, type ModeloMontado } from "./modelosHtml/glb";
import { BANCADA_OMISSAO, CHAPA_OMISSAO, TOPO_BANCADA_MM, ficheiroDaChapa, mudarChapa, selecaoChapa, type ConfigBancada } from "./bancada";
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
  /** Uma câmara pedida (metros, no mundo): as vistas da bancada (perspetiva ¾, perfil, frente, traseira, de cima, detalhe da bica). Muda ao mudar a chave. */
  camara?: { chave: string; pos: V3; alvo: V3 } | null;
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
    // juntas finas e meio apagadas: o revestimento é fundo, as peças é que se destacam
    g.globalAlpha = 0.45;
    g.strokeStyle = r.junta ?? "#bbb";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.globalAlpha = 1;
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
function useRevestimento(r: Revestimento, w: number, h: number): THREE.MeshLambertMaterial {
  const mat = useMemo(() => {
    const base = texturaBase(r);
    // o revestimento é mate e não recebe o ambiente de estúdio (com ele o branco satura e a divisão fica lisa): só as luzes e as sombras; as peças é que brilham
    const m = new THREE.MeshLambertMaterial({ color: base ? "#ffffff" : r.cor, side: THREE.DoubleSide });
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

/** O material de um acabamento (o ambiente de estúdio dá os reflexos ao metal). */
function Material({ cor, mat }: { cor: string; mat?: MaterialMockup }) {
  return <meshStandardMaterial color={cor} roughness={mat?.roughness ?? 0.4} metalness={mat?.metalness ?? 0} side={THREE.DoubleSide} />;
}

/* ------------------------------------------------------------------ os modelos do HTML: GLB pré-gerado, com o construtor procedural de reserva */
/** Diz à etiqueta da peça de onde veio cada modelo («GLB», «construtor procedural», «construtor procedural: o GLB falhou»). */
const AvisarFonte = createContext<(chave: string, fonte: string) => void>(() => {});
function useFonte(chave: string, fonte: string): void {
  const avisar = useContext(AvisarFonte);
  useEffect(() => avisar(chave, fonte), [avisar, chave, fonte]);
}

/** O construtor procedural (o caminho antigo, e a reserva quando o GLB falha). Em mm. */
function construirProcedural(familia: FamiliaGlb, modelo: string, acab: string, o: OpcoesPeca | undefined): ModeloMontado | null {
  if (familia === "torneira") {
    if (!ehModeloTorneira(modelo)) return null;
    const t = construirTorneira(modelo, acab, { bica: o?.bica, extraido: o?.extraido ? 1 : 0 });
    return { grupo: t.grupo, libertar: () => libertarMateriais(t.materiais) };
  }
  if (familia === "lava_loica") {
    if (!ehModeloLavaLoica(modelo)) return null;
    const t = construirLavaLoica(modelo, acab, { tampas: o?.tampas, reverso: o?.reverso });
    return { grupo: t.grupo, libertar: () => t.materiais.forEach((m) => m.dispose()) };
  }
  if (!ehModeloPlaca(modelo)) return null;
  const t = construirPlaca(modelo, acab);
  return { grupo: t.grupo, libertar: () => t.materiais.forEach((m) => m.dispose()) };
}
interface PropsHtml { familia: FamiliaGlb; modelo: string; acab: string; opc?: OpcoesPeca }
function ModeloProcedural({ familia, modelo, acab, opc, fonte }: PropsHtml & { fonte: string }) {
  const { bica, extraido, tampas, reverso } = opc ?? {};
  const t = useMemo(() => construirProcedural(familia, modelo, acab, { bica, extraido, tampas, reverso }), [familia, modelo, acab, bica, extraido, tampas, reverso]);
  useEffect(() => () => t?.libertar(), [t]);
  useFonte(`${familia}:${modelo}`, fonte);
  return t ? <primitive object={t.grupo} /> : null;
}
/** O GLB do modelo (suspende enquanto carrega): a geometria fica partilhada entre peças iguais; os materiais são os do acabamento. */
function ModeloGlbHtml({ familia, modelo, acab, opc }: PropsHtml) {
  const url = urlDoModeloHtml(familia, modelo);
  useEffect(() => { reterGlb(url); return () => soltarGlb(url); }, [url]);
  const cena = lerGlb(url);
  const { bica, extraido, tampas, reverso } = opc ?? {};
  const t = useMemo(() => montarModelo(familia, cena, modelo, acab, { bica, extraido, tampas, reverso }), [familia, cena, modelo, acab, bica, extraido, tampas, reverso]);
  useEffect(() => () => t.libertar(), [t]);
  useFonte(`${familia}:${modelo}`, "GLB");
  return <primitive object={t.grupo} />;
}
/** Se o GLB falhar (ficheiro em falta, rede, material desconhecido), regista o erro e põe o construtor procedural no lugar. */
class ReservaGlb extends Component<{ reserva: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(e: unknown) { console.warn("GLB do modelo 3D falhou; uso o construtor procedural", e); }
  render() { return this.state.falhou ? this.props.reserva : this.props.children; }
}
/** Um modelo do HTML (em mm): o GLB com o procedural de reserva, ou só o procedural com `USAR_GLB = false`. */
function CorpoHtml(p: PropsHtml) {
  if (!USAR_GLB) return <ModeloProcedural {...p} fonte="construtor procedural" />;
  return (
    <ReservaGlb reserva={<ModeloProcedural {...p} fonte="construtor procedural (o GLB falhou)" />}>
      <Suspense fallback={null}><ModeloGlbHtml {...p} /></Suspense>
    </ReservaGlb>
  );
}

/** A torneira detalhada do HTML (em mm; aqui a 0,001): corpo, bica e comando reais. */
function ModeloHtml({ modelo, acab, opc, z0 }: { modelo: string; acab: string; opc?: OpcoesPeca; z0: number }) {
  return ehModeloTorneira(modelo) ? <group position={[0, 0, z0]} scale={0.001}><CorpoHtml familia="torneira" modelo={modelo} acab={acab} opc={opc} /></group> : null;
}

/** O lava-loiça detalhado do HTML (Velar, Lody, Ambar): o topo do rebordo à altura `h` do mockup, as cubas para baixo. */
function ModeloLavaLoicaHtml({ modelo, acab, opc, h }: { modelo: string; acab: string; opc?: OpcoesPeca; h: number }) {
  return ehModeloLavaLoica(modelo) ? <group position={[0, h, 0]} scale={0.001}><CorpoHtml familia="lava_loica" modelo={modelo} acab={acab} opc={opc} /></group> : null;
}

/** A placa detalhada do HTML (queimadores, grelhas e manípulos; vidro com bordo): a base é o plano de apoio na bancada. */
function ModeloPlacaHtml({ modelo, acab }: { modelo: string; acab: string }) {
  return ehModeloPlaca(modelo) ? <group scale={0.001}><CorpoHtml familia="placa" modelo={modelo} acab={acab} /></group> : null;
}

/* ------------------------------------------------------------------ a chapa Coverlam (imagem do fabricante) e a bancada composta */
const cacheChapas = new Map<string, THREE.Texture>();
const aoCarregarChapa = new Set<() => void>();
/** A imagem da chapa (cache por ficheiro, nunca libertada: são poucas). Quando chega, pede novo desenho às cenas abertas. */
function texturaDaChapa(file: string): THREE.Texture {
  const tida = cacheChapas.get(file);
  if (tida) return tida;
  const t = new THREE.TextureLoader().load(ficheiroDaChapa(file), () => aoCarregarChapa.forEach((f) => f()));
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.name = file;
  cacheChapas.set(file, t);
  return t;
}
function useRedesenharAoCarregar(): void {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { const f = () => invalidate(); aoCarregarChapa.add(f); return () => { aoCarregarChapa.delete(f); }; }, [invalidate]);
}
/** A bancada composta do HTML (chapa furada com veios, rodatampo, lava-loiça, placa, torneira e móveis), com o topo da chapa a 90 cm. */
function ModeloBancadaHtml({ cfg }: { cfg: ConfigBancada }) {
  useRedesenharAoCarregar();
  const chave = JSON.stringify(cfg);
  const b = useMemo(() => {
    const c = JSON.parse(chave) as ConfigBancada, livro = selecaoChapa(c).book?.file; // o desenho escolhido (Book A/B ou chapa integral)
    // com os GLB, a bancada só constrói a chapa, o rodatampo e os móveis; os equipamentos vêm dos GLB (com o procedural de reserva)
    return construirBancada(c, livro ? texturaDaChapa(livro) : null, { equipamentos: !USAR_GLB });
  }, [chave]);
  useEffect(() => () => b?.libertar(), [b]);
  if (!b) return null;
  return (
    <group scale={0.001}>
      <primitive object={b.grupo} />
      {USAR_GLB && (
        <group position={[0, TOPO_BANCADA_MM, 0]}>
          {b.equipamentos.map((e) => (
            <group key={e.familia} position={e.posicao} rotation={[0, e.rotacaoY, 0]}><CorpoHtml familia={e.familia} modelo={e.modelo} acab={e.acab} /></group>
          ))}
        </group>
      )}
    </group>
  );
}

/** Um tampo do catálogo sem composição: a chapa de omissão com a imagem do fabricante, deitada (e os recortes, se os tiver). */
function TampoChapa({ w, d, esp, y, furos, cor }: { w: number; d: number; esp: number; y: number; furos: { x: number; z: number; w: number; d: number }[]; /** sem série do HTML: só a cor (não se inventa um desenho) */ cor?: string }) {
  useRedesenharAoCarregar();
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
    for (const f of furos) { const b = new THREE.Path(), x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, y0 = -f.z - f.d / 2, y1 = -f.z + f.d / 2; b.moveTo(x0, y0); b.lineTo(x0, y1); b.lineTo(x1, y1); b.lineTo(x1, y0); b.lineTo(x0, y0); s.holes.push(b); }
    const g = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false });
    const p = g.attributes.position, uv = g.attributes.uv;
    // à escala da chapa (1,62 × 3,24 m), sem repetir
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getY(i) + d / 2 + 0.04) / 1.62, (p.getX(i) + 1.62) / 3.24);
    return g;
  }, [w, d, esp, furos]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      {cor ? <meshStandardMaterial attach="material-0" color={cor} roughness={0.6} /> : <meshPhysicalMaterial attach="material-0" map={texturaDaChapa(CHAPA_OMISSAO)} roughness={0.62} envMapIntensity={0.28} />}
      <meshStandardMaterial attach="material-1" color="#d8d1bb" roughness={0.7} />
    </mesh>
  );
}
/** A composição de um tampo do catálogo: só a chapa da série (sem equipamentos nem rodatampo), com o comprimento e a profundidade da peça. */
function cfgDaChapa(series: string, tone: string, w: number, d: number, cabinet: boolean): ConfigBancada {
  const c = mudarChapa(mudarChapa(BANCADA_OMISSAO, "series", series), "tone", tone);
  return { ...c, length: Math.round(w * 1000), depth: Math.round(d * 1000), upstand: 0, back: false, left: false, right: false, cabinet, semEquipamentos: true };
}
/** O lava-loiça do HTML mais próximo de uma largura (m), para os lava-loiças do catálogo sem modelo próprio. */
const velarDaLargura = (w: number): string => VELAR_SPECS.reduce((a, s) => (Math.abs(s.outerWidth / 1000 - w) < Math.abs(a.outerWidth / 1000 - w) ? s : a)).id;

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
      // um tampo de cozinha do catálogo de uma série Coverlam do HTML: a chapa com a imagem do fabricante, sobre os móveis
      if (params?.k === "chapa") return <ModeloBancadaHtml cfg={cfgDaChapa(params.series, params.tone, w, d, true)} />;
      const hb = Math.max(0.2, h - 0.04);
      return (
        <>
          <Caixa p={[0, hb / 2, -0.01]} s={[w, hb, d - 0.02]} cor="#e9e7e2" r={0.6} />
          <Frentes w={w} h={hb} d={d - 0.02} n={Math.max(1, Math.round(w / 0.6))} cor="#ecebe7" />
          <TampoChapa w={w} d={d} esp={0.012} y={hb} furos={[]} cor={cor} />
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
    // Torneira, lava-loiça, placa e tampo usam SEMPRE os modelos do HTML: os da família com o modelo dela; os do catálogo (sem modelo próprio)
    // com o modelo do HTML mais parecido (lava-loiça Velar da largura mais próxima, placa de indução de 60 ou a gás de 90, torneira Round).
    case "torneira_cozinha":
      if (params?.k === "torneira" && params.html) return <ModeloHtml modelo={params.html.modelo} acab={params.html.acab} opc={opc} z0={-d / 2 + params.base / 2} />;
      // sem modelo portado (Cira, Alexia, Granada do HTML; e as que o HTML não tem): o modelo simplificado com as medidas da torneira, nunca o de outra
      if (params?.k === "torneira") return <TorneiraCozinha w={w} d={d} h={h} cor={cor} mat={mat ?? { metalness: 1, roughness: 0.3 }} p={params} />;
      return <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} />;
    case "lava_loica":
      if (params?.k === "lava_loica" && params.html) return <ModeloLavaLoicaHtml modelo={params.html.modelo} acab={params.html.acab} opc={opc} h={h} />;
      return <ModeloLavaLoicaHtml modelo={velarDaLargura(w)} acab="inox" opc={opc} h={h} />;
    case "placa":
      if (params?.k === "placa" && params.html) return <ModeloPlacaHtml modelo={params.html.modelo} acab={params.html.acab} />;
      return <ModeloPlacaHtml modelo={w > 0.75 ? "gmwl958" : "ib65b60"} acab={w > 0.75 ? "inox" : "negro"} />;
    case "tampo":
      if (params?.k === "bancada") return <ModeloBancadaHtml cfg={params.cfg} />;
      if (params?.k === "chapa") return <ModeloBancadaHtml cfg={cfgDaChapa(params.series, params.tone, w, d, false)} />;
      return <TampoChapa w={w} d={d} esp={params?.k === "tampo" ? params.espessura : 0.012} y={0} furos={recortes ?? []} />;
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
/** O GLB próprio de um produto (`mockup3d.url`), escalado à caixa da peça: mesma cache e descodificador (meshopt local) que os modelos do HTML. */
function ModeloGLB({ url, w, d, h }: { url: string; w: number; d: number; h: number }) {
  useEffect(() => { reterGlb(url); return () => soltarGlb(url); }, [url]);
  const scene = lerGlb(url);
  useFonte("produto", "GLB do produto");
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

/** O contorno da peça escolhida: uma moldura fina e rasa, 2 cm à volta da pegada, junto à base (não atravessa a peça nem a bancada). */
function Contorno({ w, d, y }: { w: number; d: number; y: number }) {
  const geo = useMemo(() => {
    const f = 0.02, l = 0.012, s = new THREE.Shape(), b = new THREE.Path();
    const W = w / 2 + f + l, D = d / 2 + f + l, wi = w / 2 + f, di = d / 2 + f;
    s.moveTo(-W, -D); s.lineTo(W, -D); s.lineTo(W, D); s.lineTo(-W, D); s.lineTo(-W, -D);
    b.moveTo(-wi, -di); b.lineTo(-wi, di); b.lineTo(wi, di); b.lineTo(wi, -di); b.lineTo(-wi, -di); s.holes.push(b);
    return new THREE.ShapeGeometry(s);
  }, [w, d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} position={[0, y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}><meshBasicMaterial color="#7c3aed" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} /></mesh>;
}

/** Que modelo do HTML a peça usa (mostrado na etiqueta): assim vê-se logo se um produto caiu num modelo genérico. */
function modeloEscolhido(m: ProdutoModelo3D): string | null {
  const pr = m.mockup3d.params;
  if (pr && "html" in pr && pr.html) return `Modelo do HTML: ${pr.html.modelo} · ${pr.html.acab}${pr.html.exacto === false ? " (o mais parecido: o HTML não tem este produto)" : ""}`;
  if (pr?.k === "chapa") return `Modelo do HTML: chapa ${pr.series} · ${pr.tone}`;
  if (pr?.k === "bancada") return "Modelo do HTML: bancada composta";
  return (["lava_loica", "placa", "torneira_cozinha", "tampo", "bancada"] as string[]).includes(m.mockup3d.tipo) ? "Sem modelo do HTML (o HTML não tem este produto)" : null;
}
/** Se o modelo de uma peça rebentar, não cai em silêncio: regista o erro e mostra uma caixa vermelha com o aviso. */
class ErroDoModelo extends Component<{ nome: string; w: number; d: number; h: number; children: ReactNode }, { erro: string | null }> {
  state = { erro: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { erro: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { console.error(`Modelo 3D de «${this.props.nome}» falhou`, e); }
  render() {
    if (!this.state.erro) return this.props.children;
    const { w, d, h } = this.props;
    return (
      <>
        <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor="#c0392b" />
        <Html position={[0, h + 0.2, 0]} center style={{ pointerEvents: "none" }}><div className="whitespace-nowrap rounded bg-red-700 px-1.5 py-0.5 text-[11px] text-white">Erro no modelo 3D: {this.state.erro}</div></Html>
      </>
    );
  }
}

function Peca({ p, m, etiquetas, selecionada, onSel }: { p: PecaProduto; m: ProdutoModelo3D; etiquetas: boolean; selecionada: boolean; onSel: (id: string) => void }) {
  const { tipo, altura, cor, url } = m.mockup3d;
  const reserva = <ErroDoModelo nome={m.nome} w={p.largura} d={p.profundidade} h={altura}><Parametrico tipo={tipo} w={p.largura} d={p.profundidade} h={altura} cor={cor} mat={m.mockup3d.material} params={m.mockup3d.params} recortes={p.recortes} opc={p.opc} /></ErroDoModelo>;
  const escolhido = modeloEscolhido(m);
  const nf = (n: number) => Math.round(n * 100).toString();
  const base = p.altura; // altura da base ao chão (peças de parede e peças sobre a bancada)
  const corpo = useRef<THREE.Group>(null);
  // todas as peças fazem e recebem sombra (os modelos do HTML já vêm assim; as paramétricas marcam-se aqui)
  useEffect(() => { corpo.current?.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); });
  // de onde veio cada modelo da peça (GLB, procedural, ou procedural porque o GLB falhou), para a etiqueta
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const avisar = useCallback((chave: string, fonte: string) => setFontes((f) => (f[chave] === fonte ? f : { ...f, [chave]: fonte })), []);
  const fonte = [...new Set(Object.values(fontes))].join(" + ");
  return (
    <group position={[p.x, base, p.y]} rotation={[0, (p.rotacao * Math.PI) / 180, 0]} onClick={(e) => { e.stopPropagation(); onSel(p.id); }}>
      <group ref={corpo} scale={[p.espelhada ? -1 : 1, 1, 1]}>
        <AvisarFonte.Provider value={avisar}>
          {url ? <Reserva reserva={reserva}><Suspense fallback={reserva}><ModeloGLB url={url} w={p.largura} d={p.profundidade} h={altura} /></Suspense></Reserva> : reserva}
        </AvisarFonte.Provider>
      </group>
      {selecionada && <Contorno w={p.largura} d={p.profundidade} y={Math.min(altura, 0.02)} />}
      {(etiquetas || selecionada) && (
        <Html position={[0, Math.max(altura, 0.3) + 0.12, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] leading-tight text-white ${selecionada ? "bg-violet-700/85" : "bg-black/60"}`}>
            {p.nome ?? m.nome}<br />{nf(p.largura)}×{nf(p.profundidade)}×{nf(altura)} cm{p.montagem === "parede" ? ` · a ${nf(p.altura)} cm do chão` : ""}
            {escolhido && <><br /><span className="opacity-80">{escolhido}</span></>}
            {fonte && <><br /><span className="opacity-80">Fonte: {fonte}</span></>}
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
        <mesh key={i} position={[(t.de + t.ate) / 2, (t.z0 + t.z1) / 2, zFora]} material={mat} receiveShadow>
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
      <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {teto && <mesh geometry={geo} position={[0, espaco.peDireito, 0]} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial color="#fafafa" side={THREE.DoubleSide} /></mesh>}
    </>
  );
}

/* ------------------------------------------------------------------ câmaras */
function Camaras({ vista, espaco, camara }: { vista: Vista3D; espaco: Espaco; camara?: Visualizador3DProps["camara"] }) {
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
  if (camara) {
    // uma vista pedida (as da bancada, como no catálogo 3D): a câmara e o alvo exactos, e roda-se à volta do alvo
    return (
      <>
        <PerspectiveCamera key={`cam-${camara.chave}`} makeDefault position={camara.pos} fov={35} near={0.02} far={200} />
        <OrbitControls key={`oc-${camara.chave}`} makeDefault target={camara.alvo} maxPolarAngle={Math.PI / 2.02} minDistance={0.2} maxDistance={maior * 4 + 6} />
      </>
    );
  }
  const d = maior * 0.8 + 1.1;
  return (
    <>
      <PerspectiveCamera key="3d" makeDefault position={[cx + d, d * 0.9, cz + d]} fov={40} near={0.1} far={200} />
      <OrbitControls key="oc-3d" makeDefault target={[cx, pe / 3, cz]} maxPolarAngle={Math.PI / 2.02} minDistance={1} maxDistance={maior * 4 + 6} />
    </>
  );
}

/** Uma sombra suave de contacto no chão, por baixo de todas as peças (o que as assenta no chão, como a sombra do chão do HTML). */
function SombraDeContacto({ espaco }: { espaco: Espaco }) {
  const { cx, cz, w, d } = useMemo(() => {
    const xs = espaco.paredes.map((p) => p.a.x), ys = espaco.paredes.map((p) => p.a.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cz: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 };
  }, [espaco.paredes]);
  return <ContactShadows position={[cx, 0.002, cz]} scale={[w, d]} resolution={512} opacity={0.7} blur={2} far={1} color="#2a2c2b" />;
}

/** A luz de estúdio do HTML: céu quente e chão esverdeado, luz principal com sombras suaves e uma de enchimento fria, apontadas ao centro do espaço. */
function LuzEstudio({ espaco }: { espaco: Espaco }) {
  const { cx, cz, r } = useMemo(() => {
    const xs = espaco.paredes.map((p) => p.a.x), ys = espaco.paredes.map((p) => p.a.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cz: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0, 1) / 2 + 0.5 };
  }, [espaco.paredes]);
  const key = useRef<THREE.DirectionalLight>(null);
  const alvo = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => { alvo.position.set(cx, 0.6, cz); alvo.updateMatrixWorld(); if (key.current) key.current.target = alvo; }, [alvo, cx, cz]);
  // as direcções do HTML (250, 750, 430) e (−340, 240, −320), à escala do espaço
  const k = (r * 2.2) / 900;
  return (
    <>
      {/* o HTML usa 1,25 num estúdio aberto; dentro de uma divisão as paredes já devolvem luz, por isso menos */}
      <hemisphereLight args={["#fffcf3", "#878e84", 0.95]} />
      <directionalLight ref={key} position={[cx + 250 * k, 750 * k, cz + 430 * k]} intensity={2.8} color="#fffcf2" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-r} shadow-camera-right={r} shadow-camera-top={r} shadow-camera-bottom={-r} shadow-camera-near={0.1} shadow-camera-far={r * 8} shadow-bias={-0.0001} shadow-normalBias={0.003} />
      <directionalLight position={[cx - 340 * k, 240 * k, cz - 320 * k]} intensity={0.8} color="#d8e5e1" />
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

export default function Visualizador3D({ espaco, modelos, vista, teto, etiquetas, descricao, selecionada, onSelecionar, camara }: Visualizador3DProps) {
  return (
    <div role="img" aria-label={descricao} className="h-full w-full touch-none">
      {/* como o HTML: ACES com exposição 1,08, sombras suaves (PCF), ambiente de estúdio e fundo claro neutro */}
      <Canvas frameloop="demand" dpr={[1, 1.5]} shadows="soft" gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08, preserveDrawingBuffer: true }} onPointerMissed={() => onSelecionar(null)}>
        <color attach="background" args={["#ecebe7"]} />
        <EstudioAmbiente />
        <LuzEstudio espaco={espaco} />
        <Camaras vista={vista} espaco={espaco} camara={vista === "3d" ? camara : null} />
        <Superficies espaco={espaco} teto={teto && vista !== "cima"} />
        {espaco.paredes.map((p, i) => <ParedeCena key={p.id} parede={p} indice={i} espaco={espaco} />)}
        <SombraDeContacto espaco={espaco} />
        {espaco.pecas.map((p) => { const m = modelos[p.produtoId]; return m ? <Peca key={p.id} p={p} m={m} etiquetas={etiquetas} selecionada={selecionada === p.id} onSel={onSelecionar} /> : null; })}
      </Canvas>
    </div>
  );
}
