import { useMemo, useRef, type RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { MIN_PESQUISA, type FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useListaPessoas, type ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { Button } from "@/components/ui/button";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { FOCO } from "@/components/negocio-metas/estilos";
import { BarraListaReal } from "./BarraListaReal";
import { AcoesCabecalhoPessoas } from "./AcoesCabecalhoPessoas";
import { BarraProgresso } from "./BarraProgresso";
import { DialogoColunasPessoas } from "./DialogoColunasPessoas";
import { FichaReal } from "./FichaReal";
import { FiltrosExtraReal } from "./FiltrosExtraReal";
import type { AoAbrirPessoa } from "./LinhaListaReal";
import { RodapeListaReal } from "./RodapeListaReal";
import { TabelaListaReal } from "./TabelaListaReal";
import { TabelaListaRealComDados } from "./TabelaListaRealComDados";
import { useColunasPessoas } from "./useColunasPessoas";
import { useFiltrosLista } from "./useFiltrosLista";
import { useFocoRodape } from "./useFocoRodape";
import { usePessoaAberta } from "./usePessoaAberta";

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
 * A Lista real das Pessoas (/pessoas), só a lista, página a página, ligada à base por useListaPessoas. Em modo real o nome de cada linha abre a ficha da pessoa
 * (P2, `?open=<uuid>`); o resto da página não muda ao abrir e fechar (os filtros ficam).
 */
export function PessoasReal() {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const comFicha = fonte.modo === "real";
  const colunas = useColunasPessoas(fonte.modo === "real" ? fonte.organizationId : null);
  const utilizadorId = fonte.modo === "real" ? (fonte.utilizadorId ?? null) : null;
  const f = useFiltrosLista(utilizadorId);
  // /pessoas é só a Lista: o Quadro vive em /pipeline (PipelineReal) e esta página nunca o consulta.
  const lista = useListaPessoas(f.filtros, true);
  const aberta = usePessoaAberta();
  const { aoAbrir, abertaId } = aberta;
  // As setas da ficha seguem as pessoas visíveis: as linhas carregadas.
  const idsVisiveis = useMemo(() => lista.linhas.map((l) => l.id), [lista.linhas]);
  const tabelaRef = useRef<HTMLDivElement>(null);
  const botaoMaisRef = useRef<HTMLButtonElement>(null);
  const repetirRef = useRef<HTMLButtonElement>(null);
  const aoPedirMais = useFocoRodape(lista, { botaoMais: botaoMaisRef, repetir: repetirRef, tabela: tabelaRef });
  const contagem = t(`${R}subtitle`, { n: lista.linhas.length });
  const dicaPendente = f.pesquisa.trim().length > 0 && f.pesquisa.trim().length < MIN_PESQUISA;
  const anuncio = [
    contagem,
    t(`${R}orderAnnounce`, { ordem: t(`${R}order.${f.filtros.ordem}`) }),
    textoEstado(t, lista),
    dicaPendente ? t(`${R}searchHint`) : "",
  ].filter(Boolean).join(". ");
  const conteudo = (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <CabecalhoPagina
        subtitulo={contagem} titulo={t(`${R}title`)} aviso={null} pai={{ to: "/pessoas", texto: t("sidebar.crm") }}
        acoes={comFicha ? <AcoesCabecalhoPessoas aoAbrirPessoa={aoAbrir} aoAnunciar={aberta.anunciar} /> : undefined}
      />
      <BarraListaReal
        pesquisa={f.pesquisa} papel={f.filtros.papel} etapa={f.filtros.etapa} ordem={f.filtros.ordem}
        aoMudarPesquisa={f.mudarPesquisa} aoMudarPapel={f.mudarPapel} aoMudarEtapa={f.mudarEtapa} aoMudarOrdem={f.mudarOrdem}
        etapaNova={comFicha ? t(`${R}board.colNew`) : undefined}
      />
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
      {/* Sempre montado: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
      <div role="status" aria-live="polite" className="sr-only">{anuncio}</div>
      {/* A mensagem de uma ação (lead criada, dados atualizados) tem a sua região: ao retirar-se aos 4 s não mexe na das contagens, que o leitor releria. */}
      <div aria-live="polite" className="sr-only">{aberta.mensagemAcao}</div>
      <Corpo
        lista={lista} filtros={f.filtros} tabelaRef={tabelaRef} aoLimpar={f.limpar} aoAbrir={comFicha ? aoAbrir : undefined}
        colunas={colunas.visiveis} comDados={comFicha}
      />
      <RodapeListaReal lista={lista} botaoMaisRef={botaoMaisRef} repetirRef={repetirRef} aoPedirMais={aoPedirMais} />
    </div>
  );
  if (!comFicha) return conteudo;
  // Com uma pessoa aberta a ficha toma o lugar da lista, na área de conteúdo (a lista fica montada, escondida).
  return (
    <FichaReal
      pessoaId={abertaId} idsVisiveis={idsVisiveis} aoFechar={aberta.fechar} aoIrPara={aberta.aoIrPara} aoLimpar={aberta.limpar}
      origemFoco={aberta.origemFoco} negocioInicial={aberta.negocioId} aoAbrirNegocio={aberta.aoAbrirNegocio}
      voltaPara="pessoas" tituloPagina={t(`${R}title`)}
    >
      {conteudo}
    </FichaReal>
  );
}
