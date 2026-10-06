import { describe, expect, it } from "vitest";
import { gerarPdfAuto, paraWinAnsi, quebrar, type DadosAuto } from "../pdfAuto";

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

const DADOS: DadosAuto = {
  empresa: "Mudelar",
  codigo: "OB-2026-00001",
  titulo: "Remodelação cozinha (Cascais)",
  cliente: "Maria João",
  morada: "Rua das Flores, 7",
  linhasDatas: [["Início previsto", "01/10/2026"], ["Fim previsto", "20/10/2026"]],
  tarefas: "12 de 12 validadas",
  remates: ["Cozinha — risco no tampo", "Geral — rodapé solto"],
  observacoes: "Cliente satisfeito.",
  assinante: "Maria João",
  assinadoEm: "20/10/2026 17:40",
};

describe("pdfAuto", () => {
  it("põe o português em WinAnsi (ç, ã, —, €) e o resto como ?", () => {
    expect(paraWinAnsi("ção")).toEqual([0xe7, 0xe3, 0x6f]);
    expect(paraWinAnsi("—€")).toEqual([0x97, 0x80]);
    expect(paraWinAnsi("✓")).toEqual([0x3f]);
  });

  it("quebra o texto pela largura sem perder palavras", () => {
    const l = quebrar("uma frase bastante comprida para caber numa linha estreita de vinte letras", 10, 100);
    expect(l.length).toBeGreaterThan(1);
    expect(l.join(" ")).toBe("uma frase bastante comprida para caber numa linha estreita de vinte letras");
    expect(l.every((x) => x.length <= 20)).toBe(true);
  });

  it("gera um PDF válido: cabeçalho, xref com os offsets certos e fim", () => {
    const pdf = gerarPdfAuto(DADOS, null);
    const s = latin1(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)\n/.exec(s)?.[1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    // Cada offset da tabela aponta para "N 0 obj".
    const entradas = s.slice(xref).split("\n").filter((l) => / 00000 n $/.test(l));
    entradas.forEach((l, i) => {
      const off = Number(l.slice(0, 10));
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    // O texto está lá, com os parêntesis escapados.
    expect(s).toContain("Remodela\xe7\xe3o cozinha \\(Cascais\\)");
    expect(s).toContain("Remates pendentes \\(2\\)");
  });

  it("mete a assinatura JPEG intacta e com o tamanho declarado", () => {
    const jpeg = Uint8Array.from({ length: 70000 }, (_, i) => i % 251);
    const pdf = gerarPdfAuto(DADOS, { jpeg, largura: 600, altura: 200 });
    const s = latin1(pdf);
    expect(s).toContain("/Filter /DCTDecode /Length 70000");
    const ini = s.indexOf("/Length 70000 >>\nstream\n") + "/Length 70000 >>\nstream\n".length;
    expect(Array.from(pdf.slice(ini, ini + 70000))).toEqual(Array.from(jpeg));
    expect(s).toContain("/Im1 Do");
  });

  it("muda de página quando a lista de remates é grande", () => {
    const pdf = gerarPdfAuto({ ...DADOS, remates: Array.from({ length: 80 }, (_, i) => `Remate ${i + 1}`) }, null);
    expect(latin1(pdf)).toMatch(/\/Count 2 /);
  });
});
