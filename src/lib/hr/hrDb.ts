/**
 * Acesso as tabelas e RPCs de RH enquanto o esquema nao esta nos tipos gerados.
 *
 * PORQUE EXISTE
 * -------------
 * `src/integrations/supabase/client.ts` cria o cliente com `Database` gerado a
 * partir do remoto. As tabelas `pessoas*` e as RPCs `rpc_hr_*` nascem nas
 * migrations 20261120010000..20261120090000 e SO entram nesse ficheiro quando
 * ele for regenerado depois do push -- e um ficheiro gerado nao se edita a mao.
 *
 * Sem esta ponte, cada acesso a `pessoas` levava o seu proprio `as any`
 * espalhado por doze ficheiros. Aqui o desvio de tipos fica num sitio,
 * comentado, e facil de remover: quando os tipos gerados conhecerem as
 * tabelas, apaga-se este ficheiro e trocam-se as chamadas pelo cliente tipado.
 *
 * O que NAO muda: a autenticacao, a chave publicavel e a RLS. Isto e o mesmo
 * cliente do resto da aplicacao -- so sem a verificacao estatica dos nomes das
 * colunas. As formas das linhas vivem em `src/types/hr.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLocalizedFallback } from "@/utils/friendlyError";

type UntypedClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const untyped = supabase as unknown as UntypedClient;

/** Tabelas de RH. Ver `src/types/hr.ts` para a forma de cada linha. */
export function hrFrom(table: string) {
  return untyped.from(table);
}

/** RPCs de RH (`rpc_hr_revelar_niss`, `rpc_hr_definir_conta`, ...). */
export function hrRpc(fn: string, args?: Record<string, unknown>) {
  return untyped.rpc(fn, args);
}

/**
 * Distingue "a base recusou" de "a base falhou".
 *
 * Uma recusa por permissao ou por grant de coluna e a RESPOSTA CORRECTA: quem
 * nao tem `hr.pessoas.saude.view` nao deve ver o cartao, e isso nao e um
 * incidente para reportar ao Sentry. Uma falha de rede, um timeout ou um erro
 * de sintaxe sao defeitos e tem de ser reportados.
 *
 * 42501 = insufficient_privilege (RLS ou grant de coluna).
 * PGRST301 / 401 / 403 = o PostgREST a recusar antes de chegar ao Postgres.
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/**
 * Um UPDATE que a RLS filtra devolve 0 linhas SEM erro. Quem pede o resultado
 * com `{ count: "exact" }` passa-o por aqui: 0 linhas vira uma recusa por
 * permissao (42501), para o ecra nao mostrar "guardado" sem ter gravado nada.
 * `count` nulo (contagem nao pedida) nao e tratado como recusa.
 */
export const ERRO_NENHUMA_LINHA_GRAVADA = {
  code: "42501",
  message: "permission denied: nenhuma linha gravada",
} as const;

export function exigirLinhasGravadas(resultado: { error: unknown; count?: number | null }): { error: unknown } {
  if (resultado.error) return { error: resultado.error };
  if (resultado.count === 0) return { error: ERRO_NENHUMA_LINHA_GRAVADA };
  return { error: null };
}

/**
 * A mensagem para quando `exigirLinhasGravadas` apanha 0 linhas e o ecra sabe
 * QUE permissao a linha exigia (ex.: afectacoes/colocacao, onde a RLS escolhe
 * `.edit` ou `.corrigir` pelo periodo da linha). Nunca "Alterações guardadas".
 */
export function mensagemNaoGravadoSemPermissao(permissao: string): string {
  return getLocalizedFallback("hr.erroNaoGravadoSemPermissao").replace("{permissao}", permissao);
}

/**
 * Distingue "o travao de tentativas disparou" de "a base falhou" ou "sem
 * duplicado".
 *
 * `hr_pessoa_duplicados_candidatos` (migracao 20261201030000) recusa com
 * ERRCODE HR920 e mensagem literal `demasiadas_tentativas` quem exceder o
 * limite de tentativas (60/5min ou 600/1h, por utilizador). Isto NAO e um
 * defeito -- e a politica de travao a funcionar -- por isso nunca deve ir
 * para o Sentry via `captureFlowError`, e nunca deve ser lido como "sem
 * duplicado" (lista vazia): e um terceiro estado, distinto dos outros dois.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code === "HR920") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /demasiadas_tentativas/i.test(message);
}
