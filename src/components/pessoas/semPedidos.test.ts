// GUARDA: a entidade «pedido» saiu da página Pessoas. O contacto, a visita e o levantamento são da PESSOA e o negócio liga registos
// existentes. Este teste lê o código fonte (testes incluídos) e falha se `PedidoNegocio`, `pedidoId` ou ids `pd-` voltarem.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PASTA = join(process.cwd(), "src", "components", "pessoas");
const ESTE = "semPedidos.test.ts";

const proibido: { nome: string; padrao: RegExp }[] = [
  { nome: "PedidoNegocio", padrao: /PedidoNegocio/ },
  { nome: "pedidoId", padrao: /pedidoId/ },
  { nome: "um id pd-", padrao: /["'`]pd-|\bpd-\d/ },
  { nome: "os ficheiros que saíram (acoesPedido, pedidosDeExemplo, pedidosExemploVariado)", padrao: /acoesPedido|pedidosDeExemplo|pedidosExemploVariado|pedidoNegocio["']/ },
];

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    return /\.tsx?$/.test(nome) && nome !== ESTE ? [caminho] : [];
  });
}

/** O código do ficheiro, sem as verificações de que um objeto NÃO tem `pedidoId` (são a prova de que o pedido saiu, não um regresso). */
const leitura = (f: string): string => readFileSync(f, "utf8").replace(/not\.toHaveProperty\(["']pedidoId["']\)/g, "");

describe("a entidade pedido não volta a Pessoas", () => {
  const todos = ficheiros(PASTA);

  it("há código a verificar", () => {
    expect(todos.length).toBeGreaterThan(50);
  });

  it.each(proibido)("nenhum ficheiro de src/components/pessoas usa $nome", ({ padrao }) => {
    const culpados = todos.filter((f) => padrao.test(leitura(f))).map((f) => relative(PASTA, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});
