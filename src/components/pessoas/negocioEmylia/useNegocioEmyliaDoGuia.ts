// Liga a ficha do Pipeline ao negócio da Emylia: lê a organização (uma vez por sessão, relida ao abrir a ficha) SÓ quando o negócio está no Negócio ou
// depois, e diz em que fase da Emylia ele está (faseEmylia.ts). É também aqui que acontece a passagem Visita → Negócio: com o levantamento do CRM
// fechado (a fase do CRM é Orçamento) e sem documentos do CRM, o negócio passa a ser da Emylia (fase 3) e grava-se pelo armazém do Ben
// (passagemParaNegocio.ts). No fim de cada gravação invalida o quadro, para o cartão mudar de coluna. Sem QueryClient (um ecrã de exemplo) não
// invalida nada e nada se rompe.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { listaPessoasQueryKey } from "@/hooks/pessoas/useListaPessoas";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { faseEmyliaDaFicha, type FaseEmylia } from "./faseEmylia";
import { jaEDaEmylia, passarParaNegocio, type DadosDaAbordagem } from "./passagemParaNegocio";
import { useNegocioEmylia, type NegocioEmylia } from "./useNegocioEmylia";

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
  /** Tentar outra vez: refaz a passagem (se ainda não gravou) ou volta a gravar. */
  repetirGravacao: () => void;
}

interface OpcoesDoGuia {
  /** A coluna do item do guia (a fase do CRM); `null` sem item. */
  faseDoItem: string | null;
  /** `pessoas.edit` neste negócio: sem ele não se passa nem se grava. */
  podeEditar: boolean;
  /** O que a abordagem tem, para a passagem. */
  dados: DadosDaAbordagem;
}

const DO_NEGOCIO: readonly string[] = ["orcamento", "proposta", "contrato"];

export function useNegocioEmyliaDoGuia(negocio: NegocioMes, { faseDoItem, podeEditar, dados }: OpcoesDoGuia): NegocioEmyliaDoGuiaEstado {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizador = fonte.modo === "real" ? (fonte.utilizadorId ?? "") : "";
  const client = useContext(QueryClientContext);
  const perdido = negocio.estadoReal === "perdido";
  const contratoAssinado = negocio.contrato?.estado === "assinado";
  const doNegocio = faseDoItem !== null && DO_NEGOCIO.includes(faseDoItem);
  // sem organização (o exemplo) não há Emylia para ler: nada se bloqueia nem se mostra
  const ativo = org !== null && !perdido && (doNegocio || contratoAssinado);
  const refazerQuadro = useCallback(() => { if (org && client) void client.invalidateQueries({ queryKey: listaPessoasQueryKey(org) }); }, [client, org]);
  const e = useNegocioEmylia(ativo ? org : null, negocio.id, refazerQuadro, undefined, utilizador);

  // A passagem Visita → Negócio: o levantamento do CRM está fechado (fase do CRM: Orçamento), o negócio não tem documentos do CRM e ainda não é da Emylia.
  const [rondas, setRondas] = useState(0);
  const tentou = useRef<string | null>(null);
  const { d, ctx } = e;
  const precisaPassar = ativo && faseDoItem === "orcamento" && e.leitura.k === "pronto" && d !== undefined && !e.docsCrm && !jaEDaEmylia(d) && !d.perdido;
  const { pedidoCliente, email, chamadas, visitas, levantamentos } = dados;
  useEffect(() => {
    if (!precisaPassar || !podeEditar || !ctx || !d) return;
    if (tentou.current === `${negocio.id}:${rondas}`) return;
    tentou.current = `${negocio.id}:${rondas}`;
    ctx.run(() => passarParaNegocio(d, ctx.S, { pedidoCliente, email, chamadas, visitas, levantamentos }));
    // `d` e `ctx` mudam de identidade em cada leitura; a tentativa conta-se por negócio e por ronda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaPassar, podeEditar, negocio.id, rondas]);
  const repetirGravacao = useCallback(() => {
    if (d && !jaEDaEmylia(d)) setRondas((n) => n + 1); else e.regravar();
  }, [d, e]);

  const aPassar = precisaPassar && podeEditar;
  const doMotor = ativo ? faseEmyliaDaFicha({ d, docsCrm: e.docsCrm, contratoAssinado }) : null;
  // enquanto passa, o Orçamento da Emylia já está à vista (a gravação mostra-se lá)
  const faseEmylia: FaseEmylia | null = doMotor ?? (aPassar ? "orcamento" : null);
  const faseDoCrm: FaseEmylia | null = !ativo ? null : contratoAssinado ? "financeiro" : (faseDoItem as FaseEmylia);
  const leituraBloqueia = ativo && (e.leitura.k === "a-ler" || e.leitura.k === "erro");
  const semNegocioNaEmylia = ativo && e.leitura.k === "pronto" && d === undefined;
  return { e, org, faseEmylia, faseDoCrm, leituraBloqueia, semNegocioNaEmylia, aPassar, repetirGravacao };
}
