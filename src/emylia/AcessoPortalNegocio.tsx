// O acesso do cliente ao portal na página do negócio (2.0, 23/10/2026), igual na proposta simples (NegocioSimples) e no aspeto atual
// (PaginaNegocio):
// · "Acesso ao portal" no cabeçalho: reenvia o acesso (e pede outra vez a conta real) sem mandar um documento novo;
// · o estado da conta real do envio (d.acesso): a preparar, pronta ou com erro, com "Tentar de novo";
// · sem email válido na ficha, o envio ao portal fica à espera do email, pedido aqui mesmo (o envio segue ao gravá-lo).
import { useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modoReal, pedirEmailPortal, usePedidoEmail } from "./acessosPortal";
import { podeTentarDeNovo } from "./estadoContaPortal";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

/** Há alguma coisa do negócio no portal (a proposta, uma versão dela ou uma adenda enviadas). */
export const temPortal = (d: Negocio): boolean => !!d.orc?.enviada || !!d.orc?.versoes?.length || !!d.adendas?.some((a) => !!a.enviada);

/** O botão do cabeçalho (só na 2.0, com a base ligada: no protótipo de sempre as contas são de teste). */
export function BotaoAcessoPortal({ ctx, d, className }: { ctx: Ctx; d: Negocio; className?: string }) {
  if (!modoReal() || !temPortal(d)) return null;
  return (
    <button type="button" onClick={() => ctx.run(() => ctx.A.acessoPortal(d.id))}
      className={className ?? "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline"}>
      <KeyRound className="h-4 w-4" aria-hidden="true" />Acesso ao portal
    </button>
  );
}

const ENVIO: Record<string, string> = {
  proposta: "a proposta", contrato: "o contrato", adenda: "a adenda", contratoAdenda: "o contrato da adenda", acesso: "o acesso ao portal",
};

/** O pedido do email (quando o envio ao portal esperou por ele) e o estado da conta real do cliente. */
export function EstadoAcessoPortal({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const pedido = usePedidoEmail();
  const [email, setEmail] = useState(d.f.email || "");
  // 29/10: o telefone (com indicativo do país) também se pede quando falta: o código de assinatura vai por SMS.
  const [telefone, setTelefone] = useState(d.tel && !d.tel.includes("@") ? d.tel : "");
  const a = d.acesso;
  const pedeEmail = pedido?.deal === d.id;
  if (!pedeEmail && !a) return null;
  const mostraEmail = pedeEmail && pedido.semEmail !== false, mostraTelefone = pedeEmail && !!pedido.semTelefone;
  return (
    <div className="space-y-2">
      {pedeEmail && (
        <form role="group" aria-label={mostraTelefone ? "Contacto do cliente para o portal" : "Email do cliente para o portal"}
          onSubmit={(e) => { e.preventDefault(); ctx.run(() => { ctx.A.emailPortal(d.id, email, telefone); }); }}
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-[15px]">
          <p className="flex items-start gap-2 font-medium text-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            {pedido.mudar
              ? "Mudar o email do cliente: fica na ficha e o acesso ao portal segue para o email novo."
              : mostraEmail && mostraTelefone
                ? <>Falta o email e o telefone do cliente: {ENVIO[pedido.acao] ?? "o envio"} só segue com um email verdadeiro e um telefone com indicativo do país.</>
                : mostraTelefone
                  ? <>Falta o telefone do cliente com indicativo do país: o código para {ENVIO[pedido.acao] ?? "o envio"} vai por SMS.</>
                  : <>Falta o email do cliente: {ENVIO[pedido.acao] ?? "o envio"} só segue para o portal com um email verdadeiro.</>}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {mostraEmail && (
              <label className="grid min-w-0 flex-1 gap-1 text-sm text-muted-foreground">
                Email do cliente
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required
                  className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
              </label>
            )}
            {mostraTelefone && (
              <label className="grid min-w-0 flex-1 gap-1 text-sm text-muted-foreground">
                Telefone do cliente (com indicativo)
                <input type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="off" required
                  placeholder="+351 912 345 678" title="Telefone com o indicativo do país, por exemplo +351 912 345 678"
                  className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
              </label>
            )}
            <Button type="submit" className="h-11">Guardar e enviar</Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => pedirEmailPortal(null)}>Agora não</Button>
          </div>
        </form>
      )}
      {a && !pedeEmail && (
        <p role="status" className={"flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-[15px] " + (a.estado === "erro" ? "border-destructive/40 bg-destructive/10" : a.envio === "falhou" ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card")}>
          {a.estado === "ok" && a.envio !== "falhou" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            : a.estado !== "a criar" ? <AlertTriangle className={"h-4 w-4 shrink-0 " + (a.estado === "erro" ? "text-destructive" : "text-amber-700")} aria-hidden="true" />
            : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {/* 24/10: o email do envio (SMTP da organização) */}
            {a.estado === "ok" && a.envio === "falhou" ? `Email não enviado para ${a.email}: ${a.envioMsg || "erro desconhecido"}`
              : a.estado === "ok" && a.envio === "enviado" ? (a.existia ? `Documento no portal do cliente · aviso enviado para ${a.email}` : `Conta do portal criada · credenciais enviadas para ${a.email}`)
              : a.estado === "ok" ? (a.existia ? `Documento no portal do cliente (${a.email})` : `Conta do portal criada: ${a.email}`)
              : a.estado === "erro" ? `Não foi possível criar a conta do portal (${a.email}): ${a.msg || "erro desconhecido"}`
              : `A preparar a conta do portal (${a.email})…`}
          </span>
          {podeTentarDeNovo(a) && modoReal() && (
            <Button type="button" variant="outline" className="h-10" onClick={() => ctx.run(() => ctx.A.acessoPortal(d.id))}>Tentar de novo</Button>
          )}
        </p>
      )}
    </div>
  );
}
