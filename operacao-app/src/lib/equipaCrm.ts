/**
 * A equipa de Operações, lida do Olyvia — não copiada.
 *
 * As pessoas já existem no CRM (nome, email, telefone, papel, equipa, agenda)
 * e, onde o módulo de RH estiver instalado, têm ficha (cargo, vínculo, local,
 * ausências). `rpc_ops_equipa_crm` (db/pessoas-crm.sql) junta tudo isso ao que
 * é só de Operações: função, ativo, especialidades, zona-base e custo/hora.
 *
 * Se a RPC ainda não estiver instalada na base, cai para as leituras antigas
 * (ops_v_pessoas + perfil): a equipa continua a abrir, só sem os dados do
 * CRM/RH. Assim o ecrã pode ir para o ar antes do SQL.
 */
import { supabase } from "./supabase";
import { ErroDeDados } from "./dados";
import { custosHora, listarPessoas } from "./config";
import { listarSkills, planeamentoDaEquipa } from "./obras";

export interface PessoaEquipa {
  utilizador_id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  avatar_url: string | null;
  /** CRM */
  cargo_crm: string | null;
  local_crm: string | null;
  papel_crm: string | null;
  papel_crm_codigo: string | null;
  equipa_crm: string | null;
  distritos: string[] | null;
  codigos_postais: string[] | null;
  /** Operações */
  em_operacoes: boolean;
  funcao: string | null;
  ativo: boolean | null;
  zona_base: string | null;
  skills: string[];
  skills_nomes: string[];
  custo_hora: number | null;
  pode_ver_custos: boolean;
  /** RH */
  rh_disponivel: boolean;
  rh_ligado: boolean;
  numero_interno: string | null;
  cargo: string | null;
  local_trabalho: string | null;
  tipo_contrato: string | null;
  regime: string | null;
  categoria_funcao: string | null;
  estado_contrato: string | null;
  data_admissao: string | null;
  /** Ausência atual ou próxima (60 dias) */
  ausencia_tipo: string | null;
  ausencia_inicio: string | null;
  ausencia_fim: string | null;
  ausencia_origem: "crm" | "rh" | null;
}

export interface EquipaCrm {
  pessoas: PessoaEquipa[];
  /** false = a RPC não existe ainda na base; os dados do CRM/RH não vieram. */
  ligadaAoCrm: boolean;
  rhDisponivel: boolean;
  podeVerCustos: boolean;
}

function rpcEmFalta(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
}

export async function listarEquipaCrm(orgId: string): Promise<EquipaCrm> {
  const { data, error } = await supabase.rpc("rpc_ops_equipa_crm", { p_org: orgId });

  if (error) {
    if (rpcEmFalta(error)) return listarEquipaSemCrm(orgId);
    // eslint-disable-next-line no-console
    console.error("[Operações] carregar a equipa:", error);
    throw new ErroDeDados(error.message || "Não foi possível carregar a equipa.");
  }

  const pessoas = ((data ?? []) as Record<string, unknown>[]).map(normalizar);
  return {
    pessoas,
    ligadaAoCrm: true,
    rhDisponivel: pessoas.some((p) => p.rh_disponivel),
    podeVerCustos: pessoas.some((p) => p.pode_ver_custos),
  };
}

function normalizar(r: Record<string, unknown>): PessoaEquipa {
  const p = r as unknown as PessoaEquipa;
  return {
    ...p,
    skills: (p.skills ?? []) as string[],
    skills_nomes: (p.skills_nomes ?? []) as string[],
    custo_hora: p.custo_hora == null ? null : Number(p.custo_hora),
    em_operacoes: !!p.em_operacoes,
    pode_ver_custos: !!p.pode_ver_custos,
    rh_disponivel: !!p.rh_disponivel,
    rh_ligado: !!p.rh_ligado,
  };
}

/** O caminho antigo, para quando db/pessoas-crm.sql ainda não correu. */
async function listarEquipaSemCrm(orgId: string): Promise<EquipaCrm> {
  const [ps, cs, plano, skills] = await Promise.all([
    listarPessoas(orgId),
    custosHora(orgId),
    planeamentoDaEquipa(orgId).catch(() => new Map<string, { zona: string | null; skills: string[] }>()),
    listarSkills(orgId).catch(() => []),
  ]);
  const nomeSkill = new Map(skills.map((k) => [k.id, k.nome]));
  const podeVerCustos = cs.size > 0;
  return {
    ligadaAoCrm: false,
    rhDisponivel: false,
    podeVerCustos,
    pessoas: ps.map((p) => {
      const pl = plano.get(p.utilizador_id);
      const ids = pl?.skills ?? [];
      return {
        utilizador_id: p.utilizador_id,
        nome: p.nome,
        email: p.email,
        telefone: null,
        avatar_url: null,
        cargo_crm: null,
        local_crm: null,
        papel_crm: null,
        papel_crm_codigo: null,
        equipa_crm: null,
        distritos: null,
        codigos_postais: null,
        em_operacoes: p.em_operacoes,
        funcao: p.funcao,
        ativo: p.ativo,
        zona_base: pl?.zona ?? null,
        skills: ids,
        skills_nomes: ids.map((id) => nomeSkill.get(id)).filter((x): x is string => !!x),
        custo_hora: podeVerCustos ? (cs.get(p.utilizador_id) ?? null) : null,
        pode_ver_custos: podeVerCustos,
        rh_disponivel: false,
        rh_ligado: false,
        numero_interno: null,
        cargo: null,
        local_trabalho: null,
        tipo_contrato: null,
        regime: null,
        categoria_funcao: null,
        estado_contrato: null,
        data_admissao: null,
        ausencia_tipo: null,
        ausencia_inicio: null,
        ausencia_fim: null,
        ausencia_origem: null,
      };
    }),
  };
}

export const ROTULO_TIPO_CONTRATO: Record<string, string> = {
  sem_termo: "Sem termo",
  termo_certo: "Termo certo",
  termo_incerto: "Termo incerto",
  estagio: "Estágio",
  prestacao_servicos: "Prestação de serviços",
  temporario: "Temporário",
};

export const ROTULO_REGIME: Record<string, string> = {
  tempo_inteiro: "Tempo inteiro",
  tempo_parcial: "Tempo parcial",
};

export const ROTULO_CATEGORIA_FUNCAO: Record<string, string> = {
  geral: "Geral",
  tecnica_confianca: "Técnica / confiança",
  direcao_quadro_superior: "Direção / quadro superior",
};

export const ROTULO_ESTADO_CONTRATO: Record<string, string> = {
  em_curso: "Em curso",
  suspenso: "Suspenso",
  terminado: "Terminado",
};
