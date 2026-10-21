// O estado partilhado do protótipo (21/10/2026): para testar em live em vários aparelhos (o técnico no telemóvel, o gestor no
// portátil, o cliente no portal), o estado vai para uma tabela isolada no Supabase (prototipo_estado) e volta para todos.
// · Partes: "global" (o que não é de um negócio), "deal:<id>" (um negócio cada), "inv" (o Inventário) e "frota".
//   O que é de quem vê (o papel, o ecrã, o negócio aberto, o técnico) não se partilha.
// · Escrever: a cada mudança, as partes que mudaram (comparadas com o último JSON sincronizado) gravam-se com a versão que se
//   conhecia; se entretanto outro aparelho mudou a mesma parte, ganha a dele e avisa-se ("repita a última ação").
// · Ler: de 2 em 2 segundos, as versões de todas as partes; as que mudaram descarregam-se e aplicam-se.
// · Sala: ?sala=<nome> no link separa testes (por omissão "principal").
// Sem rede ou sem tabela, o protótipo continua só neste browser (localStorage), como antes.
import { supabase } from "@/integrations/supabase/client";
import type { Estado, Negocio } from "./motor";

const TABELA = "prototipo_estado";
const LOCAIS = ["role", "view", "deal", "op", "filtro", "novo", "confirmPerda", "pulse", "revisao", "aspeto", "leitura", "tec"] as const;

export type EstadoSync = "a ligar" | "ao vivo" | "sem ligação";
interface Parte { chave: string; dados: unknown }
interface Fonte {
  /** O nome da parte e como se lê e aplica. */
  chave: string;
  ler: () => unknown;
  aplicar: (dados: unknown) => void;
}

export const sala = (): string => {
  try { return (new URLSearchParams(window.location.search).get("sala") || "principal").slice(0, 40); } catch { return "principal"; }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from(TABELA);
const novaVersao = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

/* ------------------------------------------------------------------ dividir e juntar o Estado */
export function partesDoEstado(S: Estado): Parte[] {
  const g: Record<string, unknown> = { ...S, ordem: S.deals.map((d) => d.id) };
  delete g.deals;
  for (const k of LOCAIS) delete g[k];
  return [{ chave: "global", dados: g }, ...S.deals.map((d) => ({ chave: "deal:" + d.id, dados: d }))];
}
/** Junta as partes remotas ao Estado local: o que é de quem vê fica deste aparelho. */
export function juntarEstado(local: Estado, global: Record<string, unknown> | null, deals: Map<number, Negocio>): Estado {
  const S = { ...local, ...(global ?? {}) } as Estado & { ordem?: number[] };
  for (const k of LOCAIS) (S as unknown as Record<string, unknown>)[k] = (local as unknown as Record<string, unknown>)[k];
  const ordem = S.ordem ?? local.deals.map((d) => d.id);
  delete S.ordem;
  S.deals = ordem.map((id) => deals.get(id) ?? local.deals.find((d) => d.id === id)).filter(Boolean) as Negocio[];
  return S;
}

/* ------------------------------------------------------------------ o motor da sincronização */
class Sincronizador {
  private versoes = new Map<string, number>();
  private json = new Map<string, string>();
  private fontes: Fonte[] = [];
  private estadoFonte: { ler: () => Estado; aplicar: (S: Estado) => void } | null = null;
  private relogio = 0;
  private aEnviar = 0;
  private ocupado = false;
  estado: EstadoSync = "a ligar";
  private ouvintes = new Set<() => void>();
  private avisarConflito: ((t: string) => void) | null = null;
  ligado = false;

  ouvir(fn: () => void) { this.ouvintes.add(fn); return () => { this.ouvintes.delete(fn); }; }
  private mudar(e: EstadoSync) { if (this.estado !== e) { this.estado = e; for (const f of this.ouvintes) f(); } }

  /** Liga o Estado (as partes global e deal:*), mais as fontes simples (inv, frota). */
  async ligar(estado: { ler: () => Estado; aplicar: (S: Estado) => void }, fontes: Fonte[], conflito: (t: string) => void, comecar: () => void) {
    // nos testes, nunca: só no browser a sério
    if (this.ligado || import.meta.env.MODE === "test" || import.meta.env.VITEST) { this.mudar("sem ligação"); return; }
    this.ligado = true;
    this.estadoFonte = estado; this.fontes = fontes; this.avisarConflito = conflito;
    try {
      const { data, error } = await tabela().select("chave, dados, versao").eq("sala", sala());
      if (error) throw error;
      const linhas = (data ?? []) as { chave: string; dados: unknown; versao: number }[];
      if (linhas.some((l) => l.chave === "global")) {
        // já há estado partilhado: aplica-o (é o de todos) e fica a conhecer as versões
        this.aplicarRemoto(linhas);
      } else {
        // a primeira vez nesta sala: começa dos dados de exemplo (e não do que este aparelho tinha guardado)
        comecar();
        await this.enviar(true);
      }
      this.mudar("ao vivo");
    } catch {
      this.mudar("sem ligação");
    }
    this.relogio = window.setInterval(() => { void this.puxar(); }, 2000);
  }

  desligar() { window.clearInterval(this.relogio); window.clearTimeout(this.aEnviar); this.ligado = false; }

  /** Uma mudança local: envia daqui a pouco (junta várias mudanças seguidas). */
  mudou() {
    if (!this.ligado) return;
    window.clearTimeout(this.aEnviar);
    this.aEnviar = window.setTimeout(() => { void this.enviar(false); }, 250);
  }

  private todasAsPartes(): Parte[] {
    const S = this.estadoFonte!.ler();
    return [...partesDoEstado(S), ...this.fontes.map((f) => ({ chave: f.chave, dados: f.ler() }))];
  }

  private async enviar(tudo: boolean) {
    if (this.ocupado) { this.mudou(); return; }
    this.ocupado = true;
    try {
      for (const p of this.todasAsPartes()) {
        const j = JSON.stringify(p.dados);
        if (!tudo && this.json.get(p.chave) === j) continue;
        const conhecida = this.versoes.get(p.chave), v = novaVersao();
        if (conhecida == null) {
          const { error } = await tabela().insert({ sala: sala(), chave: p.chave, dados: p.dados, versao: v });
          if (error) { await this.conflito(p.chave); continue; }
        } else {
          const { data, error } = await tabela().update({ dados: p.dados, versao: v, atualizado: new Date().toISOString() })
            .eq("sala", sala()).eq("chave", p.chave).eq("versao", conhecida).select("chave");
          if (error) throw error;
          if (!data?.length) { await this.conflito(p.chave); continue; }
        }
        this.versoes.set(p.chave, v); this.json.set(p.chave, j);
      }
      this.mudar("ao vivo");
    } catch {
      this.mudar("sem ligação");
    } finally {
      this.ocupado = false;
    }
  }

  /** Outro aparelho mudou a mesma parte entretanto: fica a versão dele. */
  private async conflito(chave: string) {
    const { data } = await tabela().select("chave, dados, versao").eq("sala", sala()).eq("chave", chave);
    // a parte desapareceu (a sala foi limpa): volta a criar-se com a deste aparelho
    if (!data?.length) { this.versoes.delete(chave); this.json.delete(chave); this.mudou(); return; }
    this.aplicarRemoto(data);
    this.avisarConflito?.(chave.startsWith("deal:") ? "Alguém mudou este negócio ao mesmo tempo. Já tem a versão dele: repita a última ação, se for preciso." : "Os dados foram atualizados por outra pessoa. Repita a última ação, se for preciso.");
  }

  private async puxar() {
    if (this.ocupado) return;
    try {
      const { data, error } = await tabela().select("chave, versao").eq("sala", sala());
      if (error) throw error;
      const mudaram = ((data ?? []) as { chave: string; versao: number }[]).filter((l) => this.versoes.get(l.chave) !== l.versao).map((l) => l.chave);
      if (mudaram.length) {
        const { data: d2, error: e2 } = await tabela().select("chave, dados, versao").eq("sala", sala()).in("chave", mudaram);
        if (e2) throw e2;
        if (!this.ocupado) this.aplicarRemoto(d2 ?? []);
      }
      this.mudar("ao vivo");
    } catch {
      this.mudar("sem ligação");
    }
  }

  private aplicarRemoto(linhas: { chave: string; dados: unknown; versao: number }[]) {
    let global: Record<string, unknown> | null = null;
    const deals = new Map<number, Negocio>();
    for (const l of linhas) {
      this.versoes.set(l.chave, l.versao); this.json.set(l.chave, JSON.stringify(l.dados));
      if (l.chave === "global") global = l.dados as Record<string, unknown>;
      else if (l.chave.startsWith("deal:")) deals.set(Number(l.chave.slice(5)), l.dados as Negocio);
      else this.fontes.find((f) => f.chave === l.chave)?.aplicar(l.dados);
    }
    if (global || deals.size) {
      const local = this.estadoFonte!.ler();
      this.estadoFonte!.aplicar(juntarEstado(local, global, deals));
    }
  }
}

export const sinc = new Sincronizador();
