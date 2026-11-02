// Os avisos ao cliente por email (2/11/2026, reunião com o Ricardo: "não recebi informação nenhuma, nem de início de obra, nem que
// tenho uma fatura para pagar"). O portal já mostra tudo (a vista do cliente, 20270103800000); faltava dizer ao cliente que há novidades.
//
// Cada aviso tem uma chave que descreve o estado (a fatura X por pagar, a fase 2 concluída…). Depois de gravar a vista, o CRM manda
// as chaves do estado atual a neg_avisos_cliente_registar (20270104000000), que devolve só as que ninguém avisou antes. Cada uma vai
// por email (send-email, o SMTP da organização) e o resultado volta à base (neg_avisos_cliente_resultado: uma falha tenta outra vez).
// Na primeira vez de um negócio a base regista tudo sem devolver nada: um negócio antigo não recebe os avisos do que já aconteceu.
//
// A proposta e o contrato já têm o email deles (create-client-portal-access): aqui não se repetem.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negocio } from "../motor";
import { FASES_OBRA, type FaseObra } from "../fasesObra";
import { rotuloDia } from "../preparacaoObra";
import { nomeEmpresa } from "../acessosPortal";

export interface AvisoCliente {
  /** A chave estável do estado (é o que a base guarda). */
  chave: string;
  assunto: string;
  /** O texto do email (frases curtas, uma por linha). */
  linhas: string[];
}

const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** As fases do plano e se estão concluídas (todas as tarefas validadas pelo responsável de obra). */
function fasesConcluidas(d: Negocio): FaseObra[] {
  const p = d.obra.plano;
  if (!p || (p.estado !== "em curso" && p.estado !== "concluída")) return [];
  const fases = [...new Set(p.tasks.map((t) => t.fase ?? 0))].filter(Boolean) as FaseObra[];
  return fases.filter((f) => p.tasks.filter((t) => t.fase === f).every((t) => t.exec?.estado === "validada")).sort();
}

/** Os avisos que o estado do negócio pede (todos, mesmo os já enviados: a base filtra). */
export function avisosDoNegocio(d: Negocio): AvisoCliente[] {
  const r: AvisoCliente[] = [];
  const o = d.orc;
  if (!o?.enviada || d.perdido) return r;
  const assinado = o.vendaDireta || o.contrato === "assinado";

  // as faturas das prestações que o Financeiro registou: por pagar e pagas
  for (const f of (d.fin.tranches ?? []).filter((x) => !x.daDemo)) {
    r.push({ chave: `fatura:${f.id}`, assunto: `Fatura ${f.numero} por pagar`,
      linhas: [`Emitimos a fatura ${f.numero}, de ${eur(f.valor)} €.`, "Pode vê-la e ver como pagar no portal.", "Depois de pagar, avise-nos no portal."] });
    if (f.pagamento) r.push({ chave: `pago:${f.id}`, assunto: `Recebemos o pagamento da fatura ${f.numero}`,
      linhas: [`Recebemos o pagamento da fatura ${f.numero}.`, "Obrigado.", f.recibo ? `O recibo ${f.recibo} está no portal.` : "O recibo fica no portal."] });
  }
  if (!assinado) return r;

  const p = d.obra.plano;
  if (p && p.estado !== "por aprovar") {
    r.push({ chave: "plano", assunto: "O plano do seu serviço está pronto",
      linhas: [p.origem === "orcamento" ? `O serviço começa a ${rotuloDia(p, 0)}.` : "O plano do serviço está pronto.", "Pode ver as fases e as datas no portal."] });
  }
  if (p && (p.estado === "em curso" || p.estado === "concluída")) {
    r.push({ chave: "servico-inicio", assunto: "O seu serviço começou",
      linhas: ["A equipa começou o seu serviço.", "No portal vê o que se faz em cada dia, com as fotografias.", "Se tiver alguma dúvida, escreva-nos na conversa do portal."] });
    for (const f of fasesConcluidas(d)) {
      const nome = FASES_OBRA[f - 1]?.curto ?? `Fase ${f}`;
      r.push({ chave: `fase:${f}`, assunto: `Fase concluída: ${nome}`,
        linhas: [`Terminámos a fase "${nome}".`, "As fotografias estão no portal."] });
    }
  }
  const au = d.obra.auto;
  if (au) {
    r.push({ chave: `auto:${au.n}`, assunto: "O seu serviço está pronto: falta receber",
      linhas: ["Terminámos o seu serviço.", `Veja o serviço com calma e assine o auto de receção ${au.n} no portal.`, "A garantia começa no dia em que assinar."] });
  }
  return r;
}

/** O email: texto simples em HTML, com o botão para o portal. */
export function htmlAviso(a: AvisoCliente, nome: string, empresa: string, link: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ola = nome.trim() ? `Olá ${esc(nome.trim().split(/\s+/)[0])},` : "Olá,";
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px">`,
    `<p>${ola}</p>`,
    ...a.linhas.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`),
    `<p style="margin:24px 0"><a href="${esc(link)}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Abrir o portal</a></p>`,
    `<p style="color:#64748b;font-size:13px">${esc(empresa)}</p>`,
    `</div>`,
  ].join("");
}

export interface EnvioAvisos { enviados: string[]; erros: string[] }

/** As chaves já registadas nesta sessão (negócio → chaves): sem mudança, não se pergunta outra vez à base. Com erros, esquece-se,
 *  para tentar de novo (a base só devolve um aviso que falhou 10 minutos depois). */
const registadas = new Map<string, string>();

/** Regista o estado do negócio e envia os avisos novos. Sem email do cliente, não faz nada (o primeiro registo fica para quando houver). */
export async function avisarCliente(
  sb: SupabaseClient, org: string, negocioId: string, d: Negocio, origem: string, empresa = nomeEmpresa(),
): Promise<EnvioAvisos> {
  const out: EnvioAvisos = { enviados: [], erros: [] };
  const email = (d.f.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out;
  const avisos = avisosDoNegocio(d);
  if (!avisos.length) return out;
  const marca = email + "|" + avisos.map((a) => a.chave).join(",");
  if (registadas.get(negocioId) === marca) return out;
  const { data, error } = await sb.rpc("neg_avisos_cliente_registar" as never, { p_org: org, p_negocio_id: negocioId, p_chaves: avisos.map((a) => a.chave) } as never);
  if (error) {
    // a base ainda sem a função (migration por aplicar): nada a fazer
    if (error.code === "PGRST202" || error.code === "42883") return out;
    out.erros.push(error.message);
    return out;
  }
  const novas = new Set(((data as { novas?: string[] } | null)?.novas) ?? []);
  const link = `${origem.replace(/\/$/, "")}/client-portal/negocios/${negocioId}`;
  for (const a of avisos.filter((x) => novas.has(x.chave))) {
    let ok = false, erro: string | null = null;
    try {
      const r = await sb.functions.invoke("send-email", { body: { organization_id: org, to: email, subject: a.assunto, html: htmlAviso(a, d.nome, empresa, link) } });
      const corpo = r.data as { error?: string; success?: boolean } | null;
      if (r.error) erro = r.error.message;
      else if (corpo?.error) erro = String(corpo.error);
      else ok = true;
    } catch (e) { erro = (e as Error).message; }
    await sb.rpc("neg_avisos_cliente_resultado" as never, { p_org: org, p_negocio_id: negocioId, p_chave: a.chave, p_enviado: ok, p_erro: erro } as never);
    if (ok) out.enviados.push(a.chave); else out.erros.push(`${a.chave}: ${erro}`);
  }
  if (out.erros.length) registadas.delete(negocioId); else registadas.set(negocioId, marca);
  return out;
}
