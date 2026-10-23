/**
 * As ações da troca de documentos do Portal do colaborador, em memória. As da pessoa chegam pelo link (token) e exigem um
 * acesso que ainda sirva; as do RH levam o id da pessoa. Tudo passa pelas funções puras de `lib/portalDocumentos.ts`
 * e guarda-se no mesmo store, por isso o que um lado faz o outro vê. O contrato continua a ser do fluxo de admissão
 * (`accoesAdmissao.ts`): aqui só se lhe marca «visto».
 */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { admissaoPorToken } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { aplicarPortal, gravarPortal, lerPortal } from "@/components/rh-exemplo/dados/lojaPortalDocumentos";
import { loginServe } from "@/components/rh-exemplo/lib/admissaoFluxo";
import {
  aceitarPedidoRh, assinarRecebido, enviarDocumentoAPessoa, enviarFicheirosPedidoRh, marcarVisto, pedirDocumentoAoRh,
  pedirDocumentoPessoa, prepararPedidoPessoa, recusarAssinaturaRecebido, recusarPedidoPessoa, recusarPedidoRh,
  responderPedidoPessoa, type DadosDocumentoEnviado, type DadosPedidoPessoa, type DadosPedidoRh, type PortalPessoa,
  type ResultadoPortal,
} from "@/components/rh-exemplo/lib/portalDocumentos";

const SEM_ACESSO: ResultadoPortal = { ok: false, erro: "expirado" };

/** A pessoa de um link que ainda serve (em vigor, não revogado, dentro do prazo), ou `null`. */
function pessoaDoLink(token: string | undefined): string | null {
  const { admissao, atual } = admissaoPorToken(token);
  return admissao && atual && loginServe(admissao, agoraExemplo()) ? admissao.pessoaId : null;
}

function daPessoa(token: string | undefined, fn: (p: PortalPessoa, pessoaId: string) => ResultadoPortal): ResultadoPortal {
  const pessoaId = pessoaDoLink(token);
  return pessoaId ? aplicarPortal(pessoaId, (p) => fn(p, pessoaId)) : SEM_ACESSO;
}

const nomeDa = (pessoaId: string): string => lerEstado().fichas[pessoaId]?.pessoa.nome_completo ?? "";

/* ---- A pessoa, pelo link ---- */

export const enviarFicheirosPeloLink = (token: string | undefined, pedidoId: string, nomes: readonly string[]): ResultadoPortal =>
  daPessoa(token, (p) => enviarFicheirosPedidoRh(p, pedidoId, nomes, agoraExemplo()));

export const pedirDocumentoPeloLink = (token: string | undefined, dados: DadosPedidoPessoa): ResultadoPortal =>
  daPessoa(token, (p) => pedirDocumentoAoRh(p, dados, agoraExemplo()));

export const assinarDocumentoPeloLink = (token: string | undefined, docId: string, nome: string, aceite: boolean): ResultadoPortal =>
  daPessoa(token, (p, pessoaId) => assinarRecebido(p, docId, { nome, aceite, nomeEsperado: nomeDa(pessoaId) }, agoraExemplo()));

export const recusarDocumentoPeloLink = (token: string | undefined, docId: string, motivo: string): ResultadoPortal =>
  daPessoa(token, (p) => recusarAssinaturaRecebido(p, docId, motivo, agoraExemplo()));

/** A pessoa abriu um documento (ver ou descarregar). Não faz nada se o link já não serve. */
export function marcarVistoPeloLink(token: string | undefined, docId: string): void {
  const pessoaId = pessoaDoLink(token);
  if (pessoaId) gravarPortal(pessoaId, marcarVisto(lerPortal(pessoaId), docId));
}

/* ---- O RH ---- */

export const rhEnviarDocumento = (pessoaId: string, dados: DadosDocumentoEnviado): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => enviarDocumentoAPessoa(p, dados, agoraExemplo()));

export const rhPedirDocumento = (pessoaId: string, dados: DadosPedidoRh): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => pedirDocumentoPessoa(p, dados, agoraExemplo()));

export const rhAceitarPedido = (pessoaId: string, pedidoId: string): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => aceitarPedidoRh(p, pedidoId));

export const rhRecusarPedido = (pessoaId: string, pedidoId: string, motivo: string): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => recusarPedidoRh(p, pedidoId, motivo));

export const rhPrepararPedidoDaPessoa = (pessoaId: string, pedidoId: string): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => prepararPedidoPessoa(p, pedidoId));

export const rhResponderPedidoDaPessoa = (pessoaId: string, pedidoId: string, nomeFicheiro: string, titulo: string): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => responderPedidoPessoa(p, pedidoId, nomeFicheiro, titulo, agoraExemplo()));

export const rhRecusarPedidoDaPessoa = (pessoaId: string, pedidoId: string, motivo: string): ResultadoPortal =>
  aplicarPortal(pessoaId, (p) => recusarPedidoPessoa(p, pedidoId, motivo));
