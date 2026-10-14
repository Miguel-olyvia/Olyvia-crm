import { describe, expect, it } from "vitest";
import { CATALOGO, CATALOGO_MUDELAR, CATALOGO_TODO, OFICIOS, itemCatalogo } from "../catalogo";
import { garantirServico, seed } from "../motor";
import { ICONES_SERVICO, ILUSTRACOES } from "../ilustracoes";
import { catalogo0, caminho, oficios } from "../v2/catalogoModelo";
import {
  PERFIS0, custoHoraPerfil, custoReceita, custos0, equipHora, listaCatalogo, listaCatalogoCompleta, mediaHora, receitaDe,
} from "../v2/custosModelo";
import {
  CONSUMIVEIS_MUDELAR, EQUIP_MUDELAR, EXCLUIDOS_MUDELAR, EXIGE_MUDELAR, PERFIS_MUDELAR, PRODUTOS_MUDELAR, RESUMO_MUDELAR,
  SERVICOS_MUDELAR, SKU_DOS_C, servicoMudelar,
} from "./catalogoMudelar";

const K = catalogo0();

describe("catálogo da Mudelar · os números", () => {
  it("358 serviços: 41 são os c1..c41 (com o sku, sem duplicar) e 317 são novos", () => {
    expect(SERVICOS_MUDELAR).toHaveLength(358);
    expect(new Set(SERVICOS_MUDELAR.map((s) => s.sku)).size).toBe(358);
    expect(Object.keys(SKU_DOS_C)).toHaveLength(41);
    for (let i = 1; i <= 41; i++) expect(CATALOGO.find((c) => c.id === "c" + i)!.sku).toBe(SKU_DOS_C["c" + i]);
    expect(CATALOGO_MUDELAR).toHaveLength(317);
    expect(CATALOGO_MUDELAR.every((c) => c.id.startsWith("s-") && !!c.sku)).toBe(true);
    expect(new Set(CATALOGO_TODO.map((c) => c.id)).size).toBe(CATALOGO_TODO.length);
    // o c1 é o "Levantamento de Sanitários e Mobiliário" da Mudelar
    expect(itemCatalogo("c1")).toMatchObject({ sku: "MOLSM", pvp: 71.43, custoReal: 50 });
  });
  it("2.159 produtos: 3 de teste ficam de fora; os outros entram no Catálogo, depois dos de antes", () => {
    expect(PRODUTOS_MUDELAR).toHaveLength(2156);
    expect(EXCLUIDOS_MUDELAR.map((e) => e.sku).sort()).toEqual(["1234567teste", "Teste1", "teste2"]);
    expect(RESUMO_MUDELAR).toMatchObject({ produtosEntrada: 2159, produtos: 2156, produtosExcluidos: 3 });
    expect(K.produtos.find((p) => p.id === "m1")!.n).toBe("Cerâmico de parede 30×60");
    expect(K.produtos.filter((p) => p.sku)).toHaveLength(2156);
    expect(new Set(K.produtos.map((p) => p.id)).size).toBe(K.produtos.length);
    expect(new Set(K.produtos.map((p) => p.n)).size).toBe(K.produtos.length);
  });
  it("cada produto: nó da árvore, marca, fornecedor, ilustração das chaves fixas, PVP, sku e descrição", () => {
    const ilus = new Set<string>(ILUSTRACOES);
    for (const p of K.produtos.filter((x) => x.sku)) {
      expect(p.no, p.n).toBeTruthy();
      expect(p.marca && p.fornecedor && p.desc, p.n).toBeTruthy();
      expect(ilus.has(p.img!), `${p.n}: ${p.img}`).toBe(true);
      expect(p.pvp! > 0 && p.custo > 0, p.n).toBe(true);
    }
  });
});

describe("catálogo da Mudelar · perfis, equipamentos e consumíveis", () => {
  it("perfis novos com salário; o custo/hora médio não muda (o ladrilhador continua sem salário)", () => {
    const C = custos0();
    expect(PERFIS_MUDELAR.length).toBeGreaterThanOrEqual(8);
    for (const id of ["pedreiro", "carpinteiro", "serralheiro", "ajudante"]) expect(C.perfis.find((p) => p.id === id)!.salario).toBeGreaterThan(0);
    const antes = { ...C, perfis: PERFIS0.map((p) => ({ ...p })) };
    expect(mediaHora(C)).toBeCloseTo(mediaHora(antes), 9);
    for (const p of PERFIS_MUDELAR) {
      const h = custoHoraPerfil(p, C.par)!;
      expect(h).toBeGreaterThan(17);
      expect(h).toBeLessThan(35);
    }
  });
  it("cerca de 40 equipamentos com €/h credível (depreciação + manutenção)", () => {
    const C = custos0();
    expect(C.equip.length).toBeGreaterThanOrEqual(40);
    expect(EQUIP_MUDELAR.every((e) => e.compra > e.residual && e.vida > 0 && e.usoAno > 0)).toBe(true);
    for (const e of C.equip) { const h = equipHora(e); expect(h, e.n).toBeGreaterThan(0.02); expect(h, e.n).toBeLessThan(6); }
  });
  it("entre 60 e 100 consumíveis, alguns opcionais, com datas de preço variadas", () => {
    expect(CONSUMIVEIS_MUDELAR.length).toBeGreaterThanOrEqual(60);
    expect(CONSUMIVEIS_MUDELAR.length).toBeLessThanOrEqual(100);
    expect(CONSUMIVEIS_MUDELAR.filter((c) => c.opcional).length).toBeGreaterThanOrEqual(5);
    expect(new Set(CONSUMIVEIS_MUDELAR.map((c) => c.data)).size).toBeGreaterThanOrEqual(8);
  });
});

describe("catálogo da Mudelar · as receitas", () => {
  it("o custo do motor fica a ±30% do custo real em (quase) todos", () => {
    const C = custos0();
    const comCusto = SERVICOS_MUDELAR.filter((s) => s.custoReal > 0);
    const fora: string[] = [];
    for (const s of comCusto) {
      // todos pela receitaDe, a do protótipo (14/10: os c1..c41 também usam a receita da Mudelar)
      const rec = receitaDe(C, s.id, null)!;
      const c = custoReceita(rec, C, true).total;
      if (Math.abs(c / s.custoReal - 1) > 0.3) fora.push(`${s.sku} ${c.toFixed(2)} vs ${s.custoReal}`);
    }
    const pct = (100 * (comCusto.length - fora.length)) / comCusto.length;
    console.info(`Receitas a ±30% do custo real: ${comCusto.length - fora.length}/${comCusto.length} (${pct.toFixed(1)}%)`);
    expect(fora, fora.join("; ")).toHaveLength(0);
    expect(comCusto.length).toBe(346); // os 12 de subempreitada sem preço (pedido por obra) ficam de fora
  });
  it("cada serviço (novo ou c1..c41): unidade, medida, passos, ícone e o PVP como preço de tabela; os novos na árvore ofício › sub", () => {
    const C = custos0(), icones = new Set<string>(ICONES_SERVICO);
    for (const s of SERVICOS_MUDELAR) {
      expect(icones.has(s.icone), s.sku).toBe(true);
      expect([null, "pav", "par", "pts", "pcs"]).toContain(s.medida);
      if (s.custoReal > 0) expect(s.mo.length, s.sku).toBeGreaterThan(0);
      const rec = receitaDe(C, s.id, null)!;
      expect(rec).toMatchObject({ origem: "catalogo", modo: "tabela", precoTabela: s.pvp, medida: s.medida });
      expect(rec.equip.every((u) => C.equip.some((e) => e.id === u.equip)), s.sku).toBe(true);
      expect(rec.mo.every((p) => C.perfis.some((x) => x.id === p.perfil)), s.sku).toBe(true);
      if (s.cId) continue; // os c1..c41 ficam no ofício de antes
      expect(caminho(K.arvore, K.classe[s.id])).toBe(s.sub ? `${s.oficio} › ${s.sub}` : s.oficio);
    }
    expect(SERVICOS_MUDELAR.filter((s) => s.medida).length).toBeGreaterThan(15);
    expect(SERVICOS_MUDELAR.some((s) => s.cons.some((c) => c.opcional))).toBe(true);
  });
  it("o motor cria um serviço novo com a receita da Mudelar (as mesmas contas) e o PVP real", () => {
    const S = seed(), C = custos0();
    for (const sid of ["s-moissusp", "s-mome0002", "s-mojijpvc0001", "s-moitfp"]) {
      const s = garantirServico(S, sid)!, rec = receitaDe(C, sid, s)!, c = custoReceita(rec, C, false), m = servicoMudelar(sid)!;
      expect(s.preco).toBe(m.pvp);
      expect(s.h).toBeCloseTo(c.h, 2);
      expect(s.eq).toBeCloseTo(c.eq, 2);
      expect(s.cons).toBeCloseTo(c.cons, 2);
      expect(s.eh).toBeCloseTo(c.eh, 1);
    }
  });
  it("a lista da V2 fica a de antes; a lista completa traz os 361", () => {
    const S = seed(), C = custos0();
    expect(listaCatalogo(S, C).length).toBe(new Set([...Object.keys(S.svc), ...CATALOGO.map((c) => c.id)]).size);
    expect(listaCatalogoCompleta(S, C).length).toBe(new Set([...Object.keys(S.svc), ...CATALOGO_TODO.map((c) => c.id)]).size);
  });
});

describe("catálogo da Mudelar · relações e árvore", () => {
  it("a árvore tem os ofícios novos no fim (os de antes não mudam) e todos os serviços classificados", () => {
    expect(oficios(K.arvore).map((n) => n.n)).toEqual(OFICIOS);
    expect(OFICIOS.slice(0, 7)).toEqual(["Demolições", "Canalização", "Revestimentos", "Gás (ITG)", "Carpintaria", "Eletricidade", "Pintura"]);
    for (const c of CATALOGO_TODO) expect(K.classe[c.id], c.id).toBeTruthy();
  });
  it("produto → serviço que o instala (que existe no Catálogo inteiro)", () => {
    const com = K.produtos.filter((p) => p.sku && p.servico);
    expect(com.length).toBeGreaterThan(1500);
    for (const p of com) expect(itemCatalogo(p.servico!), `${p.n} → ${p.servico}`).toBeTruthy();
    const sanita = K.produtos.find((p) => p.sku && /^SANITA FLY SUSP BRANCO BRILHO/.test(p.n))!;
    expect(sanita.servico).toBe("s-moissusp");
    const armario = K.produtos.find((p) => p.n === "Armário Superior de cozinha 60x70cm Altura")!;
    expect(itemCatalogo(armario.servico!)!.n).toBe("Instalação Armário Superior de cozinha 60x70cm Altura");
  });
  it("serviço que exige produto, com a pergunta 'O cliente mantém…?'", () => {
    expect(EXIGE_MUDELAR.length).toBeGreaterThanOrEqual(15);
    for (const e of EXIGE_MUDELAR) {
      expect(K.exigeProduto![e.sid], e.sid).toBeTruthy();
      expect(K.perguntaManter![e.sid]).toMatch(/^O cliente mantém .+\?$/);
      // há produtos no ramo para escolher
      const no = K.exigeProduto![e.sid];
      expect(K.produtos.some((p) => p.no === no), e.sid).toBe(true);
    }
    expect(K.perguntaManter!["s-moissusp"]).toBe("O cliente mantém a sanita?");
    expect(K.perguntaManter!.c13).toBe("O cliente mantém a sanita?"); // a de antes não muda
  });
  it("ícone de cada serviço só das chaves fixas", () => {
    const icones = new Set<string>(ICONES_SERVICO);
    for (const c of CATALOGO_TODO) expect(icones.has(K.icone![c.id]), c.id).toBe(true);
  });
});
