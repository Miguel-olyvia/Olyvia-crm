// FERRAMENTAS-TESTE (temporário, remover antes da main)
// 11/11 (Rafael): o painel «Ferramentas de teste» no negócio, para pôr negócios depressa no Financeiro sem criar emails de cliente nem ir
// ao portal. Para retirar: apagar este ficheiro, o teste ao lado e as linhas marcadas «FERRAMENTAS-TESTE» em NegocioSimples.tsx.
//
// Só aparece com as DUAS condições:
//  (a) o ambiente de testes: VITE_FERRAMENTAS_TESTE === "1", ou o endereço tem «testarh» (o deploy de testes), ou é localhost;
//  (b) o modo de teste da base (useModoTeste): a página real só o liga quando fn_modo_teste_para_mim diz que sim, isto é, a base tem o
//      interruptor app_modo_teste ligado (só a base do ramo RH; em produção a linha nasce desligada) E quem entrou é super admin ou
//      admin de sistema da organização (fn_super_admin_de). O servidor volta a verificar as duas coisas em cada ação.
// E só com a conta real (modoReal): o protótipo e o estúdio, sem base, não o mostram.
//
// Os botões:
//  1. «Aceitar a proposta como o cliente»: a Edge Function client-portal-action, ação «simular_cliente» → sign_proposal, o MESMO caminho do
//     portal, sem o código por SMS, sem email nem SMS (real/modoTeste.ts: simularCliente).
//  2. «Assinar o contrato como o cliente»: idem, sign_contract (os gatilhos do contrato correm como na assinatura real).
//  3. «Avançar para o passo seguinte»: o próximo passo do negócio (motor.proximo), feito pela MESMA ação do botão do passo (fazer), que
//     grava pelo caminho de sempre. Os passos do cliente usam 1 e 2. Os que precisam de alguém a escrever (a fatura do ERP, as medidas,
//     o plano…) não se forçam: o painel diz qual é e leva lá. Nunca escreve a fase à força.
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { proximo, type Estado, type Negocio } from "./motor";
import { fazer, type Ctx } from "./pecas";
import { modoReal } from "./acessosPortal";
import { useModoTeste } from "./real/modoTeste";

/** (a) O ambiente de testes: a variável do build, o deploy de testes (testarh) ou o computador de quem programa. */
export function ambienteDeTeste(env: string | undefined, host: string | undefined): boolean {
  if (env === "1") return true;
  const h = (host ?? "").toLowerCase();
  return h.includes("testarh") || h === "localhost";
}
const ambienteAqui = () => ambienteDeTeste(import.meta.env.VITE_FERRAMENTAS_TESTE as string | undefined, typeof window === "undefined" ? undefined : window.location.hostname);

/** Os passos que abrem um ecrã (ou precisam de alguém a escrever): o painel leva lá, não faz por ninguém. */
const SO_NO_ECRA = new Set(["irVerif", "abrirRetificacao", "abrirPlano", "abrirRevisao", "abrirInv", "irObra", "registarFaturaErp", "pedidoCliente"]);

export type PassoTeste =
  | { tipo: "cliente"; acao: "aceitar" | "assinar"; t: string; sub?: string }
  | { tipo: "acao"; act: string; arg?: string; t: string; sub?: string; btn: string }
  | { tipo: "ecra"; act: string; arg?: string; t: string; sub?: string; btn?: string; navega: boolean }
  | { tipo: "espera"; t: string; sub?: string };

/** O que o «Avançar» faz agora neste negócio (sem React, para os testes). */
export function passoDeTeste(d: Negocio, S: Estado, A?: Ctx["A"]): PassoTeste {
  const p = proximo(d, S);
  if (p.sim === "aceitar" || p.sim === "assinar") return { tipo: "cliente", acao: p.sim, t: p.t, sub: p.sub };
  if (p.act && SO_NO_ECRA.has(p.act)) {
    const navega = !!A && typeof (A as unknown as Record<string, unknown>)[p.act] === "function" && p.act !== "registarFaturaErp";
    return { tipo: "ecra", act: p.act, arg: p.arg, t: p.t, sub: p.sub, btn: p.btn, navega };
  }
  if (p.act && p.btn) return { tipo: "acao", act: p.act, arg: p.arg, t: p.t, sub: p.sub, btn: p.btn };
  return { tipo: "espera", t: p.t, sub: p.sub };
}

// FERRAMENTAS-TESTE (temporário, remover antes da main)
export function FerramentasTeste({ ctx, d, ambiente = ambienteAqui }: { ctx: Ctx; d: Negocio; /** para os testes */ ambiente?: () => boolean }) {
  const teste = useModoTeste();
  const [aFazer, setAFazer] = useState<string | null>(null);
  if (!teste || !modoReal() || !ambiente()) return null;
  const o = d.orc;
  const podeAceitar = !d.perdido && !d.anulado && !!o?.enviada && !o.aceite;
  const podeAssinar = !d.perdido && !d.anulado && !!o && !o.vendaDireta && o.contrato === "enviado";
  const porQueAceitar = podeAceitar ? null : !o?.enviada ? "A proposta ainda não foi enviada." : o.aceite ? "A proposta já está aceite." : "O negócio está fechado.";
  const porQueAssinar = podeAssinar ? null : o?.vendaDireta ? "Venda direta: não há contrato." : o?.contrato === "assinado" ? "O contrato já está assinado." : "O contrato ainda não foi enviado.";
  const P = passoDeTeste(d, ctx.S, ctx.A);

  const cliente = (acao: "aceitar" | "assinar") => {
    setAFazer(acao);
    void (acao === "aceitar" ? teste.aceitarProposta(d) : teste.assinarContrato(d)).finally(() => setAFazer(null));
  };
  const avancar = () => {
    if (P.tipo === "cliente") { cliente(P.acao); return; }
    if (P.tipo === "acao" || (P.tipo === "ecra" && P.navega)) ctx.go(() => fazer(ctx.A, P.act, d.id, P.arg))();
  };
  const botaoAvancar = P.tipo === "cliente" ? (P.acao === "aceitar" ? "Aceitar a proposta como o cliente" : "Assinar o contrato como o cliente")
    : P.tipo === "acao" ? `Avançar: ${P.btn}`
    : P.tipo === "ecra" && P.navega ? `Ir para o passo: ${P.btn ?? P.t}`
    : null;

  return (
    <section aria-labelledby="ferramentas-teste-t" data-testid="ferramentas-teste"
      className="mt-4 space-y-3 rounded-2xl border-2 border-dashed border-amber-500 bg-amber-100 p-4 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h2 id="ferramentas-teste-t" className="text-[16px] font-semibold">Ferramentas de teste</h2>
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">TESTE — só no ambiente de testes</span>
      </div>
      <p className="text-[15px]">
        Próximo passo: <b>{P.t}</b>{P.sub ? ` · ${P.sub}` : ""}
        {P.tipo === "ecra" && !P.navega ? " Este passo faz-se no ecrã do negócio, abaixo (não se força)." : ""}
        {P.tipo === "espera" ? " Não há nada a fazer aqui por agora." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!podeAceitar || !!aFazer}
          title={porQueAceitar ?? undefined} onClick={() => cliente("aceitar")}>
          {aFazer === "aceitar" ? "A aceitar…" : "Aceitar a proposta como o cliente"}
        </Button>
        <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!podeAssinar || !!aFazer}
          title={porQueAssinar ?? undefined} onClick={() => cliente("assinar")}>
          {aFazer === "assinar" ? "A assinar…" : "Assinar o contrato como o cliente"}
        </Button>
        {botaoAvancar && (
          <Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" disabled={!!aFazer} onClick={avancar}>
            {botaoAvancar}
          </Button>
        )}
      </div>
      <p className="text-xs">
        {porQueAceitar && <>Aceitar: {porQueAceitar} </>}{porQueAssinar && <>Assinar: {porQueAssinar} </>}
        Aceitar e assinar usam o caminho do portal, sem código por SMS, email nem SMS; o avançar faz a mesma ação do botão do passo.
      </p>
    </section>
  );
}
