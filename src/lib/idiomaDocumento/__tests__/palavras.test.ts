import { describe, expect, it } from "vitest";
import { DICIONARIO_EN } from "../dicionario.en";
import { DICIONARIO_PT } from "../dicionario.pt";
import { tDoc } from "../dicionario";
import { IDIOMAS } from "../registo";
import {
  dataHoraDoCarimbo,
  dataPorExtenso,
  duracaoEntre,
  paginaXdeY,
} from "../datas";
import { numberToEnglishWords } from "../numeroPorExtenso";

function marcadores(texto: string): string[] {
  return [...texto.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

describe("dicionário doc.* — paridade pt/en", () => {
  const chavesPt = Object.keys(DICIONARIO_PT).sort();
  const chavesEn = Object.keys(DICIONARIO_EN).sort();

  it("têm exatamente as mesmas chaves", () => {
    expect(chavesEn).toEqual(chavesPt);
    expect(chavesPt.length).toBeGreaterThan(40);
  });

  it("todas as chaves começam por doc.", () => {
    for (const k of chavesPt) expect(k.startsWith("doc.")).toBe(true);
  });

  it("nenhuma tradução está vazia", () => {
    for (const [k, v] of Object.entries(DICIONARIO_PT)) expect(v.trim(), `pt ${k}`).not.toBe("");
    for (const [k, v] of Object.entries(DICIONARIO_EN)) expect(v.trim(), `en ${k}`).not.toBe("");
  });

  it("os marcadores {x} são os mesmos nas duas línguas", () => {
    for (const k of chavesPt) {
      expect(marcadores(DICIONARIO_EN[k]), k).toEqual(marcadores(DICIONARIO_PT[k]));
    }
  });

  it("nenhum texto do inglês é igual ao português quando é uma palavra de conteúdo (cópia por traduzir)", () => {
    const iguaisPermitidos = new Set([
      "doc.tabela.total", "doc.tabela.subtotal", "doc.tabela.ref", "doc.tabela.un",
      "doc.signatarios.email", "doc.signatarios.ordem", "doc.carimbo.ip", "doc.cabecalho.tel",
    ]);
    for (const k of chavesPt) {
      if (iguaisPermitidos.has(k)) continue;
      expect(DICIONARIO_EN[k], k).not.toBe(DICIONARIO_PT[k]);
    }
  });

  it("todo o idioma registado tem o seu nome nas duas línguas", () => {
    for (const i of IDIOMAS) {
      expect(DICIONARIO_PT[`doc.idioma.${i.codigo}`], i.codigo).toBeTruthy();
      expect(DICIONARIO_EN[`doc.idioma.${i.codigo}`], i.codigo).toBeTruthy();
    }
  });
});

describe("tDoc", () => {
  it("devolve a palavra no idioma pedido", () => {
    expect(tDoc("pt", "doc.tabela.descricao")).toBe("Descrição");
    expect(tDoc("en", "doc.tabela.descricao")).toBe("Description");
  });

  it("idioma sem dicionário cai no português", () => {
    expect(tDoc("es", "doc.tabela.descricao")).toBe("Descrição");
    expect(tDoc("xx", "doc.tabela.descricao")).toBe("Descrição");
    expect(tDoc(null, "doc.tabela.descricao")).toBe("Descrição");
    expect(tDoc(undefined, "doc.tabela.descricao")).toBe("Descrição");
    expect(tDoc("EN", "doc.tabela.descricao")).toBe("Description");
  });

  it("chave que não existe devolve a própria chave", () => {
    expect(tDoc("en", "doc.nao.existe")).toBe("doc.nao.existe");
    expect(tDoc("pt", "doc.nao.existe")).toBe("doc.nao.existe");
  });

  it("idioma registado mas sem dicionário (fr) usa as palavras do português", () => {
    expect(tDoc("fr", "doc.cabecalho.titulo")).toBe("CONTRATO");
  });

  it("interpola marcadores e deixa os desconhecidos como estão", () => {
    expect(tDoc("pt", "doc.pagina", { x: 2, y: 5 })).toBe("Página 2 de 5");
    expect(tDoc("en", "doc.pagina", { x: 2, y: 5 })).toBe("Page 2 of 5");
    expect(tDoc("pt", "doc.pagina", { x: 2 })).toBe("Página 2 de {y}");
    expect(tDoc("pt", "doc.pagina")).toBe("Página {x} de {y}");
  });

  it("valores especiais ($&) não são tratados como padrões de substituição", () => {
    expect(tDoc("pt", "doc.emFalta", { rotulo: "$& x" })).toBe("$& x em falta");
  });

  it("palavras que o contrato escreve hoje em português", () => {
    expect(tDoc("pt", "doc.cabecalho.titulo")).toBe("CONTRATO");
    expect(tDoc("pt", "doc.cabecalho.numero")).toBe("CONTRATO Nº");
    expect(tDoc("pt", "doc.cabecalho.data")).toBe("Data:");
    expect(tDoc("pt", "doc.cabecalho.comercial")).toBe("Comercial:");
    expect(tDoc("pt", "doc.cabecalho.nif")).toBe("NIF:");
    expect(tDoc("pt", "doc.cabecalho.tel")).toBe("Tel:");
    expect(tDoc("pt", "doc.carimbo.assinadoOtp")).toBe("Assinado via SMS OTP");
    expect(tDoc("pt", "doc.carimbo.ip")).toBe("IP:");
    expect(tDoc("pt", "doc.carimbo.assinado")).toBe("Assinado");
    expect(tDoc("pt", "doc.tabela.precoUnit")).toBe("Preço Unit.");
    expect(tDoc("pt", "doc.tabela.tituloArtigos")).toBe("Artigos do Orçamento");
    expect(tDoc("pt", "doc.signatarios.titulo")).toBe("Signatários");
    expect(tDoc("pt", "doc.emFalta", { rotulo: "Nome do cliente" })).toBe("Nome do cliente em falta");
  });

  it("palavras em inglês do cabeçalho, do carimbo e da tabela", () => {
    expect(tDoc("en", "doc.cabecalho.titulo")).toBe("CONTRACT");
    expect(tDoc("en", "doc.cabecalho.numero")).toBe("CONTRACT No.");
    expect(tDoc("en", "doc.cabecalho.data")).toBe("Date:");
    expect(tDoc("en", "doc.cabecalho.comercial")).toBe("Sales rep:");
    expect(tDoc("en", "doc.carimbo.assinadoOtp")).toBe("Signed via SMS OTP");
    expect(tDoc("en", "doc.carimbo.assinado")).toBe("Signed");
    expect(tDoc("en", "doc.tabela.qtd")).toBe("Qty");
    expect(tDoc("en", "doc.tabela.precoUnit")).toBe("Unit price");
    expect(tDoc("en", "doc.tabela.tituloArtigos")).toBe("Quote items");
    expect(tDoc("en", "doc.signatarios.titulo")).toBe("Signatories");
    expect(tDoc("en", "doc.emFalta", { rotulo: "Client name" })).toBe("Client name missing");
  });
});

describe("dataPorExtenso", () => {
  it("português: exatamente o formato de hoje", () => {
    expect(dataPorExtenso("2026-03-13T12:00:00.000Z", "pt")).toBe("13 de Março de 2026");
    expect(dataPorExtenso("2026-12-01T12:00:00.000Z", "pt")).toBe("1 de Dezembro de 2026");
  });

  it("inglês: dia mês ano", () => {
    expect(dataPorExtenso("2026-03-13T12:00:00.000Z", "en")).toBe("13 March 2026");
    expect(dataPorExtenso("2026-01-02T12:00:00.000Z", "en")).toBe("2 January 2026");
  });

  it("os doze meses nos dois idiomas", () => {
    const pt = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (let m = 0; m < 12; m += 1) {
      const d = `2026-${String(m + 1).padStart(2, "0")}-15T12:00:00.000Z`;
      expect(dataPorExtenso(d, "pt")).toBe(`15 de ${pt[m]} de 2026`);
      expect(dataPorExtenso(d, "en")).toBe(`15 ${en[m]} 2026`);
    }
  });

  it("omissão é o português; vazio é o travessão; idioma desconhecido cai no português", () => {
    expect(dataPorExtenso("2026-03-13T12:00:00.000Z")).toBe("13 de Março de 2026");
    expect(dataPorExtenso(null, "en")).toBe("—");
    expect(dataPorExtenso("", "en")).toBe("—");
    expect(dataPorExtenso(undefined)).toBe("—");
    expect(dataPorExtenso("2026-03-13T12:00:00.000Z", "xx")).toBe("13 de Março de 2026");
  });

  it("aceita um Date", () => {
    expect(dataPorExtenso(new Date(2026, 2, 13), "en")).toBe("13 March 2026");
  });
});

describe("duracaoEntre", () => {
  const A = "2026-03-13T12:00:00.000Z";

  it("meses e dias em português, com o plural errado de hoje preservado (1 meses)", () => {
    expect(duracaoEntre(A, "2027-03-13T12:00:00.000Z", "pt")).toBe("12 meses");
    expect(duracaoEntre(A, "2026-04-13T12:00:00.000Z", "pt")).toBe("1 meses");
    expect(duracaoEntre(A, "2026-03-23T12:00:00.000Z", "pt")).toBe("10 dias");
    expect(duracaoEntre(A, "2026-03-14T12:00:00.000Z", "pt")).toBe("1 dias");
    expect(duracaoEntre(A, A, "pt")).toBe("0 dias");
    expect(duracaoEntre(A, "2026-03-01T12:00:00.000Z", "pt")).toBe("-12 dias");
  });

  it("inglês, com o singular certo", () => {
    expect(duracaoEntre(A, "2027-03-13T12:00:00.000Z", "en")).toBe("12 months");
    expect(duracaoEntre(A, "2026-04-13T12:00:00.000Z", "en")).toBe("1 month");
    expect(duracaoEntre(A, "2026-03-23T12:00:00.000Z", "en")).toBe("10 days");
    expect(duracaoEntre(A, "2026-03-14T12:00:00.000Z", "en")).toBe("1 day");
  });

  it("sem datas: travessão", () => {
    expect(duracaoEntre("", A, "en")).toBe("—");
    expect(duracaoEntre(A, "", "pt")).toBe("—");
    expect(duracaoEntre(undefined, undefined)).toBe("—");
  });
});

describe("paginaXdeY", () => {
  it("Página X de Y / Page X of Y", () => {
    expect(paginaXdeY("pt", 1, 3)).toBe("Página 1 de 3");
    expect(paginaXdeY("en", 1, 3)).toBe("Page 1 of 3");
    expect(paginaXdeY("xx", 2, 2)).toBe("Página 2 de 2");
  });
});

describe("dataHoraDoCarimbo", () => {
  it("português: igual ao toLocaleString('pt-PT') que o carimbo usa hoje", () => {
    const iso = "2026-08-06T20:15:00.000Z";
    const esperado = new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    expect(dataHoraDoCarimbo(iso, "pt")).toBe(esperado);
    expect(dataHoraDoCarimbo(iso)).toBe(esperado);
  });

  it("inglês: mês por extenso em inglês", () => {
    expect(dataHoraDoCarimbo("2026-08-06T20:15:00.000Z", "en")).toContain("August");
  });

  it("vazio: texto vazio", () => {
    expect(dataHoraDoCarimbo(null, "en")).toBe("");
    expect(dataHoraDoCarimbo("", "pt")).toBe("");
  });
});

describe("numberToEnglishWords", () => {
  it("o exemplo do desenho", () => {
    expect(numberToEnglishWords(392.37)).toBe("three hundred and ninety-two euros and thirty-seven cents");
  });

  it("zero, um, vinte e um", () => {
    expect(numberToEnglishWords(0)).toBe("zero euros");
    expect(numberToEnglishWords(1)).toBe("one euro");
    expect(numberToEnglishWords(2)).toBe("two euros");
    expect(numberToEnglishWords(21)).toBe("twenty-one euros");
    expect(numberToEnglishWords(10)).toBe("ten euros");
    expect(numberToEnglishWords(13)).toBe("thirteen euros");
    expect(numberToEnglishWords(40)).toBe("forty euros");
  });

  it("centenas", () => {
    expect(numberToEnglishWords(100)).toBe("one hundred euros");
    expect(numberToEnglishWords(101)).toBe("one hundred and one euros");
    expect(numberToEnglishWords(110)).toBe("one hundred and ten euros");
    expect(numberToEnglishWords(999)).toBe("nine hundred and ninety-nine euros");
  });

  it("milhares", () => {
    expect(numberToEnglishWords(1000)).toBe("one thousand euros");
    expect(numberToEnglishWords(1001)).toBe("one thousand and one euros");
    expect(numberToEnglishWords(1100)).toBe("one thousand one hundred euros");
    expect(numberToEnglishWords(2000)).toBe("two thousand euros");
    expect(numberToEnglishWords(12345)).toBe("twelve thousand three hundred and forty-five euros");
    expect(numberToEnglishWords(100000)).toBe("one hundred thousand euros");
  });

  it("milhões e mil milhões (o português de hoje não chega aqui; o inglês não rebenta)", () => {
    expect(numberToEnglishWords(1000000)).toBe("one million euros");
    expect(numberToEnglishWords(1000001)).toBe("one million and one euros");
    expect(numberToEnglishWords(2500000)).toBe("two million five hundred thousand euros");
    expect(numberToEnglishWords(1000000000)).toBe("one billion euros");
  });

  it("cêntimos", () => {
    expect(numberToEnglishWords(0.01)).toBe("zero euros and one cent");
    expect(numberToEnglishWords(0.5)).toBe("zero euros and fifty cents");
    expect(numberToEnglishWords(1.01)).toBe("one euro and one cent");
    expect(numberToEnglishWords(99.99)).toBe("ninety-nine euros and ninety-nine cents");
  });

  it("arredondamento a cêntimos não inventa 100 cêntimos", () => {
    expect(numberToEnglishWords(0.999)).toBe("one euro");
    expect(numberToEnglishWords(2.999)).toBe("three euros");
  });

  it("negativos", () => {
    expect(numberToEnglishWords(-1)).toBe("minus one euro");
    expect(numberToEnglishWords(-392.37)).toBe("minus three hundred and ninety-two euros and thirty-seven cents");
  });

  it("valores inválidos dão zero", () => {
    expect(numberToEnglishWords(NaN)).toBe("zero euros");
    expect(numberToEnglishWords(Infinity)).toBe("zero euros");
  });
});
