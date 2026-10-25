// O interior da ficha da pessoa: cabeçalho, barra de ações, percurso, os painéis de ação (em linha) e as abas fixas. Tudo
// vai num único contentor que rola, para o painel de chamada e o "Guardar" ficarem alcançáveis com zoom ou em ecrãs baixos.
// Com o guia (`comGuia`, a ficha real) é UM só ecrã: o topo é o guia (da pessoa, ou do negócio aberto) com o cabeçalho, as fases, o passo e o cartão do
// cliente; por baixo vêm os painéis em linha e a zona de apoio (alertas, secções recolhíveis e as abas Visitas, Negócios, Submissões e Atividade).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { MaisItensFicha } from "./CarregarMais";
import { AbaVisitasFicha } from "./AbaVisitasFicha";
import { AtividadeFicha } from "./AtividadeFicha";
import { contarVisitasAtivas, visitasDaFicha } from "./proximaVisita";
import { AvisoNegociosPerdidos } from "./AvisoNegociosPerdidos";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { CabecalhoFicha } from "./CabecalhoFicha";
import { useCabecalhoGuiaFicha } from "./CabecalhoGuiaFicha";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { ErroAcao } from "./ErroAcao";
import { todosNegociosPerdidos } from "./etapaPessoa";
import { FichaNegocios, LINHA_NEGOCIO } from "./FichaNegocios";
import { ListaNegociosComLixo } from "./ListaNegociosComLixo";
import { FichaNotas, FichaSubmissoes } from "./FichaSubmissoesNotas";
import { textoPendentes } from "./formatoPessoas";
import type { TeclaNavegacao, Vizinhas } from "./navegacaoFicha";
import type { AcaoFicha, AcoesFicha } from "./PainelBase";
import { FormChamada } from "./FormChamada";
import { GuiaDaPessoa } from "./GuiaDaPessoa";
import { PainelAcaoFicha, type AcaoPainel } from "./PainelAcaoFicha";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { PercursoPessoa } from "./PercursoPessoa";
import { itensDaPessoa } from "./processo/itensProcesso";
import { passoDoItem } from "./processo/passosProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import type { ItemAtividade, NotaPessoa, Pessoa, ResumoPessoa, Submissao } from "./pessoasTipos";
import { ResumoFicha } from "./ResumoFicha";
import { useExecutarAcao } from "./useExecutarAcao";
import { useAnuncios, usePaineis } from "./useFichaPaineis";

type AbaFicha = "resumo" | "visitas" | "negocios" | "submissoes" | "notas" | "atividade";

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
  /** O negócio a abrir logo à entrada (vindo do Quadro ou da Lista, `?negocio=`): a ficha abre na aba Negócios com ele aberto. */
  negocioInicial?: string | null;
  /** «Carregar mais» por secção (a ficha real); sem isto (o exemplo) não há botões. */
  maisItens?: MaisItensFicha;
  /** A atualização em segundo plano falhou e a ficha mostra os últimos dados: um aviso com «Tentar de novo». */
  avisoAtualizacao?: { aoRepetir: () => void };
  /** O separador Submissões da ficha real (só leitura); sem isto vale o das submissões pendentes. Aparece com `podeVerSubmissoes`. */
  separadorSubmissoes?: SeparadorSubmissoesReal;
  /** A identidade da pessoa (a ficha real: empresa ou pessoa singular, com edição), no Resumo antes do contacto. */
  identidade?: ReactNode;
  /**
   * O guia do passo seguinte (a ficha real): no topo do Resumo da pessoa em abordagem e no negócio aberto, com um só botão primário que faz o passo no
   * próprio ecrã. Ligado, os botões soltos do passo nas secções das visitas saem (era o mesmo passo duas vezes). Sem isto (o exemplo) fica como estava.
   */
  comGuia?: boolean;
}

interface AbasProps extends FichaInteriorProps {
  aba: AbaFicha;
  aoMudar: (a: AbaFicha) => void;
  negocioAberto: string | null;
  aoAbrirNegocio: (id: string) => void;
  aoVoltarNegocio: () => void;
  /** Abre o diálogo do resultado de uma visita. */
  aoRegistarResultado: (visitaId: string) => void;
  /** O guia do passo seguinte da pessoa em abordagem abre daqui o formulário «Registar chamada» da ficha. */
  aoRegistarChamada: (origem: HTMLElement | null) => void;
  /** O «Marcar como perdido» do guia (encerrar a abordagem de uma lead); ausente quando a pessoa não se encerra. */
  aoEncerrar?: (origem: HTMLElement | null) => void;
}

/** O negócio aberto, no topo da ficha com o guia: o guia do negócio é o cabeçalho (o nome da pessoa, o serviço, as fases, o passo). */
function NegocioAbertoNoTopo(p: AbasProps & { cabecalhoFicha: PecasCabecalhoFicha; negocio: NegocioMes }) {
  // O item do processo do negócio aberto (o mesmo do Quadro): dá ao passo seguinte o botão que o executa.
  const extras = useExtrasProcesso();
  const item = useMemo(
    () => itensDaPessoa(p.resumo, p.hoje, extras).find((i) => i.id === p.negocio.id),
    [p.resumo, p.hoje, extras, p.negocio.id],
  );
  return (
    <DetalheNegocioFicha
      negocio={p.negocio} hoje={p.hoje} aoVoltar={p.aoVoltarNegocio} item={item} pessoa={p.resumo.pessoa} atividade={p.atividade} comGuia
      cabecalhoFicha={p.cabecalhoFicha} aoApagado={p.aoVoltarNegocio}
    />
  );
}

/**
 * A aba Negócios: a lista, ou o negócio aberto (com "Voltar aos negócios"). Com o guia o negócio aberto vive no topo da ficha: a aba lista só os
 * OUTROS e diz qual está aberto em cima (nunca o repete).
 */
function ConteudoNegocios(p: AbasProps) {
  const { t } = useTranslation();
  const aberto = p.resumo.negocios.find((n) => n.id === p.negocioAberto);
  const abertoEmCima = p.comGuia && aberto ? aberto : undefined;
  // Depois de mandar um negócio para o lixo o detalhe fecha-se e o foco perde-se: a lista que aparece leva-o para o filtro (só nesse caso).
  const [focarFiltro, setFocarFiltro] = useState(false);
  const focado = useCallback(() => setFocarFiltro(false), []);
  // O item do processo do negócio aberto (o mesmo do Quadro): dá ao passo seguinte o botão que o executa.
  const extras = useExtrasProcesso();
  const item = useMemo(
    () => itensDaPessoa(p.resumo, p.hoje, extras).find((i) => i.id === p.negocioAberto),
    [p.resumo, p.hoje, extras, p.negocioAberto],
  );
  // Sem a capacidade «negocios» (a ficha real, até ao P3) a lista só se lê: o detalhe e as ações do negócio ainda não existem na base.
  if (!aberto || abertoEmCima) {
    const outros = abertoEmCima ? p.resumo.negocios.filter((n) => n.id !== abertoEmCima.id) : p.resumo.negocios;
    // A lista normal, com o filtro «Lixo» para quem pode restaurar (na ficha real; no exemplo é só a lista).
    return (
      <ListaNegociosComLixo
        pessoaId={p.resumo.pessoa.id} pessoaNome={p.resumo.pessoa.nome} focarAoEntrar={focarFiltro} aoFocado={focado}
        lista={(
          <>
            {abertoEmCima && <p className="mb-3 text-sm text-muted-foreground">{t("pessoasPagina.dealsList.openOnTop", { service: abertoEmCima.servico })}</p>}
            {(!abertoEmCima || outros.length > 0) && (
              <FichaNegocios negocios={outros} hoje={p.hoje} aoAbrir={p.acoes.capacidades?.negocios === false ? undefined : p.aoAbrirNegocio} />
            )}
          </>
        )}
      />
    );
  }
  return (
    <DetalheNegocioFicha
      negocio={aberto} hoje={p.hoje} aoVoltar={p.aoVoltarNegocio} item={item} pessoa={p.resumo.pessoa} atividade={p.atividade}
      aoApagado={() => { setFocarFiltro(true); p.aoVoltarNegocio(); }}
    />
  );
}

/** As abas por esta ordem: Resumo, Visitas, Negócios, Submissões, Notas e Atividade (com o guia, sem o Resumo: o que sobrava dele vem antes das abas). A lista de abas fica fixa no topo ao rolar. */
function AbasFicha(p: AbasProps) {
  const { t } = useTranslation();
  const { resumo, submissoes, notas, atividade } = p;
  const comNotas = p.comNotas ?? true;
  const verSubmissoes = () => p.aoMudar("submissoes");
  const real = p.separadorSubmissoes;
  const pendentes = real ? real.pendentes : submissoes.length;
  const nVisitas = contarVisitasAtivas(visitasDaFicha(resumo));
  const maisVisitas = p.maisItens?.visitas?.temMais === true;
  const resumoFicha = (
    <ResumoFicha
      resumo={resumo} hoje={p.hoje} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={pendentes}
      aoVerSubmissoes={verSubmissoes} aoVerVisitas={() => p.aoMudar("visitas")} alterarVisita={p.acoes.capacidades?.visita === false ? undefined : p.acoes.alterarVisita}
      visitasNaBase={p.acoes.capacidades?.gerirVisitas === true} cancelarVisita={p.acoes.capacidades?.gerirVisitas === true ? p.acoes.cancelarVisita : undefined}
      aoRegistarResultado={p.aoRegistarResultado} maisItens={p.maisItens} identidade={p.identidade} semBotaoDoPasso={p.comGuia === true} modoApoio={p.comGuia === true}
    />
  );
  return (
    <>
    {p.comGuia && <div className="px-6 pt-4">{resumoFicha}</div>}
    <Tabs value={p.aba} onValueChange={(v) => p.aoMudar(v as AbaFicha)} className="mt-2 flex flex-col">
      <ListaAbas aria-label={t("pessoasPagina.fichaTabs.label")} className="sticky top-0 z-10 shrink-0 bg-background px-6">
        {!p.comGuia && <Aba value="resumo" rotulo={t("pessoasPagina.fichaTabs.summary")} />}
        <Aba
          value="visitas" rotulo={t("pessoasPagina.fichaTabs.visits")} contador={nVisitas} contadorMais={maisVisitas}
          contadorLeitor={maisVisitas ? t("pessoasPagina.fichaTabs.visits.more", { n: nVisitas }) : undefined}
        />
        <Aba value="negocios" rotulo={t("pessoasPagina.fichaTabs.deals")} contador={resumo.negocios.length} />
        {p.podeVerSubmissoes && (
          <Aba
            value="submissoes" rotulo={t("pessoasPagina.fichaTabs.subs")} contador={real ? real.total ?? undefined : submissoes.length}
            contadorLeitor={!real && submissoes.length > 0 ? textoPendentes(t, submissoes.length) : undefined}
            novo={pendentes > 0}
          />
        )}
        {comNotas && <Aba value="notas" rotulo={t("pessoasPagina.fichaTabs.notes")} contador={notas.length} />}
        <Aba value="atividade" rotulo={t("pessoasPagina.fichaTabs.activity")} contador={atividade.length} />
      </ListaAbas>
      <div data-foco-ficha tabIndex={-1} className="px-6 pb-6 outline-none">
        {!p.comGuia && <TabsContent value="resumo" className="mt-0">{resumoFicha}</TabsContent>}
        <TabsContent value="visitas" className="mt-0 pt-4">
          <AbaVisitasFicha
            resumo={resumo} hoje={p.hoje} alterarVisita={p.acoes.capacidades?.visita === false ? undefined : p.acoes.alterarVisita}
            visitasNaBase={p.acoes.capacidades?.gerirVisitas === true} cancelarVisita={p.acoes.capacidades?.gerirVisitas === true ? p.acoes.cancelarVisita : undefined}
            aoRegistarResultado={p.aoRegistarResultado} maisItens={p.maisItens}
          />
        </TabsContent>
        <TabsContent value="negocios" className="mt-0 pt-4"><ConteudoNegocios {...p} /></TabsContent>
        <TabsContent value="submissoes" className="mt-0 pt-4">
          {real ? real.conteudo : (
            <FichaSubmissoes
              submissoes={submissoes} hoje={p.hoje} pessoas={p.pessoas} aoPedir={(id) => p.aoPedir(id, resumo.pessoa.id)} aoVerTodas={p.aoVerTodasSubmissoes}
            />
          )}
        </TabsContent>
        {comNotas && (
          <TabsContent value="notas" className="mt-0 pt-4">
            <FichaNotas notas={notas} hoje={p.hoje} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
          </TabsContent>
        )}
        <TabsContent value="atividade" className="mt-0 pt-4"><AtividadeFicha itens={atividade} hoje={p.hoje} mais={p.maisItens?.atividade} /></TabsContent>
      </div>
    </Tabs>
    </>
  );
}

/** Abrir um negócio dentro da ficha e voltar à lista com o foco na mesma linha. Mudar de aba fecha o negócio aberto. */
function useNegocioAberto() {
  const [aberto, setAberto] = useState<string | null>(null);
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    if (aberto !== null || ultimo.current === null) return;
    document.querySelector<HTMLElement>(`[${LINHA_NEGOCIO}="${ultimo.current}"]`)?.focus();
    ultimo.current = null;
  }, [aberto]);
  return {
    aberto,
    abrir: (id: string) => { ultimo.current = id; setAberto(id); },
    voltar: () => setAberto(null),
    esquecer: () => { ultimo.current = null; setAberto(null); },
  };
}

/** Quando a pessoa ganha um negócio (um "Criar negócio" que acaba de terminar), a ficha passa à aba Negócios para o mostrar. */
function useAbrirNegociosAoCriar(resumo: ResumoPessoa, esquecer: () => void, irParaNegocios: () => void) {
  const antes = useRef({ id: resumo.pessoa.id, n: resumo.negocios.length });
  const n = resumo.negocios.length;
  useEffect(() => {
    const anterior = antes.current;
    antes.current = { id: resumo.pessoa.id, n };
    if (anterior.id === resumo.pessoa.id && n > anterior.n) { esquecer(); irParaNegocios(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a mudar o número de negócios da mesma pessoa
  }, [n, resumo.pessoa.id]);
}

export function FichaInterior(p: FichaInteriorProps) {
  const { t } = useTranslation();
  // Com o guia não há aba Resumo: a aba inicial é a dos negócios (a mais usada).
  const [aba, setAba] = useState<AbaFicha>(p.comGuia ? "negocios" : "resumo");
  const negocio = useNegocioAberto();
  const painelId = useId();
  const { texto, anunciar } = useAnuncios(p.anuncioExterno);
  // A visita a que se regista o resultado (o diálogo vive aqui, dentro da ficha, para o aviso sair na região da ficha).
  const [visitaDoResultado, setVisitaDoResultado] = useState<string | null>(null);
  const visitaAberta = p.resumo.registos.visitas.find((v) => v.id === visitaDoResultado) ?? null;
  useEffect(() => { if (p.anuncioProcesso) anunciar(p.anuncioProcesso); }, [p.anuncioProcesso, anunciar]);
  const { acao, visitados, abrir, fechar, mudarConteudo } = usePaineis(p.fecharPainel, anunciar);
  useAbrirNegociosAoCriar(p.resumo, negocio.esquecer, () => setAba("negocios"));
  // Vindo de um cartão do Quadro ou de uma linha da Lista: abre já a aba Negócios com ESSE negócio aberto, e não só a pessoa. Um negócio que
  // acabou de se criar só chega à ficha depois de ela se refazer: quando aparece, abre-se (depois de `useAbrirNegociosAoCriar`, que fecha o aberto).
  const negocioPedidoExiste = !!p.negocioInicial && p.resumo.negocios.some((n) => n.id === p.negocioInicial);
  useEffect(() => {
    if (!p.negocioInicial) return;
    setAba("negocios");
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
  const cabecalhoFicha = useCabecalhoGuiaFicha({
    resumo: p.resumo, vizinhas: p.vizinhas, aoIr: p.aoIr, aberta: acao, painelId, aoAbrir: abrir, aoReativar: reativar,
    aoCriarNegocio: criarNegocio ? () => criarNegocio(p.resumo.pessoa) : undefined, capacidades: p.acoes.capacidades, aGuardar: reabrir.aGuardar,
    comItemChamada: negocioDoTopo !== null || !itemPessoa || passoDoItem(itemPessoa).id !== "registarChamada",
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
  const abasProps = {
    ...p, aba, aoMudar: (a: AbaFicha) => { if (!p.comGuia) negocio.esquecer(); setAba(a); }, negocioAberto: negocio.aberto,
    aoAbrirNegocio: negocio.abrir, aoVoltarNegocio: negocio.voltar, aoRegistarResultado: setVisitaDoResultado,
    aoRegistarChamada: (origem: HTMLElement | null) => abrir("chamada", origem),
    aoEncerrar: podeEncerrar ? (origem: HTMLElement | null) => abrir("encerrar", origem) : undefined,
  };
  const formChamada = (
    <FormChamada
      id={`${painelId}-chamada`} pessoa={p.resumo.pessoa} resumo={p.resumo} hoje={p.hoje} acoes={p.acoes} aoFechar={() => fechar(true)}
      aoConcluir={(mensagem) => { anunciar(mensagem); negocio.esquecer(); if (!p.comGuia) setAba("resumo"); fechar(true); }}
    />
  );
  return (
    <AnuncioFichaContext.Provider value={anunciar}>
      <div className="flex min-h-0 flex-1 scroll-pt-14 flex-col overflow-y-auto">
        {p.comGuia ? (
          <>
            <div className="px-6 empty:hidden"><ErroAcao chave={reabrir.erro} chaveExtra={reabrir.erroExtra} className="pb-3" /></div>
            {aviso && <div className="pt-3">{aviso}</div>}
            {todosNegociosPerdidos(p.resumo) && <AvisoNegociosPerdidos aoMarcar={(origem) => abrir("encerrar", origem)} />}
            {/* O topo: o guia do negócio aberto, ou o da pessoa. É o único cabeçalho, a única barra de fases e o único cartão do cliente. */}
            <div className="px-6 pb-2 pt-6">
              {negocioDoTopo ? (
                <NegocioAbertoNoTopo key={negocioDoTopo.id} {...abasProps} negocio={negocioDoTopo} cabecalhoFicha={cabecalhoFicha} />
              ) : (
                <GuiaDaPessoa
                  resumo={p.resumo} hoje={p.hoje} atividade={p.atividade} capacidades={p.acoes.capacidades} aoRegistarChamada={(origem) => abrir("chamada", origem)}
                  aoCriarNegocio={p.aoCriarNegocio} aoEncerrar={podeEncerrar ? (origem) => abrir("encerrar", origem) : undefined}
                  aoAdiar={(origem) => abrir("adiar", origem)} cabecalhoFicha={cabecalhoFicha}
                />
              )}
            </div>
            {paineis}
            {/* A zona de apoio (alertas e abas) fica sempre por baixo do guia, com ou sem negócio aberto; a chamada substitui-a (o guia fica à vista). */}
            {acao === "chamada" ? formChamada : <AbasFicha {...abasProps} />}
          </>
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
