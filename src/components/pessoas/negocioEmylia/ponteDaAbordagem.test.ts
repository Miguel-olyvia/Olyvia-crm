import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { linhasDaPonte, type FactosDaAbordagem } from "./ponteDaAbordagem";

const d = (f: Record<string, string> = {}): Negocio => ({ ...structuredClone(seed().deals[0]), f });
const vazio: FactosDaAbordagem = { email: "", chamadas: 0, visitasMarcadas: 0, levantamentos: 0 };
const estado = (l: ReturnType<typeof linhasDaPonte>, id: string) => l.find((x) => x.id === id)?.estado;

describe("linhasDaPonte (o que a abordagem entrega ao negócio da Emylia)", () => {
  it("o que a base da Emylia já lê do negócio do CRM aparece como ligado, sem o utilizador escrever outra vez", () => {
    const l = linhasDaPonte(d(), vazio);
    for (const id of ["nome", "telefone", "moradaObra", "origem", "servicoPedido"]) expect(estado(l, id)).toBe("ligado");
  });
  it("o email só passa se a Emylia o tem; se a pessoa o tem e a Emylia não, diz-se que está só no CRM", () => {
    expect(estado(linhasDaPonte(d({ email: "a@b.pt" }), { ...vazio, email: "a@b.pt" }), "email")).toBe("ligado");
    expect(estado(linhasDaPonte(d(), { ...vazio, email: "a@b.pt" }), "email")).toBe("soNoCrm");
    expect(estado(linhasDaPonte(d(), vazio), "email")).toBe("semRegisto");
  });
  it("chamadas, visitas e levantamento do CRM não chegam ao negócio da Emylia: dizem-se só no CRM, nunca ligados", () => {
    const l = linhasDaPonte(d(), { email: "", chamadas: 3, visitasMarcadas: 1, levantamentos: 1 });
    expect(estado(l, "chamadas")).toBe("soNoCrm");
    expect(estado(l, "visitas")).toBe("soNoCrm");
    expect(estado(l, "levantamento")).toBe("soNoCrm");
    expect(l.find((x) => x.id === "chamadas")?.n).toBe(3);
  });
  it("sem registos na abordagem, essas linhas ficam sem registo", () => {
    const l = linhasDaPonte(d(), vazio);
    expect(["chamadas", "visitas", "levantamento"].map((id) => estado(l, id))).toEqual(["semRegisto", "semRegisto", "semRegisto"]);
  });
  it("sem o negócio da Emylia lido nada se dá por ligado", () => {
    const l = linhasDaPonte(undefined, { email: "a@b.pt", chamadas: 1, visitasMarcadas: 0, levantamentos: 0 });
    expect(l.every((x) => x.estado !== "ligado")).toBe(true);
  });
});
