import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BarraQuadro } from "./BarraQuadro";
import { BarraSelecao, LinkIrParaSelecao } from "./BarraSelecao";
import { ComparacaoNegocios } from "./ComparacaoNegocios";
import { EstadoVazioQuadro } from "./EstadoVazioQuadro";
import { ListaNegocios } from "./ListaNegocios";
import { PainelNegocio } from "./PainelNegocio";
import { QuadroNegocios } from "./QuadroNegocios";
import type { AcoesNegocio } from "./AcoesNegocio";
import type { NegocioMes } from "./negocioMetas";
import {
  SEM_FILTROS, alternarFase, alternarParaTratar, chipsDeFase, comerciaisDe, filtrarNegocios, filtrosAtivos,
  servicosDe, totaisPorFase, type FiltrosQuadro,
} from "./logicaQuadro";
import { ordenarNegocios, type Ordem } from "./ordenacaoQuadro";
import { useAtalhosQuadro } from "./useAtalhosQuadro";
import { useNegocioAberto } from "./useNegocioAberto";
import { useSelecaoNegocios } from "./useSelecaoNegocios";
import type { ModoVista } from "./vistaGuardada";

interface AbaQuadroProps {
  negocios: NegocioMes[];
  /** O dia de hoje (AAAA-MM-DD): todos os prazos e a saúde contam a partir dele. */
  hoje: string;
  /** Os filtros, o modo e a ordem vivem na página, que precisa deles para o resumo do topo e para o seletor ao lado das abas. */
  filtros: FiltrosQuadro;
  modo: ModoVista;
  ordem: Ordem | null;
  acoes: AcoesNegocio;
  aoMudarFiltros: (filtros: FiltrosQuadro) => void;
  aoMudarOrdem: (ordem: Ordem | null) => void;
  /** O negócio acabado de criar: ao abrir o painel dele, o foco vai para o título. */
  focarTituloDe?: string | null;
}

/** Tudo o que se calcula a partir dos negócios e dos filtros: linhas, chips e totais por fase. */
function useDadosQuadro({ negocios, hoje, filtros, ordem }: AbaQuadroProps) {
  const visiveis = useMemo(
    () => ordenarNegocios(filtrarNegocios(negocios, filtros, hoje), ordem, hoje),
    [negocios, filtros, ordem, hoje],
  );
  return {
    visiveis,
    chips: useMemo(() => chipsDeFase(negocios, filtros, hoje), [negocios, filtros, hoje]),
    totaisFase: useMemo(() => totaisPorFase(negocios, filtros, hoje), [negocios, filtros, hoje]),
    comerciais: useMemo(() => comerciaisDe(negocios), [negocios]),
    servicos: useMemo(() => servicosDe(negocios), [negocios]),
  };
}

const primeiroCartao = (raiz: RefObject<HTMLElement>) =>
  raiz.current?.querySelector<HTMLElement>("[data-cartao]") ?? null;

/** Depois de limpar a seleção o foco não se perde: vai ao primeiro cartão ou, sem cartões (estado vazio), à pesquisa. */
function focarDepoisDeLimpar(raiz: RefObject<HTMLElement>, pesquisa: RefObject<HTMLElement>) {
  (primeiroCartao(raiz) ?? pesquisa.current)?.focus();
}

/** A seleção para comparar: negócios escolhidos, os ocultos pelos filtros, a dica do "c" e a limpeza com foco. */
function useSelecaoQuadro(
  negocios: NegocioMes[], visiveis: NegocioMes[], raiz: RefObject<HTMLElement>, pesquisa: RefObject<HTMLElement>,
) {
  const selecao = useSelecaoNegocios();
  const [comparando, setComparando] = useState(false);
  const [dicaVez, setDicaVez] = useState(0);
  const selecionados = selecao.ids
    .map((id) => negocios.find((n) => n.id === id))
    .filter((n): n is NegocioMes => n !== undefined);
  const ocultos = selecionados.filter((n) => !visiveis.some((v) => v.id === n.id)).length;
  // A dica "mínimo 2" apaga-se quando a seleção muda e volta, anunciada de novo, a cada "c".
  useEffect(() => setDicaVez(0), [selecao.ids.length]);
  const comparar = () => {
    if (selecionados.length >= 2) setComparando(true);
    else setDicaVez((v) => v + 1);
  };
  const limpar = () => {
    selecao.limpar();
    focarDepoisDeLimpar(raiz, pesquisa);
  };
  return { selecao, selecionados, ocultos, comparando, setComparando, comparar, limpar, dicaVez };
}

interface ConteudoProps {
  p: AbaQuadroProps;
  dados: ReturnType<typeof useDadosQuadro>;
  selecionados: ReadonlySet<string>;
  aoAlternarSelecao: (id: string) => void;
  aoAbrir: (n: NegocioMes) => void;
}

/** O Quadro, a Lista ou o estado vazio, conforme o modo e o que os filtros deixam ver. */
function Conteudo({ p, dados, selecionados, aoAlternarSelecao, aoAbrir }: ConteudoProps) {
  const { filtros, hoje, acoes, ordem, aoMudarFiltros, aoMudarOrdem } = p;
  const comFiltros = filtrosAtivos(filtros);
  const limpar = () => aoMudarFiltros(SEM_FILTROS);
  if (dados.visiveis.length === 0) {
    return (
      <EstadoVazioQuadro
        meus={filtros.meus} comFiltros={comFiltros}
        aoVerTodos={() => aoMudarFiltros({ ...filtros, meus: false })} aoLimpar={limpar}
      />
    );
  }
  const comum = {
    negocios: dados.visiveis, hoje, ocultarComercial: filtros.meus, acoes, selecionados, aoAbrir, aoAlternarSelecao,
  };
  return p.modo === "lista" ? (
    <ListaNegocios {...comum} ordem={ordem} totaisFase={dados.totaisFase} aoMudarOrdem={aoMudarOrdem} />
  ) : (
    <QuadroNegocios {...comum} fases={filtros.fases} aoLimpar={comFiltros ? limpar : undefined} />
  );
}

/** Aba Quadro: filtros, chips, o Quadro ou a Lista, o painel do negócio e a comparação. */
export function AbaQuadro(props: AbaQuadroProps) {
  const { negocios, hoje, filtros, ordem, acoes, aoMudarFiltros, aoMudarOrdem } = props;
  const { aberto, abrir, fechar } = useNegocioAberto(negocios);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pesquisa = useRef<HTMLInputElement>(null);
  const dados = useDadosQuadro(props);
  const sel = useSelecaoQuadro(negocios, dados.visiveis, raiz, pesquisa);
  const aoTeclar = useAtalhosQuadro(raiz, {
    pesquisa: () => pesquisa.current?.focus(),
    ajuda: () => setAjudaAberta((a) => !a),
    selecionar: sel.selecao.alternar,
    comparar: sel.comparar,
    abrir: (id) => { const n = negocios.find((x) => x.id === id); if (n) acoes.abrirNegocio(n); },
  });
  const mudarFiltros = (parcial: Partial<FiltrosQuadro>) => aoMudarFiltros({ ...filtros, ...parcial });
  const comSelecao = sel.selecao.ids.length > 0;

  return (
    <div ref={raiz} onKeyDown={aoTeclar} className={comSelecao ? "space-y-4 pb-32" : "space-y-4"}>
      {comSelecao && <LinkIrParaSelecao />}
      <BarraQuadro
        filtros={filtros} comerciais={dados.comerciais} servicos={dados.servicos}
        chipsFase={dados.chips.fases} chipParaTratar={dados.chips.paraTratar} ordem={ordem}
        total={dados.visiveis.length} pesquisaRef={pesquisa} ajudaAberta={ajudaAberta}
        aoMudarAjuda={setAjudaAberta} aoMudarFiltros={mudarFiltros}
        aoAlternarFase={(fase) => aoMudarFiltros(alternarFase(filtros, fase))}
        aoAlternarParaTratar={() => aoMudarFiltros(alternarParaTratar(filtros))}
        aoMudarOrdem={aoMudarOrdem}
        aoFocarPrimeiro={() => primeiroCartao(raiz)?.focus()}
        aoLimparTudo={() => aoMudarFiltros(SEM_FILTROS)}
      />
      <Conteudo
        p={props} dados={dados} selecionados={new Set(sel.selecao.ids)}
        aoAlternarSelecao={sel.selecao.alternar} aoAbrir={abrir}
      />
      <PainelNegocio
        negocio={aberto} hoje={hoje} acoes={acoes} aoFechar={fechar}
        focarTitulo={aberto !== null && aberto.id === props.focarTituloDe}
      />
      <BarraSelecao
        total={sel.selecao.ids.length} ocultos={sel.ocultos} recusado={sel.selecao.recusado}
        tentativas={sel.selecao.tentativas} dicaVez={sel.dicaVez} aoComparar={sel.comparar} aoLimpar={sel.limpar}
      />
      <ComparacaoNegocios negocios={sel.selecionados} hoje={hoje} aberta={sel.comparando} aoFechar={() => sel.setComparando(false)} />
    </div>
  );
}
