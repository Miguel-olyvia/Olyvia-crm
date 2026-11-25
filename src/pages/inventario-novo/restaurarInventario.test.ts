// O "Restaurar" do toast (fatia 4) tem de ser o MESMO dos ecrãs clássicos: a mesma RPC com { p_id } e a mesma permissão do
// botão "Restaurar" de "Ver eliminados". Estes testes leem os quatro ecrãs e falham se algum deixar de bater certo com a
// tabela RESTAURAR, e confirmam que o handleDelete de cada um avisa a moldura só no ramo de sucesso (uma linha).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RESTAURAR, restaurar, textoEliminado, textoRestaurado } from "./restaurarInventario";

const ler = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf-8").replace(/\r\n/g, "\n");
const ler2 = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf-8").replace(/\r\n/g, "\n");

/** O corpo de `const <nome> = async (…) => { … };` (até ao `  };` da mesma indentação). */
function corpo(fonte: string, nome: string): string {
  const i = fonte.indexOf(`const ${nome} = async`);
  expect(i, `${nome} não encontrado`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n  };\n", i);
  return fonte.slice(i, fim);
}

const ECRAS = [
  { tipo: "po", ficheiro: "PurchaseOrders.tsx", permissao: () => ler2("components/purchase-orders/PoRowActions.tsx") },
  { tipo: "fornecedor", ficheiro: "Suppliers.tsx", permissao: () => ler("Suppliers.tsx") },
  { tipo: "armazem", ficheiro: "Warehouses.tsx", permissao: () => ler("Warehouses.tsx") },
  { tipo: "stock", ficheiro: "Stocks.tsx", permissao: () => ler("Stocks.tsx") },
] as const;

describe("restaurarInventario: o mesmo Restaurar dos ecrãs clássicos", () => {
  for (const e of ECRAS) {
    it(`${e.ficheiro}: handleRestore usa ${RESTAURAR[e.tipo].rpc}({ p_id }) e o botão pede ${RESTAURAR[e.tipo].permissao}`, () => {
      const fonte = ler(e.ficheiro);
      expect(corpo(fonte, "handleRestore")).toMatch(new RegExp(`rpc\\("${RESTAURAR[e.tipo].rpc}", \\{ p_id: (id|supplier\\.id) \\}\\)`));
      // o botão "Restaurar" de "Ver eliminados" e a sua permissão, lado a lado
      const perm = e.permissao();
      const restaurarComPermissao = new RegExp(`(Restaur|onRestore|handleRestore)[\\s\\S]{0,200}permission: "${RESTAURAR[e.tipo].permissao.replace(".", "\\.")}"`);
      expect(perm).toMatch(restaurarComPermissao);
    });

    it(`${e.ficheiro}: o handleDelete avisa a moldura só no ramo de sucesso (uma linha, avisos?.)`, () => {
      const fonte = ler(e.ficheiro);
      const h = corpo(fonte, "handleDelete");
      const linhas = h.split("\n").filter((l) => l.includes("avisos"));
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toContain(`avisos?.("eliminado", { tipo: "${e.tipo}"`);
      // depois do erro verificado (if (error) throw error) e antes do catch
      expect(h.indexOf("avisos?.")).toBeGreaterThan(h.indexOf("if (error) throw error;"));
      expect(h.indexOf("avisos?.")).toBeLessThan(h.indexOf("} catch"));
      expect(fonte).toContain("const avisos = useAvisosInventario();");
    });
  }

  it("restaurar: a RPC da tabela com { p_id }; o erro sobe", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await restaurar({ rpc }, "armazem", "w-1");
    expect(rpc).toHaveBeenCalledWith("rpc_restore_warehouse", { p_id: "w-1" });
    const falha = vi.fn().mockResolvedValue({ data: null, error: { message: "sem permissão" } });
    await expect(restaurar({ rpc: falha }, "po", "po-1")).rejects.toMatchObject({ message: "sem permissão" });
    expect(falha).toHaveBeenCalledWith("rpc_restore_purchase_order", { p_id: "po-1" });
  });

  it("os textos do toast", () => {
    expect(textoEliminado({ tipo: "po", rotulo: "PO-2026-0007" })).toBe("Encomenda PO-2026-0007 eliminada.");
    expect(textoEliminado({ tipo: "fornecedor", rotulo: null })).toBe("Fornecedor eliminado.");
    expect(textoRestaurado({ tipo: "armazem", rotulo: "Central" })).toBe("Armazém Central restaurado.");
  });
});
