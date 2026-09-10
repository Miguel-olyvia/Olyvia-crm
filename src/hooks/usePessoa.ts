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
  PessoaFardamento,
  PessoaIdentificacao,
  PessoaMorada,
  PessoaRetribuicao,
  PessoaSindicalizacao,
  PessoaVinculo,
  HorarioPlaneado,
  HorarioRealizado,
  FormatoConta,
} from "@/types/hr";
import type { LinhaPlaneadoParaGravar } from "@/lib/hr/horario";

const COLUNAS_PESSOA =
  "id, organization_id, numero_interno, primeiro_nome, apelido, nome_completo, " +
  "email_trabalho, email_pessoal, telefone_trabalho, cargo, local_trabalho, " +
  "local_id, departamento, estrutura, " +
  "entidade_legal_org_id, reporta_a_pessoa_id, data_admissao, data_antiguidade, " +
  "data_saida, " +
  "estado_registo, dias_trabalho, notas, created_at, updated_at";

const COLUNAS_DADOS_PESSOAIS =
  "id, pessoa_id, organization_id, data_nascimento, ocultar_aniversario, genero, " +
  "nacionalidade, telefone_pessoal, estado_civil, dependentes, " +
  "irs_retencao_percentagem, " +
  // Admissao, 20261124030000.
  "naturalidade_freguesia, naturalidade_concelho, naturalidade_pais, " +
  "conjuge_situacao_profissional, dependentes_deficientes, " +
  "habilitacao_academica, habilitacao_data_conclusao";

// Sem `niss`: a coluna esta revogada a `authenticated` ao nivel da coluna.
// Pedi-la faz o PostgREST devolver 42501 e perder a linha inteira.
const COLUNAS_IDENTIFICACAO =
  "id, pessoa_id, organization_id, tipo_documento, numero_documento, validade_documento, " +
  "nif, niss_ultimos4, " +
  // Carta de conducao, 20261124040000.
  "carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade";

const COLUNAS_MORADA =
  "id, pessoa_id, organization_id, tipo, linha1, linha2, codigo_postal, localidade, distrito, " +
  "pais, is_principal";

const COLUNAS_EMERGENCIA =
  "id, pessoa_id, organization_id, nome, relacao, telefone, telefone_alternativo, email, ordem";

const COLUNAS_VINCULO =
  "id, pessoa_id, organization_id, tipo_contrato, regime, horas_periodo, data_inicio, " +
  "data_fim, motivo_termo, periodo_experimental_ate, entidade_legal_org_id, estado, " +
  // Camada de tempo de trabalho, 20261120140000.
  "tipo_trabalho, horas_frequencia, tempo_trabalho_pct, dias_uteis, politica_feriados, " +
  // Coluna GERADA (20261120190000): le-se, nunca se escreve.
  "horas_semanais_equivalentes, " +
  "horas_anuais_maximas, horas_semanais_maximas, periodo_experimental_dias, " +
  // Documentos e periodo experimental sugerido, 20261123040000.
  "categoria_funcao, periodo_experimental_origem, " +
  // Admissao, 20261124080000.
  "categoria_profissional, renovavel, isencao_horario, formacao_inicio, formacao_fim";

const COLUNAS_RETRIBUICAO =
  "id, pessoa_id, organization_id, vinculo_id, valor_base, moeda, periodicidade, " +
  "subsidio_alimentacao, subsidio_alimentacao_modo, valido_de, valido_ate, motivo, " +
  "duodecimos_pct";

const COLUNAS_FARDAMENTO =
  "id, pessoa_id, organization_id, tamanho_cima, tamanho_cima_detalhe, " +
  "tamanho_baixo, tamanho_baixo_detalhe, tamanho_blazer, tamanho_blazer_detalhe";

// Nunca `sindicalizado` a NULL por omissao no ecra: le-se o que a base tiver.
const COLUNAS_SINDICALIZACAO =
  "id, pessoa_id, organization_id, sindicalizado, sindicato, quota_percentagem";

const COLUNAS_HORARIO_PLANEADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, dia_semana, data, hora_inicio, " +
  "hora_fim, nao_trabalha, ordem, valido_de, valido_ate, notas";

const COLUNAS_HORARIO_REALIZADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, planeado_id, data, hora_inicio, " +
  "hora_fim, minutos, origem, estado, validado_por, validado_em, motivo_rejeicao, notas";

// Sem o numero da conta: na base nao existe coluna com ele em claro. Le-se o
// formato, a mascara e -- so no caso do IBAN -- o pais.
const COLUNAS_BANCARIOS =
  "id, pessoa_id, organization_id, formato_conta, titular, banco, conta_ultimos4, " +
  "conta_pais, swift, is_principal";

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
  retribuicao: PessoaRetribuicao | null;
  horarioPlaneado: HorarioPlaneado[];
  horarioRealizado: HorarioRealizado[];
  bancarios: PessoaDadosBancarios | null;
  saude: PessoaDadosSaude | null;
  conta: PessoaConta | null;
  fardamento: PessoaFardamento | null;
  sindicalizacao: PessoaSindicalizacao | null;
}

const FICHA_VAZIA: PessoaFicha = {
  pessoa: null,
  dadosPessoais: null,
  identificacao: null,
  morada: null,
  emergencia: null,
  vinculos: [],
  retribuicao: null,
  horarioPlaneado: [],
  horarioRealizado: [],
  bancarios: null,
  saude: null,
  conta: null,
  fardamento: null,
  sindicalizacao: null,
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

      const [
        dadosPessoais,
        identificacao,
        morada,
        emergencia,
        vinculos,
        retribuicao,
        horarioPlaneado,
        horarioRealizado,
        bancarios,
        saude,
        conta,
        fardamento,
        sindicalizacao,
      ] = await Promise.all([
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
          carregarUm<PessoaRetribuicao>(
            "pessoas_retribuicoes",
            COLUNAS_RETRIBUICAO,
            pessoaId,
            (q) => q.is("deleted_at", null).order("valido_de", { ascending: false }),
          ),
          carregarMuitos<HorarioPlaneado>(
            "pessoas_horario_planeado",
            COLUNAS_HORARIO_PLANEADO,
            pessoaId,
            (q) =>
              q
                .is("deleted_at", null)
                .order("data", { ascending: true })
                .order("ordem", { ascending: true }),
          ),
          carregarMuitos<HorarioRealizado>(
            "pessoas_horario_realizado",
            COLUNAS_HORARIO_REALIZADO,
            pessoaId,
            (q) => q.is("deleted_at", null).order("data", { ascending: false }).limit(200),
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
          carregarUm<PessoaFardamento>("pessoas_fardamento", COLUNAS_FARDAMENTO, pessoaId),
          carregarUm<PessoaSindicalizacao>(
            "pessoas_sindicalizacao",
            COLUNAS_SINDICALIZACAO,
            pessoaId,
          ),
        ]);

      setFicha({
        pessoa: nucleo as Pessoa,
        dadosPessoais,
        identificacao,
        morada,
        emergencia,
        vinculos,
        retribuicao,
        horarioPlaneado,
        horarioRealizado,
        bancarios,
        saude,
        conta,
        fardamento,
        sindicalizacao,
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

  const saveFardamento = useCallback(
    (patch: Partial<PessoaFardamento>) => upsertSatelite("pessoas_fardamento", patch),
    [upsertSatelite],
  );

  /**
   * `pessoas_sindicalizacao` -- ver o comentario do tipo em `types/hr.ts`.
   * Mesmo caminho de escrita que qualquer outro satelite 1:1; a garantia de
   * quem pode gravar vive so na politica de RLS (`hr.pessoas.sindicalizacao.edit`,
   * `is_dangerous`), nao aqui.
   */
  const saveSindicalizacao = useCallback(
    (patch: Partial<PessoaSindicalizacao>) => upsertSatelite("pessoas_sindicalizacao", patch),
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
   * Grava o contrato: actualiza o vinculo activo, ou cria o primeiro.
   *
   * NAO ha caminho para apagar: o DELETE de `pessoas_vinculos` esta bloqueado
   * por politica restritiva, e e assim que se quer -- o historico de contratos
   * nao se apaga. Terminar um contrato e por-lhe `estado = terminado` e abrir
   * outro, nao apagar a linha.
   */
  const saveVinculo = useCallback(
    (vinculoId: string | null, patch: Partial<PessoaVinculo>) =>
      guardar(async (autorId) => {
        const orgId = ficha.pessoa?.organization_id;
        if (!orgId || !pessoaId) return { error: new Error("Ficha sem organizacao resolvida") };
        if (vinculoId) {
          return hrFrom("pessoas_vinculos")
            .update({ ...patch, updated_by: autorId })
            .eq("id", vinculoId);
        }
        return hrFrom("pessoas_vinculos").insert({
          ...patch,
          pessoa_id: pessoaId,
          organization_id: orgId,
          estado: patch.estado ?? "activo",
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [guardar, ficha.pessoa?.organization_id, pessoaId],
  );

  /**
   * Substitui o horario PLANEADO da pessoa pelas linhas dadas.
   *
   * PORQUE E SUBSTITUICAO E NAO DIFERENCA
   * -------------------------------------
   * O editor manipula intervalos livremente -- acrescenta, remove, parte em
   * dois, copia para outros dias. Calcular a diferenca linha a linha daria
   * dezenas de casos e um erro silencioso em cada um. Marcar as linhas vivas
   * como apagadas e inserir as novas e uma operacao que ou corre inteira ou
   * falha visivelmente.
   *
   * O soft delete e um UPDATE, nao um DELETE: o DELETE esta bloqueado por
   * politica e a politica de UPDATE nao exige `deleted_at IS NULL` no USING,
   * exactamente para isto ser possivel.
   */
  const savePlaneado = useCallback(
    (linhas: LinhaPlaneadoParaGravar[]) =>
      guardar(async (autorId) => {
        const orgId = ficha.pessoa?.organization_id;
        if (!orgId || !pessoaId) return { error: new Error("Ficha sem organizacao resolvida") };
        const agora = new Date().toISOString();

        const { error: erroApagar } = await hrFrom("pessoas_horario_planeado")
          .update({ deleted_at: agora, deleted_by: autorId, updated_by: autorId })
          .eq("pessoa_id", pessoaId)
          .is("deleted_at", null);
        if (erroApagar) return { error: erroApagar };

        if (linhas.length === 0) return { error: null };

        // Em vigor = activo OU suspenso. So `activo` deixava o horario
        // planeado sem `vinculo_id` no dia em que o contrato fosse suspenso,
        // e sem erro nenhum a dizer porque.
        const vinculoActivo = ficha.vinculos.find(
          (vinculo) => vinculo.estado === "activo" || vinculo.estado === "suspenso",
        );
        return hrFrom("pessoas_horario_planeado").insert(
          linhas.map((linha) => ({
            ...linha,
            pessoa_id: pessoaId,
            organization_id: orgId,
            vinculo_id: vinculoActivo?.id ?? null,
            created_by: autorId,
            updated_by: autorId,
          })),
        );
      }),
    [guardar, ficha.pessoa?.organization_id, ficha.vinculos, pessoaId],
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

  /**
   * A conta bancaria, em qualquer dos seis formatos.
   *
   * `rpc_hr_definir_conta` substituiu `rpc_hr_definir_iban` e a antiga foi
   * largada na mesma migration (20261120220000): duas funcoes com o mesmo
   * proposito e assinaturas diferentes deixam o PostgREST sem saber qual
   * escolher -- ja parou um botao neste projecto.
   */
  const definirConta = useCallback(
    (args: {
      formato: FormatoConta;
      conta: string;
      titular?: string | null;
      banco?: string | null;
      swift?: string | null;
    }) =>
      guardar(async () =>
        hrRpc("rpc_hr_definir_conta", {
          p_pessoa_id: pessoaId,
          p_formato: args.formato,
          p_conta: args.conta,
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
    saveFardamento,
    saveSindicalizacao,
    saveVinculo,
    savePlaneado,
    revelarNiss,
    definirNiss,
    definirConta,
    ligarConta,
    revogarConta,
  };
}
