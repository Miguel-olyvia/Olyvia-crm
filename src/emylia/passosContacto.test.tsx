// 12/11: «O que o cliente quer» (Contacto) fica feito com o tipo de serviço confirmado na chamada e pelo menos um serviço do Catálogo
import { describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { passosDaFase } from "./PaginaNegocio";
import type { Passo } from "./CamposFase";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ctxDe = (S: ReturnType<typeof seed>) => {
  const run = (fn: () => void) => fn();
  return { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => fn() } as unknown as Ctx;
};
// a mesma regra do NegocioSimples (com conta, n > 0)
const completo = (p: Passo) => (p.conta ? p.conta.n > 0 && p.conta.f >= p.conta.n : !!p.feito);

describe("«O que o cliente quer» no Contacto", () => {
  const preparar = () => {
    const S = seed(), ctx = ctxDe(S);
    const d = S.deals.find((x) => x.fase === 1)!;
    delete d.f.servico_validado; delete d.f.servicos_pedidos;
    const quer = () => passosDaFase(ctx, d, true, 1).find((p) => p.titulo === "O que o cliente quer")!;
    const svc = Object.keys(S.svc)[0]!;
    return { S, ctx, d, quer, svc };
  };

  it("por fazer sem o serviço confirmado nem serviços do Catálogo; os textos longos continuam opcionais", () => {
    const { quer } = preparar();
    const p = quer();
    expect(p.conta).toBeUndefined();
    expect(completo(p)).toBe(false);
  });

  it("só o serviço confirmado, ou só serviços do Catálogo, não chega", () => {
    const { ctx, d, quer, svc } = preparar();
    ctx.A.servicoDaChamada(d.id, d.linha);
    expect(completo(quer())).toBe(false);
    delete d.f.servico_validado;
    ctx.A.servicosDoPedido(d.id, [svc]);
    expect(completo(quer())).toBe(false);
  });

  it("feito com o serviço confirmado e um serviço do Catálogo, sem escrever os textos", () => {
    const { ctx, d, quer, svc } = preparar();
    ctx.A.servicoDaChamada(d.id, d.linha);
    ctx.A.servicosDoPedido(d.id, [svc]);
    expect(d.f.alteracoes ?? "").toBe("");
    expect(completo(quer())).toBe(true);
  });

  it("um serviço que já não está no Catálogo não conta", () => {
    const { ctx, d, quer } = preparar();
    ctx.A.servicoDaChamada(d.id, d.linha);
    d.f.servicos_pedidos = "nao-existe";
    expect(completo(quer())).toBe(false);
  });
});
