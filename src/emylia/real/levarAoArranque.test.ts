// 27/11 (Rúben: «passa todos os negócios que importamos via contrato para o arranque de obra»): levar um negócio com a proposta aceite
// até à obra em curso, pelas ações da app. Aqui com o motor do protótipo (sem base): a assinatura e os materiais são simulados.
import { describe, expect, it, vi } from "vitest";
import { acoes, seed } from "../motor";
import { levarAoArranque, lerNumeros, valorDeTeste, type DependenciasArranque } from "./levarAoArranque";

function montar() {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031)!;
  const A = acoes(S, () => {}, (fn) => fn());
  A.aceitar(d.id);
  const dep: DependenciasArranque = {
    S, A, run: (fn) => fn(), esperarGravacao: async () => {}, reler: async () => {}, hoje: () => "2026-11-27",
    prepararMinuta: vi.fn(async () => {}),
    assinarContrato: vi.fn(async (x) => { A.assinar(x.id); }),
    garantirMateriais: vi.fn(async () => {}),
  };
  return { S, d, A, dep };
}

describe("levar até ao arranque (teste)", () => {
  it("da proposta aceite à obra em curso, pelos passos da app", async () => {
    const { S, d, dep } = montar();
    const passos: string[] = [];
    const r = await levarAoArranque(dep, d.id, (t) => passos.push(t));
    expect(dep.prepararMinuta).toHaveBeenCalled();
    expect(dep.assinarContrato).toHaveBeenCalled();
    expect(passos).toEqual(expect.arrayContaining(["contrato assinado (teste)", "fatura registada", "1.º pagamento validado", "medidas aceites", "plano aprovado"]));
    expect(S.deals.find((x) => x.id === d.id)!.fin.pago).toBe(true);
    // no protótipo a obra pode arrancar (sem a prontidão real) ou parar num passo; nunca fica num ciclo
    expect(r.feito.length).toBeLessThanOrEqual(14);
    if (!r.ok) expect(r.ficou).toBeTruthy();
  });
  it("sem proposta aceite não faz nada", async () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && !x.orc.aceite)!;
    const A = acoes(S, () => {}, (fn) => fn());
    const r = await levarAoArranque({ S, A, run: (fn) => fn(), esperarGravacao: async () => {}, reler: async () => {}, hoje: () => "2026-11-27",
      prepararMinuta: vi.fn(), assinarContrato: vi.fn(), garantirMateriais: vi.fn() }, d.id);
    expect(r).toMatchObject({ ok: false, ficou: "a proposta ainda não está aceite", feito: [] });
  });
  it("lê os números (intervalos e listas) e os valores de teste", () => {
    expect(lerNumeros("1017-1020, 1015 1017")).toEqual([1017, 1018, 1019, 1020, 1015]);
    expect(valorDeTeste({ k: "condominio", l: "", t: "sim_nao" }, "2026-11-27", "condominio")).toBe("Sim");
    expect(valorDeTeste({ k: "multa", l: "", t: "sim_nao" }, "2026-11-27", "multa")).toBe("Não");
    expect(valorDeTeste({ k: "x", l: "", t: "escolha", op: ["A", "B"] }, "2026-11-27", "x")).toBe("A");
  });
});
