/**
 * A lista de pessoas de RH da organizacao activa, e os tres numeros do topo.
 *
 * AMBITO
 * ------
 * Le sempre com `organization_id = organizacao activa`. A RLS ja garante o
 * isolamento (as politicas usam `has_anew_permission_in_org`, nunca
 * `get_user_visible_org_ids`), mas o filtro explicito diz na aplicacao o que
 * a base tambem diz -- e evita trazer fichas de outra organizacao se alguem
 * alargar uma politica por descuido.
 *
 * OS TRES CARTOES
 * ---------------
 * Total de activos, entradas nos ultimos 90 dias e saidas nos ultimos 90 dias
 * sao calculados EM MEMORIA sobre a lista ja carregada. Nao ha contagens
 * separadas na base nesta ronda: sao numeros pequenos e uma contagem `head`
 * por cartao triplicava os pedidos sem ganho nenhum. Quando a lista passar a
 * ser paginada, os cartoes deixam de poder ser derivados e passam a contagens
 * proprias -- fica dito aqui para nao passar em silencio.
 *
 * ESTADO DO ACESSO
 * ----------------
 * Nao e uma coluna de `pessoas`: vem de `pessoas_contas`, num segundo select
 * juntado em memoria. Se esse select for recusado por falta de permissao, a
 * coluna mostra "sem conta" para todos em vez de partir a lista.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import type { EstadoAcesso, Pessoa, PessoaListItem } from "@/types/hr";

/** Colunas do nucleo que a lista precisa. Nunca `select("*")`. */
const COLUNAS_LISTA = [
  "id",
  "organization_id",
  "numero_interno",
  "primeiro_nome",
  "apelido",
  "nome_completo",
  "nome_social",
  "email_trabalho",
  "email_pessoal",
  "telefone_trabalho",
  "cargo",
  "local_trabalho",
  "entidade_legal_org_id",
  "reporta_a_pessoa_id",
  "data_admissao",
  "data_antiguidade",
  "data_saida",
  "estado_contrato",
  "estado_registo",
  "dias_trabalho",
  "notas",
].join(", ");

export interface PessoasStats {
  activos: number;
  entradas90d: number;
  saidas90d: number;
}

const DIAS_JANELA = 90;

function dentroDaJanela(data: string | null, hoje: Date): boolean {
  if (!data) return false;
  const valor = new Date(`${data}T00:00:00`);
  if (Number.isNaN(valor.getTime())) return false;
  const diff = hoje.getTime() - valor.getTime();
  return diff >= 0 && diff <= DIAS_JANELA * 24 * 60 * 60 * 1000;
}

export function usePessoas() {
  const { activeCompany } = useCompany();
  const [pessoas, setPessoas] = useState<PessoaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setPessoas([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: erroPessoas } = await hrFrom("pessoas")
        .select(COLUNAS_LISTA)
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("nome_completo", { ascending: true });

      if (erroPessoas) throw erroPessoas;

      const linhas = (data ?? []) as Pessoa[];

      // Contas ligadas. Uma recusa aqui nao e um defeito: quem nao pode ler
      // `pessoas_contas` fica sem a coluna de estado do acesso, com a lista
      // toda de pe.
      const contasPorPessoa = new Map<string, EstadoAcesso>();
      const { data: contas, error: erroContas } = await hrFrom("pessoas_contas")
        .select("pessoa_id, estado")
        .eq("organization_id", activeCompany.id)
        .eq("estado", "activa");

      if (erroContas && !isPermissionError(erroContas)) {
        captureFlowError(erroContas, "hr-pessoas-load");
      }
      for (const conta of (contas ?? []) as Array<{ pessoa_id: string }>) {
        contasPorPessoa.set(conta.pessoa_id, "ativo");
      }

      setPessoas(
        linhas.map((pessoa) => ({
          ...pessoa,
          estadoAcesso: contasPorPessoa.get(pessoa.id) ?? "semConta",
        })),
      );
    } catch (e) {
      captureFlowError(e, "hr-pessoas-load");
      setPessoas([]);
      setError(await getFriendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo<PessoasStats>(() => {
    const hoje = new Date();
    return {
      activos: pessoas.filter(
        (p) => p.estado_registo === "activo" && p.estado_contrato === "em_curso",
      ).length,
      entradas90d: pessoas.filter((p) => dentroDaJanela(p.data_admissao, hoje)).length,
      saidas90d: pessoas.filter((p) => dentroDaJanela(p.data_saida, hoje)).length,
    };
  }, [pessoas]);

  /**
   * Cria a ficha com o minimo indispensavel e devolve o id da pessoa nova, ou
   * lanca. Tudo o resto edita-se depois na ficha -- um formulario de criacao
   * com trinta campos e um formulario que ninguem preenche.
   *
   * `organization_id` vem SEMPRE da organizacao activa e nunca do formulario:
   * a base recusaria de qualquer forma (a politica de INSERT exige
   * `hr.pessoas.create` naquela organizacao), mas nao se manda ao servidor uma
   * escolha que o utilizador nao devia poder fazer.
   */
  const criarPessoa = useCallback(
    async (dados: {
      primeiro_nome: string;
      apelido: string;
      email_trabalho?: string | null;
      cargo?: string | null;
      data_admissao?: string | null;
      entidade_legal_org_id?: string | null;
    }): Promise<string> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const autorId = await resolveCurrentBusinessUserId();
      const { data, error: erro } = await hrFrom("pessoas")
        .insert({
          organization_id: activeCompany.id,
          primeiro_nome: dados.primeiro_nome.trim(),
          apelido: dados.apelido.trim(),
          email_trabalho: dados.email_trabalho ?? null,
          cargo: dados.cargo ?? null,
          data_admissao: dados.data_admissao ?? null,
          entidade_legal_org_id: dados.entidade_legal_org_id ?? null,
          created_by: autorId,
          updated_by: autorId,
        })
        .select("id")
        .single();
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-pessoa-write");
        throw erro;
      }
      await load();
      return (data as { id: string }).id;
    },
    [activeCompany?.id, load],
  );

  return { pessoas, stats, loading, error, refresh: load, criarPessoa };
}
