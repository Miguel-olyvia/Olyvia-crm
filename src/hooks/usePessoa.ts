/**
 * A ficha de uma pessoa: o nucleo mais os satelites que a permissao permitir.
 *
 * TOLERA FALTA DE PERMISSAO, NAO TOLERA FALHA
 * -------------------------------------------
 * Cada satelite tem a sua propria permissao de leitura (`hr.pessoas.pessoais.view`,
 * `hr.pessoas.morada.view`, `hr.pessoas.saude.view`, ...) e cada um e carregado
 * no seu proprio select, todos EM PARALELO. Se a base recusar um deles por
 * permissao, essa parte da ficha fica a `null` e o separador esconde o bloco --
 * isso e a resposta correcta e nao vai ao Sentry. Se falhar por outra razao
 * (rede, timeout, erro de sintaxe) e reportada, porque ai a ficha aparece
 * incompleta sem ninguem saber.
 *
 * A unica leitura fatal e a do nucleo: sem `pessoas` nao ha ficha para mostrar.
 *
 * O QUE NAO PASSA POR AQUI
 * ------------------------
 * O NISS em claro e o IBAN em claro. O NISS so vem da RPC `rpc_hr_revelar_niss`,
 * chamada pelo campo que o mostra, e nunca fica em estado desta ficha. O IBAN
 * nao tem RPC de leitura nenhuma nesta ronda: a aplicacao nunca o ve.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type {
  Pessoa,
  PessoaConta,
  PessoaContactoEmergencia,
  PessoaDadosBancarios,
  PessoaDadosPessoais,
  PessoaDadosSaude,
  PessoaIdentificacao,
  PessoaMorada,
  PessoaVinculo,
} from "@/types/hr";

const COLUNAS_PESSOA =
  "id, organization_id, numero_interno, primeiro_nome, apelido, nome_completo, nome_social, " +
  "email_trabalho, email_pessoal, telefone_trabalho, cargo, local_trabalho, " +
  "entidade_legal_org_id, reporta_a_pessoa_id, data_admissao, data_antiguidade, data_saida, " +
  "estado_contrato, estado_registo, dias_trabalho, notas, created_at, updated_at";

const COLUNAS_DADOS_PESSOAIS =
  "id, pessoa_id, organization_id, data_nascimento, ocultar_aniversario, genero, pronomes, " +
  "nacionalidade, telefone_pessoal, email_comunicacoes, estado_civil, dependentes, " +
  "irs_retencao_percentagem";

// Sem `niss`: a coluna esta revogada a `authenticated` ao nivel da coluna.
// Pedi-la faz o PostgREST devolver 42501 e perder a linha inteira.
const COLUNAS_IDENTIFICACAO =
  "id, pessoa_id, organization_id, tipo_documento, numero_documento, validade_documento, " +
  "nif, niss_ultimos4";

const COLUNAS_MORADA =
  "id, pessoa_id, organization_id, tipo, linha1, linha2, codigo_postal, localidade, distrito, " +
  "pais, is_principal";

const COLUNAS_EMERGENCIA =
  "id, pessoa_id, organization_id, nome, relacao, telefone, telefone_alternativo, email, ordem";

const COLUNAS_VINCULO =
  "id, pessoa_id, organization_id, tipo_contrato, regime, horas_semanais, data_inicio, " +
  "data_fim, motivo_termo, periodo_experimental_ate, entidade_legal_org_id, estado";

// Sem coluna de IBAN: na base ela nao existe.
const COLUNAS_BANCARIOS =
  "id, pessoa_id, organization_id, titular, banco, iban_ultimos4, iban_pais, swift, is_principal";

const COLUNAS_SAUDE =
  "id, pessoa_id, organization_id, incapacidade_percentagem, " +
  "incapacidade_comprovativo_valido_ate, necessidades_adaptacao, observacoes";

const COLUNAS_CONTA =
  "id, pessoa_id, organization_id, anew_user_id, entity_id, estado, ligada_em, revogada_em";

export interface PessoaFicha {
  pessoa: Pessoa | null;
  dadosPessoais: PessoaDadosPessoais | null;
  identificacao: PessoaIdentificacao | null;
  morada: PessoaMorada | null;
  emergencia: PessoaContactoEmergencia | null;
  vinculos: PessoaVinculo[];
  bancarios: PessoaDadosBancarios | null;
  saude: PessoaDadosSaude | null;
  conta: PessoaConta | null;
}

const FICHA_VAZIA: PessoaFicha = {
  pessoa: null,
  dadosPessoais: null,
  identificacao: null,
  morada: null,
  emergencia: null,
  vinculos: [],
  bancarios: null,
  saude: null,
  conta: null,
};

/**
 * Um satelite 1:1. Devolve `null` tanto quando nao existe linha como quando a
 * base recusou por permissao -- que do ponto de vista do ecra e o mesmo:
 * nao ha nada para mostrar.
 */
async function carregarUm<T>(
  tabela: string,
  colunas: string,
  pessoaId: string,
  extra?: (query: any) => any,
): Promise<T | null> {
  let query = hrFrom(tabela).select(colunas).eq("pessoa_id", pessoaId);
  if (extra) query = extra(query);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    if (!isPermissionError(error)) captureFlowError(error, "hr-pessoas-load");
    return null;
  }
  return (data ?? null) as T | null;
}

async function carregarMuitos<T>(
  tabela: string,
  colunas: string,
  pessoaId: string,
  extra?: (query: any) => any,
): Promise<T[]> {
  let query = hrFrom(tabela).select(colunas).eq("pessoa_id", pessoaId);
  if (extra) query = extra(query);
  const { data, error } = await query;
  if (error) {
    if (!isPermissionError(error)) captureFlowError(error, "hr-pessoas-load");
    return [];
  }
  return (data ?? []) as T[];
}

export function usePessoa(pessoaId: string | undefined) {
  const [ficha, setFicha] = useState<PessoaFicha>({ ...FICHA_VAZIA });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setFicha({ ...FICHA_VAZIA });
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setError(null);

    try {
      const { data: nucleo, error: erroNucleo } = await hrFrom("pessoas")
        .select(COLUNAS_PESSOA)
        .eq("id", pessoaId)
        .is("deleted_at", null)
        .maybeSingle();

      if (erroNucleo) throw erroNucleo;
      if (!nucleo) {
        setFicha({ ...FICHA_VAZIA });
        setNotFound(true);
        return;
      }

      const [dadosPessoais, identificacao, morada, emergencia, vinculos, bancarios, saude, conta] =
        await Promise.all([
          carregarUm<PessoaDadosPessoais>("pessoas_dados_pessoais", COLUNAS_DADOS_PESSOAIS, pessoaId),
          carregarUm<PessoaIdentificacao>("pessoas_identificacao", COLUNAS_IDENTIFICACAO, pessoaId),
          carregarUm<PessoaMorada>("pessoas_moradas", COLUNAS_MORADA, pessoaId, (q) =>
            q.order("is_principal", { ascending: false }),
          ),
          carregarUm<PessoaContactoEmergencia>(
            "pessoas_contactos_emergencia",
            COLUNAS_EMERGENCIA,
            pessoaId,
            (q) => q.order("ordem", { ascending: true }),
          ),
          carregarMuitos<PessoaVinculo>("pessoas_vinculos", COLUNAS_VINCULO, pessoaId, (q) =>
            q.is("deleted_at", null).order("data_inicio", { ascending: false }),
          ),
          carregarUm<PessoaDadosBancarios>(
            "pessoas_dados_bancarios",
            COLUNAS_BANCARIOS,
            pessoaId,
          ),
          carregarUm<PessoaDadosSaude>("pessoas_dados_saude", COLUNAS_SAUDE, pessoaId),
          carregarUm<PessoaConta>("pessoas_contas", COLUNAS_CONTA, pessoaId, (q) =>
            q.eq("estado", "activa"),
          ),
        ]);

      setFicha({
        pessoa: nucleo as Pessoa,
        dadosPessoais,
        identificacao,
        morada,
        emergencia,
        vinculos,
        bancarios,
        saude,
        conta,
      });
    } catch (e) {
      captureFlowError(e, "hr-pessoas-load");
      setFicha({ ...FICHA_VAZIA });
      setError(await getFriendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [pessoaId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Grava e devolve `null` em caso de sucesso, ou a mensagem de erro amigavel.
   * Quem chama decide o que fazer com ela (toast, texto no formulario); o erro
   * NUNCA fica so no console.
   */
  const guardar = useCallback(
    async (executar: (autorId: string | null) => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const { error: erro } = await executar(autorId);
        if (erro) throw erro;
        await load();
        return null;
      } catch (e) {
        // Uma recusa por permissao e resposta legitima: o utilizador ve a
        // mensagem e nao ha nada a corrigir do nosso lado.
        if (!isPermissionError(e)) captureFlowError(e, "hr-pessoa-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const savePessoa = useCallback(
    (patch: Partial<Pessoa>) =>
      guardar(async (autorId) =>
        hrFrom("pessoas")
          .update({ ...patch, updated_by: autorId })
          .eq("id", pessoaId),
      ),
    [guardar, pessoaId],
  );

  /** Satelite 1:1 com unique em `pessoa_id`: um upsert resolve criar e editar. */
  const upsertSatelite = useCallback(
    (tabela: string, patch: Record<string, unknown>) =>
      guardar(async (autorId) => {
        const orgId = ficha.pessoa?.organization_id;
        if (!orgId || !pessoaId) return { error: new Error("Ficha sem organizacao resolvida") };
        return hrFrom(tabela).upsert(
          {
            ...patch,
            pessoa_id: pessoaId,
            organization_id: orgId,
            created_by: autorId,
            updated_by: autorId,
          },
          { onConflict: "pessoa_id" },
        );
      }),
    [guardar, ficha.pessoa?.organization_id, pessoaId],
  );

  const saveDadosPessoais = useCallback(
    (patch: Partial<PessoaDadosPessoais>) => upsertSatelite("pessoas_dados_pessoais", patch),
    [upsertSatelite],
  );

  const saveIdentificacao = useCallback(
    (patch: Partial<PessoaIdentificacao>) => upsertSatelite("pessoas_identificacao", patch),
    [upsertSatelite],
  );

  const saveSaude = useCallback(
    (patch: Partial<PessoaDadosSaude>) => upsertSatelite("pessoas_dados_saude", patch),
    [upsertSatelite],
  );

  /**
   * Moradas e contactos de emergencia sao N:1 e NAO tem unique em `pessoa_id`,
   * por isso nao ha upsert: ou se actualiza a linha que ja existe, ou se
   * insere a primeira. Nesta ronda a ficha trata uma morada (a principal) e um
   * contacto (ordem 1) -- as listas completas ficam para quando o ecra as
   * mostrar.
   */
  const saveLinhaUnica = useCallback(
    (
      tabela: string,
      existenteId: string | undefined,
      patch: Record<string, unknown>,
      defaults: Record<string, unknown>,
    ) =>
      guardar(async (autorId) => {
        const orgId = ficha.pessoa?.organization_id;
        if (!orgId || !pessoaId) return { error: new Error("Ficha sem organizacao resolvida") };
        if (existenteId) {
          return hrFrom(tabela)
            .update({ ...patch, updated_by: autorId })
            .eq("id", existenteId);
        }
        return hrFrom(tabela).insert({
          ...defaults,
          ...patch,
          pessoa_id: pessoaId,
          organization_id: orgId,
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [guardar, ficha.pessoa?.organization_id, pessoaId],
  );

  const saveMorada = useCallback(
    (patch: Partial<PessoaMorada>) =>
      saveLinhaUnica("pessoas_moradas", ficha.morada?.id, patch, {
        tipo: "residencia",
        pais: "PT",
        is_principal: true,
      }),
    [saveLinhaUnica, ficha.morada?.id],
  );

  const saveEmergencia = useCallback(
    (patch: Partial<PessoaContactoEmergencia>) =>
      saveLinhaUnica("pessoas_contactos_emergencia", ficha.emergencia?.id, patch, { ordem: 1 }),
    [saveLinhaUnica, ficha.emergencia?.id],
  );

  /**
   * O NISS em claro, uma vez, por RPC auditada. Devolve o valor ou lanca --
   * quem chama mostra a mensagem. NUNCA guardar o retorno em estado que
   * sobreviva ao ecra.
   */
  const revelarNiss = useCallback(async (): Promise<string | null> => {
    if (!pessoaId) return null;
    const { data, error: erro } = await hrRpc("rpc_hr_revelar_niss", { p_pessoa_id: pessoaId });
    if (erro) {
      if (!isPermissionError(erro)) captureFlowError(erro, "hr-pessoa-write");
      throw erro;
    }
    return (data ?? null) as string | null;
  }, [pessoaId]);

  const definirNiss = useCallback(
    (niss: string) =>
      guardar(async () => hrRpc("rpc_hr_definir_niss", { p_pessoa_id: pessoaId, p_niss: niss })),
    [guardar, pessoaId],
  );

  const definirIban = useCallback(
    (args: { iban: string; titular?: string | null; banco?: string | null; swift?: string | null }) =>
      guardar(async () =>
        hrRpc("rpc_hr_definir_iban", {
          p_pessoa_id: pessoaId,
          p_iban: args.iban,
          p_titular: args.titular ?? null,
          p_banco: args.banco ?? null,
          p_swift: args.swift ?? null,
        }),
      ),
    [guardar, pessoaId],
  );

  const ligarConta = useCallback(
    (anewUserId: string) =>
      guardar(async () =>
        hrRpc("rpc_hr_ligar_conta", { p_pessoa_id: pessoaId, p_anew_user_id: anewUserId }),
      ),
    [guardar, pessoaId],
  );

  const revogarConta = useCallback(
    (motivo: string | null) =>
      guardar(async () =>
        hrRpc("rpc_hr_revogar_conta", { p_pessoa_id: pessoaId, p_motivo: motivo }),
      ),
    [guardar, pessoaId],
  );

  return {
    ...ficha,
    loading,
    saving,
    notFound,
    error,
    refresh: load,
    savePessoa,
    saveDadosPessoais,
    saveIdentificacao,
    saveMorada,
    saveEmergencia,
    saveSaude,
    revelarNiss,
    definirNiss,
    definirIban,
    ligarConta,
    revogarConta,
  };
}
