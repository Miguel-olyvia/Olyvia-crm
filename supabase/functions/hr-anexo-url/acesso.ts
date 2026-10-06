/**
 * O fluxo de acesso a um anexo da admissao, sem Deno nem rede: tudo o que toca
 * na base e no Storage entra por `PortosDeAcesso`, por isso o vitest prova a
 * ORDEM das chamadas -- que e o que protege os documentos de identificacao:
 *
 *   1. so utilizadores reais (service_role nao tem auth.uid() a quem atribuir o registo)
 *   2. so anexos promovidos, no bucket final
 *   3. permissao do tipo (ou ser a propria pessoa), contra a organizacao DA LINHA
 *   4. AUDITORIA (tipos sensiveis)  ->  so depois  ->  5. o URL assinado
 *
 * Se a auditoria falhar, nao sai URL (falhar aberto seria um acesso sensivel sem
 * registo). Respostas de erro: `{error: codigo}`, nunca texto da base nem caminhos.
 * O index.ts so liga os portos ao cliente real.
 */
import { eUuid } from "../_shared/uuid.ts";
import {
  PERMISSAO_POR_TIPO,
  PERMISSAO_PROPRIA,
  decidirAcessoAnexo,
  eTipoAnexo,
  type CampoAuditado,
  type TipoAnexo,
} from "./regras.ts";

export const BUCKET_FINAL = "hr-documentos";

export interface AnexoRow {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo: string;
  estado: string;
  bucket: string;
  caminho: string;
  mime_type: string | null;
}

interface ResultadoSimples {
  data: unknown;
  error: unknown;
}

/** O que o fluxo precisa do mundo exterior; o utilizador que pede ja vem agarrado nos portos. */
export interface PortosDeAcesso {
  /** Le por CHAVE PRIMARIA um anexo no estado `promovido`; `anexo: null` se nao existe. */
  lerAnexoPromovido(anexoId: string): Promise<{ anexo: AnexoRow | null; error: unknown }>;
  temPermissao(codigo: string, organizationId: string): PromiseLike<ResultadoSimples>;
  pessoaDoUtilizador(organizationId: string): PromiseLike<ResultadoSimples>;
  registarAcesso(acesso: { pessoaId: string; organizationId: string; campo: CampoAuditado }): PromiseLike<{ error: unknown }>;
  assinarUrl(caminho: string, ttlSegundos: number): Promise<{ signedUrl: string | null; error: unknown }>;
}

export interface PedidoDeAcesso {
  isServiceRole: boolean;
  body: unknown;
  portos: PortosDeAcesso;
  /** Falhas inesperadas (Sentry). O index trata de tirar o texto. */
  registarErro?: (erro: unknown) => void;
}

export interface RespostaDeAcesso {
  status: number;
  body: Record<string, unknown>;
}

const resposta = (status: number, body: Record<string, unknown>): RespostaDeAcesso => ({ status, body });
const erro = (codigo: string, status: number): RespostaDeAcesso => resposta(status, { error: codigo });

function lerAnexoId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const candidato = (body as Record<string, unknown>).anexoId;
  return eUuid(candidato) ? candidato : null;
}

/** `null` quando a base falhou (o chamador responde 500); senao o booleano. */
async function perguntarBooleano(
  pergunta: PromiseLike<ResultadoSimples>,
  registarErro?: (e: unknown) => void,
): Promise<boolean | null> {
  const { data, error } = await pergunta;
  if (error) {
    registarErro?.(error);
    return null;
  }
  return data === true;
}

export async function tratarPedidoAnexoUrl(p: PedidoDeAcesso): Promise<RespostaDeAcesso> {
  const { portos, registarErro } = p;

  // Tem de haver sempre um utilizador real por tras de um acesso: sem
  // auth.uid() nao ha ninguem a quem atribuir o registo de auditoria.
  if (p.isServiceRole) return erro("sem_permissao", 403);

  const anexoId = lerAnexoId(p.body);
  if (!anexoId) return erro("pedido_invalido", 400);

  const { anexo, error: erroAnexo } = await portos.lerAnexoPromovido(anexoId);
  if (erroAnexo) {
    registarErro?.(erroAnexo);
    return erro("erro_inesperado", 500);
  }
  if (!anexo || anexo.bucket !== BUCKET_FINAL || !eTipoAnexo(anexo.tipo)) {
    return erro("anexo_nao_encontrado", 404);
  }
  const tipo: TipoAnexo = anexo.tipo;

  // Tudo contra a organizacao da PROPRIA linha.
  const temPermissaoDoTipo = await perguntarBooleano(
    portos.temPermissao(PERMISSAO_POR_TIPO[tipo], anexo.organization_id),
    registarErro,
  );
  if (temPermissaoDoTipo === null) return erro("erro_inesperado", 500);

  let temPermissaoPropria = false;
  let eAPropriaPessoa = false;
  // So se vai ver se e a propria pessoa quando a permissao do tipo nao chegou.
  if (!temPermissaoDoTipo) {
    const propria = await perguntarBooleano(portos.temPermissao(PERMISSAO_PROPRIA, anexo.organization_id), registarErro);
    if (propria === null) return erro("erro_inesperado", 500);
    temPermissaoPropria = propria;
    if (propria) {
      const { data: pessoaDoUtilizador, error: erroPessoa } = await portos.pessoaDoUtilizador(anexo.organization_id);
      if (erroPessoa) {
        registarErro?.(erroPessoa);
        return erro("erro_inesperado", 500);
      }
      eAPropriaPessoa = pessoaDoUtilizador === anexo.pessoa_id;
    }
  }

  const decisao = decidirAcessoAnexo(tipo, { temPermissaoDoTipo, temPermissaoPropria, eAPropriaPessoa });
  if (!decisao.autorizado) return erro("sem_permissao", 403);

  // A auditoria ANTES do URL: se falhar, o fluxo para aqui.
  if (decisao.auditar) {
    const { error: erroAuditoria } = await portos.registarAcesso({
      pessoaId: anexo.pessoa_id,
      organizationId: anexo.organization_id,
      campo: decisao.auditar,
    });
    if (erroAuditoria) {
      registarErro?.(erroAuditoria);
      return erro("erro_auditoria", 500);
    }
  }

  const { signedUrl, error: erroUrl } = await portos.assinarUrl(anexo.caminho, decisao.ttlSegundos);
  if (erroUrl || !signedUrl) {
    if (erroUrl) registarErro?.(erroUrl);
    return erro("erro_url", 500);
  }

  return resposta(200, {
    url: signedUrl,
    expiraEmSegundos: decisao.ttlSegundos,
    tipo,
    mime_type: anexo.mime_type,
  });
}
