import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { MIN_PESQUISA, type FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useListaPessoas, type ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { useQuadroPessoas } from "@/hooks/pessoas/useQuadroPessoas";
import { usePermissaoQuadro } from "@/hooks/pessoas/usePodeVerQuadro";
import type { VistaPessoas } from "@/components/pessoas/pessoasTipos";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/PermissionGate";
import { NovaLeadReal } from "@/components/pessoas-leads/NovaLeadReal";
import { BotaoWorkflowPessoas } from "@/components/pessoas-workflow/BotaoWorkflowPessoas";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { FOCO } from "@/components/negocio-metas/estilos";
import { usePessoasUrl } from "@/components/pessoas/usePessoasUrl";
import { BarraListaReal } from "./BarraListaReal";
import { BarraProgresso } from "./BarraProgresso";
import { DialogoColunasPessoas } from "./DialogoColunasPessoas";
import { FichaReal } from "./FichaReal";
import { FiltrosExtraReal } from "./FiltrosExtraReal";
import type { AoAbrirPessoa } from "./LinhaListaReal";
import { QuadroReal, textoEstadoQuadro } from "./QuadroReal";
import { RodapeListaReal } from "./RodapeListaReal";
import { TabelaListaReal } from "./TabelaListaReal";
import { TabelaListaRealComDados } from "./TabelaListaRealComDados";
import { useColunasPessoas } from "./useColunasPessoas";
import { useFiltrosLista } from "./useFiltrosLista";
import { useFocoRodape } from "./useFocoRodape";
import { useMensagemAnunciada } from "./useMensagemAnunciada";
import { useVistaReal } from "./useVistaReal";

const R = "pessoasPagina.real.";

function BotaoRepetir({ aoRepetir }: { aoRepetir: () => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoRepetir}>
      {t(`${R}retry`)}
    </Button>
  );
}

const temFiltros = (f: FiltrosLista): boolean =>
  f.papel !== null || f.etapa !== null || f.pesquisa.trim().length >= MIN_PESQUISA
  || f.atribuidoA !== null || f.formularioId !== null || f.ultimoResultado !== null || f.voltou || f.atrasada;

interface CorpoProps {
  lista: ListaPessoas;
  filtros: FiltrosLista;
  tabelaRef: RefObject<HTMLDivElement>;
  aoLimpar: () => void;
  /** Abre a ficha de uma pessoa; sem isto (fora do modo real) o nome das linhas é texto simples. */
  aoAbrir?: AoAbrirPessoa;
  /** As colunas visíveis, por ordem. Deve ser estável (useMemo): a tabela e as linhas estão em memória. */
  colunas: readonly IdColuna[];
  /** Em modo real: lê, por página, os contactos e os nomes dos comerciais das colunas visíveis. */
  comDados: boolean;
}

// Os avisos visíveis não levam role: as mesmas mensagens são anunciadas pelo contentor live da página.
function Corpo({ lista, filtros, tabelaRef, aoLimpar, aoAbrir, colunas, comDados }: CorpoProps) {
  const { t } = useTranslation();
  if (lista.erroSemDados) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <p>{t(lista.erro?.chave ?? `${R}error`)}</p>
        <BotaoRepetir aoRepetir={lista.recarregar} />
      </div>
    );
  }
  if (lista.isLoading) return <p className="p-4 text-sm text-muted-foreground">{t(`${R}loading`)}</p>;
  if (lista.linhas.length === 0) {
    if (lista.aMostrarAnterior) return <BarraProgresso />;
    if (temFiltros(filtros)) {
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm">
          <p>{t(`${R}emptyFiltered`)}</p>
          <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoLimpar}>{t(`${R}clearFilters`)}</Button>
        </div>
      );
    }
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm">{t(`${R}empty`)}</p>;
  }
  return (
    <div className="space-y-3">
      {lista.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p>{t(`${R}refreshWarn`)}</p>
          <BotaoRepetir aoRepetir={lista.recarregar} />
        </div>
      )}
      {comDados ? (
        <TabelaListaRealComDados ref={tabelaRef} linhas={lista.linhas} ocupada={lista.aMostrarAnterior} aoAbrir={aoAbrir} colunas={colunas} />
      ) : (
        <TabelaListaReal ref={tabelaRef} linhas={lista.linhas} ocupada={lista.aMostrarAnterior} aoAbrir={aoAbrir} colunas={colunas} />
      )}
    </div>
  );
}

/** A mensagem de estado que o contentor live anuncia (uma de cada vez, por ordem de importância). */
function textoEstado(t: ReturnType<typeof useTranslation>["t"], lista: ListaPessoas): string {
  if (lista.erroAoCarregarMais) return t(`${R}loadMoreError`);
  if (lista.isFetchingMore) return t(`${R}loadingMore`);
  if (lista.aMostrarAnterior) return t(`${R}updating`);
  if (lista.isLoading) return t(`${R}loading`);
  if (lista.isError && !lista.erroSemDados) return t(`${R}refreshWarn`);
  return "";
}

/**
 * A Lista real das Pessoas, página a página, ligada à base por useListaPessoas. Em modo real o nome de cada linha abre a ficha da pessoa
 * (P2, `?open=<uuid>`); o resto da página não muda ao abrir e fechar (os filtros ficam).
 */
export function PessoasReal() {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const comFicha = fonte.modo === "real";
  const colunas = useColunasPessoas(fonte.modo === "real" ? fonte.organizationId : null);
  const url = usePessoasUrl(false);
  const utilizadorId = fonte.modo === "real" ? (fonte.utilizadorId ?? null) : null;
  const f = useFiltrosLista(utilizadorId);
  // O Quadro só existe em modo real e com `pessoas.view`; só a vista visível consulta (a outra fica em cache, sem pedidos dentro do staleTime).
  const { pode: podeVer, aCarregar: permissoesACarregar } = usePermissaoQuadro();
  const podeQuadro = comFicha && podeVer;
  // Com o Quadro guardado e as permissões a carregar espera-se (sem consultar nenhuma das vistas): decidir já mandava para a Lista e saltava depois.
  const aEsperarPermissoes = comFicha && permissoesACarregar;
  const { vista, mudar: mudarVistaGuardada } = useVistaReal(podeQuadro, aEsperarPermissoes);
  const noQuadro = vista === "quadro";
  const lista = useListaPessoas(f.filtros, !noQuadro);
  const quadroDaBase = useQuadroPessoas({ papel: f.filtros.papel, pesquisa: f.filtros.pesquisa, ordem: f.filtros.ordem }, noQuadro && !aEsperarPermissoes);
  const quadro = useMemo(() => (noQuadro && aEsperarPermissoes ? { ...quadroDaBase, isLoading: true } : quadroDaBase), [noQuadro, aEsperarPermissoes, quadroDaBase]);
  const { limparSoDaLista } = f;
  // O Quadro ignora a etapa e os filtros extra (só as minhas, atrasada, voltou, formulário, resultado): ao entrar nele limpam-se, para não ficarem
  // ativos sem se verem (os cartões apareciam todos, sem aviso) nem a Lista voltar com um filtro que o Quadro não mostrou.
  const mudarVista = useCallback((nova: VistaPessoas) => {
    if (nova === "quadro") limparSoDaLista();
    mudarVistaGuardada(nova);
  }, [limparSoDaLista, mudarVistaGuardada]);
  const { abrir, abertaId } = url;
  // `abrir` muda sempre que o ?open= muda; as linhas e a tabela estão em memória e só valem se o que lhes damos não mudar. Por isso o que
  // se passa é uma função estável que chama sempre o `abrir` mais recente (guardado depois de cada render, nunca durante).
  const abrirRef = useRef(abrir);
  const abertaRef = useRef(abertaId);
  useEffect(() => {
    abrirRef.current = abrir;
    abertaRef.current = abertaId;
  });
  // O botão clicado fica guardado AQUI, no clique: a ficha só abre quando os dados chegam e o foco já pode estar noutro sítio.
  const origemFoco = useRef<HTMLElement | null>(null);
  const aoAbrir = useCallback((id: string, origem?: HTMLElement) => {
    origemFoco.current = origem ?? null;
    abrirRef.current(id);
  }, []);
  const aoIrPara = useCallback((id: string) => abrirRef.current(id), []);
  // No Quadro o foco volta ao botão que abriu a ficha (o do nome ou o do passo), como na Lista.
  const aoAbrirQuadro = useCallback((pessoaId: string, negocioId?: string) => {
    origemFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abrirRef.current(pessoaId, negocioId);
  }, []);
  // O que a «Nova lead» anuncia (lead criada, dados atualizados) vai para o contentor live da página, a seguir ao resto.
  // A mensagem retira-se sozinha (não volta a ser lida com cada mudança seguinte da região) e duas iguais seguidas anunciam-se as duas.
  const { mensagem: mensagemAcao, anunciar: setMensagemAcao } = useMensagemAnunciada();
  // Depois de criar um negócio na ficha: o negócio novo vai para o endereço (`?negocio=`), na pessoa que está aberta.
  // Só se a pessoa aberta ainda é a do negócio (a gravação pode acabar depois de se trocar de pessoa).
  const aoAbrirNegocio = useCallback((negocioId: string, pessoaId: string) => {
    if (abertaRef.current === pessoaId) abrirRef.current(pessoaId, negocioId);
  }, []);
  // As setas da ficha seguem as pessoas visíveis: na Lista as linhas; no Quadro as pessoas únicas pela ordem das colunas (só as carregadas).
  const idsVisiveis = useMemo(
    () => (noQuadro ? [...new Set(quadro.cartoes.map((c) => c.pessoaId))] : lista.linhas.map((l) => l.id)),
    [noQuadro, quadro.cartoes, lista.linhas],
  );
  const tabelaRef = useRef<HTMLDivElement>(null);
  const botaoMaisRef = useRef<HTMLButtonElement>(null);
  const repetirRef = useRef<HTMLButtonElement>(null);
  const aoPedirMais = useFocoRodape(lista, { botaoMais: botaoMaisRef, repetir: repetirRef, tabela: tabelaRef });
  const contagem = noQuadro ? t(`${R}board.subtitle`, { n: quadro.cartoes.length }) : t(`${R}subtitle`, { n: lista.linhas.length });
  const dicaPendente = f.pesquisa.trim().length > 0 && f.pesquisa.trim().length < MIN_PESQUISA;
  const anuncio = [
    contagem,
    t(`${R}orderAnnounce`, { ordem: t(`${R}order.${f.filtros.ordem}`) }),
    noQuadro ? textoEstadoQuadro(t, quadro) : textoEstado(t, lista),
    dicaPendente ? t(`${R}searchHint`) : "",
  ].filter(Boolean).join(". ");
  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <CabecalhoPagina
        subtitulo={contagem} titulo={t(`${R}title`)} aviso={null} pai={{ to: "/leads", texto: t("sidebar.crm") }}
        acoes={comFicha ? (
          // Como em Leads: «Nova lead» só a quem pode criar leads e «Workflow» só a quem pode configurá-lo (`pessoas.config`, não a de Leads).
          // `comFicha` é o modo real, isto é, a organização com o novo fluxo ligado. No modo exemplo fica o `NovaLeadPainel` da página de exemplo.
          <>
            <PermissionGate permission="leads.create">
              <NovaLeadReal aoAbrirPessoa={aoAbrir} aoAnunciar={setMensagemAcao} />
            </PermissionGate>
            <PermissionGate permission="pessoas.config">
              <BotaoWorkflowPessoas />
            </PermissionGate>
          </>
        ) : undefined}
      />
      <BarraListaReal
        pesquisa={f.pesquisa} papel={f.filtros.papel} etapa={f.filtros.etapa} ordem={f.filtros.ordem}
        aoMudarPesquisa={f.mudarPesquisa} aoMudarPapel={f.mudarPapel} aoMudarEtapa={f.mudarEtapa} aoMudarOrdem={f.mudarOrdem}
        vista={vista} aoMudarVista={podeQuadro ? mudarVista : undefined} etapaNova={comFicha ? t(`${R}board.colNew`) : undefined}
      />
      {/* Os filtros extra e as colunas são da Lista: o Quadro lê só tipo, pesquisa e ordem. */}
      {!noQuadro && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FiltrosExtraReal
            filtros={f.filtros} soMinhas={f.soMinhas} podeSoMinhas={utilizadorId !== null} aoMudarSoMinhas={f.mudarSoMinhas}
            aoMudarAtrasada={f.mudarAtrasada} aoMudarVoltou={f.mudarVoltou} aoMudarFormulario={f.mudarFormulario}
            aoMudarResultado={f.mudarResultado} aoLimpar={f.limpar}
          />
          <DialogoColunasPessoas
            escolha={colunas.escolha} aoAlternar={colunas.alternar} aoMover={colunas.mover} aoMoverPara={colunas.moverPara} aoRepor={colunas.repor}
          />
        </div>
      )}
      {/* Sempre montado: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
      <div role="status" aria-live="polite" className="sr-only">{anuncio}</div>
      {/* A mensagem de uma ação (lead criada, dados atualizados) tem a sua região: ao retirar-se aos 4 s não mexe na das contagens, que o leitor releria. */}
      <div aria-live="polite" className="sr-only">{mensagemAcao}</div>
      {noQuadro ? (
        <QuadroReal
          quadro={quadro} aoAbrir={aoAbrirQuadro} aoLimpar={f.limpar}
          temFiltros={f.filtros.papel !== null || f.filtros.pesquisa.trim().length >= MIN_PESQUISA}
        />
      ) : (
        <>
          <Corpo
            lista={lista} filtros={f.filtros} tabelaRef={tabelaRef} aoLimpar={f.limpar} aoAbrir={comFicha ? aoAbrir : undefined}
            colunas={colunas.visiveis} comDados={comFicha}
          />
          <RodapeListaReal lista={lista} botaoMaisRef={botaoMaisRef} repetirRef={repetirRef} aoPedirMais={aoPedirMais} />
        </>
      )}
      {comFicha && (
        <FichaReal
          pessoaId={abertaId} idsVisiveis={idsVisiveis} aoFechar={url.fechar} aoIrPara={aoIrPara} aoLimpar={url.limpar} origemFoco={origemFoco}
          negocioInicial={url.negocioId} aoAbrirNegocio={aoAbrirNegocio}
        />
      )}
    </div>
  );
}
