// 23/11: a pré-visualização 3D de um produto do catálogo (só para ver): o modelo que o classificador do catálogo 3D dá ao produto, numa divisão mínima.
// O three só se carrega (React.lazy) quando este componente monta, ou seja, quando alguém pede «Ver em 3D». Se qualquer coisa falhar (sem WebGL, um modelo que
// não abre, a própria conta do modelo), fica um texto com «Tentar outra vez» em vez do formulário partido.
import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComandosVista, RevestimentoVisual } from "./planta3d/Visualizador3D";
import { cenaDoProduto, estadoDoModelo, modeloParaPrevia, tipoDaPrevia, type EstadoPrevia, type MedidaCm } from "./planta3d/previaProduto3d";
import { eixosPorOmissao, notaDaTroca, temCamposParaEixos, textoDasMedidas, trocarEixo, type Eixos } from "./planta3d/eixosMedida";
import { zonasDoModelo, rotuloDaZona, ZONAS, type ZonaGlb, type ZonasDoProduto } from "./planta3d/zonasGlb";
import { classeDoNomeDe, type LeituraDoProduto } from "./planta3d/acabamentoCor3d";
import { InterruptorMedidas, PainelMedidas, PainelZonas } from "./Previa3DPaineis";
import type { Config3dPrevia } from "./Previa3DLigacoes";
import { PainelAspeto3D } from "./PainelAspeto3D";
import type { NoCat, ProdutoModelo3D, TipoMockup } from "./planta3d/catalogo3d";
import type { TexturaModelo } from "./planta3d/texturaProduto";
import { niveisDoNo } from "./planta3d/modelos3dEscolha";
import { cenaDoRevestimento, planearRevestimento, superficieDaPrevia, type MedidaRevestimento, type SuperficieRev } from "./planta3d/revestimentoPrevia";

const carregarVisualizador = () => import("./planta3d/Visualizador3D");
let Visualizador3D = lazy(carregarVisualizador);
/** Um `lazy` cuja carga falhou fica a falhar em cache para sempre: depois de um erro faz-se um novo, para fechar e abrir (ou «Tentar outra vez») voltarem a tentar. */
const renovarVisualizador = () => { Visualizador3D = lazy(carregarVisualizador); };

const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const NOTA = "text-[15px] text-muted-foreground";
const SEM_ESCOLHA = () => {};
const MSG_FALHA = "Não foi possível mostrar o 3D neste dispositivo";

/** O aviso de cada estado: só a caixa e o desenho aproximado levam um (com o genérico e o modelo do HTML não há nada a avisar). */
const AVISO: Partial<Record<EstadoPrevia, string>> = {
  caixa: "Sem modelo 3D parecido: aparece uma caixa com as medidas.",
  aproximado: "Ainda não há um 3D igual a este produto: é um desenho aproximado do tipo de produto, com as medidas.",
};

/** Uma mensagem de estado para o leitor de ecrã: o parágrafo `role="status"` monta vazio e só depois recebe o texto (uma região viva que já nasce cheia não se anuncia). */
function Estado({ texto, className = NOTA }: { texto: string; className?: string }) {
  const [t, setT] = useState("");
  useEffect(() => { setT(texto); }, [texto]);
  return <p role="status" className={className}>{t}</p>;
}

/** Se qualquer coisa do 3D falhar, fica a alternativa em vez de partir o formulário. `onErro`: quem quer saber (para renovar o que ficou em cache a falhar). */
class Falha3D extends Component<{ alternativa: ReactNode; onErro?: () => void; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.warn("[catálogo] o 3D do produto falhou:", e); this.props.onErro?.(); }
  render() { return this.state.erro ? this.props.alternativa : this.props.children; }
}

export interface Previa3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** A medida dos atributos (cm); o que ela não diz vem do nome ou das omissões do tipo. */
  medida?: MedidaCm | null;
  /** A cor (hex) do atributo Cor. */
  cor?: string;
  /** A foto da opção de cor (URL público): vira a textura do corpo da peça; se a imagem falhar, fica a cor. */
  textura?: TexturaModelo;
  /** O «Modelo 3D» escolhido no próprio produto (a subcategoria e a categoria vêm da árvore): manda sobre o classificador. */
  modelo3d?: string | null;
  /** 24/11: a Medida de um revestimento em cm, sem os limites do modelo 3D (a espessura de 3,5 mm de um laminado conta). Sem ela, a `medida` ou a do nome. */
  medidaRevestimento?: MedidaRevestimento | null;
  /** 24/11: o atributo «Aplicação» do produto (Pavimento, Parede): manda sobre a subcategoria na vista por omissão de um revestimento automático. */
  aplicacao?: string | null;
  /** 24/11 (fase 1): a aparência de cada zona (Cor da frente, Cor do corpo…), dos atributos do produto; sem ela, a foto ou cor única de sempre. */
  zonas?: ZonasDoProduto;
  /** 24/11 (fase 1): mostra o painel «Medidas» (escolher os eixos da Medida, só para ver). Só a secção «Modelo 3D» do produto o liga. */
  painelMedidas?: boolean;
  /**
   * 25/11: a configuração 3D (eixos e ligações) que a base devolveu para este produto: os eixos guardados (ou herdados) mandam sobre a regra do tipo, o painel «Medidas» passa a gravar
   * e aparece o painel «Ligações». Sem ela (a função da base ainda não existe, ou o formulário de criar) tudo fica como na fase 1: só para ver.
   */
  config3d?: Config3dPrevia;
  /** 26/11: a altura da caixa do 3D (classes do Tailwind) quando não há painel «Aspeto 3D»; a omissão é a de sempre (h-64 sm:h-80), a vista da família pede um 3D maior. */
  alturaClasse?: string;
}

const ALTURA_OMISSAO = "h-64 sm:h-80";

const ROTULO_SUPERFICIE: Record<SuperficieRev, string> = { chao: "No chão", parede: "Na parede" };
const BOTOES_SUPERFICIE: ReadonlyArray<readonly [SuperficieRev, string]> = [["chao", "Ver no chão"], ["parede", "Ver na parede"]];
const BOTAO_SUPERFICIE = "inline-flex min-h-11 items-center rounded-md px-3 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:bg-muted aria-pressed:hover:bg-primary";

/** Os lados da peça de um revestimento (cm): a medida do revestimento, senão a do modelo 3D (largura e comprimento), senão a do nome; nenhuma: null (vai a 60×60). */
function ladosDaPeca(mr: MedidaRevestimento | null | undefined, medida: MedidaCm | null | undefined, m: ProdutoModelo3D): [number, number] | null {
  if (mr) return mr.ladoCm;
  if (medida?.largura && medida.comprimento) return [medida.largura, medida.comprimento];
  return m.dimensoes.deNome ? [m.dimensoes.larguraCm, m.dimensoes.profundidadeCm] : null;
}

const BOTAO_ZOOM = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input bg-card/95 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const MAIS = new Set(["+", "="]), MENOS = new Set(["-", "_"]);

/** A ajuda por baixo do 3D: a roda do rato só faz zoom depois de se clicar no 3D (senão a página rola); com o foco, as teclas + e − também. */
function textoDeAjuda(foco: boolean, dentro: boolean): string {
  if (!foco) return "Clique no 3D para usar a roda do rato.";
  return dentro ? "Roda do rato, ou as teclas + e −, para aproximar e afastar." : "Teclas + e − para aproximar e afastar.";
}

/** O 3D: a conta do modelo e da cena, o aviso e o visualizador (lazy). Corre dentro do Falha3D, por isso uma excepção aqui também fica na alternativa. */
function Corpo({ nome, sub, no, arvore, medida, cor, textura, modelo3d, medidaRevestimento, aplicacao, zonas, painelMedidas = false, config3d, alturaClasse = ALTURA_OMISSAO }: Previa3DProdutoProps) {
  // o zoom: botões (sempre), pinça (toque), e roda do rato e teclas + e − só com o 3D focado (e a roda só com o rato lá dentro), para a página continuar a rolar
  const comandos = useRef<ComandosVista | null>(null), idAjuda = useId();
  const [foco, setFoco] = useState(false), [dentro, setDentro] = useState(false);
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && zonaFixa) { e.preventDefault(); fechar(false); return; } // o foco já está no 3D: fica lá
    if (MAIS.has(e.key)) { e.preventDefault(); comandos.current?.aproximar(); }
    else if (MENOS.has(e.key)) { e.preventDefault(); comandos.current?.afastar(); }
  };
  // 24/11 (fase 1): os eixos escolhidos à mão (null: a regra automática do tipo), as cotas, e a zona apontada (rato ou teclado) ou fixa (clique) no painel «Zonas». Nada disto grava.
  const tipo = useMemo(() => tipoDaPrevia({ nome, sub: sub ?? undefined, no, arvore, modelo3d }), [nome, sub, no, arvore, modelo3d]);
  // a escolha leva o tipo a que se aplica: se o tipo mudar, vale logo a regra automática (sem um desenho com os eixos do tipo antigo, como daria repor num efeito)
  const [escolha, setEscolha] = useState<{ tipo: TipoMockup; eixos: Eixos; nota: string | null } | null>(null);
  const aMao = escolha && escolha.tipo === tipo ? escolha : null;
  // 25/11: sem escolha à mão valem os eixos guardados (ou herdados) do produto, se os há; senão a regra do tipo
  const eixosEscolhidos = aMao ? aMao.eixos : config3d?.eixos.guardados ?? null;
  const notaTroca = aMao ? aMao.nota : null;
  useEffect(() => { setEscolha((e) => (e && e.tipo !== tipo ? null : e)); }, [tipo]); // esquece a escolha de outro tipo (se o tipo voltar, não ressuscita)
  const [cotas, setCotas] = useState(false);
  const [zonaApontada, setZonaApontada] = useState<ZonaGlb | null>(null), [zonaFixa, setZonaFixa] = useState<ZonaGlb | null>(null);
  // 25/11: a zona debaixo do rato no próprio 3D (escolher a zona clicando numa parte da peça); a escolha é a mesma `zonaFixa` do painel «Zonas»
  const [zonaSobRato, setZonaSobRato] = useState<ZonaGlb | null>(null);
  // de onde veio a zona escolhida (o clique no 3D ou o botão do painel «Zonas»): ao fechar o painel o foco volta para lá; ao abrir por clique, passa ao painel
  const [origem, setOrigem] = useState<"3d" | "botao">("3d");
  // 26/11: as zonas que a regra apontada (ou focada) no painel «Aspeto 3D» pinta de facto: o 3D realça só essas (uma lista vazia: nenhuma); null: sem regra apontada
  const [zonasDaRegra, setZonasDaRegra] = useState<readonly ZonaGlb[] | null>(null);
  const raiz = useRef<HTMLDivElement>(null), grupo3d = useRef<HTMLDivElement>(null);
  const escolherZona3d = (z: ZonaGlb | null) => { setOrigem("3d"); setZonaFixa(z); };
  const escolherZonaBotao = (z: ZonaGlb | null) => { setOrigem("botao"); setZonaFixa(z); };
  const fechar = (devolverFoco = true) => {
    const z = zonaFixa;
    setZonaFixa(null);
    if (!devolverFoco) return;
    const botao = origem === "botao" && z ? raiz.current?.querySelector<HTMLElement>(`[data-zona-botao="${z}"]`) : null;
    (botao ?? grupo3d.current)?.focus();
  };
  const modelo = useMemo(() => modeloParaPrevia({ nome, sub: sub ?? undefined, no, arvore, medida, cor, textura, modelo3d, eixos: eixosEscolhidos, zonas }), [nome, sub, no, arvore, medida, cor, textura, modelo3d, eixosEscolhidos, zonas]);
  const eixosEmVigor = eixosEscolhidos ?? eixosPorOmissao(tipo, medida);
  const zonasDoObjecto = useMemo(() => zonasDoModelo(modelo), [modelo]);
  useEffect(() => { if (zonaFixa && !zonasDoObjecto.some((z) => z.zona === zonaFixa)) setZonaFixa(null); }, [zonaFixa, zonasDoObjecto]);
  useEffect(() => { if (zonaSobRato && !zonasDoObjecto.some((z) => z.zona === zonaSobRato)) setZonaSobRato(null); }, [zonaSobRato, zonasDoObjecto]);
  // 25/11: clicar numa parte da peça escolhe a zona (só com 2 ou mais zonas: o painel «Zonas» é a alternativa de teclado e de leitor de ecrã, e só existe então)
  const zonasEscolheveis = useMemo(() => new Set<ZonaGlb>(zonasDoObjecto.map((z) => z.zona)), [zonasDoObjecto]);
  const escolherNo3d = zonasDoObjecto.length >= 2;
  // os atributos do produto (com valor escolhido) que o 3D lê, e as zonas que cada um pinta hoje (só as do modelo): o que se preserva ao ligar um atributo a outra zona
  const atributosDoProduto: readonly LeituraDoProduto[] = config3d?.atributosDoProduto ?? [];
  const pintaHoje = (atributo: string): ZonaGlb[] => {
    const nome = atributosDoProduto.find((a) => a.id === atributo)?.nome;
    return nome ? ZONAS.filter((z) => zonasEscolheveis.has(z) && zonas?.zonas[z]?.atributo === nome) : [];
  };
  // os atributos de cor do produto que pintam cada zona SÓ pelo nome («Cor da frente» → frente): a ligação escolhida manda sobre eles (escolherZona.ts)
  const pelaNome = (z: ZonaGlb) => atributosDoProduto.flatMap((a) => { const c = classeDoNomeDe(a.nome); return c && c.papel === z ? [{ id: a.id, lisa: c.nivel === 3 }] : []; });
  // 24/11: um revestimento (escolhido, ou automático na categoria Revestimentos) mostra-se como superfície: a vista por omissão vem da regra única
  // (revestimentoPrevia.ts, superficieDaPrevia) e o interruptor muda-a só aqui, sem gravar nada; outro produto fica exactamente como antes
  const niveis = useMemo(() => niveisDoNo(arvore, no), [arvore, no]);
  const omissao = superficieDaPrevia({ modelo: modelo.escolha?.modelo ?? null, categoria: niveis.categoria?.nome, subcategoria: niveis.subcategoria?.nome ?? sub, aplicacao });
  const [escolhida, setEscolhida] = useState<SuperficieRev | null>(null);
  useEffect(() => { setEscolhida(null); }, [omissao]);
  const superficie = omissao ? escolhida ?? omissao : null;
  const lados = ladosDaPeca(medidaRevestimento, medida, modelo);
  const espessuraCm = medidaRevestimento?.espessuraCm ?? medida?.espessura;
  const ladosChave = lados?.join("x");
  const plano = useMemo(() => (superficie ? planearRevestimento({ ladoPecaCm: lados, superficie, espessuraCm }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ladosChave` resume `lados` (um array novo em cada desenho)
    [superficie, ladosChave, espessuraCm]);
  const cenaRev = useMemo(() => (plano ? cenaDoRevestimento(plano, modelo.nome) : null), [plano, modelo.nome]);
  const revestimento = useMemo<RevestimentoVisual | null>(() => (cenaRev ? { amostra: cenaRev.amostra, cor: modelo.mockup3d.cor, ...(textura ? { textura } : {}) } : null), [cenaRev, modelo.mockup3d.cor, textura]);
  const cena = useMemo(() => (cenaRev ? { espaco: cenaRev.espaco, modelos: {}, camara: cenaRev.camara } : cenaDoProduto(modelo)), [cenaRev, modelo]);
  // a caixa escolhida à mão não leva o aviso de «sem modelo parecido»; um revestimento só avisa quando a medida falta ou a amostra teve de mudar
  const escolhido = modelo.escolha?.modelo;
  const aviso = plano ? [plano.medidaEmFalta ? "Sem medida: aparecem peças de 60 × 60 cm." : null, plano.aviso].filter(Boolean).join(" ") || undefined
    : escolhido === "caixa" ? undefined : AVISO[estadoDoModelo(modelo)];
  const d = modelo.dimensoes;
  const descricao = plano
    ? `${modelo.nome || "Revestimento sem nome"}: peças de ${nf(plano.pecaRealCm[0])} por ${nf(plano.pecaRealCm[1])} cm, ${superficie === "chao" ? "no chão" : "na parede"}, numa amostra de ${nf(plano.amostraM[0])} por ${nf(plano.amostraM[1])} m.`
    : `${modelo.nome || "Produto sem nome"}: ${nf(d.larguraCm)} por ${nf(d.profundidadeCm)} por ${nf(d.alturaCm)} cm (largura, profundidade e altura).`;
  // 26/11: o painel «Aspeto 3D» (zona escolhida + regras do produto + um só «Guardar») fica AO LADO do 3D no ecrã largo e por baixo dele no telemóvel (sem gaveta, que tapava o 3D)
  const mostrarRegras = painelMedidas && !!config3d && zonasDoObjecto.length >= 1;
  const mostrarAspeto = !superficie && (mostrarRegras || (escolherNo3d && zonaFixa !== null));
  return (
    <div ref={raiz} className={cn("grid gap-3", mostrarAspeto && "xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-rows-[auto_1fr] xl:items-start")}>
      {/* 26/11: o 3D é um filho directo da grelha (e não do contentor das zonas e medidas): por baixo de 1280 px (uma só coluna) fica PRESO no topo do ecrã, com altura limitada, enquanto o painel «Aspeto 3D» rola por baixo (escolhe-se a cor a ver a peça).
          O ecrã que rola é o <main> do Layout (fixed, overflow-auto), por isso `top-0`. Ao lado (≥ 1280 px, xl: com o menu lateral do catálogo aberto a ficha tem ~940 px, e a 1024 px só ~625 px, o 3D ficava com 177 px) volta ao fluxo normal. Sem painel «Aspeto 3D», nada fica preso. */}
      <div className={cn("min-w-0", mostrarAspeto && "sticky top-0 z-10 bg-card pb-2 xl:static xl:z-auto xl:col-start-1 xl:row-start-1 xl:bg-transparent xl:pb-0")}>
      <div className={cn("relative overflow-hidden rounded-xl border border-border bg-muted/50", mostrarAspeto ? "h-[min(16rem,36vh)] sm:h-[min(18rem,40vh)] xl:h-80" : alturaClasse)}>
        <div ref={grupo3d} role="group" aria-label="Pré-visualização 3D do produto" aria-describedby={idAjuda} tabIndex={0} onKeyDown={aoTeclar}
          onFocus={() => setFoco(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false); }}
          onPointerEnter={() => setDentro(true)} onPointerLeave={() => setDentro(false)} onPointerDown={(e) => { setDentro(true); e.currentTarget.focus(); }}
          className="h-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
          <Suspense fallback={<div className="grid h-full place-items-center"><Estado texto="A carregar o 3D…" /></div>}>
            <Visualizador3D espaco={cena.espaco} modelos={cena.modelos} vista="3d" teto={false} etiquetas={false} descricao={descricao}
              selecionada={null} onSelecionar={SEM_ESCOLHA} camara={cena.camara} rolarPagina zoomRoda={foco && dentro} comandos={comandos} revestimento={revestimento}
              cotas={cotas && !superficie} zonaRealcada={zonasDaRegra ?? zonaApontada ?? zonaSobRato ?? zonaFixa}
              aoClicarZona={escolherNo3d && !superficie ? escolherZona3d : undefined} aoPassarZona={escolherNo3d && !superficie ? setZonaSobRato : undefined} zonasEscolheveis={zonasEscolheveis} />
          </Suspense>
        </div>
        {!superficie && <InterruptorMedidas ligado={cotas} aoMudar={setCotas} className="absolute left-2 top-2" />}
        {/* o nome da zona debaixo do rato e o atributo que a pinta (decorativo: o painel «Zonas» e o painel da zona dizem o mesmo em texto) */}
        {escolherNo3d && !superficie && zonaSobRato && (
          <p data-testid="etiqueta-zona" aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-11rem)] rounded-md bg-card/95 px-2.5 py-1 text-[15px] font-medium text-foreground shadow-sm">
            {rotuloDaZona(zonaSobRato)} · {zonas?.zonas[zonaSobRato]?.atributo || "sem atributo de cor"}
          </p>
        )}
        {superficie && (
          <>
            <p className="pointer-events-none absolute left-2 top-2 rounded-md bg-card/95 px-2.5 py-1 text-[15px] font-semibold text-foreground shadow-sm">{ROTULO_SUPERFICIE[superficie]}</p>
            <div role="group" aria-label="Onde ver o revestimento" className="absolute right-2 top-2 flex gap-1 rounded-lg border border-input bg-card/95 p-1 shadow-sm">
              {BOTOES_SUPERFICIE.map(([s, rotulo]) => (
                <button key={s} type="button" aria-pressed={superficie === s} onClick={() => setEscolhida(s)} className={BOTAO_SUPERFICIE}>{rotulo}</button>
              ))}
            </div>
          </>
        )}
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button type="button" aria-label="Afastar" title="Afastar" onClick={() => comandos.current?.afastar()} className={BOTAO_ZOOM}><Minus className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" aria-label="Aproximar" title="Aproximar" onClick={() => comandos.current?.aproximar()} className={BOTAO_ZOOM}><Plus className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" aria-label="Repor vista" title="Repor vista" onClick={() => comandos.current?.repor()} className={BOTAO_ZOOM}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </div>
      </div>
      {/* a coluna da esquerda por baixo do 3D (notas, zonas, medidas) é UM contentor: assim as Regras compridas da direita não abrem buracos entre os seus blocos, e o Tab segue a ordem visual */}
      <div className={cn("grid min-w-0 gap-3", mostrarAspeto && "xl:col-start-1 xl:row-start-2")}>
      <div className="grid gap-2">
      <p id={idAjuda} className={NOTA}>{textoDeAjuda(foco, dentro)}</p>
      {aviso && <Estado texto={aviso} />}
      {escolherNo3d && !superficie && (
        <>
          <p className={NOTA}>Clique numa parte da peça para escolher a zona e dizer que atributo a pinta; ou use os botões das zonas, mais abaixo.</p>
          {/* a região viva existe sempre (vazia): o que muda é o texto, e assim a escolha anuncia-se a quem usa leitor de ecrã */}
          <p aria-live="polite" className="sr-only">{zonaFixa ? `Zona ${rotuloDaZona(zonaFixa)} seleccionada` : ""}</p>
        </>
      )}
      {/* o equivalente em texto das cotas, para leitores de ecrã: a região viva existe sempre (vazia e escondida com as cotas desligadas) para a mudança se anunciar */}
      <p aria-live="polite" className={cotas && !superficie ? NOTA : "sr-only"}>{cotas && !superficie ? textoDasMedidas(d) : ""}</p>
      </div>
      {!superficie && zonasDoObjecto.length >= 2 && (
        <div className="min-w-0">
          <PainelZonas zonas={zonasDoObjecto} pintadaPor={zonas?.zonas} fixa={zonaFixa} aoApontar={setZonaApontada} aoFixar={escolherZonaBotao} />
        </div>
      )}
      {painelMedidas && !superficie && medida && temCamposParaEixos(medida) && (
        <div className="min-w-0">
          <PainelMedidas medida={medida} eixos={eixosEmVigor} manual={aMao !== null} dimensoes={d} nota={notaTroca}
            aoEscolher={(eixo, campo) => { const depois = trocarEixo(eixosEmVigor, eixo, campo); setEscolha({ tipo, eixos: depois, nota: notaDaTroca(eixosEmVigor, depois, eixo) }); }} aoRepor={() => setEscolha(null)}
            gravacao={config3d ? {
              podeEditar: config3d.podeEditar, origemGuardada: config3d.eixos.guardados ? config3d.eixos.origem : null, proprio: config3d.eixos.proprio,
              // depois de gravar, a escolha à mão acaba: valem os eixos que a base acabou de guardar (quem grava relê a configuração antes de responder)
              aoGuardar: async () => { const erro = await config3d.eixos.gravar(eixosEmVigor); if (!erro) setEscolha(null); return erro; },
              aoHerdar: async () => { const erro = await config3d.eixos.gravar(null); if (!erro) setEscolha(null); return erro; },
            } : undefined} />
        </div>
      )}
      </div>
      {mostrarAspeto && (
        <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 [&_*]:scroll-mb-40 max-xl:[&_*]:scroll-mt-[calc(min(18rem,40vh)+1rem)]">
          <PainelAspeto3D zonaFixa={escolherNo3d ? zonaFixa : null} zonasDoModelo={zonasDoObjecto.map((z) => z.zona)} pintadaPor={zonas?.zonas} atributos={atributosDoProduto}
            pintaHoje={pintaHoje} pelaNome={pelaNome} focarAoAbrir={origem === "3d"} aoFechar={() => fechar()} config3d={config3d} mostrarRegras={mostrarRegras} aoRealcarRegra={setZonasDaRegra} />
        </div>
      )}
    </div>
  );
}

export function Previa3DProduto(props: Previa3DProdutoProps) {
  const [tentativa, setTentativa] = useState(0);
  const alternativa = (
    <div className={cn("grid place-items-center content-center gap-2 rounded-xl border border-border bg-muted/50 p-4 text-center", props.alturaClasse ?? ALTURA_OMISSAO)}>
      <Estado texto={MSG_FALHA} />
      <button type="button" onClick={() => setTentativa((n) => n + 1)}
        className="inline-flex min-h-11 items-center rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25">
        Tentar outra vez
      </button>
    </div>
  );
  return <Falha3D key={tentativa} onErro={renovarVisualizador} alternativa={alternativa}><Corpo {...props} /></Falha3D>;
}
