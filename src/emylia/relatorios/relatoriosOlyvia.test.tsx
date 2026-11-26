// 26/11: os relatórios da Olyvia (negócios, obras, orçamento): o documento, o ecrã, o PDF e o Excel dizem o mesmo; os custos só com eles.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { obraDeExemplo } from "../estudioObra/exemploObra";
import { itemCustos, itemOrcamento, itensDoConhecimento } from "../conhecimentoOlyvia";
import { dia, docNegocios, docObras, docOrcamento, enderecoRelatorio, type LinhaBase } from "./relatoriosOlyvia";
import { gerarExcelRelatorio, gerarPdfRelatorio } from "./exportarRelatorio";
import { VistaRelatorio } from "@/pages/RelatoriosOlyvia";

afterEach(cleanup);

/** A base de conhecimento a partir do motor (a obra de exemplo e os negócios do seed), como a tabela a devolve. */
function base(): { L: LinhaBase[]; id: number } {
  const { S, d } = obraDeExemplo();
  const L = itensDoConhecimento(S, new Date(2026, 10, 26, 10, 0)).map((x) => ({ tipo: x.tipo, numero: x.numero ?? null, titulo: x.titulo, texto: x.texto,
    dados: (x.dados ?? null) as Record<string, unknown> | null, atualizado_em: "2026-11-26T10:00:00Z" }));
  return { L, id: d.id };
}

describe("o orçamento e os custos na base de conhecimento", () => {
  it("o orçamento traz as linhas, os totais por IVA e por fase, as prestações; os custos trazem a margem", () => {
    const { S, d } = obraDeExemplo();
    const o = itemOrcamento(d, S)!, c = itemCustos(d, S)!;
    expect(o).toMatchObject({ tipo: "orcamento", numero: d.id });
    const dd = o.dados as { linhas: unknown[]; totais: { total: number; base: number; iva: number }; porFase: unknown[]; parcelas: unknown[] };
    expect(dd.linhas.length).toBeGreaterThan(0);
    expect(dd.totais.total).toBeCloseTo(dd.totais.base + dd.totais.iva, 1);
    expect(dd.porFase.length).toBeGreaterThan(0);
    expect(o.texto).toMatch(/^Orçamento do negócio \d+ de .+: \d+ linhas/);
    expect(o.texto).not.toMatch(/custo|margem/i); // o que o cliente vê
    expect(c).toMatchObject({ tipo: "custos", numero: d.id });
    expect(c.texto).toMatch(/margem prevista/);
  });
  it("quem não vê custos (as linhas com o custo a 0) não escreve uma margem de 100%", () => {
    const { S, d } = obraDeExemplo();
    for (const l of d.orc!.linhas) { if (l.t === "mat") l.custo = 0; else l.cu = 0; }
    d.obra = null as never; // sem o ajuste do prazo da obra
    expect(itemCustos(d, S)).toBeNull();
    expect(itemOrcamento(d, S)).not.toBeNull();
  });
});

describe("os relatórios", () => {
  it("negócios: os números, o funil pelas seis fases e a lista com o total", () => {
    const { L } = base();
    const doc = docNegocios(L, "Mudelar");
    const kpis = doc.seccoes.find((s) => s.k === "kpis")!;
    expect(kpis.k === "kpis" && kpis.itens.map((k) => k.rot)).toEqual(["Negócios ativos", "Em proposta", "Ganhos", "Taxa de aceitação"]);
    const barras = doc.seccoes.find((s) => s.k === "barras")!;
    expect(barras.k === "barras" && barras.itens.map((b) => b.rot)).toEqual(["Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"]);
    const t = doc.seccoes.find((s) => s.k === "tabela")!;
    expect(t.k === "tabela" && t.linhas.length).toBe(L.filter((x) => x.tipo === "negocio").length);
    expect(doc.subtitulo).toMatch(/^Mudelar · \d+ negócios ativos$/);
  });
  it("obras: as decisões à espera e o dia", () => {
    const { L, id } = base();
    const doc = docObras(L);
    const t = doc.seccoes.find((s) => s.k === "tabela")!;
    expect(t.k === "tabela" && t.linhas.some((l) => l[0] === id)).toBe(true);
    expect(doc.seccoes.some((s) => s.k === "texto" && s.titulo === "O dia das obras")).toBe(true);
  });
  it("orçamento: sem os custos, não há margem; com eles, há a secção interna", () => {
    const { L, id } = base();
    const o = L.find((x) => x.tipo === "orcamento" && x.numero === id)!, c = L.find((x) => x.tipo === "custos" && x.numero === id)!;
    const sem = docOrcamento(o, null), com = docOrcamento(o, c);
    expect(JSON.stringify(sem)).not.toMatch(/Margem|Custo/);
    expect(com.seccoes.some((s) => s.k === "tabela" && s.titulo === "Custo e margem (interno)")).toBe(true);
    expect(sem.nomeFicheiro).toMatch(new RegExp(`^Orcamento ${id} `));
    expect(enderecoRelatorio("orcamento", { numero: id, formato: "pdf" })).toBe(`/relatorios/olyvia?tipo=orcamento&numero=${id}&formato=pdf`);
  });
  it("as datas por extenso: ISO e como a app as guarda", () => {
    expect(dia("2026-11-24T23:20:00Z")).toBe("24 de novembro de 2026");
    expect(dia("24/11 23:20")).toBe("24 de novembro");
    expect(dia("06/10")).toBe("6 de outubro");
    expect(dia("hoje")).toBe("hoje");
    expect(dia(null)).toBe("—");
  });
  it("o PDF abre (A4, várias secções, o rodapé com a página) e o Excel tem o resumo e uma folha por tabela", async () => {
    const { L, id } = base();
    const o = L.find((x) => x.tipo === "orcamento" && x.numero === id)!, c = L.find((x) => x.tipo === "custos" && x.numero === id)!;
    const doc = docOrcamento(o, c, "Mudelar");
    const pdf = await gerarPdfRelatorio(doc, new Date(2026, 10, 26, 10, 0));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const lido = await PDFDocument.load(pdf);
    expect(lido.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(lido.getPage(0).getSize()).toMatchObject({ width: 595.28, height: 841.89 });
    const xlsx = await gerarExcelRelatorio(doc);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(xlsx, { type: "array" });
    expect(wb.SheetNames[0]).toBe("Resumo");
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["Serviços", "Totais por taxa de IVA", "Custo e margem (interno)"]));
    const sv = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Serviços"]);
    expect(typeof sv[0]["Total s/ IVA"]).toBe("number"); // os valores vão em número (para somar no Excel)
  });
  it("o ecrã desenha os números, as barras e as tabelas", () => {
    const { L } = base();
    render(<VistaRelatorio doc={docNegocios(L)} />);
    expect(screen.getByText("Negócios ativos")).toBeTruthy();
    expect(screen.getByText("O funil por fase")).toBeTruthy();
    expect(screen.getAllByRole("table").length).toBe(1);
  });
});
