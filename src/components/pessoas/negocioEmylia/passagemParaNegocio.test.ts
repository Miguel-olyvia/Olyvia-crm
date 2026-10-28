import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { jaEDaEmylia, passarParaNegocio } from "./passagemParaNegocio";

function deAbordagem(): Negocio {
  const d = structuredClone(seed().deals[0]);
  d.fase = 0; d.orc = null; d.perdido = false; d.f = {}; d.hist = [];
  d.visita.fechada = false; d.visita.med = { ...d.visita.med, pav: 0, par: 0, pts: 0, pcs: 0 }; d.visita.extra = {}; d.visita.off = []; d.visita.prod = [];
  return d;
}
const dados = { pedidoCliente: "Trocar a banheira por duche", email: "ana@x.pt", chamadas: 2, visitas: 1, levantamentos: 1 };

describe("passarParaNegocio (o levantamento fechado no CRM põe o negócio no Orçamento da Emylia)", () => {
  it("passa o negócio à fase 3, com o levantamento fechado e um orçamento VAZIO (nada se inventa a partir do levantamento)", () => {
    const S = seed(), d = deAbordagem();
    passarParaNegocio(d, S, dados);
    expect(d.fase).toBe(3);
    expect(d.visita.fechada).toBe(true);
    expect(d.orc).not.toBeNull();
    // o orçamento sai do motor da Emylia (criarOrc) sem medidas: sem uma só linha de serviço (a de materiais é dele)
    expect(d.orc?.linhas.filter((l) => l.t === "svc")).toHaveLength(0);
    expect(d.orc?.enviada).toBeNull();
  });
  it("leva só o que se mapeia sem adivinhar: o pedido e o email; e não sobrepõe o que a Emylia já tem", () => {
    const S = seed(), d = deAbordagem();
    passarParaNegocio(d, S, dados);
    expect(d.f.pedido).toBe("Trocar a banheira por duche");
    expect(d.f.email).toBe("ana@x.pt");
    const e = deAbordagem(); e.f = { pedido: "já escrito", email: "outro@x.pt" };
    passarParaNegocio(e, S, dados);
    expect(e.f.pedido).toBe("já escrito");
    expect(e.f.email).toBe("outro@x.pt");
  });
  it("deixa no histórico do negócio a referência ao que há no CRM (chamadas, visitas, levantamentos)", () => {
    const d = deAbordagem();
    passarParaNegocio(d, seed(), dados);
    const textos = d.hist.map((h) => h.t).join(" | ");
    expect(textos).toMatch(/Levantamento fechado no CRM/);
    expect(textos).toMatch(/2 chamadas/);
    expect(textos).toMatch(/1 visita/);
    expect(textos).toMatch(/1 levantamento/);
  });
  it("sem pedido nem email no CRM não escreve campos vazios", () => {
    const d = deAbordagem();
    passarParaNegocio(d, seed(), { pedidoCliente: "", email: "", chamadas: 0, visitas: 0, levantamentos: 0 });
    expect("pedido" in d.f).toBe(false);
    expect("email" in d.f).toBe(false);
  });
  it("é idempotente: um negócio que já é da Emylia (fase 3 ou mais) não se mexe", () => {
    const d = deAbordagem(); d.fase = 4;
    const antes = JSON.stringify(d);
    passarParaNegocio(d, seed(), dados);
    expect(JSON.stringify(d)).toBe(antes);
  });
  it("um negócio perdido não passa", () => {
    const d = deAbordagem(); d.perdido = true;
    passarParaNegocio(d, seed(), dados);
    expect(d.fase).toBe(0);
  });
  it("jaEDaEmylia: a partir da fase 3", () => {
    const d = deAbordagem();
    expect(jaEDaEmylia(d)).toBe(false);
    d.fase = 3;
    expect(jaEDaEmylia(d)).toBe(true);
  });
});
