/**
 * As ações da admissão, em memória: juntam a máquina de estados (`lib/admissaoFluxo.ts`), o store das admissões e os
 * efeitos na ficha (o contrato gerado entra em Documentos, as credenciais criam o estado do acesso). Nenhum e-mail sai:
 * o que o RH vê são pré-visualizações. As do RH levam o nome de quem as faz; as da pessoa vêm pelo token do link.
 */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import {
  admissaoPorToken, executarAdmissao, gravarAdmissao, lerAdmissoes, novoTokenAdmissao,
} from "@/components/rh-exemplo/dados/lojaAdmissao";
import { atualizarFicha, lerEstado, novoId } from "@/components/rh-exemplo/dados/loja";
import {
  criarAdmissao, guardarRascunho, vistaPublica, type EntradaAdmissao, type ResultadoAdmissao,
} from "@/components/rh-exemplo/lib/admissaoFluxo";
import type { PessoaDocumento, TipoContrato } from "@/components/rh-exemplo/tipos";

/** O que só o RH preenche ao aprovar, e que o contrato leva. */
export interface CamposDoRh {
  dataAdmissao: string;
  cargoId: string;
  tipoContrato: TipoContrato;
  retribuicao: number;
  subsidio: number | null;
  duodecimos: 0 | 50 | 100;
}

export interface PedidoContrato {
  modeloId: string;
  campos: CamposDoRh;
  titulo: string;
  linhas: string[];
}

/** O nome de quem está a usar o ecrã de RH (para o histórico). */
export function quemRh(): string {
  const e = lerEstado();
  return (e.minhaPessoaId && e.fichas[e.minhaPessoaId]?.pessoa.nome_completo) || "RH";
}

const nomeDa = (pessoaId: string): string => lerEstado().fichas[pessoaId]?.pessoa.nome_completo ?? "";

/** Cria a admissão de quem acabou de ser criado com convite (role previsto escolhido pelo RH). */
export function convidarPessoa(pessoaId: string, dados: { email: string; roleId: string | null }): void {
  gravarAdmissao(criarAdmissao({ pessoaId, ...dados, token: novoTokenAdmissao() }, { agora: agoraExemplo(), quem: quemRh() }));
}

export const renovarLogin = (id: string): ResultadoAdmissao => executarAdmissao(id, "renovarLogin", {}, quemRh());
export const reenviarLink = (id: string): ResultadoAdmissao => executarAdmissao(id, "reenviarLink", {}, quemRh());
export const aprovarFicha = (id: string): ResultadoAdmissao => executarAdmissao(id, "aprovar", {}, quemRh());
export const rejeitarFicha = (id: string, motivo: string): ResultadoAdmissao => executarAdmissao(id, "rejeitar", { motivo }, quemRh());
export const reenviarContrato = (id: string): ResultadoAdmissao => executarAdmissao(id, "reenviarContrato", {}, quemRh());

export function devolverFicha(id: string, comentarios: Record<string, string>): ResultadoAdmissao {
  return executarAdmissao(id, "devolver", { comentarios }, quemRh());
}

function documentoDoContrato(pessoaId: string, modeloId: string, titulo: string): PessoaDocumento {
  const f = lerEstado().fichas[pessoaId];
  return {
    id: novoId("doc"), pessoa_id: pessoaId, organization_id: f.pessoa.organization_id, vinculo_id: f.vinculos[0]?.id ?? null,
    modelo_id: modeloId, tipo: "contrato", titulo: `${titulo} — ${nomeDa(pessoaId)}`, estado: "a_aguardar_assinatura",
    ficheiro_caminho: null, ficheiro_hash_sha256: null, ficheiro_anexado_em: null, emitido_em: agoraExemplo().toISOString(),
    emitido_por: lerEstado().minhaPessoaId ? `u-${lerEstado().minhaPessoaId}` : null, assinado_em: null, assinatura_origem: null,
    anulado_em: null, anulado_motivo: null, created_at: agoraExemplo().toISOString(),
  };
}

function aplicarCamposDoRh(pessoaId: string, c: CamposDoRh, documento: PessoaDocumento): void {
  const cargo = lerEstado().cargos.find((x) => x.id === c.cargoId);
  atualizarFicha(pessoaId, (f) => ({
    ...f,
    pessoa: { ...f.pessoa, data_admissao: c.dataAdmissao, data_antiguidade: c.dataAdmissao, cargo_id: c.cargoId, cargo: cargo?.nome ?? f.pessoa.cargo },
    vinculos: f.vinculos.map((v, i) => (i === 0 ? { ...v, tipo_contrato: c.tipoContrato, data_inicio: c.dataAdmissao } : v)),
    retribuicoes: f.retribuicoes.map((r, i) => (
      i === 0 ? { ...r, valor_base: c.retribuicao, subsidio_alimentacao: c.subsidio, duodecimos_pct: c.duodecimos } : r
    )),
    documentos: [documento, ...f.documentos],
  }));
}

/** Gera o contrato: o documento entra em Documentos da ficha e a admissão passa a «Contrato por assinar». */
export function gerarContrato(pessoaId: string, p: PedidoContrato): ResultadoAdmissao {
  const documento = documentoDoContrato(pessoaId, p.modeloId, p.titulo);
  const entrada: EntradaAdmissao = { modeloId: p.modeloId, documentoId: documento.id, titulo: p.titulo, linhas: p.linhas };
  const resultado = executarAdmissao(pessoaId, "gerarContrato", entrada, quemRh());
  if (resultado.ok) aplicarCamposDoRh(pessoaId, p.campos, documento);
  return resultado;
}

function alterarDocumento(pessoaId: string, documentoId: string | null, fn: (d: PessoaDocumento) => PessoaDocumento): void {
  if (!documentoId) return;
  atualizarFicha(pessoaId, (f) => ({ ...f, documentos: f.documentos.map((d) => (d.id === documentoId ? fn(d) : d)) }));
}

export function anularContrato(pessoaId: string, motivo: string): ResultadoAdmissao {
  const documentoId = lerAdmissoes().porPessoa[pessoaId]?.contrato?.documentoId ?? null;
  const resultado = executarAdmissao(pessoaId, "anularContrato", { motivo }, quemRh());
  if (resultado.ok) {
    alterarDocumento(pessoaId, documentoId, (d) => ({
      ...d, estado: "anulado", anulado_em: agoraExemplo().toISOString(), anulado_motivo: motivo.trim(),
    }));
  }
  return resultado;
}

/** Envia as credenciais (simulado): o acesso fica «convidado» na lista até a pessoa entrar pela primeira vez. */
export function enviarCredenciais(pessoaId: string, dados: { email: string; roleId: string }): ResultadoAdmissao {
  const resultado = executarAdmissao(pessoaId, "enviarCredenciais", dados, quemRh());
  if (resultado.ok) {
    atualizarFicha(pessoaId, (f) => ({
      ...f,
      pessoa: { ...f.pessoa, email_trabalho: dados.email.trim() },
      convite: {
        conviteId: `cred-${pessoaId}`, estado: "pendente", emailDestino: dados.email.trim(), criadoEm: agoraExemplo().toISOString(),
        validUntil: `${diaIso(7)}T09:00:00Z`, usadoEm: null, emailEnviado: true, emailErro: null, ultimaRecusa: null,
      },
    }));
  }
  return resultado;
}

/** Demonstração: a pessoa entra pela primeira vez. A conta liga-se à ficha e o login temporário deixa de funcionar. */
export function simularPrimeiroAcesso(pessoaId: string): ResultadoAdmissao {
  const resultado = executarAdmissao(pessoaId, "ativarAcesso", {}, nomeDa(pessoaId));
  if (resultado.ok) {
    atualizarFicha(pessoaId, (f) => ({
      ...f,
      conta: {
        id: novoId("ct"), pessoa_id: pessoaId, organization_id: f.pessoa.organization_id, anew_user_id: `u-${pessoaId}`,
        entity_id: null, estado: "activa", ligada_em: agoraExemplo().toISOString(), revogada_em: null,
      },
      convite: f.convite && { ...f.convite, estado: "usado", usadoEm: agoraExemplo().toISOString() },
      pendencias: [],
    }));
  }
  return resultado;
}

/* ---- A pessoa, pelo link (token) ---- */

const SEM_LINK: ResultadoAdmissao = { ok: false, erro: "transicao_invalida" };

function daPessoa(token: string | undefined, acao: Parameters<typeof executarAdmissao>[1], entrada: EntradaAdmissao): ResultadoAdmissao {
  const { admissao, atual } = admissaoPorToken(token);
  if (!admissao || !atual) return SEM_LINK;
  return executarAdmissao(admissao.pessoaId, acao, entrada, nomeDa(admissao.pessoaId));
}

/** A pessoa abre o link pela primeira vez: «convite enviado» passa a «a preencher». Não faz nada nos outros estados. */
export function abrirLink(token: string | undefined): void {
  const { admissao } = admissaoPorToken(token);
  if (admissao?.estado === "convite_enviado") daPessoa(token, "abrir", {});
}

/** Guarda o rascunho; ao editar uma ficha devolvida, volta a «a preencher» (o mesmo login, o prazo já renovado). */
export function gravarRascunhoDoLink(token: string | undefined, rascunho: Record<string, unknown>): void {
  const { admissao, atual } = admissaoPorToken(token);
  if (!admissao || !atual) return;
  if (admissao.estado === "devolvida") daPessoa(token, "retomar", {});
  const corrente = admissaoPorToken(token).admissao;
  if (corrente) gravarAdmissao(guardarRascunho(corrente, rascunho, agoraExemplo()));
}

export const submeterPeloLink = (token: string | undefined, dados: Record<string, unknown>): ResultadoAdmissao =>
  daPessoa(token, "submeter", { dados });

export const assinarPeloLink = (token: string | undefined, nome: string, aceite: boolean): ResultadoAdmissao => {
  const { admissao } = admissaoPorToken(token);
  const resultado = daPessoa(token, "assinarContrato", { nome, aceite, nomeEsperado: admissao ? nomeDa(admissao.pessoaId) : "" });
  if (resultado.ok && admissao) {
    alterarDocumento(admissao.pessoaId, admissao.contrato?.documentoId ?? null, (d) => ({
      ...d, estado: "assinado", assinado_em: agoraExemplo().toISOString(), assinatura_origem: "interna",
    }));
  }
  return resultado;
};

export const recusarContratoPeloLink = (token: string | undefined, motivo: string): ResultadoAdmissao =>
  daPessoa(token, "recusarContrato", { motivo });

/** O que a página pública do link deve mostrar neste momento. */
export function vistaDoLink(token: string | undefined) {
  const { admissao, atual } = admissaoPorToken(token);
  return vistaPublica(admissao, atual, agoraExemplo());
}
