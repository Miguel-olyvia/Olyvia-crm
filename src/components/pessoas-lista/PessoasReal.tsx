import { useRef, type RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { MIN_PESQUISA, type FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { useListaPessoas, type ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { FOCO } from "@/components/negocio-metas/estilos";
import { BarraListaReal } from "./BarraListaReal";
import { BarraProgresso } from "./BarraProgresso";
import { RodapeListaReal } from "./RodapeListaReal";
import { TabelaListaReal } from "./TabelaListaReal";
import { useFiltrosLista } from "./useFiltrosLista";
import { useFocoRodape } from "./useFocoRodape";

const R = "pessoasPagina.real.";

function BotaoRepetir({ aoRepetir }: { aoRepetir: () => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoRepetir}>
      {t(`${R}retry`)}
    </Button>
  );
}

const temFiltros = (f: FiltrosLista): boolean => f.papel !== null || f.etapa !== null || f.pesquisa.trim().length >= MIN_PESQUISA;

interface CorpoProps {
  lista: ListaPessoas;
  filtros: FiltrosLista;
  tabelaRef: RefObject<HTMLDivElement>;
  aoLimpar: () => void;
}

// Os avisos visíveis não levam role: as mesmas mensagens são anunciadas pelo contentor live da página.
function Corpo({ lista, filtros, tabelaRef, aoLimpar }: CorpoProps) {
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
      <TabelaListaReal ref={tabelaRef} linhas={lista.linhas} ocupada={lista.aMostrarAnterior} />
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

/** A Lista real das Pessoas (P1): só leitura, página a página, ligada à base por useListaPessoas. */
export function PessoasReal() {
  const { t } = useTranslation();
  const f = useFiltrosLista();
  const lista = useListaPessoas(f.filtros);
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
  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <CabecalhoPagina
        subtitulo={contagem} titulo={t(`${R}title`)} aviso={null} pai={{ to: "/leads", texto: t("sidebar.crm") }}
      />
      <BarraListaReal
        pesquisa={f.pesquisa} papel={f.filtros.papel} etapa={f.filtros.etapa} ordem={f.filtros.ordem}
        aoMudarPesquisa={f.mudarPesquisa} aoMudarPapel={f.mudarPapel} aoMudarEtapa={f.mudarEtapa} aoMudarOrdem={f.mudarOrdem}
      />
      {/* Sempre montado: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{anuncio}</div>
      <Corpo lista={lista} filtros={f.filtros} tabelaRef={tabelaRef} aoLimpar={f.limpar} />
      <RodapeListaReal lista={lista} botaoMaisRef={botaoMaisRef} repetirRef={repetirRef} aoPedirMais={aoPedirMais} />
    </div>
  );
}
