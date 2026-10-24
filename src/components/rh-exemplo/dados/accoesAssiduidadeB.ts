/**
 * As accoes dos fluxos 5 (alertas do fim do dia, justificacao de falha de marcacao) e 7 (faltas) sobre os
 * stores em memoria. Cada uma valida com a funcao pura e devolve `null` em sucesso ou a chave do erro.
 */
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { definirGestao, lerGestao, novoIdGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { nomeDeQuemUsa } from "@/components/rh-exemplo/dados/accoesHorarioB";
import { definirFluxosB, lerFluxosB, novoIdB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import {
  aplicarAccao,
  decidirJustificacaoPicagem,
  submeterJustificacao,
  type AccaoAlerta,
  type AlertaDia,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import {
  decidirJustificacaoFalta,
  minutosDoPeriodo,
  registarJustificacao,
  validarMarcacaoFalta,
  type ContextoFalta,
  type DecisaoJustificacaoFalta,
  type PeriodoFalta,
} from "@/components/rh-exemplo/lib/faltasB";
import type { Falta, MotivoFalta, Picagem } from "@/components/rh-exemplo/tiposAssiduidade";

export interface ResultadoAccao {
  erro: string | null;
  detalhe?: string;
  avisos?: string[];
}

const OK: ResultadoAccao = { erro: null };

/** O que ja existe no dia de uma pessoa: tempo trabalhado, outras faltas e ausencias (para os cruzamentos). */
export function contextoDaFalta(pessoaId: string): ContextoFalta {
  const ficha = lerEstado().fichas[pessoaId];
  return {
    realizado: ficha?.horarioRealizado ?? [],
    faltas: lerGestao().faltas.filter((f) => f.pessoa_id === pessoaId),
    ausencias: (ficha?.ausencias.dias ?? []).map((d) => ({ data: d.data, fraccao_dia: d.fraccao_dia, estado: d.estado })),
  };
}

/** Uma falta ativa «sem justificacao» no periodo dado (ainda nao guardada no store). */
export function construirFalta(pessoaId: string, periodo: PeriodoFalta, motivoCodigo: MotivoFalta): Falta {
  const ficha = lerEstado().fichas[pessoaId];
  return {
    id: novoIdGestao("fa"),
    pessoa_id: pessoaId,
    organization_id: ficha?.pessoa.organization_id ?? "",
    data: periodo.data,
    planeado_id: null,
    vinculo_id: ficha?.vinculos[0]?.id ?? null,
    local_id: null,
    hora_inicio: periodo.inicio,
    hora_fim: periodo.fim,
    minutos: minutosDoPeriodo(periodo.inicio, periodo.fim),
    motivo_codigo: motivoCodigo,
    justificacao_estado: "sem_justificacao",
    justificada: false,
    remunerada: false,
    desconta_saldo: false,
    justificacao_decidida_por: null,
    justificacao_decidida_em: null,
    justificacao_motivo: null,
    ausencia_dia_id: null,
    corrige_falta_id: null,
    correccao_motivo: null,
    estado: "activa",
    anulado_em: null,
    anulacao_motivo: null,
    created_at: new Date().toISOString(),
  };
}

/** O RH MARCA a falta: valida o periodo e os cruzamentos e grava uma falta ativa, «sem justificacao». */
export function marcarFaltaDoRh(
  pessoaId: string,
  periodo: PeriodoFalta,
  motivo: string,
  motivoCodigo: MotivoFalta,
  /** Se a falta nasce de uma sugestao da fila, o alerta fica «falta marcada». */
  alertaId: string | null = null,
): ResultadoAccao {
  const validacao = validarMarcacaoFalta(periodo, motivo, contextoDaFalta(pessoaId));
  if (validacao.ok === false) return { erro: validacao.erro, detalhe: validacao.detalhe };
  const nova = construirFalta(pessoaId, periodo, motivoCodigo);
  definirGestao((g) => ({ ...g, faltas: [...g.faltas, nova] }));
  if (alertaId) {
    const quem = nomeDeQuemUsa();
    definirFluxosB((e) => ({
      ...e,
      alertas: e.alertas.map((a) =>
        a.id === alertaId ? { ...a, estado: "falta_marcada" as const, motivo, tratadoPor: quem, tratadoEm: new Date().toISOString() } : a,
      ),
    }));
  }
  return { erro: null, avisos: validacao.avisos };
}

function guardarAlerta(novo: AlertaDia): void {
  definirFluxosB((e) => ({ ...e, alertas: e.alertas.map((a) => (a.id === novo.id ? novo : a)) }));
}

function periodoDoAlerta(alerta: AlertaDia): PeriodoFalta {
  const inicio = (alerta.horaInicio ?? "09:00").slice(0, 5);
  // Uma picagem por emparelhar nao tem fim: o periodo vai ate ao fim do turno da tarde.
  const fim = alerta.horaFim ? alerta.horaFim.slice(0, 5) : inicio < "18:00" ? "18:00" : "";
  return { data: alerta.data, inicio, fim };
}

/** Uma accao do RH sobre um alerta; marcar falta passa tambem pelas regras do fluxo 7. */
export function tratarAlerta(alertaId: string, accao: AccaoAlerta, motivo: string): ResultadoAccao {
  const alerta = lerFluxosB().alertas.find((a) => a.id === alertaId);
  if (!alerta) return { erro: "rhExemplo.pic.erro.jaTratado" };
  const resultado = aplicarAccao(alerta, accao, { motivo, quem: nomeDeQuemUsa(), agora: new Date().toISOString() });
  if (resultado.ok === false) return { erro: resultado.erro };
  if (accao === "marcar_falta") {
    const falta = marcarFaltaDoRh(alerta.pessoaId, periodoDoAlerta(alerta), motivo, "ausencia_nao_comunicada");
    if (falta.erro) return falta;
  }
  guardarAlerta(resultado.valor);
  return OK;
}

/** A pessoa justifica a falha de marcacao (hora real + motivo + anexo opcional), em 5 dias uteis. */
export function enviarJustificacaoDePicagem(
  alertaId: string,
  dados: { horaReal: string; motivo: string; anexoNome: string | null },
): ResultadoAccao {
  const alerta = lerFluxosB().alertas.find((a) => a.id === alertaId);
  if (!alerta) return { erro: "rhExemplo.pic.erro.jaTratado" };
  const resultado = submeterJustificacao(alerta, { ...dados, id: novoIdB("jp"), hoje: hojeIso(), agora: new Date().toISOString() });
  if (resultado.ok === false) return { erro: resultado.erro };
  definirFluxosB((e) => ({
    ...e,
    justificacoesPicagem: [...e.justificacoesPicagem, resultado.valor],
    alertas: e.alertas.map((a) => (a.id === alertaId ? { ...a, estado: "justificacao_recebida" as const } : a)),
  }));
  return OK;
}

function picagemLancadaAMao(alerta: AlertaDia, horaReal: string, motivo: string): Picagem {
  const ficha = lerEstado().fichas[alerta.pessoaId];
  return {
    id: novoIdGestao("pg"),
    pessoa_id: alerta.pessoaId,
    organization_id: ficha?.pessoa.organization_id ?? "",
    momento: `${alerta.data}T${horaReal}:00.000Z`,
    data_local: alerta.data,
    hora_local: `${horaReal}:00`,
    sentido: alerta.tipo === "pendente_par" ? "saida" : "entrada",
    local_id: null,
    vinculo_id: ficha?.vinculos[0]?.id ?? null,
    planeado_id: null,
    origem: "manual_rh",
    latitude: null,
    longitude: null,
    precisao_metros: null,
    estado: "valida",
    realizado_id: null,
    corrige_picagem_id: null,
    correccao_tipo: "esquecida",
    correccao_motivo: motivo,
    registado_por_pessoa_id: lerEstado().minhaPessoaId,
    anulado_em: null,
    anulacao_motivo: null,
    created_at: new Date().toISOString(),
  };
}

/** O RH aceita (lanca a picagem a mao, com motivo) ou recusa com motivo (a diferenca volta a pendente). */
export function decidirJustificacaoDePicagem(justificacaoId: string, aceitar: boolean, motivo: string): ResultadoAccao {
  const estado = lerFluxosB();
  const justificacao = estado.justificacoesPicagem.find((j) => j.id === justificacaoId);
  const alerta = estado.alertas.find((a) => a.id === justificacao?.alertaId);
  if (!justificacao || !alerta) return { erro: "rhExemplo.pic.erro.jaTratado" };
  const resultado = decidirJustificacaoPicagem(justificacao, alerta, { aceitar, motivo, quem: nomeDeQuemUsa(), agora: new Date().toISOString() });
  if (resultado.ok === false) return { erro: resultado.erro };
  definirFluxosB((e) => ({
    ...e,
    justificacoesPicagem: e.justificacoesPicagem.map((j) => (j.id === justificacaoId ? resultado.valor.justificacao : j)),
    alertas: e.alertas.map((a) => (a.id === alerta.id ? resultado.valor.alerta : a)),
  }));
  if (aceitar) {
    const nova = picagemLancadaAMao(alerta, justificacao.horaReal, justificacao.motivo);
    definirGestao((g) => ({ ...g, picagens: [...g.picagens, nova] }));
  }
  return OK;
}

/* ---- Faltas: justificacao ---- */

function atualizarFalta(faltaId: string, patch: Partial<Falta>): void {
  definirGestao((g) => ({ ...g, faltas: g.faltas.map((f) => (f.id === faltaId ? { ...f, ...patch } : f)) }));
}

/** Registar a justificacao (texto sensivel): pendente de documento dentro do prazo da organizacao. */
export function registarJustificacaoDeFalta(faltaId: string, texto: string): ResultadoAccao & { foraDoPrazo?: boolean } {
  const falta = lerGestao().faltas.find((f) => f.id === faltaId);
  if (!falta) return { erro: "rhExemplo.fal.erro.faltaAnulada" };
  const resultado = registarJustificacao(falta, { texto, hoje: hojeIso(), prazoDias: lerFluxosB().prazoFaltaDias });
  if (resultado.ok === false) return { erro: resultado.erro };
  definirFluxosB((e) => ({ ...e, textosFalta: { ...e.textosFalta, [faltaId]: texto.trim() } }));
  atualizarFalta(faltaId, { justificacao_estado: resultado.estado });
  return { erro: null, foraDoPrazo: resultado.foraDoPrazo };
}

export function decidirJustificacaoDeFalta(faltaId: string, decisao: DecisaoJustificacaoFalta, motivo: string): ResultadoAccao {
  const falta = lerGestao().faltas.find((f) => f.id === faltaId);
  if (!falta) return { erro: "rhExemplo.fal.erro.faltaAnulada" };
  const resultado = decidirJustificacaoFalta(falta, decisao, motivo);
  if (resultado.ok === false) return { erro: resultado.erro };
  atualizarFalta(faltaId, {
    ...resultado.patch,
    justificacao_decidida_por: lerEstado().minhaPessoaId,
    justificacao_decidida_em: new Date().toISOString(),
  });
  return OK;
}

/** «Ver texto»: devolve o texto sensivel e regista quem leu e quando. */
export function verTextoDaFalta(faltaId: string): string | null {
  const texto = lerFluxosB().textosFalta[faltaId] ?? null;
  if (texto === null) return null;
  definirFluxosB((e) => ({
    ...e,
    acessosTexto: [...e.acessosTexto, { faltaId, quem: nomeDeQuemUsa(), quando: new Date().toISOString() }],
  }));
  return texto;
}

export function definirPrazoDeJustificacao(dias: number): void {
  const valido = Number.isFinite(dias) ? Math.min(30, Math.max(1, Math.round(dias))) : 5;
  definirFluxosB((e) => ({ ...e, prazoFaltaDias: valido }));
}
