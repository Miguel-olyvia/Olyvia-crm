// Liga a ficha do Pipeline ao negócio da Emylia: lê a organização (uma vez por sessão, relida ao abrir a ficha), diz em que fase da Emylia o negócio está
// (faseEmylia.ts) e faz AVANÇAR a fase no momento em que ela se conclui, gravando `negocios.fase` pelo armazém do Ben (neg_guardar_negocio):
//  - registar a chamada leva a 1 (Contacto), marcar a visita a 2 (Visita), guardar o levantamento a 3 (Negócio, com os dados de partida do CRM: passagemParaNegocio.ts);
//  - o avanço acontece quando a ação que conclui a fase se faz COM A FICHA ABERTA, nunca ao abrir a ficha (abrir não grava nada);
//  - de 3 em diante (Financeiro, Obra) avança o motor da Emylia, pelos seus botões.
// Para os casos antigos (levantamento já guardado e negócio preso na Visita) fica a saída «Passar para o Negócio» (`passar`), sempre visível, que nada bloqueia senão
// a falta de permissão, os documentos do CRM ou a leitura da organização (diz-se a razão). No fim de cada gravação invalida o quadro, para o cartão mudar de
// coluna. Sem QueryClient (um ecrã de exemplo) não invalida nada e nada se rompe.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { listaPessoasQueryKey } from "@/hooks/pessoas/useListaPessoas";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import { faseDaColunaDoQuadro, fasePipelineDerivada, numeroDaFase } from "./faseDoPipeline";
import { faseEmyliaDaFicha, type FaseEmylia } from "./faseEmylia";
import { jaEDaEmylia, passarParaNegocio, type DadosDaAbordagem } from "./passagemParaNegocio";
import { useNegocioEmylia, type NegocioEmylia } from "./useNegocioEmylia";

/** Porque é que «Passar para o Negócio» não se pode fazer agora. */
export type RazaoSemPassar = "semPermissao" | "docsCrm" | "aLer" | "erro" | "semNegocio";

export interface AcaoPassar {
  /** O levantamento está guardado e o negócio ainda é da abordagem: a ação aparece. */
  visivel: boolean;
  /** `null`: pode-se; senão a razão (a ação aparece desativada, com ela dita). */
  razao: RazaoSemPassar | null;
  /** O negócio está a passar (a gravar a fase 3). */
  aFazer: boolean;
  fazer: () => void;
}

export interface NegocioEmyliaDoGuiaEstado {
  e: NegocioEmylia;
  org: string | null;
  /** A fase da Emylia em que o negócio está; `null` antes do Negócio, quando está perdido ou quando não há prova dela (CRM com documentos). */
  faseEmylia: FaseEmylia | null;
  /** A fase do Negócio em diante que o CRM mostra (para o ecrã de «a ler» e de erro); `null` fora do Negócio. */
  faseDoCrm: FaseEmylia | null;
  /** O negócio é do Negócio em diante e a leitura da Emylia não acabou, ou falhou: o ecrã diz-o em vez de mostrar o fluxo do CRM. */
  leituraBloqueia: boolean;
  /** A leitura acabou mas a organização não devolveu o negócio (por exemplo, sem número): fica o fluxo do CRM, com aviso. */
  semNegocioNaEmylia: boolean;
  /** O negócio está a passar de Visita a Negócio (a gravar a fase 3). */
  aPassar: boolean;
  /** A saída da Visita: «Passar para o Negócio». */
  passar: AcaoPassar;
  /** Tentar outra vez: refaz a passagem (se ainda não gravou) ou volta a gravar. */
  repetirGravacao: () => void;
}

interface OpcoesDoGuia {
  /** A coluna do item do guia (a fase do CRM); `null` sem item. */
  faseDoItem: string | null;
  /** `pessoas.edit` neste negócio: sem ele não se avança nem se grava. */
  podeEditar: boolean;
  /** O negócio tem um levantamento guardado (ligado ou escrito). */
  levantamentoGuardado: boolean;
  /** O que a abordagem tem: o que se leva na passagem e o que diz que fase se concluiu. */
  dados: DadosDaAbordagem;
}

const DO_NEGOCIO: readonly string[] = ["orcamento", "proposta", "contrato"];
const PASSAM: readonly string[] = ["levantamento", "orcamento"];

export function useNegocioEmyliaDoGuia(negocio: NegocioMes, { faseDoItem, podeEditar, levantamentoGuardado, dados }: OpcoesDoGuia): NegocioEmyliaDoGuiaEstado {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizador = fonte.modo === "real" ? (fonte.utilizadorId ?? "") : "";
  const client = useContext(QueryClientContext);
  const perdido = negocio.estadoReal === "perdido";
  const contratoAssinado = negocio.contrato?.estado === "assinado";
  // sem organização (o exemplo) não há Emylia para ler: nada se bloqueia nem se mostra
  const ler = org !== null && !perdido;
  // do Negócio em diante a Emylia manda e a leitura bloqueia o fluxo do CRM; na abordagem (incluída a coluna Levantamento) a leitura NÃO bloqueia o assistente
  const ativo = ler && ((faseDoItem !== null && DO_NEGOCIO.includes(faseDoItem)) || contratoAssinado);
  const paraPassar = ler && faseDoItem !== null && PASSAM.includes(faseDoItem) && levantamentoGuardado;
  const refazerQuadro = useCallback(() => { if (org && client) void client.invalidateQueries({ queryKey: listaPessoasQueryKey(org) }); }, [client, org]);
  const e = useNegocioEmylia(ler ? org : null, negocio.id, refazerQuadro, undefined, utilizador);

  const { d, ctx } = e;
  const { pedidoCliente, email, chamadas, visitas, levantamentos } = dados;
  const passagem = useCallback(() => {
    if (!ctx || !d) return;
    ctx.run(() => passarParaNegocio(d, ctx.S, { pedidoCliente, email, chamadas, visitas, levantamentos }));
  }, [ctx, d, pedidoCliente, email, chamadas, visitas, levantamentos]);

  // A fase concluída avança no momento: a fase de agora (a do quadro e a do que o negócio tem) comparada com a de antes DESTA ficha aberta. Abrir não conta como avanço.
  const [pedida, setPedida] = useState(false);
  const [pendente, setPendente] = useState<number | null>(null);
  const agora = Math.max(
    faseDoItem !== null ? numeroDaFase(faseDaColunaDoQuadro(faseDoItem as ColunaQuadro)) : 0,
    numeroDaFase(fasePipelineDerivada({ chamadas, visitas, levantamento: levantamentoGuardado, orcamentos: 0, proposta: false, contrato: false })),
  );
  const antes = useRef<number | null>(null);
  useEffect(() => {
    if (antes.current !== null && agora > antes.current) setPendente(agora);
    antes.current = agora;
  }, [agora]);
  useEffect(() => {
    if (pendente === null) return;
    // sem permissão ou com documentos do CRM não se grava (a saída diz porquê); ainda a ler: espera-se
    if (!podeEditar || e.docsCrm || e.leitura.k === "erro") { setPendente(null); return; }
    if (e.leitura.k !== "pronto" || !ctx || !d) return;
    setPendente(null);
    if (d.fase >= pendente) return;
    if (pendente >= 3) { setPedida(true); passagem(); } else ctx.run(() => { if (d.fase < pendente) d.fase = pendente; });
    // `d` e `ctx` mudam de identidade em cada leitura; o que conta é haver um avanço pendente e a leitura pronta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente, e.leitura.k, e.docsCrm, podeEditar]);

  // A ação «Passar para o Negócio»: só com o levantamento guardado e o negócio ainda na abordagem.
  const visivel = paraPassar && (d === undefined || !jaEDaEmylia(d));
  const razao: RazaoSemPassar | null = !visivel ? null
    : !podeEditar ? "semPermissao"
    : e.leitura.k === "a-ler" ? "aLer"
    : e.leitura.k === "erro" ? "erro"
    : d === undefined ? "semNegocio"
    : e.docsCrm ? "docsCrm"
    : null;
  const fazer = useCallback(() => { if (razao === null) { setPedida(true); passagem(); } }, [razao, passagem]);
  const repetirGravacao = useCallback(() => {
    if (d && !jaEDaEmylia(d)) passagem(); else e.regravar();
  }, [d, e, passagem]);

  const aPassar = pedida && d !== undefined && d.fase >= 3 && e.gravacao.k === "a-gravar";
  const faseEmylia: FaseEmylia | null = ler ? faseEmyliaDaFicha({ d, docsCrm: e.docsCrm, contratoAssinado }) : null;
  const faseDoCrm: FaseEmylia | null = !ativo ? null : contratoAssinado ? "financeiro" : "negocio";
  const leituraBloqueia = ativo && (e.leitura.k === "a-ler" || e.leitura.k === "erro");
  const semNegocioNaEmylia = ativo && e.leitura.k === "pronto" && d === undefined;
  return { e, org, faseEmylia, faseDoCrm, leituraBloqueia, semNegocioNaEmylia, aPassar, passar: { visivel, razao, aFazer: aPassar, fazer }, repetirGravacao };
}
