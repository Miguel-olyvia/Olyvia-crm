// O interior da ficha da pessoa: cabeçalho, barra de ações, percurso, os painéis de ação (em linha) e as abas fixas. Tudo
// vai num único contentor que rola, para o painel de chamada e o "Guardar" ficarem alcançáveis com zoom ou em ecrãs baixos.
// Com o guia (`comGuia`, a ficha real) é UM só ecrã e mais nada: o topo é o guia (da pessoa, ou do negócio aberto) com o cabeçalho, a faixa fina de alertas
// (só se existirem), as fases, o passo e o cartão do cliente; por baixo só vêm os painéis em linha abertos. A ficha antiga (registos, dados da pessoa,
// visitas, negócios, submissões, atividade) NÃO existe neste modo: o Pipeline faz tudo no assistente de passos. Só os «Detalhes do negócio» abrem num diálogo.
import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { MaisItensFicha } from "./CarregarMais";
import { AbasFicha, type AbaFicha, type AbasProps } from "./ApoioFicha";
import { AvisoNegociosPerdidos } from "./AvisoNegociosPerdidos";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { CabecalhoFicha } from "./CabecalhoFicha";
import { useCabecalhoGuiaFicha } from "./CabecalhoGuiaFicha";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { ErroAcao } from "./ErroAcao";
import { todosNegociosPerdidos } from "./etapaPessoa";
import { FaixaAlertasFicha } from "./FaixaAlertasFicha";
import { LINHA_NEGOCIO } from "./FichaNegocios";
import type { TeclaNavegacao, Vizinhas } from "./navegacaoFicha";
import type { AcaoFicha, AcoesFicha } from "./PainelBase";
import { FormChamada } from "./FormChamada";
import { GuiaDaPessoa } from "./GuiaDaPessoa";
import { PainelAcaoFicha, type AcaoPainel } from "./PainelAcaoFicha";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { LigacaoVoltarFicha } from "./pecasFicha";
import { PercursoPessoa } from "./PercursoPessoa";
import { itensDaPessoa } from "./processo/itensProcesso";
import { passoDoItem } from "./processo/passosProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import type { ItemAtividade, NotaPessoa, Pessoa, ResumoPessoa, Submissao } from "./pessoasTipos";
import { useExecutarAcao } from "./useExecutarAcao";
import { useAnuncios, usePaineis } from "./useFichaPaineis";

/**
 * O separador Submissões da ficha real: o conteúdo vem de quem monta a ficha (só para ler, lido como Leads o lê) e as contagens, da leitura.
 * Sem isto (o exemplo) o separador é o das submissões pendentes, com as ações de resolver.
 */
export interface SeparadorSubmissoesReal {
  /** Quantas submissões há; `null` enquanto não se sabe (a carregar, ou a leitura falhou): o separador fica sem número. */
  total: number | null;
  /** Quantas estão por rever: o aviso «Voltou a contactar» oferece vê-las. */
  pendentes: number;
  conteudo: ReactNode;
}

export interface FichaInteriorProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** As submissões pendentes desta pessoa, já ordenadas; vazias sem permissão para as ver. */
  submissoes: Submissao[];
  notas: NotaPessoa[];
  atividade: ItemAtividade[];
  /** Todas as pessoas, por id: as candidatas das submissões. */
  pessoas: ReadonlyMap<string, Pessoa>;
  /** "Voltou a contactar": tem pendentes e ainda não foi respondida nem perdida. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  acoes: AcoesFicha;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoVerTodasSubmissoes: () => void;
  /**
   * "Criar negócio" (uma lead, ligado ao pedido dela) e "Novo negócio sem visita" (um cliente): a página abre o painel "Novo negócio"
   * com esta pessoa já escolhida. O "Novo negócio com visita" de um cliente não passa por aqui: abre o painel de visita e levantamento.
   */
  aoCriarNegocio?: (pessoa: Pessoa) => void;
  /** A aba Notas (feita só de submissões): por defeito aparece; a ficha real não a tem. */
  comNotas?: boolean;
  /** Um anúncio vindo da página (resolver uma submissão a partir da ficha), para o leitor de ecrã o ouvir aqui. */
  anuncioExterno?: string;
  /** O aviso de um passo do processo feito com a ficha aberta: a região da página está escondida, por isso diz-se aqui dentro. */
  anuncioProcesso?: string;
  /** A ficha chama isto no Esc: fecha o painel aberto (e diz se havia um) em vez de fechar a ficha. */
  fecharPainel: MutableRefObject<(() => boolean) | null>;
  /** A anterior e a seguinte na lista visível, e como passar a elas. */
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
  /** O negócio a abrir logo à entrada (vindo do Quadro ou da Lista, `?negocio=`): a ficha abre com ele aberto (no exemplo, na aba Negócios). */
  negocioInicial?: string | null;
  /** «Carregar mais» por secção (a ficha real); sem isto (o exemplo) não há botões. */
  maisItens?: MaisItensFicha;
  /** A atualização em segundo plano falhou e a ficha mostra os últimos dados: um aviso com «Tentar de novo». */
  avisoAtualizacao?: { aoRepetir: () => void };
  /** O separador Submissões da ficha real (só leitura); sem isto vale o das submissões pendentes. Aparece com `podeVerSubmissoes`. */
  separadorSubmissoes?: SeparadorSubmissoesReal;
  /** A identidade da pessoa (a ficha real: empresa ou pessoa singular, com edição), nos «Dados da pessoa» do apoio. */
  identidade?: ReactNode;
  /**
   * O guia do passo seguinte (a ficha real do Pipeline): no topo da ficha da pessoa em abordagem e do negócio aberto, com o assistente de passos que faz
   * cada passo no próprio ecrã. Ligado, a ficha é só o guia: não há ficha antiga por cima (registos, dados, visitas, negócios, submissões, atividade).
   * Sem isto (o exemplo) fica como estava.
   */
  comGuia?: boolean;
  /** Com o guia na página: de onde se abriu a ficha, para a ligação «← Pipeline» / «← Pessoas» no topo (fecha a ficha e volta ao quadro). Sem isto não há ligação. */
  voltaPara?: "pipeline" | "pessoas";
  /**
   * A ficha está NA PÁGINA (sem Sheet): quem rola é a área de conteúdo do layout e não este contentor, e a ligação «← Pipeline» / «← Pessoas» aparece no topo.
   * Sem isto (o painel lateral, o exemplo) o contentor rola e não há ligação.
   */
  naPagina?: boolean;
}

/** O negócio aberto, no topo da ficha com o guia: o guia do negócio é o cabeçalho (o nome da pessoa, o serviço, as fases, o passo). */
function NegocioAbertoNoTopo(
  p: AbasProps & {
    cabecalhoFicha: PecasCabecalhoFicha; negocio: NegocioMes;
    detalhesAbertos: boolean; aoFecharDetalhes: () => void; origemApoio: MutableRefObject<HTMLElement | null>;
  },
) {
  // O item do processo do negócio aberto (o mesmo do Quadro): dá ao passo seguinte o botão que o executa.
  const extras = useExtrasProcesso();
  const item = useMemo(
    () => itensDaPessoa(p.resumo, p.hoje, extras).find((i) => i.id === p.negocio.id),
    [p.resumo, p.hoje, extras, p.negocio.id],
  );
  return (
    <DetalheNegocioFicha
      negocio={p.negocio} hoje={p.hoje} aoVoltar={p.aoVoltarNegocio} item={item} pessoa={p.resumo.pessoa} atividade={p.atividade} comGuia
      cabecalhoFicha={p.cabecalhoFicha} aoApagado={p.aoVoltarNegocio} aoRegistarChamada={p.aoRegistarChamada}
      apoioAberto={p.detalhesAbertos} aoFecharApoio={p.aoFecharDetalhes} origemApoio={p.origemApoio}
    />
  );
}

/**
 * Abrir um negócio dentro da ficha e voltar à lista com o foco na mesma linha. Mudar de aba fecha o negócio aberto (no exemplo).
 * Com o guia (`comGuia`) a linha só existe dentro do diálogo de apoio, que já fechou: o foco vai para o nome da pessoa, no guia, e não se perde no corpo da página.
 */
function useNegocioAberto(comGuia: boolean) {
  const [aberto, setAberto] = useState<string | null>(null);
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    if (aberto !== null || ultimo.current === null) return;
    const linha = document.querySelector<HTMLElement>(`[${LINHA_NEGOCIO}="${ultimo.current}"]`);
    (linha ?? (comGuia ? document.querySelector<HTMLElement>("[data-ficha-nome]") : null))?.focus();
    ultimo.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a abrir ou fechar o negócio
  }, [aberto]);
  return {
    aberto,
    abrir: (id: string) => { ultimo.current = id; setAberto(id); },
    voltar: () => setAberto(null),
    esquecer: () => { ultimo.current = null; setAberto(null); },
  };
}

/**
 * Quando a pessoa ganha um negócio (um "Criar negócio" que acaba de terminar), avisa com os ids dos negócios novos: o exemplo passa à aba Negócios para o
 * mostrar; a ficha com o guia abre o novo negócio no topo.
 */
function useAoCriarNegocio(resumo: ResumoPessoa, aoCriados: (novos: string[]) => void) {
  const antes = useRef({ id: resumo.pessoa.id, ids: new Set(resumo.negocios.map((n) => n.id)) });
  const n = resumo.negocios.length;
  useEffect(() => {
    const anterior = antes.current;
    antes.current = { id: resumo.pessoa.id, ids: new Set(resumo.negocios.map((x) => x.id)) };
    if (anterior.id === resumo.pessoa.id && n > anterior.ids.size) aoCriados(resumo.negocios.filter((x) => !anterior.ids.has(x.id)).map((x) => x.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a mudar o número de negócios da mesma pessoa
  }, [n, resumo.pessoa.id]);
}

export function FichaInterior(p: FichaInteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("resumo");
  // Os detalhes do negócio aberto: só existem com o guia. `origemApoio` é o botão a que o foco volta.
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const origemApoio = useRef<HTMLElement | null>(null);
  const negocio = useNegocioAberto(!!p.comGuia);
  const painelId = useId();
  const { texto, anunciar } = useAnuncios(p.anuncioExterno);
  // A visita a que se regista o resultado (o diálogo vive aqui, dentro da ficha, para o aviso sair na região da ficha).
  const [visitaDoResultado, setVisitaDoResultado] = useState<string | null>(null);
  const visitaAberta = p.resumo.registos.visitas.find((v) => v.id === visitaDoResultado) ?? null;
  useEffect(() => { if (p.anuncioProcesso) anunciar(p.anuncioProcesso); }, [p.anuncioProcesso, anunciar]);
  const { acao, visitados, abrir, fechar, mudarConteudo } = usePaineis(p.fecharPainel, anunciar);
  useAoCriarNegocio(p.resumo, (novos) => {
    if (p.comGuia) { if (novos[0]) negocio.abrir(novos[0]); return; }
    negocio.esquecer();
    setAba("negocios");
  });
  // Vindo de um cartão do Quadro ou de uma linha da Lista: abre já ESSE negócio (no exemplo, na aba Negócios), e não só a pessoa. Um negócio que
  // acabou de se criar só chega à ficha depois de ela se refazer: quando aparece, abre-se (depois de `useAoCriarNegocio`).
  const negocioPedidoExiste = !!p.negocioInicial && p.resumo.negocios.some((n) => n.id === p.negocioInicial);
  useEffect(() => {
    if (!p.negocioInicial) return;
    if (!p.comGuia) setAba("negocios");
    negocio.abrir(p.negocioInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a mudar o negócio pedido, ou a passar a existir
  }, [p.negocioInicial, negocioPedidoExiste]);
  // Reativar espera pela ação (na base pode demorar ou falhar): só anuncia no fim, e uma falha fica à vista em role=alert.
  const reabrir = useExecutarAcao(anunciar);
  const reativar = () => {
    const mensagem = t("pessoasPagina.live.reactivated", { name: p.resumo.pessoa.nome });
    reabrir.executar(() => p.acoes.reativar(p.resumo.pessoa.id), () => anunciar(mensagem), mensagem);
  };
  const criarNegocio = p.aoCriarNegocio;
  // O mesmo critério do «Encerrar abordagem» do menu «Mais»: só uma lead, sem negócio aberto e com a abordagem ainda em curso.
  const podeEncerrar = p.acoes.capacidades?.encerrar !== false && p.resumo.papel === "lead" && !p.resumo.pessoa.encerrada && !p.resumo.pessoa.perdida && p.resumo.abertos.length === 0;
  // Com o guia: o negócio aberto manda sobre a pessoa (o seu guia é o cabeçalho) e «Registar chamada» só vai para o «Mais» quando o botão do passo não é o da chamada.
  const extras = useExtrasProcesso();
  const itemPessoa = useMemo(() => (p.comGuia ? itensDaPessoa(p.resumo, p.hoje, extras).find((i) => i.tipo === "pessoa") : undefined), [p.comGuia, p.resumo, p.hoje, extras]);
  const negocioDoTopo = p.comGuia ? p.resumo.negocios.find((n) => n.id === negocio.aberto) ?? null : null;
  const abrirDetalhes = (origem: HTMLElement | null) => { origemApoio.current = origem; setDetalhesAbertos(true); };
  const faixa = p.comGuia ? (
    <FaixaAlertasFicha
      resumo={p.resumo} hoje={p.hoje} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes}
      aoEncerrar={(origem) => abrir("encerrar", origem)}
    />
  ) : undefined;
  const cabecalhoFicha = useCabecalhoGuiaFicha({
    resumo: p.resumo, vizinhas: p.vizinhas, aoIr: p.aoIr, aberta: acao, painelId, aoAbrir: abrir, aoReativar: reativar,
    capacidades: p.acoes.capacidades, aGuardar: reabrir.aGuardar,
    comItemChamada: negocioDoTopo !== null || !itemPessoa || passoDoItem(itemPessoa).id !== "registarChamada",
    aoAbrirDetalhesNegocio: negocioDoTopo ? abrirDetalhes : undefined, faixa,
  });
  const aviso = p.avisoAtualizacao && (
    <div role="alert" className="mx-6 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p>{t("pessoasPagina.real.ficha.staleWarn")}</p>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={p.avisoAtualizacao.aoRepetir}>
        {t("pessoasPagina.real.retry")}
      </Button>
    </div>
  );
  const paineis = visitados.filter((a): a is AcaoPainel => a !== "chamada").map((a) => (
    <PainelAcaoFicha
      key={a} acao={a} id={`${painelId}-${a}`} ativo={a === acao} pessoa={p.resumo.pessoa} resumo={p.resumo} hoje={p.hoje} acoes={p.acoes}
      aoFechar={() => fechar(true)} aoMudarConteudo={mudarConteudo(a)}
      aoConcluir={(mensagem) => { anunciar(mensagem); fechar(true); }}
    />
  ));
  const abasProps: AbasProps = {
    ...p, aba,
    aoMudar: (a: AbaFicha) => { if (!p.comGuia) negocio.esquecer(); setAba(a); },
    negocioAberto: negocio.aberto,
    aoAbrirNegocio: (id: string) => negocio.abrir(id),
    aoVoltarNegocio: negocio.voltar, aoRegistarResultado: setVisitaDoResultado,
    aoRegistarChamada: (origem: HTMLElement | null) => abrir("chamada", origem),
    aoEncerrar: podeEncerrar ? (origem: HTMLElement | null) => abrir("encerrar", origem) : undefined,
  };
  const formChamada = (
    <FormChamada
      id={`${painelId}-chamada`} pessoa={p.resumo.pessoa} resumo={p.resumo} hoje={p.hoje} acoes={p.acoes} aoFechar={() => fechar(true)}
      negocioId={p.comGuia ? negocio.aberto ?? undefined : undefined} exigirNegocio={!!p.comGuia}
      // No Pipeline (com guia) o negócio fica aberto: a chamada liga-se a ele e a ficha continua nele (passa a Contactado). Só a ficha antiga o fecha.
      aoConcluir={(mensagem) => { anunciar(mensagem); if (!p.comGuia) { negocio.esquecer(); setAba("resumo"); } fechar(true); }}
    />
  );
  return (
    <AnuncioFichaContext.Provider value={anunciar}>
      <div className={p.naPagina ? "rounded-xl bg-muted/30" : cn("flex min-h-0 flex-1 scroll-pt-14 flex-col overflow-y-auto", p.comGuia && "bg-muted/30")}>
        {p.comGuia ? (
          // Uma coluna centrada (até 1120 px) sobre o fundo suave; na página, com a ligação de volta ao quadro no topo.
          <div data-ficha-coluna className="mx-auto w-full max-w-[1120px] pb-6">
            {p.naPagina && p.voltaPara && <LigacaoVoltarFicha voltaPara={p.voltaPara} />}
            <div className="px-4 empty:hidden sm:px-6"><ErroAcao chave={reabrir.erro} chaveExtra={reabrir.erroExtra} className="pb-3" /></div>
            {aviso && <div className="pt-3">{aviso}</div>}
            {/* O topo: o guia do negócio aberto, ou o da pessoa. É o único cabeçalho, a única barra de fases e o único cartão do cliente. */}
            <div className="px-4 pb-4 pt-4 sm:px-6">
              {negocioDoTopo ? (
                <NegocioAbertoNoTopo
                  key={negocioDoTopo.id} {...abasProps} negocio={negocioDoTopo} cabecalhoFicha={cabecalhoFicha}
                  detalhesAbertos={detalhesAbertos} aoFecharDetalhes={() => setDetalhesAbertos(false)} origemApoio={origemApoio}
                />
              ) : (
                <GuiaDaPessoa
                  resumo={p.resumo} hoje={p.hoje} atividade={p.atividade} capacidades={p.acoes.capacidades} aoRegistarChamada={(origem) => abrir("chamada", origem)}
                  aoCriarNegocio={p.aoCriarNegocio} aoEncerrar={podeEncerrar ? (origem) => abrir("encerrar", origem) : undefined}
                  aoAdiar={(origem) => abrir("adiar", origem)} cabecalhoFicha={cabecalhoFicha}
                />
              )}
            </div>
            {/* Por baixo do guia só ficam os painéis em linha abertos (Nota, Adiar, Encerrar, Visita, chamada): nunca uma segunda ficha empilhada. */}
            {paineis}
            {acao === "chamada" && formChamada}
          </div>
        ) : (
          <>
            <CabecalhoFicha resumo={p.resumo} vizinhas={p.vizinhas} aoIr={p.aoIr} />
            <BarraAcoesFicha
              resumo={p.resumo} aberta={acao} painelId={painelId} aoAbrir={abrir} aoReativar={reativar}
              aoCriarNegocio={criarNegocio ? () => criarNegocio(p.resumo.pessoa) : undefined} capacidades={p.acoes.capacidades}
              aGuardar={reabrir.aGuardar}
            />
            <ErroAcao chave={reabrir.erro} chaveExtra={reabrir.erroExtra} className="px-6 pb-3" />
            {aviso}
            <div className="mt-3 px-6"><PercursoPessoa resumo={p.resumo} /></div>
            {todosNegociosPerdidos(p.resumo) && <AvisoNegociosPerdidos aoMarcar={(origem) => abrir("encerrar", origem)} />}
            {paineis}
            {acao === "chamada" ? formChamada : <AbasFicha {...abasProps} />}
          </>
        )}
      </div>
      <DialogoResultadoVisita
        visita={visitaAberta} pessoa={p.resumo.pessoa} comNegocioAberto={p.resumo.abertos.length > 0} aoGuardar={p.acoes.registarResultadoVisita}
        aoFechar={() => setVisitaDoResultado(null)} aoAnunciar={anunciar}
      />
      <div role="status" className="sr-only">{texto}</div>
    </AnuncioFichaContext.Provider>
  );
}
