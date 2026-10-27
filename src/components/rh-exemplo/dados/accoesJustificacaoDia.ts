/**
 * As acções sobre as justificações de dias com falta sugerida ou atraso, em memória. A pessoa envia; o RH aceita (paga ou
 * não paga) ou recusa com motivo. Aceitar cria a falta marcada, com a justificação já decidida pela regra de `faltasB.ts`:
 * é essa falta que o cálculo do mês desconta ou não. Num mês já fechado a decisão fica registada e a falta nasce na mesma,
 * mas o fecho congela os recibos: o desconto só muda se o mês for reaberto.
 */
import { momentoDePicagemAgora } from "@/components/rh-exemplo/dados/hojeExemplo";
import { nomeDeQuemUsa } from "@/components/rh-exemplo/dados/accoesHorarioB";
import { construirFalta } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { lerFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { definirGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import {
  definirJustificacaoDia,
  lerJustificacaoDia,
  novoIdJustificacaoDia,
} from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { lerFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import type { DesvioJustificavel } from "@/components/rh-exemplo/calendarioPessoa/desvioJustificavel";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { MOTIVO_DA_FALTA } from "@/components/rh-exemplo/lib/faltaDaAceitacao";
import { decidirJustificacaoFalta } from "@/components/rh-exemplo/lib/faltasB";
import {
  criarJustificacaoDia,
  decidirJustificacaoDia,
  mesDoDia,
  situacaoDoDia,
  type DadosEnvio,
  type DecisaoJustificacaoDia,
  type ErrosEnvio,
  type JustificacaoDia,
} from "@/components/rh-exemplo/lib/justificacaoDia";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";

export interface ResultadoEnvio {
  erros: ErrosEnvio | null;
}

export interface ResultadoDecisaoDia {
  erro: string | null;
  /** O dia pertence a um mês já fechado: o desconto não se altera sem reabrir. */
  mesFechado: boolean;
}


/** A pessoa envia (ou volta a enviar, depois de uma recusa) a justificação de um dia. Valida tudo e devolve erros por campo. */
export function enviarJustificacaoDeDia(pessoaId: string, data: string, desvio: DesvioJustificavel, dados: DadosEnvio): ResultadoEnvio {
  const justificacoes = lerJustificacaoDia().justificacoes.filter((j) => j.pessoaId === pessoaId);
  const situacao = situacaoDoDia({ data, hoje: hojeIso(), prazoDias: lerFluxosB().prazoFaltaDias, temDesvio: true, justificacoes });
  const resultado = criarJustificacaoDia(
    { id: novoIdJustificacaoDia(), pessoaId, data, estado: situacao.estado, agora: momentoDePicagemAgora(), ...desvio },
    dados,
  );
  if (resultado.ok === false) return { erros: resultado.erros };
  definirJustificacaoDia((e) => ({ ...e, justificacoes: [...e.justificacoes, resultado.valor] }));
  return { erros: null };
}

/** A falta marcada que a aceitação cria, já decidida (paga ou não paga) pela regra das faltas. */
function faltaDaAceitacao(j: JustificacaoDia, decisao: DecisaoJustificacaoDia, agora: string): Falta | null {
  const base = construirFalta(j.pessoaId, { data: j.data, inicio: j.periodoInicio, fim: j.periodoFim }, j.deAtraso ? "atraso" : MOTIVO_DA_FALTA[j.tipo]);
  const patch = decidirJustificacaoFalta(
    { estado: "activa", justificacao_estado: "pendente_documento" },
    decisao === "aceitar_paga" ? "justificada_paga" : "justificada_nao_paga",
    j.motivo,
  );
  if (patch.ok === false) return null;
  return { ...base, ...patch.patch, justificacao_decidida_por: lerEstado().minhaPessoaId, justificacao_decidida_em: agora };
}

/**
 * O RH decide. Recusar exige motivo; aceitar marca a falta justificada e o dia, o mapa e o cálculo do mês acompanham.
 *
 * `faltaIdReal`: o id da falta que a BASE criou ao aceitar (`rpc_hr_falta_marcar` + `rpc_hr_falta_decidir_justificacao`, feitos
 * antes por `AceitarComFaltaReal`). Com ele, a justificação guarda esse id e NÃO se cria falta nenhuma em memória: a falta
 * é a da base. Sem ele (testes), mantém-se a falta de exemplo em memória.
 */
export function decidirJustificacaoDeDia(
  justificacaoId: string,
  decisao: DecisaoJustificacaoDia,
  motivo: string,
  faltaIdReal: string | null = null,
): ResultadoDecisaoDia {
  const atual = lerJustificacaoDia().justificacoes.find((j) => j.id === justificacaoId);
  if (!atual) return { erro: "rhJust.erro.jaDecidida", mesFechado: false };
  const mesFechado = Boolean(lerFluxosC().fechos[mesDoDia(atual.data)]);
  const quem = nomeDeQuemUsa();
  const agora = momentoDePicagemAgora();
  const resultado = decidirJustificacaoDia(atual, decisao, { motivo, quem, agora, mesFechado });
  if (resultado.ok === false) return { erro: resultado.erro, mesFechado };
  const falta = decisao === "recusar" || faltaIdReal ? null : faltaDaAceitacao(atual, decisao, agora);
  if (falta) definirGestao((g) => ({ ...g, faltas: [...g.faltas, falta] }));
  const decidida: JustificacaoDia = { ...resultado.valor, faltaId: faltaIdReal ?? falta?.id ?? null };
  definirJustificacaoDia((e) => ({ ...e, justificacoes: e.justificacoes.map((j) => (j.id === justificacaoId ? decidida : j)) }));
  return { erro: null, mesFechado };
}

/** «Ver texto»: devolve o motivo (dado sensível) e regista quem leu e quando. */
export function verTextoDaJustificacao(justificacaoId: string): string | null {
  const j = lerJustificacaoDia().justificacoes.find((x) => x.id === justificacaoId);
  if (!j) return null;
  definirJustificacaoDia((e) => ({
    ...e,
    acessos: [...e.acessos, { justificacaoId, quem: nomeDeQuemUsa(), quando: momentoDePicagemAgora() }],
  }));
  return j.motivo;
}
