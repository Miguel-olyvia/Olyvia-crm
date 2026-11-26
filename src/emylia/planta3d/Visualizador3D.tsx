// Protótipo (visualizador 3D): a cena three.js (react-three-fiber 8 + drei 9, compatíveis com o React 18). Carrega-se com React.lazy, por isso o
// three só entra no pacote ao abrir o visualizador. Recebe o espaço (modelo.ts) e os produtos do catálogo com o mockup de cada um (catalogo3d.ts);
// cada mockup é geometria paramétrica com a dimensão real do produto. Se o produto tiver `mockup3d.url` (GLB), carrega-se esse modelo e a
// geometria paramétrica fica de reserva. Sem sombras (o protótipo não precisa) e com o ciclo de desenho sob pedido (frameloop demand).
import { Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { temGeometriaPropria, type MaterialMockup, type Mockup3D, type ParamsMockup, type ProdutoModelo3D } from "./catalogo3d";
import { ehModeloTorneira, construirTorneira } from "./modelosHtml/torneiras";
import { libertarMateriais } from "./modelosHtml/util";
import { construirLavaLoica, ehModeloLavaLoica } from "./modelosHtml";
import { construirPlaca, ehModeloPlaca } from "./modelosHtml/placas";
import { construirBancada } from "./modelosHtml/bancada3d";
import { VELAR_SPECS } from "./modelosHtml/lavaLoicas";
import { pecasDosModulos } from "./composicaoCozinha";
import { USAR_GLB_GENERICOS, categoriaDoTipo, categoriaPorId, opcoesComOmissao, urlDoGenerico, type CategoriaGlb } from "./categoriasGlb";
import { USAR_GLB, criarMaterialEspelho, lerGlb, montarGenerico, montarModelo, reterGlb, soltarGlb, urlDoModeloHtml, type FamiliaGlb, type ModeloMontado } from "./modelosHtml/glb";
import { BANCADA_OMISSAO, CHAPA_OMISSAO, TOPO_BANCADA_MM, ficheiroDaChapa, mudarChapa, selecaoChapa, type ConfigBancada } from "./bancada";
import { comprimento, normalInterior, trocosDeParede, type Abertura, type Espaco, type OpcoesPeca, type Parede, type PecaProduto } from "./modelo";
import { repeticoes, revestimentoDaSuperficie, type Revestimento } from "./revestimentos";
import { aplicarTextura, pedirTextura, retirarTextura, type TexturaModelo } from "./texturaProduto";
import { corDaJunta, type AmostraNoMundo, type PlanoRevestimento } from "./revestimentoPrevia";
import { cotasDaPeca, noEcra } from "./cotasPeca";
import type { ZonaGlb, ZonasDoProduto } from "./zonasGlb";
import { criarPortaDoHover, foiClique, zonaDaPrimeiraIntersecao, type ObjetoDoCanvas } from "./zonaDoClique";
import { aplicarAparenciaDasZonas, aplicarRealceDasZonas, criarMateriaisDeZona, type RealceDeZonas } from "./zonasMateriais";
import { useTexturasPorUrl } from "./useTexturasPorUrl";
import { criarAmbienteMetal, type AmbienteMetal } from "./ambienteMetal";

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
  camara?: { chave: string; pos: V3; alvo: V3; /** até onde o zoom aproxima e afasta a câmara do alvo (m); sem eles, 0,2 m e o tamanho da divisão */ distMin?: number; distMax?: number } | null;
  /** Mover a peça escolhida arrastando-a no 3D (as regras e a gravação vêm da planta). Sem isto, só se escolhe. */
  mover?: Mover3D;
  /** 23/11 (o Estúdio da obra): as peças ainda por fazer, desenhadas transparentes. */
  porFazer?: ReadonlySet<string>;
  /** 23/11 (a pré-visualização de um produto num formulário longo): o toque vertical rola a página, a roda do rato só faz zoom com `zoomRoda` (senão rola a página) e o
   *  deslocamento lateral desliga-se; roda-se a peça e a pinça aproxima e afasta. Sem isto, como sempre. */
  rolarPagina?: boolean;
  /** Com `rolarPagina`: a roda do rato faz zoom (quem usa liga-o depois de o utilizador clicar ou focar o 3D e desliga-o ao sair). Sem `rolarPagina` não faz nada. */
  zoomRoda?: boolean;
  /** Entrega os comandos do zoom (aproximar, afastar, repor a vista) a quem tem botões ou teclas fora do canvas; fica a null enquanto não há câmara pronta. */
  comandos?: MutableRefObject<ComandosVista | null>;
  /** 24/11 (a pré-visualização de um revestimento): uma amostra de peças com juntas, no chão ou na parede (revestimentoPrevia.ts). Sem isto, nada muda. */
  revestimento?: RevestimentoVisual | null;
  /** 24/11 (fase 1, a pré-visualização de um produto): as cotas (largura, altura, profundidade) nas arestas da caixa da peça. Sem isto, nada se desenha. */
  cotas?: boolean;
  /** 24/11 (fase 1): a zona do objecto a realçar (brilho), a que o utilizador aponta no painel «Zonas». Sem isto, nada se realça. */
  zonaRealcada?: RealceDeZonas;
  /**
   * 25/11 (escolher a zona no 3D, só a pré-visualização do produto): clicar numa parte da peça chama `aoClicarZona` com a zona dela (só conta se o ponteiro quase não se moveu: arrastar roda a câmara),
   * e clicar no fundo chama-o com null; `aoPassarZona` diz a zona debaixo do rato (null ao sair). Só valem as `zonasEscolheveis`. Sem `aoClicarZona` nem `aoPassarZona`, nada muda.
   */
  aoClicarZona?: (z: ZonaGlb | null) => void;
  aoPassarZona?: (z: ZonaGlb | null) => void;
  zonasEscolheveis?: ReadonlySet<ZonaGlb>;
}
/** Os ganchos de escolher a zona no 3D, entregues à peça. */
interface EscolhaDeZona { clicar?: (z: ZonaGlb | null) => void; passar?: (z: ZonaGlb | null) => void; validas?: ReadonlySet<ZonaGlb> }
/** A amostra de um revestimento: onde fica e as peças (revestimentoPrevia.ts), a cor lisa das peças e, se houver, a foto da cor (mapeada no mundo, como nas peças). */
export interface RevestimentoVisual { amostra: AmostraNoMundo; cor: string; textura?: TexturaModelo }
/** O que se pode pedir à câmara de fora do canvas (botões e teclas): aproximar e afastar respeitam as distâncias mínima e máxima da câmara; repor volta à vista de partida. */
export interface ComandosVista { aproximar: () => void; afastar: () => void; repor: () => void }

type V3 = [number, number, number];
/** O espelho é prateado neutro (sem tom azulado) e o vidro claro é neutro: os mesmos tons dos genéricos (modelosHtml/glb.ts). */
const COR_VIDRO = "#e9ecea";
/** O espelho dos mockups de reserva: o mesmo material dos genéricos (prata neutra com reflexo falso), partilhado e nunca libertado. */
const MATERIAL_ESPELHO = criarMaterialEspelho();

/* ------------------------------------------------------------------ texturas procedurais (canvas, sem ficheiros) */
const cacheTexturas = new Map<string, THREE.CanvasTexture>();
function texturaBase(r: Revestimento): THREE.CanvasTexture | null {
  if (r.tipo === "tinta") return null;
  // pela cor também: o material de um produto (Estúdio) tem o id do produto e a cor pode mudar entre leituras do catálogo
  const chave = `${r.id}|${r.cor}|${r.junta ?? ""}`;
  const guardada = cacheTexturas.get(chave);
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
  cacheTexturas.set(chave, t);
  return t;
}

/** Um material do revestimento para uma superfície de `w`×`h` metros (a textura repete-se por metro, não esticada). */
function useRevestimento(r: Revestimento, w: number, h: number): THREE.MeshLambertMaterial {
  // pelo conteúdo, não pelo objeto: o material de um produto do Estúdio é um objeto novo em cada leitura do espaço
  const chave = `${r.id}|${r.tipo}|${r.cor}|${r.junta ?? ""}|${r.modulo}|${r.moduloAlto ?? ""}`;
  const mat = useMemo(() => {
    const base = texturaBase(r);
    // o revestimento é mate e não recebe o ambiente de estúdio (com ele o branco satura e a divisão fica lisa): só as luzes e as sombras; as peças é que brilham
    const m = new THREE.MeshLambertMaterial({ color: base ? "#ffffff" : r.cor, side: THREE.DoubleSide });
    if (base) {
      const t = base.clone();
      t.needsUpdate = true;
      const [rx, ry] = repeticoes(r, w, h);
      t.repeat.set(rx, ry);
      m.map = t;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume `r`
  }, [chave, w, h]);
  useEffect(() => () => { mat.map?.dispose(); mat.dispose(); }, [mat]);
  return mat;
}

/* ------------------------------------------------------------------ pequenas peças */
/**
 * 24/11: a textura da foto da opção de cor de UMA peça (só a pré-visualização do produto a põe; a planta não): a textura carregada, a cor lisa do corpo (as partes dessa
 * cor levam a foto; as outras, como os puxadores, ficam como são) e as propriedades de material que a aplicam (mapa e shader por posição no mundo). Sem ela, tudo como sempre.
 */
interface TexturaDaPeca { tex: THREE.Texture; cor: string; lado: number; props: { map: THREE.Texture; onBeforeCompile: THREE.Material["onBeforeCompile"]; customProgramCacheKey: () => string } }
const TexturaCtx = createContext<TexturaDaPeca | null>(null);
/** 24/11 (fase 1): a aparência de cada zona da peça e a zona realçada. Passa por contexto DENTRO do canvas (a Peca fornece-o); sem fornecedor, nada de zonas: como sempre. */
interface ZonasDaPeca { zonas?: ZonasDoProduto; realce?: RealceDeZonas }
const ZonasCtx = createContext<ZonasDaPeca>({});
/** 25/11: pede o mapa de ambiente com contraste dos metais (ambienteMetal.ts); só se constrói na primeira vez que alguma zona de metal o pede (sem metal nunca se cria). Sem fornecedor: nenhum. */
const AmbienteMetalCtx = createContext<(() => THREE.Texture | null) | null>(null);
function AmbienteMetalDosMetais({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl), feito = useRef<AmbienteMetal | null>(null);
  const pedir = useCallback(() => { if (!feito.current) feito.current = criarAmbienteMetal(gl); return feito.current.texture; }, [gl]);
  useEffect(() => () => { feito.current?.dispose(); feito.current = null; }, [gl]);
  return <AmbienteMetalCtx.Provider value={pedir}>{children}</AmbienteMetalCtx.Provider>;
}
/** A textura do modelo (por URL, com cache): null enquanto carrega, se o modelo não a tem, ou se a imagem falhar (fica a cor lisa). Liberta-se ao desmontar a peça. */
function useTexturaDoModelo(textura: Mockup3D["textura"], cor: string): TexturaDaPeca | null {
  const invalidate = useThree((s) => s.invalidate);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const url = textura?.url, lado = textura?.ladoCm ?? 0;
  useEffect(() => {
    if (!url) { setTex(null); return; }
    const largar = pedirTextura(url, (t) => { setTex(t); invalidate(); });
    return () => { largar(); setTex(null); };
  }, [url, invalidate]);
  return useMemo(() => {
    if (!tex) return null;
    // as propriedades saem de um material de molde (nunca desenhado), para haver um só sítio que sabe aplicar a foto
    const molde = new THREE.MeshStandardMaterial();
    aplicarTextura(molde, tex, lado);
    const props = { map: tex, onBeforeCompile: molde.onBeforeCompile, customProgramCacheKey: molde.customProgramCacheKey };
    molde.dispose();
    return { tex, cor, lado, props };
  }, [tex, cor, lado]);
}
const Caixa = ({ p, s, cor, r = 0.6 }: { p: V3; s: V3; cor: string; r?: number }) => {
  const tx = useContext(TexturaCtx), com = !!tx && tx.cor === cor;
  return <mesh position={p}><boxGeometry args={s} /><meshStandardMaterial key={com ? "tx" : "liso"} color={com ? "#ffffff" : cor} roughness={r} {...(com && tx ? tx.props : {})} /></mesh>;
};
/** Um cilindro achatado em elipse: raio 0,5 em x e z, escalado para `ex` × `ez`. */
const Elipse = ({ p, ex, ez, h, cor, topo = 0.5 }: { p: V3; ex: number; ez: number; h: number; cor: string; topo?: number }) => {
  const tx = useContext(TexturaCtx), com = !!tx && tx.cor === cor;
  return <mesh position={p} scale={[ex, 1, ez]}><cylinderGeometry args={[topo, 0.5, h, 28]} /><meshStandardMaterial key={com ? "tx" : "liso"} color={com ? "#ffffff" : cor} roughness={0.25} {...(com && tx ? tx.props : {})} /></mesh>;
};
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
  // o ciclo de desenho é sob pedido: quando o GLB chega (o Suspense resolve), pede-se um desenho, senão a peça só aparece no próximo movimento
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [t, invalidate]);
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

/* ------------------------------------------------------------------ os genéricos por categoria (um GLB por categoria; categoriasGlb.ts) */
type PropsParam = { tipo: ProdutoModelo3D["tipo"]; w: number; d: number; h: number; cor: string; mat?: MaterialMockup; params?: ParamsMockup; recortes?: { x: number; z: number; w: number; d: number }[]; opc?: OpcoesPeca; generico?: Mockup3D["generico"] };
/** A categoria genérica que a peça usa (a do produto, escolhida pelo nome; senão a do tipo; nenhuma se tiver o modelo do HTML). */
const categoriaDaPeca = (tipo: ProdutoModelo3D["tipo"], params?: ParamsMockup, generico?: Mockup3D["generico"]): CategoriaGlb | undefined =>
  (USAR_GLB_GENERICOS && !temGeometriaPropria(params) && params?.k !== "cozinha" ? categoriaPorId(generico?.id) ?? categoriaDoTipo(tipo) : undefined);
function AvisoFonte({ chave, fonte }: { chave: string; fonte: string }) { useFonte(chave, fonte); return null; }
/** O GLB genérico da categoria com as medidas, a cor e as opções desta peça (a geometria é partilhada por todos os produtos da categoria). */
function GenericoGlb({ c, tipo, w, d, h, cor, mat, opc, generico }: PropsParam & { c: CategoriaGlb }) {
  const url = urlDoGenerico(c.id);
  useEffect(() => { reterGlb(url); return () => soltarGlb(url); }, [url]);
  const cena = lerGlb(url);
  const gen = opc?.gen, corFinal = typeof gen?.cor === "string" ? gen.cor : cor, chave = JSON.stringify(opcoesComOmissao(c, tipo, { ...generico?.o, ...gen }));
  const metal = mat?.metalness, rugos = mat?.roughness;
  // 25/11: as zonas com ligação explícita (aplicar: sim) a um atributo: nelas as partes de metal (os puxadores) também se pintam. Mudam raramente: a montagem refaz-se, para as cópias
  // dos materiais partirem sempre do modelo limpo (nunca de uma cópia já pintada)
  const tx = useContext(TexturaCtx), zc = useContext(ZonasCtx), ambienteMetal = useContext(AmbienteMetalCtx);
  const chaveLigadas = zc.zonas?.ligadas?.join(",") ?? "";
  const t = useMemo(() => montarGenerico(cena, c, { w, d, h, o: JSON.parse(chave) as Record<string, string | boolean> }, corFinal, metal === undefined ? undefined : { metalness: metal, roughness: rugos ?? 0.4 }), // eslint-disable-next-line react-hooks/exhaustive-deps -- `chaveLigadas` só força a remontagem
    [cena, c, w, d, h, chave, corFinal, metal, rugos, chaveLigadas]);
  useEffect(() => () => t.libertar(), [t]);
  const invalidate = useThree((s) => s.invalidate);
  // 24/11: a foto da opção de cor vai para o material `corpo` (o que leva a cor do produto); os outros (metal, vidro, puxadores) ficam como são.
  // Fase 1: o `corpo` passa a ser UM material por zona (frente, corpo, tampo, pés, estofo: zonasMateriais.ts), cada um com a sua foto ou cor (`zonas`, só a pré-visualização do produto
  // as põe) e o realce da zona apontada no painel «Zonas». Sem `zonas` (ou com todas iguais) a foto única (corpo > frente > cor) vai para todas as zonas: o que se via antes.
  const zm = useMemo(() => criarMateriaisDeZona(t.grupo, c, chaveLigadas ? (chaveLigadas.split(",") as ZonaGlb[]) : undefined), [t, c, chaveLigadas]);
  useEffect(() => () => zm.libertar(), [zm]);
  const urls = useMemo(() => (zc.zonas?.porZona ? Object.values(zc.zonas.zonas).flatMap((z) => (z?.textura ? [z.textura.url] : [])) : []), [zc.zonas]);
  const texturas = useTexturasPorUrl(urls, invalidate);
  useEffect(() => {
    aplicarAparenciaDasZonas(zm.porZona, { corBase: corFinal, zonas: zc.zonas, texturas, unica: tx ? { tex: tx.tex, lado: tx.lado } : null, fixas: zm.fixas, ambienteMetal: ambienteMetal ?? undefined });
    invalidate();
  }, [zm, zc.zonas, texturas, tx, corFinal, ambienteMetal, invalidate]);
  // o realce é só brilho: apontar de uma zona a outra não retira nem volta a pôr as fotos (o material não se recompila)
  useEffect(() => { aplicarRealceDasZonas(zm.porZona, zc.realce); invalidate(); }, [zm, zc.realce, invalidate]);
  useEffect(() => { invalidate(); }, [t, invalidate]);
  useFonte("generico", "GLB genérico");
  return <primitive object={t.grupo} />;
}
/** O mockup de um tipo: o GLB genérico da categoria (com o paramétrico de sempre de reserva) ou, sem categoria, o paramétrico. */
/** A composição modular de cozinha: cada módulo com o genérico da sua categoria (coluna, base, forno, armário de parede), lado a lado, em metros. */
function ModeloComposicao({ cfg }: { cfg: Extract<ParamsMockup, { k: "cozinha" }>["cfg"] }) {
  return (
    <>
      {pecasDosModulos(cfg).map((m, i) => {
        const c = categoriaPorId(m.categoria), w = m.w / 100, d = m.d / 100, h = m.h / 100;
        const caixa = <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={m.cor} />;
        return (
          <group key={`${m.modulo}-${i}`} position={[m.x / 100, m.y / 100, m.z / 100]}>
            {c ? <ReservaGlb reserva={caixa}><Suspense fallback={null}><GenericoGlb c={c} tipo="movel" w={w} d={d} h={h} cor={m.cor} opc={{ gen: m.o }} /></Suspense></ReservaGlb> : caixa}
          </group>
        );
      })}
    </>
  );
}
function Parametrico(props: PropsParam) {
  if (props.params?.k === "cozinha") return <ModeloComposicao cfg={props.params.cfg} />;
  const c = categoriaDaPeca(props.tipo, props.params, props.generico);
  if (!c) return <ParametricoAntigo {...props} />;
  return (
    <ReservaGlb reserva={<><ParametricoAntigo {...props} /><AvisoFonte chave="generico" fonte="mockup paramétrico (o GLB genérico falhou)" /></>}>
      <Suspense fallback={null}><GenericoGlb {...props} c={c} /></Suspense>
    </ReservaGlb>
  );
}

/** O mockup paramétrico de um tipo, com a pegada `w` (largura) × `d` (profundidade) e a altura `h`. Frente para +z, costas em -z, base em y=0. */
function ParametricoAntigo({ tipo, w, d, h, cor, mat, params, recortes, opc }: { tipo: ProdutoModelo3D["tipo"]; w: number; d: number; h: number; cor: string; mat?: MaterialMockup; params?: ParamsMockup; recortes?: { x: number; z: number; w: number; d: number }[]; opc?: OpcoesPeca }) {
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
          <mesh position={[0, h / 2, Math.max(d, 0.02) / 2 + 0.001]}><boxGeometry args={[w - 0.05, h - 0.05, 0.004]} /><primitive object={MATERIAL_ESPELHO} attach="material" /></mesh>
        </>
      );
    case "armario_espelho":
      return (
        <>
          <Caixa p={[0, h / 2, 0]} s={[w, h, d]} cor={cor} r={0.5} />
          <mesh position={[0, h / 2, d / 2 + 0.003]}><boxGeometry args={[w - 0.04, h - 0.04, 0.006]} /><primitive object={MATERIAL_ESPELHO} attach="material" /></mesh>
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
          <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, Math.max(d, 0.008)]} /><meshStandardMaterial color={COR_VIDRO} transparent opacity={0.3} roughness={0.05} /></mesh>
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
/** Os objectos auxiliares (cotas, contorno da selecção) não se apontam nem se clicam: raycast nulo, e a marca para o filtro do clique (zonaDoClique.ehAuxiliar). */
const SEM_RAIO = () => undefined;
const AUXILIAR = { auxiliar: true };
function Contorno({ w, d, y }: { w: number; d: number; y: number }) {
  const geo = useMemo(() => {
    const f = 0.02, l = 0.012, s = new THREE.Shape(), b = new THREE.Path();
    const W = w / 2 + f + l, D = d / 2 + f + l, wi = w / 2 + f, di = d / 2 + f;
    s.moveTo(-W, -D); s.lineTo(W, -D); s.lineTo(W, D); s.lineTo(-W, D); s.lineTo(-W, -D);
    b.moveTo(-wi, -di); b.lineTo(-wi, di); b.lineTo(wi, di); b.lineTo(wi, -di); b.lineTo(-wi, -di); s.holes.push(b);
    return new THREE.ShapeGeometry(s);
  }, [w, d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} position={[0, y + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={SEM_RAIO} userData={AUXILIAR}><meshBasicMaterial color="#7c3aed" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} /></mesh>;
}

/**
 * 24/11 (fase 1): as cotas da peça: três linhas de dimensão nas arestas da caixa (largura no topo da frente, profundidade em baixo à direita, altura à esquerda ou, numa peça deitada, à
 * direita: cotasPeca.ts), em forma de chaveta (a linha de chamada sai da aresta, corre ao longo dela e volta), com o rótulo «Largura 40 cm» a meio. A caixa vai de -w/2 a w/2, -d/2 a d/2
 * e 0 a h (m). Os rótulos são só para ver (aria-hidden): a mesma informação está em texto fora do canvas (Previa3DProduto). As linhas ignoram a profundidade (vêem-se através da peça).
 * Ao zoom máximo um rótulo pode sair do enquadramento: a cada desenho esconde-se o que fica fora do ecrã (noEcra), em vez de ficar cortado ou colado ao bordo.
 */
const COR_COTA = "#0b6b63";
function Cotas({ w, d, h }: { w: number; d: number; h: number }) {
  const cotas = useMemo(() => cotasDaPeca(w, d, h), [w, d, h]);
  const grupos = useRef<Record<string, THREE.Group | null>>({}), rotulos = useRef<Record<string, HTMLDivElement | null>>({});
  const mundo = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    for (const c of cotas) {
      const g = grupos.current[c.chave], el = rotulos.current[c.chave];
      if (!g || !el) continue;
      g.getWorldPosition(mundo).project(camera);
      el.style.visibility = noEcra(mundo) ? "visible" : "hidden";
    }
  });
  return (
    <group>
      {cotas.map((c) => (
        <group key={c.chave}>
          <Line points={c.pontos} color={COR_COTA} lineWidth={1.6} depthTest={false} renderOrder={6} raycast={SEM_RAIO} userData={AUXILIAR} />
          <group position={c.meio} ref={(g) => { grupos.current[c.chave] = g; }}>
            <Html center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
              <div ref={(el) => { rotulos.current[c.chave] = el; }} aria-hidden="true" data-cota={c.chave} className="whitespace-nowrap rounded border border-teal-800/40 bg-white/95 px-1.5 py-0.5 text-[12px] font-semibold leading-tight text-teal-900 shadow-sm">{c.rotulo}</div>
            </Html>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Que modelo do HTML a peça usa (mostrado na etiqueta): assim vê-se logo se um produto caiu num modelo genérico. */
function modeloEscolhido(m: ProdutoModelo3D): string | null {
  const pr = m.mockup3d.params;
  if (pr && "html" in pr && pr.html) return `Modelo do HTML: ${pr.html.modelo} · ${pr.html.acab}${pr.html.exacto === false ? " (o mais parecido: o HTML não tem este produto)" : ""}`;
  if (pr?.k === "chapa") return `Modelo do HTML: chapa ${pr.series} · ${pr.tone}`;
  if (pr?.k === "bancada") return "Modelo do HTML: bancada composta";
  if (pr?.k === "cozinha") return `Composição de cozinha: ${pr.cfg.modulos.length} módulos (modelos genéricos)`;
  const c = categoriaDaPeca(m.mockup3d.tipo, pr, m.mockup3d.generico);
  if (c) return `Modelo genérico: ${c.rotulo}`;
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

/* ------------------------------------------------------------------ mover a peça escolhida directamente no 3D */
/** O sítio de uma peça durante o arrasto (centro em metros, rotação em graus, altura da base ao chão em metros). */
export interface LugarPeca3D { x: number; y: number; rot: number; altura: number }
/**
 * Mover no 3D com as MESMAS regras da planta (pecas3d.ts, `ajustarPeca`): `ajustar` diz onde a peça fica para um ponto do chão (peça de chão:
 * dentro da divisão e encostada de costas à parede quando perto; peça de parede: só ao longo da parede, podendo passar o canto, à altura dada),
 * ou null se não couber; `confirmar` grava (entra no Desfazer/Refazer como qualquer gravação da planta).
 */
export interface Mover3D {
  ajustar: (id: string, x: number, y: number, altura?: number) => LugarPeca3D | null;
  confirmar: (id: string, x: number, y: number, altura?: number) => void;
}
interface Arrasto { id: string; parede: boolean; x0: number; y0: number; alt0: number; py0: number; ultimo: { x: number; y: number; altura?: number }; lugar: LugarPeca3D | null }
const CHAO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** Metros de altura por píxel ao arrastar com Shift (peças de parede). */
const ALTURA_POR_PIXEL = 0.004;

/** A guia da parede durante o arrasto: uma faixa roxa rente à parede mais próxima (no chão e, nas peças de parede, à altura da peça). */
function GuiaParede({ espaco, x, y, altura }: { espaco: Espaco; x: number; y: number; altura: number | null }) {
  const w = useMemo(() => {
    let melhor: { p: Parede; d: number } | null = null;
    for (const p of espaco.paredes) {
      const ax = p.a.x, ay = p.a.y, bx = p.b.x, by = p.b.y, l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
      const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
      if (!melhor || d < melhor.d) melhor = { p, d };
    }
    return melhor?.p ?? null;
  }, [espaco.paredes, x, y]);
  if (!w) return null;
  const c = comprimento(w), ang = -Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
  return (
    <group position={[mx, 0, my]} rotation={[0, ang, 0]}>
      <mesh position={[0, 0.006, 0]} renderOrder={3}><boxGeometry args={[c, 0.012, 0.06]} /><meshBasicMaterial color="#7c3aed" transparent opacity={0.6} depthWrite={false} /></mesh>
      {altura !== null && <mesh position={[0, altura, 0]} renderOrder={3}><boxGeometry args={[c, 0.012, 0.06]} /><meshBasicMaterial color="#7c3aed" transparent opacity={0.6} depthWrite={false} /></mesh>}
    </group>
  );
}

/**
 * O que o toque precisa de saber ANTES da câmara: o OrbitControls ouve o canvas e reage ao toque antes dos eventos do three; por isso o
 * contentor do 3D vê, na fase de captura, se o dedo (ou o rato) cai na peça escolhida e, se cair, desliga a câmara para o arrasto.
 */
interface AlvoArrasto { grupo: THREE.Object3D | null; camera: THREE.Camera | null; controls: { enabled: boolean } | null }
// (passa por props, não por contexto: o contexto do React não atravessa o <Canvas> do react-three-fiber 8)
function PonteCamara({ alvo }: { alvo: { current: AlvoArrasto } }) {
  const camera = useThree((s) => s.camera), controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  useEffect(() => { alvo.current.camera = camera; alvo.current.controls = controls; }, [alvo, camera, controls]);
  return null;
}
const raio = new THREE.Raycaster();
/** Na fase de captura do contentor: o ponteiro cai na peça escolhida? Então a câmara fica parada (o arrasto é da peça). */
function travarCamaraSeNaPeca(e: React.PointerEvent<HTMLDivElement>, alvo: AlvoArrasto): void {
  const { grupo, camera, controls } = alvo, cv = e.currentTarget.querySelector("canvas");
  if (!grupo || !camera || !controls || !cv) return;
  const r = cv.getBoundingClientRect();
  raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  if (raio.intersectObject(grupo, true).length) controls.enabled = false;
}

/** 23/11: uma malha de uma peça por fazer fica transparente. O material copia-se (os materiais dos modelos são partilhados entre peças). */
function tornarFantasma(m: THREE.Mesh): void {
  if (m.userData.fantasma) return;
  const um = (x: THREE.Material) => { const c = x.clone(); c.transparent = true; c.opacity = Math.min(c.opacity, 0.3); c.depthWrite = false; return c; };
  m.material = Array.isArray(m.material) ? m.material.map(um) : um(m.material);
  m.userData.fantasma = true;
}

interface PropsPeca { p: PecaProduto; m: ProdutoModelo3D; etiquetas: boolean; selecionada: boolean; fantasma?: boolean; onSel: (id: string) => void; mover?: Mover3D; arrasto: Arrasto | null; setArrasto: (a: Arrasto | null) => void; alvo: { current: AlvoArrasto }; cotas?: boolean; realce?: RealceDeZonas; escolha?: EscolhaDeZona }
function Peca({ p: original, m, etiquetas, selecionada, fantasma = false, onSel, mover, arrasto, setArrasto, alvo, cotas = false, realce = null, escolha }: PropsPeca) {
  const grupoRef = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!selecionada || !mover) return;
    const a = alvo.current, g = grupoRef.current;
    a.grupo = g;
    return () => { if (a.grupo === g) a.grupo = null; };
  }, [alvo, selecionada, mover]);
  // durante o arrasto desta peça, o sítio é o que as regras dão para o ponto do rato
  const lugar = arrasto?.id === original.id ? arrasto.lugar : null;
  const p = lugar ? { ...original, x: lugar.x, y: lugar.y, rotacao: lugar.rot, altura: lugar.altura } : original;
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const invalidate = useThree((s) => s.invalidate);
  const domElement = useThree((s) => s.gl.domElement);
  // 25/11: escolher a zona no 3D. O clique só conta se o ponteiro quase não se moveu (`delta`, em píxeis, entre premir e largar): arrastar é rodar a câmara. A zona é a da primeira malha visível debaixo do ponteiro.
  const zonaSob = useRef<ZonaGlb | null>(null);
  const zonaDe = (e: ThreeEvent<PointerEvent | MouseEvent>): ZonaGlb | null => zonaDaPrimeiraIntersecao(e.intersections as unknown as ReadonlyArray<{ object: ObjetoDoCanvas }>, escolha?.validas);
  // o hover: sem botão premido (arrastar é rodar a câmara) e no máximo uma vez por INTERVALO_HOVER_MS, em vez de a cada movimento do rato
  const portaHover = useMemo(() => criarPortaDoHover(), []);
  const limparHover = () => { if (zonaSob.current === null) return; zonaSob.current = null; domElement.style.cursor = ""; escolha?.passar?.(null); };
  const eventosDeZona = escolha?.clicar || escolha?.passar ? {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (e.buttons !== 0) { limparHover(); return; }
      if (!portaHover(e.buttons, performance.now())) return;
      const z = zonaDe(e);
      if (z === zonaSob.current) return;
      zonaSob.current = z; domElement.style.cursor = z ? "pointer" : ""; escolha?.passar?.(z);
    },
    onPointerOut: limparHover,
  } : {};
  // se a peça sai (ou o produto muda) com o rato por cima, o estado do hover e o cursor não ficam presos: limpa-se ao desmontar e na troca de produto
  const escolhaAtual = useRef(escolha);
  useEffect(() => { escolhaAtual.current = escolha; });
  useEffect(() => () => {
    if (zonaSob.current === null) return;
    zonaSob.current = null; domElement.style.cursor = ""; escolhaAtual.current?.passar?.(null);
  }, [domElement, m.nome, original.produtoId]);
  const largar = (confirmar: boolean) => {
    if (!arrasto) return;
    if (controls) controls.enabled = true;
    if (confirmar && mover && arrasto.lugar) mover.confirmar(arrasto.id, arrasto.ultimo.x, arrasto.ultimo.y, arrasto.ultimo.altura);
    setArrasto(null); invalidate();
  };
  const eventos = selecionada && mover ? {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // a captura do ponteiro pode falhar (ponteiro já inactivo): o arrasto continua sem ela
      try { (e.target as unknown as Element).setPointerCapture?.(e.pointerId); } catch { /* sem captura */ }
      if (controls) controls.enabled = false; // a câmara não roda enquanto se arrasta
      setArrasto({ id: original.id, parede: original.montagem === "parede", x0: original.x, y0: original.y, alt0: original.altura, py0: e.clientY, ultimo: { x: original.x, y: original.y }, lugar: { x: original.x, y: original.y, rot: original.rotacao, altura: original.altura } });
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (arrasto?.id !== original.id || !mover) return;
      e.stopPropagation();
      // Shift numa peça de parede: muda só a altura ao chão; senão, o ponto do chão debaixo do rato
      let ultimo: Arrasto["ultimo"];
      if (arrasto.parede && e.shiftKey) ultimo = { x: arrasto.x0, y: arrasto.y0, altura: Math.max(0, arrasto.alt0 + (arrasto.py0 - e.clientY) * ALTURA_POR_PIXEL) };
      else { const v = e.ray.intersectPlane(CHAO, new THREE.Vector3()); if (!v) return; ultimo = { x: v.x, y: v.z, altura: arrasto.ultimo.altura }; }
      const l = mover.ajustar(original.id, ultimo.x, ultimo.y, ultimo.altura);
      setArrasto({ ...arrasto, ultimo, lugar: l ?? arrasto.lugar });
      invalidate();
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); try { (e.target as unknown as Element).releasePointerCapture?.(e.pointerId); } catch { /* sem captura */ } largar(true); },
    onPointerCancel: () => largar(false),
  } : {};
  // Esc cancela o arrasto (a peça volta ao sítio)
  useEffect(() => {
    if (arrasto?.id !== original.id) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); if (controls) controls.enabled = true; setArrasto(null); invalidate(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [arrasto?.id, original.id, controls, setArrasto, invalidate]);
  const { tipo, altura, cor, url } = m.mockup3d;
  const texturaDaPeca = useTexturaDoModelo(m.mockup3d.textura, cor);
  const zonasDaPeca = useMemo<ZonasDaPeca>(() => ({ zonas: m.mockup3d.zonas, realce }), [m.mockup3d.zonas, realce]);
  const reserva = <ErroDoModelo nome={m.nome} w={p.largura} d={p.profundidade} h={altura}><Parametrico tipo={tipo} w={p.largura} d={p.profundidade} h={altura} cor={cor} mat={m.mockup3d.material} params={m.mockup3d.params} recortes={p.recortes} opc={p.opc} generico={m.mockup3d.generico} /></ErroDoModelo>;
  const escolhido = modeloEscolhido(m);
  const nf = (n: number) => Math.round(n * 100).toString();
  const base = p.altura; // altura da base ao chão (peças de parede e peças sobre a bancada)
  const corpo = useRef<THREE.Group>(null);
  // todas as peças fazem e recebem sombra (os modelos do HTML já vêm assim; as paramétricas marcam-se aqui)
  useEffect(() => { corpo.current?.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !fantasma; m.receiveShadow = true; if (fantasma) tornarFantasma(m); } }); });
  // de onde veio cada modelo da peça (GLB, procedural, ou procedural porque o GLB falhou), para a etiqueta
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const avisar = useCallback((chave: string, fonte: string) => setFontes((f) => (f[chave] === fonte ? f : { ...f, [chave]: fonte })), []);
  const fonte = [...new Set(Object.values(fontes))].join(" + ");
  return (
    <group ref={grupoRef} position={[p.x, base, p.y]} rotation={[0, (p.rotacao * Math.PI) / 180, 0]} onClick={(e) => { e.stopPropagation(); if (escolha?.clicar && foiClique(e.delta)) { const z = zonaDe(e); if (z) escolha.clicar(z); } onSel(p.id); }} {...eventosDeZona} {...eventos}>
      <group ref={corpo} scale={[p.espelhada ? -1 : 1, 1, 1]}>
        <TexturaCtx.Provider value={texturaDaPeca}>
          <ZonasCtx.Provider value={zonasDaPeca}>
            <AvisarFonte.Provider value={avisar}>
              {url ? <Reserva reserva={reserva}><Suspense fallback={reserva}><ModeloGLB url={url} w={p.largura} d={p.profundidade} h={altura} /></Suspense></Reserva> : reserva}
            </AvisarFonte.Provider>
          </ZonasCtx.Provider>
        </TexturaCtx.Provider>
      </group>
      {cotas && <Cotas w={p.largura} d={p.profundidade} h={altura} />}
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
  const rev = revestimentoDaSuperficie(espaco.revestimentos, "parede");
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
  const cor = a.cor ?? (a.tipo === "porta" ? "#a98467" : "#f1f1ee");
  return (
    <group position={[x, 0, z]}>
      <Caixa p={[-a.largura / 2 + aro / 2, a.peitoril + a.altura / 2, 0]} s={[aro, a.altura, e]} cor={cor} />
      <Caixa p={[a.largura / 2 - aro / 2, a.peitoril + a.altura / 2, 0]} s={[aro, a.altura, e]} cor={cor} />
      <Caixa p={[0, a.peitoril + a.altura - aro / 2, 0]} s={[a.largura, aro, e]} cor={cor} />
      {a.tipo === "janela" ? (
        <>
          <Caixa p={[0, a.peitoril + aro / 2, 0]} s={[a.largura, aro, e]} cor={cor} />
          <mesh position={[0, a.peitoril + a.altura / 2, 0]}><boxGeometry args={[a.largura - 2 * aro, a.altura - 2 * aro, 0.01]} /><meshStandardMaterial color={COR_VIDRO} transparent opacity={0.35} roughness={0.1} /></mesh>
          <Caixa p={[0, a.peitoril + a.altura / 2, 0]} s={[0.025, a.altura - 2 * aro, 0.03]} cor={cor} />
        </>
      ) : (
        <>
          <Caixa p={[0, (a.altura - aro) / 2, 0]} s={[a.largura - 2 * aro, a.altura - aro, 0.04]} cor={a.cor ?? "#c19a76"} r={0.6} />
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
  const rev = revestimentoDaSuperficie(espaco.revestimentos, "pavimento");
  const mat = useRevestimento(rev, 1, 1);
  return (
    <>
      <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {teto && <mesh geometry={geo} position={[0, espaco.peDireito, 0]} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial color="#fafafa" side={THREE.DoubleSide} /></mesh>}
    </>
  );
}

/* ------------------------------------------------------------------ a amostra de um revestimento (só a pré-visualização do produto) */
/** A camada de argamassa por baixo das peças (m): as juntas são o rasgo entre peças até ela. */
const ARGAMASSA_M = 0.002;
/**
 * As peças da amostra numa SÓ geometria (as caixas fundidas, nada de centenas de malhas): no plano da amostra, `x` ao longo da largura e `y` ao longo do fundo (chão, +Z)
 * ou da altura (parede, +Y); a espessura para cima (chão) ou para fora da parede (+Z). O tom de cada peça vai na cor dos vértices (multiplica a cor ou a foto).
 */
function geometriaDasPecas(plano: PlanoRevestimento): THREE.BufferGeometry {
  const molde = new THREE.BoxGeometry(1, 1, 1);
  const pos = molde.getAttribute("position"), nor = molde.getAttribute("normal"), idx = molde.getIndex();
  const nv = pos.count, ni = idx ? idx.count : 0, n = plano.pecas.length, e = plano.espessuraM, chao = plano.superficie === "chao";
  const P = new Float32Array(n * nv * 3), N = new Float32Array(n * nv * 3), C = new Float32Array(n * nv * 3), I = new Uint32Array(n * ni);
  plano.pecas.forEach((q, k) => {
    const s: V3 = chao ? [q.w, e, q.h] : [q.w, q.h, e];
    const c: V3 = chao ? [q.x + q.w / 2, ARGAMASSA_M + e / 2, q.y + q.h / 2] : [q.x + q.w / 2, q.y + q.h / 2, ARGAMASSA_M + e / 2];
    for (let i = 0; i < nv; i++) {
      const o = (k * nv + i) * 3;
      P[o] = pos.getX(i) * s[0] + c[0]; P[o + 1] = pos.getY(i) * s[1] + c[1]; P[o + 2] = pos.getZ(i) * s[2] + c[2];
      N[o] = nor.getX(i); N[o + 1] = nor.getY(i); N[o + 2] = nor.getZ(i);
      C[o] = C[o + 1] = C[o + 2] = q.tom;
    }
    for (let i = 0; i < ni; i++) I[k * ni + i] = (idx?.getX(i) ?? 0) + k * nv;
  });
  molde.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}
/**
 * A amostra: a argamassa (uma placa cinzenta, um pouco mais escura do que a peça) e por cima as peças, finas, com a foto da cor mapeada no mundo (`LADO_TEXTURA_CM`
 * por repetição, como nas peças; rodada quando a peça é mais comprida do que alta, para o veio seguir a peça) ou a cor lisa; se a foto não abrir, fica a cor lisa. Tudo faz e recebe sombra; a geometria, os materiais e a foto largam-se ao desmontar.
 */
function AmostraRevestimento({ r }: { r: RevestimentoVisual }) {
  const { plano, origem } = r.amostra, [w, h] = plano.amostraM, chao = plano.superficie === "chao";
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => geometriaDasPecas(plano), [plano]);
  useEffect(() => () => geo.dispose(), [geo]);
  const matPecas = useMemo(() => new THREE.MeshStandardMaterial({ color: r.cor, roughness: 0.5, vertexColors: true }), [r.cor]);
  const matJunta = useMemo(() => new THREE.MeshStandardMaterial({ color: corDaJunta(r.cor), roughness: 0.95 }), [r.cor]);
  useEffect(() => () => { matPecas.dispose(); matJunta.dispose(); }, [matPecas, matJunta]);
  const url = r.textura?.url, lado = r.textura?.ladoCm ?? 0;
  // o veio da foto (vertical nas fotos das opções de cor) corre ao longo da peça: com o lado maior na horizontal, a foto roda
  const rodar = plano.pecaM[0] > plano.pecaM[1];
  useEffect(() => {
    if (!url) return;
    const largar = pedirTextura(url, (t) => { if (t) aplicarTextura(matPecas, t, lado, { rodar }); else retirarTextura(matPecas); invalidate(); });
    return () => { largar(); retirarTextura(matPecas); invalidate(); };
  }, [url, lado, rodar, matPecas, invalidate]);
  useEffect(() => { invalidate(); }, [geo, invalidate]);
  const base: { p: V3; s: V3 } = chao ? { p: [w / 2, ARGAMASSA_M / 2, h / 2], s: [w, ARGAMASSA_M, h] } : { p: [w / 2, h / 2, ARGAMASSA_M / 2], s: [w, h, ARGAMASSA_M] };
  return (
    <group position={origem}>
      <mesh position={base.p} material={matJunta} receiveShadow><boxGeometry args={base.s} /></mesh>
      <mesh geometry={geo} material={matPecas} castShadow receiveShadow />
    </group>
  );
}

/* ------------------------------------------------------------------ câmaras */
function Camaras({ vista, espaco, camara, contido = false }: { vista: Vista3D; espaco: Espaco; camara?: Visualizador3DProps["camara"]; contido?: boolean }) {
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
        <OrbitControls key={`oc-${camara.chave}`} makeDefault target={camara.alvo} maxPolarAngle={Math.PI / 2.02} minDistance={camara.distMin ?? 0.2} maxDistance={Math.min(camara.distMax ?? Infinity, maior * 4 + 6)} enablePan={!contido} />
      </>
    );
  }
  const d = maior * 0.8 + 1.1;
  return (
    <>
      <PerspectiveCamera key="3d" makeDefault position={[cx + d, d * 0.9, cz + d]} fov={40} near={0.1} far={200} />
      <OrbitControls key="oc-3d" makeDefault target={[cx, pe / 3, cz]} maxPolarAngle={Math.PI / 2.02} minDistance={1} maxDistance={maior * 4 + 6} enablePan={!contido} />
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

/** O OrbitControls põe `touch-action: none` no canvas ao ligar-se (o toque vertical deixa de rolar a página); aqui volta a deixar o toque vertical à página, depois de ele se ligar. */
function ToqueRolaPagina() {
  const gl = useThree((s) => s.gl), controls = useThree((s) => s.controls);
  useEffect(() => { if (controls) gl.domElement.style.touchAction = "pan-y"; }, [gl, controls]);
  return null;
}

/** O que se usa do OrbitControls para o zoom por botões e teclas (o drei só o dá como EventDispatcher). */
interface ControlosOrbita { object: THREE.Camera; target: THREE.Vector3; minDistance: number; maxDistance: number; update: () => void; saveState: () => void; reset: () => void }
/** O passo de cada toque em «Aproximar» e «Afastar»: a distância ao alvo passa a 80 % ou a 125 %. */
const PASSO_ZOOM = 0.8;

/** Os comandos do zoom, fora do canvas: aproximar e afastar mexem na distância ao alvo (dentro dos limites do OrbitControls), repor volta à vista de partida. */
function ComandosDaVista({ comandos }: { comandos: MutableRefObject<ComandosVista | null> }) {
  const controls = useThree((s) => s.controls) as unknown as ControlosOrbita | null, invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!controls) return;
    controls.saveState();
    const mudar = (fator: number) => {
      const v = controls.object.position.clone().sub(controls.target), d = v.length();
      if (d === 0) return;
      const nova = Math.min(controls.maxDistance, Math.max(controls.minDistance, d * fator));
      controls.object.position.copy(controls.target).add(v.multiplyScalar(nova / d));
      controls.update(); invalidate();
    };
    const meus: ComandosVista = { aproximar: () => mudar(PASSO_ZOOM), afastar: () => mudar(1 / PASSO_ZOOM), repor: () => { controls.reset(); invalidate(); } };
    comandos.current = meus;
    return () => { if (comandos.current === meus) comandos.current = null; };
  }, [controls, comandos, invalidate]);
  return null;
}

export default function Visualizador3D({ espaco, modelos, vista, teto, etiquetas, descricao, selecionada, onSelecionar, camara, mover, porFazer, rolarPagina = false, zoomRoda = false, comandos, revestimento, cotas = false, zonaRealcada = null, aoClicarZona, aoPassarZona, zonasEscolheveis }: Visualizador3DProps) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const alvo = useRef<AlvoArrasto>({ grupo: null, camera: null, controls: null });
  const escolhaDeZona = useMemo<EscolhaDeZona | undefined>(() => (aoClicarZona || aoPassarZona ? { clicar: aoClicarZona, passar: aoPassarZona, validas: zonasEscolheveis } : undefined), [aoClicarZona, aoPassarZona, zonasEscolheveis]);
  // com `rolarPagina`, a roda do rato só chega ao OrbitControls quando `zoomRoda`: senão a página rola (o OrbitControls ouve o canvas e dá-lhe preventDefault, por isso
  // corta-se antes, na captura, e o navegador faz o que faria sem o 3D)
  const raiz = useRef<HTMLDivElement>(null), rodaLigada = useRef(zoomRoda);
  rodaLigada.current = zoomRoda;
  useEffect(() => {
    const el = raiz.current;
    if (!el || !rolarPagina) return;
    const cortar = (e: WheelEvent) => { if (!rodaLigada.current) e.stopPropagation(); };
    el.addEventListener("wheel", cortar, { capture: true });
    return () => el.removeEventListener("wheel", cortar, { capture: true });
  }, [rolarPagina]);
  return (
    <div ref={raiz} role="img" aria-label={descricao} className={rolarPagina ? "h-full w-full touch-pan-y" : "h-full w-full touch-none"} onPointerDownCapture={(e) => { if (mover) travarCamaraSeNaPeca(e, alvo.current); }}
      onPointerUpCapture={() => { if (!arrasto && alvo.current.controls) alvo.current.controls.enabled = true; }}>
      {/* como o HTML: ACES com exposição 1,08, sombras suaves (PCF), ambiente de estúdio e fundo claro neutro */}
      <Canvas frameloop="demand" dpr={[1, 1.5]} shadows="soft" gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08, preserveDrawingBuffer: true }} onPointerMissed={() => { onSelecionar(null); aoClicarZona?.(null); }}>
        <color attach="background" args={["#ecebe7"]} />
        <EstudioAmbiente />
        <LuzEstudio espaco={espaco} />
        <Camaras vista={vista} espaco={espaco} camara={vista === "3d" ? camara : null} contido={rolarPagina} />
        {rolarPagina && <ToqueRolaPagina />}
        {comandos && <ComandosDaVista comandos={comandos} />}
        <Superficies espaco={espaco} teto={teto && vista !== "cima"} />
        {espaco.paredes.map((p, i) => <ParedeCena key={p.id} parede={p} indice={i} espaco={espaco} />)}
        <SombraDeContacto espaco={espaco} />
        {revestimento && <AmostraRevestimento r={revestimento} />}
        <AmbienteMetalDosMetais>
          {espaco.pecas.map((p) => { const m = modelos[p.produtoId]; return m ? <Peca key={porFazer?.has(p.id) ? `${p.id}:por-fazer` : p.id} p={p} m={m} etiquetas={etiquetas} selecionada={selecionada === p.id} fantasma={!!porFazer?.has(p.id)} onSel={onSelecionar} mover={mover} arrasto={arrasto} setArrasto={setArrasto} alvo={alvo} cotas={cotas} realce={zonaRealcada} escolha={escolhaDeZona} /> : null; })}
        </AmbienteMetalDosMetais>
        {arrasto?.lugar && <GuiaParede espaco={espaco} x={arrasto.lugar.x} y={arrasto.lugar.y} altura={arrasto.parede ? arrasto.lugar.altura : null} />}
        <PonteCamara alvo={alvo} />
      </Canvas>
    </div>
  );
}
