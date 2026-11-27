import { describe, expect, it } from "vitest";
import { corrigirLigacoes } from "./ligacoesDasFerramentas";

describe("corrigirLigacoes (27/11)", () => {
  const exata = "/relatorios/olyvia?tipo=servicos&formato=pdf&notas=eyJwb250b3MiOlsiMTIzLDc0Il19";
  it("troca a ligação estragada pelo modelo pela exata da ferramenta", () => {
    const texto = "Aqui está: [Descarregar o PDF](/relatorios/olyvia?tipo=servicos&formato=pdf&notas=eyJwb250b3MiOlsiMT=zLDc0Il19)";
    const r = corrigirLigacoes(texto, [{ label: "Descarregar o PDF", path: "/relatorios/olyvia?tipo=servicos&formato=pdf&notas=eyJwb250b3MiOlsiMT=zLDc0Il19" }], [{ link: exata }]);
    expect(r.texto).toBe(`Aqui está: [Descarregar o PDF](${exata})`);
    expect(r.ligacoes).toEqual([{ label: "Descarregar o PDF", path: exata }]);
  });
  it("junta a ligação quando o modelo não a escreveu", () => {
    const r = corrigirLigacoes("Feito.", [], [{ link: exata }], "Abrir o relatório");
    expect(r.texto).toBe("Feito.");
    expect(r.ligacoes).toEqual([{ label: "Abrir o relatório", path: exata }]);
  });
  it("não mexe noutras ligações nem sem ferramentas", () => {
    const texto = "[Ver negócio](/negocios?n=1029)";
    expect(corrigirLigacoes(texto, [{ label: "Ver negócio", path: "/negocios?n=1029" }], undefined).texto).toBe(texto);
    const r = corrigirLigacoes(texto, [{ label: "Ver negócio", path: "/negocios?n=1029" }], [{ link: exata }]);
    expect(r.texto).toBe(texto);
    expect(r.ligacoes.map((l) => l.path)).toEqual(["/negocios?n=1029", exata]);
  });
});
