import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "./motor";
import { todosApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro } from "./filtrosNegocios";
import { BOM, COLUNAS_CSV_PESSOAS, campoCsv, csvDe, csvNegocios, csvPessoas, descarregarCsv, valorCsv } from "./funcCsv";

describe("CSV · campos", () => {
  it("só põe aspas quando é preciso, e duplica as aspas de dentro", () => {
    expect(campoCsv("Ana Martins")).toBe("Ana Martins");
    expect(campoCsv("Cozinha; com ilha")).toBe('"Cozinha; com ilha"');
    expect(campoCsv('Disse "talvez"')).toBe('"Disse ""talvez"""');
    expect(campoCsv("duas\nlinhas")).toBe('"duas\nlinhas"');
    expect(campoCsv(" espaço")).toBe('" espaço"');
  });
  it("campos vazios ficam vazios (null, undefined e texto vazio), e os números em texto", () => {
    expect(campoCsv(null)).toBe("");
    expect(campoCsv(undefined)).toBe("");
    expect(campoCsv("")).toBe("");
    expect(campoCsv(7)).toBe("7");
  });
  it("os acentos ficam como estão (o BOM diz ao Excel que é UTF-8)", () => {
    expect(campoCsv("Condomínio Jardins do Tejo · Lisboa")).toBe("Condomínio Jardins do Tejo · Lisboa");
  });
  it("o valor com vírgula decimal e sem separador de milhares; sem valor, vazio", () => {
    expect(valorCsv(16225.82)).toBe("16225,82");
    expect(valorCsv(3000)).toBe("3000,00");
    expect(valorCsv(null)).toBe("");
  });
});

describe("CSV · o ficheiro", () => {
  it("começa pelo BOM, separa por ponto e vírgula e acaba as linhas em CRLF", () => {
    const t = csvDe(["Nome", "Nota"], [["Ana", "a;b"], ["Rúben", null]]);
    expect(t.startsWith(BOM)).toBe(true);
    expect(t.slice(1)).toBe('Nome;Nota\r\nAna;"a;b"\r\nRúben;\r\n');
  });
  it("as pessoas: o cabeçalho pedido e uma linha por pessoa, com o valor e o comercial", () => {
    const S = seed(), itens = todosApp(S).slice(0, 3).map((p) => ({ p, f: perfilDe(p, S) }));
    const linhas = csvPessoas(S, itens).slice(1).split("\r\n");
    expect(linhas[0]).toBe(COLUNAS_CSV_PESSOAS.join(";"));
    expect(linhas[0]).toBe("Nome;Papel;Empresa;Serviço;Localidade;Distrito;Formulário;Etapa;Último contacto;Resultado;Próximo passo;Valor;Comercial");
    expect(linhas).toHaveLength(5); // cabeçalho, três pessoas e a linha vazia do fim
    expect(linhas[1].split(";")[0]).toBe("Pedro Lopes");
    expect(linhas[1].split(";")[1]).toBe("Lead");
    expect(linhas[1].split(";").slice(-1)[0]).toBe("Rúben");
  });
  it("os negócios do Quadro, um por linha", () => {
    const q = selecionarQuadro(linhasNegocios(seed()), { rapido: "todos", q: "", f: SEM_FILTROS_N });
    const linhas = csvNegocios(q).slice(1).trimEnd().split("\r\n");
    expect(linhas).toHaveLength(q.length + 1);
    expect(linhas[0]).toBe("Pessoa;Negócio;Fase;Orçamentos;Valor;Dias parado;Próximo passo;Comercial;Distrito;Exemplo");
  });
});

describe("CSV · descarregar", () => {
  const original = URL.createObjectURL;
  afterEach(() => { URL.createObjectURL = original; vi.restoreAllMocks(); });
  it("sem URL.createObjectURL diz que não conseguiu (e não rebenta)", () => {
    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = undefined;
    expect(descarregarCsv("x.csv", "a")).toBe(false);
  });
  it("com o browser, cria um Blob e carrega num link temporário que depois desaparece", () => {
    const criar = vi.fn(() => "blob:x");
    URL.createObjectURL = criar as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect(descarregarCsv("pessoas.csv", "a;b")).toBe(true);
    expect(criar).toHaveBeenCalledWith(expect.any(Blob));
    expect(clique).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download="pessoas.csv"]')).toBeNull();
  });
});
