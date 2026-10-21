// O estado das abas Visita e Levantamento do «Novo negócio» da ficha real: o que se liga do que a pessoa já tem (contactos, visitas e um levantamento
// existente) e o que se cria de novo (visitas e um levantamento). As visitas e o levantamento novos reutilizam o estado do painel «Visita e levantamento»
// (`useEstadoNovoNegocio`). Só um levantamento: ou um que já existe, ou um novo, ou nenhum (a base recusa o segundo, NG004). Um levantamento novo só
// conta se for esse o escolhido: o que se escreveu e depois se deixou de escolher não se grava.
import { useMemo, useState } from "react";
import type { registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { camposDoLevantamento, visitasComCodigoPostalInvalido, visitasParaGuardar } from "@/components/negocio-metas/visitasNegocio";
import { ligarInicial, type LigarRegistos } from "@/components/negocio-metas/ligarNegocio";
import { validarLevantamento, type ErrosLevantamento } from "@/components/negocio-metas/levantamento";
import { useComercialDaSessao } from "@/hooks/pessoas/useComercialDaSessao";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { validarRespostas } from "@/components/negocio-metas/respostasQuestionario";
import { useLevantamentoForm, useMoradaForm, useRespostasForm, useVisitasForm } from "@/components/negocio-metas/useEstadoNovoNegocio";

/** O rascunho de quem não escolheu fazer um levantamento novo: não há passo de levantamento a gravar. */
const RASCUNHO_VAZIO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };

/**
 * A escolha de partida dos registos: os contactos e visitas por ligar marcados, e o levantamento mais recente (ou nenhum). Com a lista de
 * levantamentos incompleta (faltam páginas) não se propõe «o mais recente»: seria o mais recente dos carregados. «Fazer um novo» nunca é a partida.
 */
export function ligacaoInicial(porLigar: ReturnType<typeof registosPorLigar>, levantamentosCompletos: boolean): LigarRegistos {
  const inicial = ligarInicial(levantamentosCompletos ? porLigar : { ...porLigar, levantamentos: [] });
  return inicial.levantamento.tipo === "novo" ? { ...inicial, levantamento: { tipo: "dispensar" } } : inicial;
}

interface Opcoes {
  porLigar: ReturnType<typeof registosPorLigar>;
  levantamentosCompletos: boolean;
  /** AAAA-MM-DD (Lisboa): o dia de uma visita nova. */
  hoje: string;
  aoSujar: () => void;
}

export function useRegistosNovoNegocio({ porLigar, levantamentosCompletos, hoje, aoSujar }: Opcoes) {
  const [ligar, setLigar] = useState<LigarRegistos>(() => ligacaoInicial(porLigar, levantamentosCompletos));
  // O «Feito por» de uma visita nova parte de quem está na sessão (se for comercial) ou fica vazio: nunca de um nome de exemplo.
  const comercial = useComercialDaSessao();
  const vis = useVisitasForm(hoje, aoSujar, comercial);
  const lev = useLevantamentoForm(hoje, aoSujar, comercial);
  const resp = useRespostasForm(aoSujar);
  // A morada da obra acompanha as visitas novas, como no painel «Visita e levantamento».
  const morada = useMoradaForm(aoSujar, { visitas: vis.visitas });
  const levantamentoNovo = ligar.levantamento.tipo === "novo";
  const { questionario } = useQuestionario();
  // As respostas erradas só contam quando o levantamento novo é o escolhido (as que ficaram escritas e se deixaram de escolher não se gravam).
  const errosRespostas = levantamentoNovo ? validarRespostas(questionario, resp.respostas) : {};

  // A data, quem fez e o estado do levantamento derivam das visitas novas; as linhas e as observações são do formulário.
  const levantamento = useMemo(
    () => ({ ...lev.levantamento, ...camposDoLevantamento(vis.visitas, hoje, comercial) }),
    [lev.levantamento, vis.visitas, hoje, comercial],
  );
  const errosLevantamento: ErrosLevantamento = levantamentoNovo ? validarLevantamento(levantamento) : {};
  const visitasComCodigoPostal = visitasComCodigoPostalInvalido(vis.visitas);
  const rascunho: RascunhoLevantamento = levantamentoNovo
    ? { linhas: lev.levantamento.linhas, observacoes: lev.levantamento.observacoes, respostas: resp.respostas, moradaObra: morada.morada }
    : RASCUNHO_VAZIO;
  const visitasNovas: VisitaNegocio[] = visitasParaGuardar(vis.visitas);

  return {
    ligar,
    mudarLigar: (novo: LigarRegistos) => { aoSujar(); setLigar(novo); },
    vis, lev, resp, morada, levantamento, errosRespostas, levantamentoNovo, errosLevantamento, visitasComCodigoPostal, rascunho, visitasNovas,
    /** Há visitas novas ou um levantamento novo escolhido: então o plano corre em seco antes de criar o negócio. */
    temNovos: visitasNovas.length > 0 || levantamentoNovo,
  };
}
