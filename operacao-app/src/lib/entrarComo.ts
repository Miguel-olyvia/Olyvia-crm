/**
 * "Entrar como" — o admin abre a app como outra pessoa da equipa.
 *
 * A sessão do admin é guardada (nesta aba, em sessionStorage) antes de se
 * trocar pela da pessoa, e reposta em "Voltar à minha conta". As regras de
 * quem pode entrar como quem vivem na base (db/entrar-como.sql) e são
 * verificadas pela edge function `ops-entrar-como`; aqui só se troca a sessão.
 *
 * Ao sair da pessoa usa-se signOut({ scope: "local" }): o "global" terminaria
 * TODAS as sessões dela, incluindo a do telemóvel com que está a trabalhar.
 */
import { supabase } from "./supabase";
import { ErroDeEscrita } from "./dados";

const CHAVE = "operacao-app-entrar-como";
/** Ao fim disto volta-se sozinho à conta do admin. */
export const DURACAO_MAX_MS = 60 * 60 * 1000;

export interface EstadoEntrarComo {
  nome: string;
  funcao: string;
  orgId: string;
  logId: string;
  desde: number;
  admin: { access_token: string; refresh_token: string };
}

export function estadoEntrarComo(): EstadoEntrarComo | null {
  try {
    const v = sessionStorage.getItem(CHAVE);
    return v ? (JSON.parse(v) as EstadoEntrarComo) : null;
  } catch {
    return null;
  }
}

function avisar() {
  window.dispatchEvent(new Event("operacao-entrar-como"));
}

export async function entrarComo(orgId: string, alvoId: string): Promise<void> {
  if (estadoEntrarComo()) throw new ErroDeEscrita("Já estás a ver como outra pessoa. Volta primeiro à tua conta.");

  const { data: atual } = await supabase.auth.getSession();
  const s = atual.session;
  if (!s) throw new ErroDeEscrita("Sessão expirada. Entra outra vez.");

  const { data, error } = await supabase.functions.invoke("ops-entrar-como", {
    body: { org_id: orgId, alvo_id: alvoId },
  });
  if (error || !data?.token_hash) {
    let msg = (data as { error?: string } | null)?.error;
    // Em erro, o invoke devolve a resposta em error.context.
    const ctx = (error as { context?: Response } | null)?.context;
    if (!msg && ctx && typeof ctx.json === "function") {
      try {
        msg = ((await ctx.json()) as { error?: string }).error;
      } catch {
        /* sem corpo */
      }
    }
    throw new ErroDeEscrita(msg || "Não foi possível entrar como essa pessoa.");
  }

  const estado: EstadoEntrarComo = {
    nome: data.nome,
    funcao: data.funcao,
    orgId,
    logId: data.log_id,
    desde: Date.now(),
    admin: { access_token: s.access_token, refresh_token: s.refresh_token },
  };
  // Guardar ANTES de trocar: se a troca falhar a meio, há sempre caminho de volta.
  sessionStorage.setItem(CHAVE, JSON.stringify(estado));

  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
  if (otpErr) {
    sessionStorage.removeItem(CHAVE);
    await supabase.auth.setSession(estado.admin);
    throw new ErroDeEscrita("Não foi possível abrir a sessão dessa pessoa.");
  }
  try {
    localStorage.setItem("operacao-app-active-org", orgId);
  } catch {
    /* ignora */
  }
  avisar();
}

export async function voltarAMinhaConta(): Promise<void> {
  const estado = estadoEntrarComo();
  if (!estado) return;
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.setSession(estado.admin);
  sessionStorage.removeItem(CHAVE);
  if (error) {
    avisar();
    throw new ErroDeEscrita("A tua sessão expirou entretanto. Entra outra vez.");
  }
  // Fecha o registo (já com a sessão do admin). Se falhar, a entrada fica sem hora de fim — não bloqueia.
  await supabase.rpc("rpc_ops_entrar_como_terminar", { p_log_id: estado.logId });
  try {
    localStorage.setItem("operacao-app-active-org", estado.orgId);
  } catch {
    /* ignora */
  }
  avisar();
}
