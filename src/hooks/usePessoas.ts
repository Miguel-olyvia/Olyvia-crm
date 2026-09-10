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
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { dataDeHoje, type NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import type { EstadoAcesso, Pessoa, PessoaListItem } from "@/types/hr";

/**
 * Uma seccao do assistente que NAO ficou gravada.
 *
 * A pessoa nao se pode apagar (o DELETE de `pessoas` esta bloqueado por
 * politica restritiva), por isso uma falha a meio nao se desfaz: a ficha fica
 * criada e diz-se, por escrito, o que lhe falta. E isto que evita a
 * meia-pessoa silenciosa.
 */
export interface SeccaoFalhada {
  seccao:
    | "pessoais"
    | "identificacao"
    | "niss"
    | "morada"
    | "bancarios"
    | "emergencia"
    | "vinculo"
    | "retribuicao"
    | "horario"
    | "acesso"
    // A ligacao a uma conta de CRM (`rpc_hr_ligar_conta`), escolhida no passo
    // 1 do assistente. Falhar isto NAO desfaz a ficha -- ela ja existe, e a
    // pessoa fica editavel e ligavel a partir do proprio ecra de detalhe
    // (`usePessoa.ligarConta`), que tenta a MESMA RPC outra vez.
    | "conta";
  mensagem: string;
}

export interface ResultadoCriacao {
  id: string;
  falhas: SeccaoFalhada[];
}

/** Colunas do nucleo que a lista precisa. Nunca `select("*")`. */
const COLUNAS_LISTA = [
  "id",
  "organization_id",
  "numero_interno",
  "primeiro_nome",
  "apelido",
  "nome_completo",
  "email_trabalho",
  "email_pessoal",
  "telefone_trabalho",
  "cargo",
  "local_trabalho",
  "local_id",
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
   * Cria a ficha completa a partir das cinco seccoes do assistente.
   *
   * ORDEM E FALHA PARCIAL -- a decisao que evita a meia-pessoa silenciosa
   * ------------------------------------------------------------------
   * Primeiro `pessoas`. Se esse insert falhar, nao ha ficha e lanca-se. Depois
   * cada satelite, um a um: se UM falhar, os outros continuam e a falha e
   * DEVOLVIDA a quem chama, com o nome da seccao. Nao se apaga a pessoa --
   * nem se poderia, o DELETE esta bloqueado por politica -- e nao se engole o
   * erro: a ficha abre e diz o que lhe falta.
   *
   * `organization_id` vem SEMPRE da organizacao activa e nunca do formulario:
   * a base recusaria de qualquer forma (a politica de INSERT exige
   * `hr.pessoas.create` naquela organizacao), mas nao se manda ao servidor uma
   * escolha que o utilizador nao devia poder fazer. E por isso que a "entidade
   * legal" deixou de ser um campo.
   *
   * O NISS vai por `rpc_hr_definir_niss`: a coluna esta revogada ao
   * `authenticated` no INSERT (20261120040000) e nao ha outro caminho. Falhar
   * o NISS nao pode fazer perder o resto -- e a falha mais provavel de todas.
   */
  const criarPessoa = useCallback(
    async (payload: NovaPessoaPayload): Promise<ResultadoCriacao> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const organizationId = activeCompany.id;
      const autorId = await resolveCurrentBusinessUserId();
      const falhas: SeccaoFalhada[] = [];

      const { data, error: erro } = await hrFrom("pessoas")
        .insert({
          organization_id: organizationId,
          ...payload.nucleo,
          created_by: autorId,
          updated_by: autorId,
        })
        .select("id")
        .single();
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-pessoa-write");
        throw erro;
      }
      const pessoaId = (data as { id: string }).id;

      // A ligacao a conta vai LOGO A SEGUIR ao nucleo, antes de qualquer
      // satelite: e a chamada mais barata, e a unica cujo falhanco muda o que
      // quem usa o assistente tem de fazer a seguir (ir ao ecra de detalhe
      // tentar de novo). Nunca apaga a ficha se falhar -- o DELETE esta
      // bloqueado por politica, e apagar seria pior: perdia-se o resto do
      // formulario por causa de uma ligacao que se repete num clique.
      if (payload.contaALigar) {
        const { error: erroLigacao } = await hrRpc("rpc_hr_ligar_conta", {
          p_pessoa_id: pessoaId,
          p_anew_user_id: payload.contaALigar,
        });
        if (erroLigacao) {
          if (!isPermissionError(erroLigacao)) captureFlowError(erroLigacao, "hr-pessoa-write");
          falhas.push({ seccao: "conta", mensagem: await getFriendlyErrorMessage(erroLigacao) });
        }
      }

      const base = {
        pessoa_id: pessoaId,
        organization_id: organizationId,
        created_by: autorId,
        updated_by: autorId,
      };

      const gravar = async (
        seccao: SeccaoFalhada["seccao"],
        executar: () => Promise<{ error: unknown }>,
      ) => {
        const { error: falha } = await executar();
        if (!falha) return;
        if (!isPermissionError(falha)) captureFlowError(falha, "hr-pessoa-write");
        falhas.push({ seccao, mensagem: await getFriendlyErrorMessage(falha) });
      };

      if (payload.dadosPessoais) {
        await gravar("pessoais", () =>
          hrFrom("pessoas_dados_pessoais").insert({ ...base, ...payload.dadosPessoais }),
        );
      }
      if (payload.identificacao) {
        await gravar("identificacao", () =>
          hrFrom("pessoas_identificacao").insert({ ...base, ...payload.identificacao }),
        );
      }
      if (payload.niss) {
        await gravar("niss", async () =>
          hrRpc("rpc_hr_definir_niss", { p_pessoa_id: pessoaId, p_niss: payload.niss }),
        );
      }
      if (payload.morada) {
        await gravar("morada", () =>
          hrFrom("pessoas_moradas").insert({ ...base, ...payload.morada }),
        );
      }
      // A conta bancaria NAO pode ir num insert: `pessoas_dados_bancarios` tem
      // a escrita revogada a `authenticated` e tres politicas restritivas a
      // false (20261120070000). O unico caminho e a RPC, depois de a pessoa
      // existir -- e como o NISS, pode falhar sozinha sem levar a ficha atras.
      if (payload.conta) {
        await gravar("bancarios", async () =>
          hrRpc("rpc_hr_definir_conta", {
            p_pessoa_id: pessoaId,
            p_formato: payload.conta!.formato,
            p_conta: payload.conta!.numero,
          }),
        );
      }
      if (payload.emergencia) {
        await gravar("emergencia", () =>
          hrFrom("pessoas_contactos_emergencia").insert({ ...base, ...payload.emergencia }),
        );
      }

      // O vinculo precisa de existir ANTES da retribuicao e do horario: as
      // duas penduram nele por chave estrangeira composta.
      let vinculoId: string | null = null;
      if (payload.vinculo) {
        const { data: linha, error: falha } = await hrFrom("pessoas_vinculos")
          .insert({ ...base, ...payload.vinculo })
          .select("id")
          .single();
        if (falha) {
          if (!isPermissionError(falha)) captureFlowError(falha, "hr-pessoa-write");
          falhas.push({ seccao: "vinculo", mensagem: await getFriendlyErrorMessage(falha) });
        } else {
          vinculoId = (linha as { id: string }).id;
        }
      }

      if (payload.retribuicao) {
        await gravar("retribuicao", () =>
          hrFrom("pessoas_retribuicoes").insert({
            ...base,
            ...payload.retribuicao,
            vinculo_id: vinculoId,
            valido_de:
              (payload.vinculo?.data_inicio as string | undefined) ??
              payload.nucleo.data_admissao ??
              dataDeHoje(),
          }),
        );
      }

      if (payload.horario && payload.horario.length > 0) {
        await gravar("horario", () =>
          hrFrom("pessoas_horario_planeado").insert(
            payload.horario!.map((linha) => ({ ...base, ...linha, vinculo_id: vinculoId })),
          ),
        );
      }

      // O CONVITE DE ACESSO NAO SE ENVIA NESTA RONDA. Nao ha caminho de
      // criacao de conta a partir do modulo de RH: o acesso continua a ser o
      // `membership` mais o papel, criado no ecra de Utilizadores. Em vez de um
      // interruptor que nao faz nada em silencio, a intencao e devolvida como
      // pendencia e o ecra diz onde se conclui.
      if (payload.acesso.enviar_convite || payload.acesso.role_id) {
        falhas.push({ seccao: "acesso", mensagem: "" });
      }

      await load();
      return { id: pessoaId, falhas };
    },
    [activeCompany?.id, load],
  );

  return { pessoas, stats, loading, error, refresh: load, criarPessoa };
}
