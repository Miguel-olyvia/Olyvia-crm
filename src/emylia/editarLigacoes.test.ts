import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { custos0, receitaDe, type Custos } from "./v2/custosModelo";
import { catalogo0, type Catalogo } from "./v2/catalogoModelo";
import { ligacoesDe, montarCatalogo, type Ref } from "./ligacoes";
import { candidatos, juntar, podeJuntar, podeRetirar, retirar, textoJuntar } from "./editarLigacoes";

const preparar = () => {
  const S = seed(), C = custos0(), Kc = catalogo0();
  const K = () => montarCatalogo(S, C, Kc);
  const aplicar = (e: ReturnType<typeof juntar>) => { expect(e).not.toBeNull(); e!.custos?.(C); e!.catalogo?.(Kc); };
  return { S, C, Kc, K, aplicar };
};
const svc = (id: string): Ref => ({ t: "svc", id });
const itens = (m: ReturnType<typeof ligacoesDe>, g: string) => m!.grupos.find((x) => x.id === g)!.itens.map((l) => l.ref.id);

describe("editar as ligações no mapa", () => {
  it("só se junta onde a ligação é direta, com o texto certo", () => {
    expect(podeJuntar(svc("canal"), "tecnicos")).toBe(true);
    expect(podeJuntar({ t: "prod", id: "x" }, "alternativas")).toBe(false);
    expect(textoJuntar(svc("canal"), "equipamentos")).toBe("Juntar equipamento");
    expect(textoJuntar({ t: "tec", id: "pintor" }, "servicos")).toBe("Juntar a um serviço");
  });

  it("serviço no centro: junta e retira um técnico, um equipamento e um consumível", () => {
    const { S, C, K, aplicar } = preparar();
    const k0 = K();
    const tec = candidatos(svc("canal"), "tecnicos", k0)[0], eq = candidatos(svc("canal"), "equipamentos", k0)[0], co = candidatos(svc("canal"), "consumiveis", k0)[0];
    for (const [g, x] of [["tecnicos", tec], ["equipamentos", eq], ["consumiveis", co]] as const) aplicar(juntar(svc("canal"), g, x.ref, K(), S));
    const r = C.receitas.canal as NonNullable<Custos["receitas"][string]>;
    expect(r.origem).toBe("editada");
    expect(r.mo.some((p) => p.perfil === tec.ref.id && p.h === 0.5)).toBe(true);
    expect(r.equip.some((u) => u.equip === eq.ref.id)).toBe(true);
    const m = ligacoesDe(svc("canal"), K());
    expect(itens(m, "tecnicos")).toContain(tec.ref.id);
    expect(itens(m, "equipamentos")).toContain(eq.ref.id);
    expect(itens(m, "consumiveis")).toContain(co.ref.id);
    // já ligado: deixa de ser candidato
    expect(candidatos(svc("canal"), "equipamentos", K()).some((x) => x.ref.id === eq.ref.id)).toBe(false);
    aplicar(retirar(svc("canal"), "equipamentos", eq.ref, K(), S));
    expect(itens(ligacoesDe(svc("canal"), K()), "equipamentos")).not.toContain(eq.ref.id);
  });

  it("do outro lado: o técnico no centro junta-se a um serviço", () => {
    const { S, C, K, aplicar } = preparar();
    const t: Ref = { t: "tec", id: "pintor" };
    const s = candidatos(t, "servicos", K()).find((x) => x.ref.id === "canal")!;
    aplicar(juntar(t, "servicos", s.ref, K(), S));
    expect(receitaDe(C, "canal", S.svc.canal, S.cfg.alvo)!.mo.some((p) => p.perfil === "pintor")).toBe(true);
    expect(itens(ligacoesDe(t, K()), "servicos")).toContain("canal");
    aplicar(retirar(t, "servicos", svc("canal"), K(), S));
    expect(C.receitas.canal!.mo.some((p) => p.perfil === "pintor")).toBe(false);
  });

  it("produtos: ligar um produto ao serviço e desligar; os que o serviço só pede não se retiram", () => {
    const { S, Kc, K, aplicar } = preparar();
    const p = K().produtos.find((x) => !x.servico)!;
    aplicar(juntar(svc("canal"), "produtos", { t: "prod", id: p.id }, K(), S));
    expect((Kc as Catalogo).produtos.find((x) => x.id === p.id)!.servico).toBe("canal");
    const l = ligacoesDe(svc("canal"), K())!.grupos[0].itens.find((x) => x.ref.id === p.id)!;
    expect(podeRetirar(svc("canal"), "produtos", l, K())).toBe(true);
    aplicar(retirar(svc("canal"), "produtos", l.ref, K(), S));
    expect(Kc.produtos.find((x) => x.id === p.id)!.servico).toBeUndefined();
    // um produto que outro serviço traz não se "retira" daqui
    const outro = K().produtos.find((x) => x.servico && x.servico !== "canal")!;
    expect(retirar(svc("canal"), "produtos", { t: "prod", id: outro.id }, K(), S)).toBeNull();
  });
});
