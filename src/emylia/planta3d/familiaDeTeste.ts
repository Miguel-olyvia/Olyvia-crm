// Só para testes: uma família configurada pequena (Lava-loiça Keran, RODI HOME), feita como as de verdade, a partir de produtos do catálogo (3 produtos: 80 cm Inox, 100 cm Inox, 100 cm Gun Metal).
import { criarFamiliaVazia, familiaDeProdutos, type AtribuicaoProduto, type FamiliaCfg, type ProdutoRef } from "./configurador";

const PRODUTOS: readonly { ref: ProdutoRef; atrib: Omit<AtribuicaoProduto, "produtoId"> }[] = [
  { ref: { id: "p-ker80-ix", n: "Lava-loiça Keran 80 - Inox escovado", marca: "RODI HOME", sku: "KER-80-IX", preco: 149, semPvp: false },
    atrib: { medida: "80 cm", dim: [80, 50, 16], acabamento: "Inox escovado", cor: "#c3c7ca", codigo: "IX", metalness: 1, roughness: 0.3 } },
  { ref: { id: "p-ker100-ix", n: "Lava-loiça Keran 100 - Inox escovado", marca: "RODI HOME", sku: "KER-100-IX", preco: 189, semPvp: false },
    atrib: { medida: "100 cm", dim: [100, 50, 16], acabamento: "Inox escovado", cor: "#c3c7ca", codigo: "IX", metalness: 1, roughness: 0.3 } },
  { ref: { id: "p-ker100-gm", n: "Lava-loiça Keran 100 - Gun Metal", marca: "RODI HOME", sku: "KER-100-GM", preco: 199, semPvp: false },
    atrib: { medida: "100 cm", dim: [100, 50, 16], acabamento: "Gun Metal", cor: "#62605e", codigo: "GM", metalness: 1, roughness: 0.29 } },
];

export function familiaKeranDeTeste(): FamiliaCfg {
  const base: FamiliaCfg = { ...criarFamiliaVazia(), id: "cfg:lava-loica-keran", nome: "Lava-loiça Keran", marca: "RODI HOME" };
  return familiaDeProdutos(base, PRODUTOS.map((p) => p.ref), PRODUTOS.map((p) => ({ produtoId: p.ref.id, ...p.atrib }))).familia;
}
