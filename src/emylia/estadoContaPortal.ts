// O estado da conta real do portal (2.0, 23/10/2026), gravado onde a equipa o vê: no negócio (d.acesso, a parte "deal:<id>") para o
// cliente e na ficha do fornecedor (s.contaPortal, a parte "inv") para o fornecedor. Assim, se a criação falhar (ou o separador fechar a
// meio), a página do negócio e o Inventário dizem-no e deixam "Tentar de novo" — antes só o popup o mostrava, e só a quem o tinha aberto.
// 24/10: e o email do envio (SMTP da organização): se não seguiu, "Email não enviado — Tentar de novo"; se o que falhou levava as
// credenciais, o "Tentar de novo" pede credenciais novas (credenciaisPorEnviar), porque a password antiga não se recupera.
// Sem supabase-js aqui: quem cria a conta é contasReais.ts, chamado pelo protótipo (PrototipoNegocios.tsx, definirCriadorContas).
import type { Estado } from "./motor";
import type { EnvioAcesso, EstadoContaPortal, ResultadoConta } from "./acessosPortal";
import { executar, lerInventario } from "./inventario/loja";

/** Quanto tempo uma conta pode ficar "a criar" antes de se oferecer "Tentar de novo" (o separador que a pedia pode ter fechado). */
export const PRESA_MS = 2 * 60_000;

/** O estado a gravar, a partir do resultado e do estado de antes (`antes`: para não perder as credenciais por enviar). */
export function estadoDoResultado(r: ResultadoConta, email: string, em = new Date().toISOString(), antes?: EstadoContaPortal | null): EstadoContaPortal {
  const pendentes = !!antes?.credenciaisPorEnviar;
  if (r.fase === "erro") return { estado: "erro", email, msg: r.msg, em, ...(pendentes ? { credenciaisPorEnviar: true } : {}) };
  if (r.fase === "a criar") return { estado: "a criar", email, em, ...(pendentes ? { credenciaisPorEnviar: true } : {}) };
  const e: EstadoContaPortal = { estado: "ok", email, em, ...(r.nova ? {} : { existia: true }) };
  if (r.email?.enviado) e.envio = "enviado";
  else if (r.email) {
    e.envio = "falhou"; e.envioMsg = r.email.mensagem;
    if (r.nova || pendentes) e.credenciaisPorEnviar = true;
  }
  return e;
}

/** Pede-se outra vez: falhou, o email não seguiu, ou ficou "a criar" há demasiado tempo. */
export const podeTentarDeNovo = (a: EstadoContaPortal | null | undefined, agora = Date.now()): boolean =>
  !!a && (a.estado === "erro" || a.envio === "falhou" || (a.estado === "a criar" && agora - (Date.parse(a.em) || 0) > PRESA_MS));

/** O estado gravado da conta do envio `e` (o negócio do cliente ou a ficha do fornecedor). */
export function estadoGuardado(S: Estado, e: EnvioAcesso): EstadoContaPortal | null {
  const c = e.conta;
  if (c.tipo === "cliente") return S.deals.find((x) => String(x.id) === c.ref)?.acesso ?? null;
  return lerInventario().suppliers.find((x) => x.id === c.ref)?.contaPortal ?? null;
}

/** O envio deve pedir credenciais novas? (o email das credenciais falhou antes) */
export const credenciaisPorEnviar = (S: Estado, e: EnvioAcesso): boolean => !!estadoGuardado(S, e)?.credenciaisPorEnviar;

/** Grava o estado da conta do envio `e` no Estado (cliente) ou no Inventário (fornecedor). Com a conta pronta, a password temporária
 *  sai do Estado partilhado (só o popup a mostrou, como o email a levaria). */
export function marcarContaPortal(S: Estado, e: EnvioAcesso, r: ResultadoConta): void {
  const c = e.conta, estado = estadoDoResultado(r, c.email, undefined, estadoGuardado(S, e));
  if (c.tipo === "cliente") {
    const d = S.deals.find((x) => String(x.id) === c.ref);
    if (d) d.acesso = estado;
    const a = S.acessos?.[c.email];
    if (r.fase === "pronta" && a) a.password = "";
    return;
  }
  executar((db) => {
    const s = db.suppliers.find((x) => x.id === c.ref);
    if (s) s.contaPortal = estado;
  });
}
