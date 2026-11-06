// Wrapper: a leitura das fichas de RH que se podem ligar a uma conta e a ligação (`rpc_hr_ligar_conta`), para o campo
// «Pessoa do RH» do formulário de utilizador. Mesma leitura de `usePessoas` (pessoas não eliminadas da organização,
// paginada) e de `useContasLigaveis` (pessoas_contas ativas, tolerando a recusa por permissão). Os erros da RPC chegam
// com o mesmo texto que a ficha do RH mostra (`mensagemDeErroCargo` → `hr.conta.erro*`).
import { isPermissionError } from "@/lib/hr/hrDb";
import { mensagemDeErroCargo } from "@/lib/hr/errosCargo";
import { pessoasLigaveis, type LinhaContaRh, type LinhaPessoaRh, type PessoaRh } from "../pessoaRh";
import { mensagemDeErro } from "../rolesReais";
import type { ResultadoMutacao } from "../tipos";
import { db } from "./clienteBase";

const PAGINA = 1000;

export interface PessoasRhLidas {
  pessoas: PessoaRh[];
  ligadaId: string | null;
}

/** As fichas da organização sem conta ativa (mais a ligada a `utilizadorId`). Uma falha nas fichas sobe; nas ligações, só se não for de permissão. */
export async function lerPessoasRh(organizacaoId: string, utilizadorId?: string): Promise<PessoasRhLidas> {
  // Paginada: o PostgREST corta nas 1000 linhas em silêncio.
  const pessoas: LinhaPessoaRh[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await db.from("pessoas")
      .select("id, nome_completo, numero_interno, email_trabalho")
      .eq("organization_id", organizacaoId)
      .is("deleted_at", null)
      .order("nome_completo", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(mensagemDeErro(error));
    const pagina = (data ?? []) as LinhaPessoaRh[];
    pessoas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  const { data: contas, error: erroContas } = await db.from("pessoas_contas")
    .select("pessoa_id, anew_user_id")
    .eq("organization_id", organizacaoId)
    .eq("estado", "activa");
  if (erroContas && !isPermissionError(erroContas)) throw new Error(mensagemDeErro(erroContas));
  return pessoasLigaveis(pessoas, (erroContas ? [] : contas ?? []) as LinhaContaRh[], utilizadorId);
}

/** Liga a ficha à conta (`anew_users.id`). A RPC valida a permissão, a membership ativa e as ligações já existentes. */
export async function ligarPessoaRhNaBase(pessoaId: string, utilizadorId: string): Promise<ResultadoMutacao> {
  try {
    const { error } = await db.rpc("rpc_hr_ligar_conta", { p_pessoa_id: pessoaId, p_anew_user_id: utilizadorId });
    if (error) return { ok: false, erro: await mensagemDeErroCargo(error, "hr-pessoa-write") };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) };
  }
}
