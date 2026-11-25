// 25/11 (Rúben: «queremos estes serviços e microtarefas na Olyvia, e substituir em todo o lado»). As microtarefas de cada serviço do
// Catálogo da organização (cat_servico_microtarefas, SQL 19 / migration 20270126420000): lidas com o Catálogo (cat_ler_microtarefas) e
// gravadas na ficha do serviço (cat_guardar_microtarefas). Sem a migration aplicada, a leitura falha calada e a app usa a proposta (as
// tarefas da Mudelar no Infraspeak); a gravação diz «Ainda não disponível nesta base». No protótipo (sem organização) ficam em memória.
import type { SupabaseClient } from "@supabase/supabase-js";
// (o Catálogo e o cliente da base importam-se dentro das funções: microtarefas.ts usa este módulo e um import aqui em cima fecharia um ciclo)

/** Uma microtarefa da ficha de um serviço. `ref`: a tarefa da Mudelar no Infraspeak de onde veio (dados/infraspeakMudelar.ts). */
export interface MicroServico { nome: string; horas?: number; quem?: string; checklist: string[]; ref?: string }

let porServico = new Map<string, MicroServico[]>();
/** A base já respondeu (com a migration): as listas são as da base. */
let lida = false;
const ouvintes = new Set<() => void>();
let versao = 0;
const avisar = () => { versao++; for (const f of ouvintes) f(); };
export const ouvirMicrotarefasServicos = (f: () => void): (() => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const versaoMicrotarefasServicos = (): number => versao;

/** A lista do serviço (pela chave do motor), ou null se o serviço não tem microtarefas próprias. */
export function microtarefasDoServico(sid: string | undefined): MicroServico[] | null {
  if (!sid) return null;
  const L = porServico.get(sid);
  return L && L.length ? L.map((m) => ({ ...m, checklist: [...m.checklist] })) : null;
}
/** Os serviços com microtarefas próprias. */
export const servicosComMicrotarefas = (): string[] => [...porServico.keys()].filter((k) => (porServico.get(k)?.length ?? 0) > 0);
export const microtarefasNaBase = (): boolean => lida;

const limpar = (x: unknown): MicroServico | null => {
  const o = x as { nome?: unknown; horas?: unknown; quem?: unknown; checklist?: unknown; ref?: unknown } | null;
  const nome = typeof o?.nome === "string" ? o.nome.trim() : "";
  if (!nome) return null;
  const horas = typeof o?.horas === "number" ? o.horas : typeof o?.horas === "string" && o.horas.trim() ? Number(o.horas) : undefined;
  return {
    nome, ...(horas != null && Number.isFinite(horas) ? { horas } : {}),
    ...(typeof o?.quem === "string" && o.quem.trim() ? { quem: o.quem.trim() } : {}),
    checklist: Array.isArray(o?.checklist) ? o!.checklist.filter((c): c is string => typeof c === "string" && !!c.trim()) : [],
    ...(typeof o?.ref === "string" && o.ref ? { ref: o.ref } : {}),
  };
};

/** Lê as microtarefas dos serviços da organização (depois do Catálogo, que dá as chaves). Falha calada (sem a migration: fica a proposta). */
export async function lerMicrotarefasServicos(sb: Pick<SupabaseClient, "rpc">, org: string): Promise<boolean> {
  try {
    const { chaveDoServicoLido } = await import("./catalogoLeve");
    const r = (await sb.rpc("cat_ler_microtarefas" as never, { p_org: org } as never)) as { data?: unknown; error?: unknown } | undefined;
    if (!r || r.error) return false;
    const L = (r.data as { servicos?: unknown } | null)?.servicos;
    if (!Array.isArray(L)) return false;
    const m = new Map<string, MicroServico[]>();
    for (const s of L as { service_id?: unknown; chave?: unknown; microtarefas?: unknown }[]) {
      const id = typeof s.service_id === "string" ? s.service_id : "";
      const k = (typeof s.chave === "string" && s.chave) || chaveDoServicoLido(id) || id;
      const lista = Array.isArray(s.microtarefas) ? s.microtarefas.map(limpar).filter((x): x is MicroServico => !!x) : [];
      if (k && lista.length) m.set(k, lista);
    }
    porServico = m; lida = true; avisar();
    return true;
  } catch {
    return false;
  }
}

/** Grava a lista de um serviço (substitui). Sem organização (protótipo), fica em memória. */
export async function gravarMicrotarefasServico(sid: string, lista: MicroServico[]): Promise<{ ok: true } | { ok: false; erro: string }> {
  const limpa = lista.map(limpar).filter((x): x is MicroServico => !!x);
  const { idDoServicoLido, orgDoCatalogoLido } = await import("./catalogoLeve");
  const org = orgDoCatalogoLido();
  if (org) {
    const id = idDoServicoLido(sid);
    if (!id) return { ok: false, erro: "Este serviço ainda não está gravado no Catálogo. Grave-o primeiro." };
    const FRASE = "Não foi possível gravar as microtarefas.";
    const { AINDA_NAO, erroAmigavel, rpcLivre } = await import("../fichaProdutoDados");
    try {
      const { error } = await rpcLivre("cat_guardar_microtarefas", { p_org: org, p_servico: id, p_lista: limpa });
      if (error) {
        if (/^CT00\d$/.test(error.code ?? "") && error.message) return { ok: false, erro: error.message };
        return { ok: false, erro: erroAmigavel(error, FRASE) === AINDA_NAO ? `${AINDA_NAO}: falta colar o SQL 19 (microtarefas dos serviços).` : FRASE };
      }
    } catch {
      return { ok: false, erro: FRASE };
    }
  }
  if (limpa.length) porServico.set(sid, limpa); else porServico.delete(sid);
  avisar();
  return { ok: true };
}

/** Para os testes: esvazia (ou define) as listas. */
export function definirMicrotarefasServicos(m: Record<string, MicroServico[]> | null, naBase = false): void {
  porServico = new Map(Object.entries(m ?? {}));
  lida = naBase; avisar();
}
