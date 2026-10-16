// Validação, no ramo feat/v1 (16/10/2026), da lógica nova do Inventário do Rafael (inventario/ponteNegocios.ts, commits 08d73000 e d3a26885):
// a encomenda de cliente emite-se no Inventário novo quando o Financeiro valida o pagamento.
// O que está certo fica como teste normal. Um achado fica como `it.fails`: o teste diz o comportamento esperado e hoje falha.
// Quando o achado for corrigido, o `it.fails` passa a falhar e avisa: troca-se por `it`. O relatório está em docs-design/validacao-inventario-v1.md.
import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, executar, lerInventario } from "./inventario/loja";
import { enviarPo } from "./inventario/po";
import { livreEm } from "./inventario/ec";
import { ARMAZEM_OBRAS, SKU_MATERIAL, resumoEcNegocio, sincronizarEcsNegocios } from "./inventario/ponteNegocios";
import { acoes, calcMats, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, emFalta, type Grupo } from "./campos";
import { colunasV1, foraDoQuadro, fichaV1, pessoaV1 } from "./pessoasV1Docs";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
function preparar() {
  const S = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1027)!; // Tiago Almeida: contrato assinado, cozinha
  const pagar = (n: Negocio) => { preencher(n, FINANCEIRO); A.emitir(n.id); A.validar(n.id); };
  return { S, A, d, pagar };
}
const poDaEc = (ref: string) => lerInventario().pos.find((p) => p.originKey === ref)!;

beforeEach(() => { esquecerInventario(); });

describe("o que está certo", () => {
  it("o número e a origem: EC-<id> e CT 2026/<id>, iguais no negócio e no Inventário", () => {
    const { d, pagar } = preparar();
    pagar(d);
    expect(d.obra.ec?.n).toBe("EC-1027");
    expect(lerInventario().ecs.find((e) => e.origin.ref === "CT 2026/1027")?.id).toBe("EC-1027");
  });

  it("o reservado e o em falta do negócio batem, linha a linha (pelo produto, não pela posição), com o Inventário", () => {
    const { d, pagar } = preparar();
    pagar(d);
    const db = lerInventario(), e = db.ecs.find((x) => x.id === "EC-1027")!;
    for (const x of d.obra.ec!.linhas) {
      const l = e.lines.find((y) => y.sku && db.products.find((p) => p.sku === y.sku)?.name === x.n)!;
      expect(l, x.n).toBeTruthy();
      expect(x.res, x.n).toBe(Math.min(x.q, l.stockQty));
    }
  });

  it("a encomenda a fornecedor nasce por aprovar e, aprovada, passa ao portal (d3a26885)", () => {
    const { d, pagar } = preparar();
    pagar(d);
    const po = poDaEc("CT 2026/1027");
    expect(po.status).toBe("pending");
    expect(executar((x) => enviarPo(x, x.pos.find((y) => y.id === po.id)!)).ok).toBe(true);
    expect(resumoEcNegocio(lerInventario(), "CT 2026/1027")!.pos.find((x) => x.id === po.id)?.fase).toBe("no portal");
  });

  it("no V1 (feat/v1): o negócio pago sai do quadro de Negócios e conta em obra; na ficha, o passo seguinte é das Operações", () => {
    const { S, d, pagar } = preparar();
    const obraAntes = foraDoQuadro(S).obra;
    pagar(d);
    expect(Object.values(colunasV1(S)).flat().some((x) => x.id === d.id)).toBe(false);
    expect(foraDoQuadro(S).obra).toBe(obraAntes + 1);
    const f = fichaV1(S, pessoaV1(S, d.nome)!);
    expect(f.agora.t).toMatch(/plano/i);
    expect(f.agora.de).toBe("de Filipe"); // o comercial vê de quem é, e "Mudar para" (C27)
    expect(f.negocios.find((n) => n.abre === d.id)?.estado).toBe("Em obra"); // e não "Concluído", com a obra por arrancar
  });
});

describe("achados", () => {
  // ACHADO 1. O Inventário vive em memória (inventario/loja.ts não grava no localStorage); o negócio grava. Ao recarregar a página,
  // sincronizarEcsNegocios volta a emitir a encomenda "do zero": o que se fez no Inventário (aprovar a encomenda a fornecedor,
  // receber, dar saída, carregar a carrinha) perde-se, e o negócio e a Frota (que gravam) ficam a dizer outra coisa.
  it.fails("o que se faz no Inventário sobrevive a recarregar a página (a encomenda a fornecedor aprovada continua no portal)", () => {
    const { S, d, pagar } = preparar();
    pagar(d);
    const po = poDaEc("CT 2026/1027");
    executar((x) => enviarPo(x, x.pos.find((y) => y.id === po.id)!));
    esquecerInventario(); // o mesmo que recarregar a página
    sincronizarEcsNegocios(S.deals);
    expect(poDaEc("CT 2026/1027").status).not.toBe("pending");
  });

  // ACHADO 2. Há duas contas de stock: a do motor (S.stock, o stock de abertura, que já não desce) e a do Inventário (que reserva).
  // Antes do pagamento, o negócio estima o reservado e o em falta com S.stock (calcMats): depois de outra obra reservar, a estimativa
  // de um segundo negócio conta com material que já não está livre (e o aviso "materiais a tempo" fica otimista).
  it.fails("a estimativa antes do pagamento usa o stock livre do Inventário (o que outra obra já reservou não conta)", () => {
    const { S, d, pagar } = preparar();
    pagar(d); // a cozinha do Tiago reserva cerâmico de parede (cp) do Armazém Central
    const livreCp = livreEm(lerInventario(), SKU_MATERIAL.cp, ARMAZEM_OBRAS);
    const outra = S.deals.find((x) => x.id !== d.id && x.linha === "coz" && x.orc && !x.fin.pago)!;
    const cp = calcMats(outra, S as Estado, false).find((m) => m.k === "cp")!;
    expect(cp.res).toBeLessThanOrEqual(Math.max(0, livreCp));
  });
});
