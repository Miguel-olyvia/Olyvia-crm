/**
 * A margem de tempo e os desvios de uma organizacao, lidos e escritos so pelas RPCs `rpc_hr_desvios_*` e `rpc_hr_desvio_validar`.
 *  - margem: ler pede `hr.assiduidade.view`; guardar, `hr.assiduidade.gerir`. `null` = «sem margem» (funcionalidade desligada).
 *  - detetar e validar: `hr.assiduidade.gerir`; ninguem valida os proprios desvios.
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto nem a mensagem da base. Defeitos (rede, sem codigo legivel) vao para
 * o registo; recusas de negocio (permissao, estado, folha fechada) nao.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { CHAVE_HORAS_EXTRA } from "@/hooks/hr/useHorasExtra";
import { chaveDoErroDesvios, chavesDeDesviosPorPessoa, codigoDeErroDesvios, rpcDeDesviosIndisponivel } from "@/lib/hr/desviosBase";
import { margemLigadaNoPeriodo, type VersaoMargem } from "@/lib/hr/desviosRelatorio";
import {
  detetarDesvios,
  guardarMargem,
  lerAssinaturasDeDesvios,
  lerMargem,
  listarDesvios,
  validarDesvio,
  type MargemLida,
  type ResultadoValidacao,
  type ResumoDeteccaoDesvios,
} from "@/lib/hr/desviosRpc";

export const CHAVE_DESVIOS_MARGEM = "hr-desvios-margem";

/** O texto traduzido de um erro de uma RPC; defeitos vao para o registo, recusas de negocio nao. */
export function textoDoErroDesvios(erro: unknown, origem: BusinessFlow): string {
  const codigo = codigoDeErroDesvios(erro);
  const permissao = (erro as { code?: unknown } | null)?.code === "42501";
  if (codigo === null && !permissao) captureFlowError(erro, origem);
  return getLocalizedFallback(chaveDoErroDesvios(codigo));
}

export type ResultadoDesvios<T = void> = { ok: true; valor: T } | { ok: false; erro: string };

/* ------------------------------------------------------------------ margem */
export interface MargemHook {
  /** As versoes (da mais recente para a mais antiga); vazio enquanto carrega ou quando a leitura falhou. */
  margem: MargemLida | null;
  aCarregar: boolean;
  aGuardar: boolean;
  /** A base ainda nao tem as RPCs de desvios (migration por aplicar). */
  indisponivel: boolean;
  /** O texto traduzido da falha de leitura; `null` quando correu bem. */
  erro: string | null;
  /** `margemMin` `null` = «sem margem». */
  guardar: (validoDe: string, margemMin: number | null) => Promise<ResultadoDesvios>;
}

export function useDesviosMargem(enabled = true): MargemHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aGuardar, setAGuardar] = useState(false);
  const consulta = useQuery({
    queryKey: [CHAVE_DESVIOS_MARGEM, organizationId],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<MargemLida & { indisponivel: boolean }> => {
      try {
        return { ...(await lerMargem(organizationId as string)), indisponivel: false };
      } catch (erro) {
        if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_config_ler")) return { emVigor: null, versoes: [], indisponivel: true };
        throw new Error(textoDoErroDesvios(erro, "hr-desvios-config-ler"));
      }
    },
  });

  const guardar = useCallback(
    async (validoDe: string, margemMin: number | null): Promise<ResultadoDesvios> => {
      if (!organizationId) return { ok: false, erro: getLocalizedFallback(chaveDoErroDesvios("desvios_config_dados_em_falta")) };
      // Guarda SINCRONA: dois cliques no mesmo instante nao chegam a fazer dois pedidos.
      if (ocupado.current) return { ok: false, erro: getLocalizedFallback("rhDesvios.erro.pedidoEmCurso") };
      ocupado.current = true;
      setAGuardar(true);
      try {
        await guardarMargem(organizationId, validoDe, margemMin);
        // A margem muda o que e desvio: o relatorio e a fila releem.
        await queryClient.invalidateQueries({ queryKey: [CHAVE_DESVIOS_MARGEM, organizationId] });
        await queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId, "fila"] });
        return { ok: true, valor: undefined };
      } catch (erro) {
        return { ok: false, erro: textoDoErroDesvios(erro, "hr-desvios-config-guardar") };
      } finally {
        ocupado.current = false;
        setAGuardar(false);
      }
    },
    [organizationId, queryClient],
  );

  return {
    margem: consulta.data ? { emVigor: consulta.data.emVigor, versoes: consulta.data.versoes } : null,
    aCarregar: consulta.isLoading,
    aGuardar,
    indisponivel: consulta.data?.indisponivel ?? false,
    erro: consulta.error ? (consulta.error as Error).message : null,
    guardar,
  };
}

/* ------------------------------------------------------------------ fecho da folha */
export type PreparacaoDoFecho =
  | { ok: true; assinaturas: Map<string, string> }
  /** A deteccao mudou `mudou` dias: o calculo que o ecra tem ja nao e o dos desvios de agora. Reler e fechar de novo. */
  | { ok: false; motivo: "mudaram"; mudou: number }
  | { ok: false; motivo: "erro"; texto: string };

/** Sem permissao (42501): o cliente nao pode fazer este passo; o fecho na base detecta sozinho e compara as assinaturas. */
const recusadoPorPermissao = (erro: unknown): boolean => (erro as { code?: unknown } | null)?.code === "42501";

/**
 * O que o fecho da folha faz antes de gravar.
 *  1) Le a margem. Sem margem ligada no periodo nao ha nada a fazer (e quem fecha so com `hr.processamento.periodo.gerir` nao
 *     chama a deteccao, que exige gerir a assiduidade). Margem por ler por permissao: a base decide.
 *  2) `rpc_hr_desvios_detetar` sobre o periodo (sem isto a deteccao do fecho, na base, desfazia-se com o erro). Sem permissao (42501)
 *     a base decide (o fecho dela detecta e compara assinaturas).
 *  3) Compara os desvios de agora (`rpc_hr_desvios_listar`) com os que o CALCULO usou (`calculadas`: a chave de cada pessoa
 *     obrigatoria): se alguma diferir (deteccao, decisao ou substituicao desde que o ecra leu), o calculo e mais antigo do que os
 *     desvios e nao se fecha: o chamador recalcula.
 *  4) `rpc_hr_desvios_assinaturas`, imediatamente antes de montar os resultados: cada assinatura segue no `desvios_assinatura` da
 *     pessoa e a base recusa o fecho se houve decisoes entretanto.
 * Uma base sem as RPCs de desvios (migration por aplicar) nao tem desvios: segue sem assinaturas.
 */
export async function prepararFechoComDesvios(args: {
  organizationId: string;
  periodoId: string;
  de: string;
  ate: string;
  /** A chave de desvios que o calculo de cada pessoa obrigatoria usou (vazia = sem desvios). */
  calculadas?: ReadonlyMap<string, string>;
}): Promise<PreparacaoDoFecho> {
  const semAssinaturas: PreparacaoDoFecho = { ok: true, assinaturas: new Map() };
  let versoes: VersaoMargem[] = [];
  try {
    versoes = (await lerMargem(args.organizationId)).versoes;
  } catch (erro) {
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_config_ler")) return semAssinaturas;
    if (!recusadoPorPermissao(erro)) return { ok: false, motivo: "erro", texto: textoDoErroDesvios(erro, "hr-desvios-config-ler") };
    // Margem por ler por permissao: nao se sabe se a organizacao a tem; segue-se para as assinaturas e a base decide.
    return lerAssinaturas(args.periodoId);
  }
  if (!margemLigadaNoPeriodo(versoes, args.de, args.ate)) return semAssinaturas;

  try {
    const resumo = await detetarDesvios(args.organizationId, args.de, args.ate);
    if (resumo.criados + resumo.substituidos > 0) return { ok: false, motivo: "mudaram", mudou: resumo.criados + resumo.substituidos };
  } catch (erro) {
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_detetar")) return semAssinaturas;
    // Sem `hr.assiduidade.gerir`: a base decide (o fecho dela detecta sozinho).
    if (!recusadoPorPermissao(erro)) return { ok: false, motivo: "erro", texto: textoDoErroDesvios(erro, "hr-desvios-detetar") };
  }

  if (args.calculadas && args.calculadas.size > 0) {
    try {
      const atuais = chavesDeDesviosPorPessoa(await listarDesvios(args.organizationId, { estado: null, de: args.de, ate: args.ate }));
      let mudou = 0;
      for (const [pessoaId, usada] of args.calculadas) if ((atuais.get(pessoaId) ?? "") !== usada) mudou += 1;
      if (mudou > 0) return { ok: false, motivo: "mudaram", mudou };
    } catch (erro) {
      if (!rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_listar") && !recusadoPorPermissao(erro)) {
        return { ok: false, motivo: "erro", texto: textoDoErroDesvios(erro, "hr-desvios-listar") };
      }
    }
  }
  return lerAssinaturas(args.periodoId);
}

async function lerAssinaturas(periodoId: string): Promise<PreparacaoDoFecho> {
  try {
    return { ok: true, assinaturas: await lerAssinaturasDeDesvios(periodoId) };
  } catch (erro) {
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_desvios_assinaturas") || recusadoPorPermissao(erro)) return { ok: true, assinaturas: new Map() };
    captureFlowError(erro, "hr-desvios-assinaturas");
    return { ok: false, motivo: "erro", texto: getLocalizedFallback("rhProcReal.fecho.erroAssinaturas") };
  }
}
/* ------------------------------------------------------------------ detetar e validar */
export interface DesviosAcoesHook {
  /** Verdadeiro enquanto uma accao esta a correr. */
  aExecutar: boolean;
  /** Detecta os desvios de `[de, ate]` (ate hoje) para a organizacao ou uma pessoa. A fila refaz-se SEMPRE no fim. */
  detetar: (de: string, ate: string, pessoaId?: string | null) => Promise<ResultadoDesvios<ResumoDeteccaoDesvios>>;
  /** Valida um desvio a validar. `motivo` e obrigatorio (3 a 500) em `aceitar_desvio`. */
  validar: (
    desvioId: string,
    decisao: "normal" | "hora_extra" | "aceitar_desvio",
    motivo?: string,
  ) => Promise<ResultadoDesvios<ResultadoValidacao>>;
}

const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;
/** Quando o desvio ja nao esta como o ecra o mostra (decidido por outro, ou substituido), a fila tem de se refazer. */
const CODIGOS_QUE_DESACTUALIZAM = new Set(["desvio_nao_esta_a_validar", "pessoas_desvios_periodo_fechado"]);

export function useDesviosAcoes(): DesviosAcoesHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aExecutar, setAExecutar] = useState(false);

  const refazer = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId, "fila"] }),
    [organizationId, queryClient],
  );

  const comGuarda = useCallback(async <T,>(corre: () => Promise<T>, aoOcupado: () => T): Promise<T> => {
    if (ocupado.current) return aoOcupado();
    ocupado.current = true;
    setAExecutar(true);
    try {
      return await corre();
    } finally {
      ocupado.current = false;
      setAExecutar(false);
    }
  }, []);

  const recusa = (chave: string): { ok: false; erro: string } => ({ ok: false, erro: getLocalizedFallback(chave) });

  const detetar = useCallback<DesviosAcoesHook["detetar"]>(
    async (de, ate, pessoaId = null) => {
      if (!organizationId) return recusa(chaveDoErroDesvios("desvios_config_dados_em_falta"));
      return comGuarda<ResultadoDesvios<ResumoDeteccaoDesvios>>(
        async () => {
          try {
            const valor = await detetarDesvios(organizationId, de, ate, pessoaId);
            return { ok: true, valor };
          } catch (erro) {
            return { ok: false, erro: textoDoErroDesvios(erro, "hr-desvios-detetar") };
          } finally {
            await refazer();
          }
        },
        () => recusa("rhDesvios.erro.pedidoEmCurso"),
      );
    },
    [organizationId, comGuarda, refazer],
  );

  const validar = useCallback<DesviosAcoesHook["validar"]>(
    async (desvioId, decisao, motivo = "") => {
      const texto = motivo.trim();
      if (decisao === "aceitar_desvio" && texto.length < MOTIVO_MIN) return recusa(chaveDoErroDesvios("desvio_motivo_obrigatorio"));
      if (texto.length > MOTIVO_MAX) return recusa("rhDesvios.erro.motivoLongo");
      return comGuarda<ResultadoDesvios<ResultadoValidacao>>(
        async () => {
          try {
            const valor = await validarDesvio(desvioId, decisao, texto === "" ? null : texto);
            await refazer();
            return { ok: true, valor };
          } catch (erro) {
            // Ja decidido por outro (ou substituido): a lista que o ecra mostra esta desactualizada.
            if (CODIGOS_QUE_DESACTUALIZAM.has(codigoDeErroDesvios(erro) ?? "")) await refazer();
            return { ok: false, erro: textoDoErroDesvios(erro, "hr-desvios-validar") };
          }
        },
        () => recusa("rhDesvios.erro.pedidoEmCurso"),
      );
    },
    [comGuarda, refazer],
  );

  return { aExecutar, detetar, validar };
}
