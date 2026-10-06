/**
 * O cliente acompanha a obra (db/acompanhamento-cliente.sql).
 *
 * Um link privado por obra: o token só existe no link (a base guarda o
 * hash). O cliente entra sem sessão — `rpc_ops_acompanhar` devolve só o que
 * ele deve ver. A equipa gera/revoga o link, escolhe as fotos e pré-visualiza.
 */
import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita, urlsDosAnexos } from "./dados";

export type EstadoFase = "concluida" | "em_curso" | "por_fazer";

export interface FaseCliente {
  ordem: number;
  nome: string;
  inicio: string | null;
  fim: string | null;
  n: number;
  feitas: number;
  estado: EstadoFase;
}

export interface FotoCliente {
  id: string;
  caminho: string;
  legenda: string | null;
  data: string;
  tarefa: string | null;
  fase: string | null;
}

export interface AtrasoCliente {
  motivo: string;
  nota: string | null;
  novo_fim: string | null;
  fim_anterior: string | null;
  fase: string | null;
  data: string;
}

export interface Acompanhamento {
  empresa: { nome?: string; logo_url?: string | null; telefone?: string | null };
  obra: {
    codigo: string;
    titulo: string;
    morada: string | null;
    estado: "planeada" | "em_curso" | "suspensa" | "concluida" | "cancelada";
    inicio: string | null;
    fim: string | null;
    fim_original: string | null;
    iniciada_em: string | null;
    concluida_em: string | null;
  };
  progresso: { percentagem: number; tarefas: number; feitas: number };
  fases: FaseCliente[];
  fase_atual: FaseCliente | null;
  proxima_fase: FaseCliente | null;
  fotos: FotoCliente[];
  atrasos: AtrasoCliente[];
  supervisor: { nome?: string; email?: string | null; telefone?: string | null } | null;
  gerado_em: string;
  /** Só no link do cliente. */
  link_expira_em?: string;
}

export interface EstadoPartilha {
  ativa: boolean;
  criada_em: string | null;
  expira_em: string | null;
  acessos: number;
  ultimo_acesso_em: string | null;
  criada_por: string | null;
  fotos_visiveis: number;
  pode_gerir: boolean;
}

/** O endereço que o cliente abre. */
export function linkDeAcompanhamento(token: string, origem = window.location.origin): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${origem}${base}/acompanhar/${token}`;
}

/** O cliente, sem sessão, com o token do link. */
export async function acompanhar(token: string): Promise<Acompanhamento> {
  const { data, error } = await supabase.rpc("rpc_ops_acompanhar", { p_token: token });
  if (error) {
    const m = error.message ?? "";
    throw new ErroDeDados(
      m.includes("expirou")
        ? "Este link expirou. Peça um novo à equipa da obra."
        : m.includes("inválido")
          ? "Este link não é válido ou foi desativado."
          : "Não foi possível abrir o acompanhamento. Tente daqui a pouco."
    );
  }
  return data as unknown as Acompanhamento;
}

/** A equipa vê exatamente o que o cliente vê. */
export async function previaAcompanhamento(obraId: string): Promise<Acompanhamento> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_acompanhamento_previa", { p_obra_id: obraId });
  if (error) throw new ErroDeDados(error.message || "Não foi possível montar a pré-visualização.");
  return data as unknown as Acompanhamento;
}

export async function estadoPartilha(obraId: string): Promise<EstadoPartilha | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_partilha_estado", { p_obra_id: obraId });
  if (error) {
    // Base ainda sem o acompanhamento-cliente.sql: o botão simplesmente não aparece.
    console.warn("[Obras] estado da partilha:", error.message);
    return null;
  }
  return data as unknown as EstadoPartilha;
}

export async function criarPartilha(obraId: string, dias = 90): Promise<{ token: string; expira_em: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_partilha_criar", { p_obra_id: obraId, p_dias: dias });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gerar o link.");
  return data as unknown as { token: string; expira_em: string };
}

export async function revogarPartilha(obraId: string): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_obra_partilha_revogar", { p_obra_id: obraId });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível desativar o link.");
}

export async function marcarFotoCliente(fotoId: string, visivel: boolean): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_obra_foto_cliente", { p_foto_id: fotoId, p_visivel: visivel });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível mudar a foto.");
}

/** URLs temporários (1 h). Para o cliente, o storage só assina as fotos marcadas. */
export function urlsDasFotos(fotos: readonly FotoCliente[]): Promise<Map<string, string>> {
  return urlsDosAnexos(fotos.map((f) => f.caminho));
}
