// Formatação por idioma do portal: só datas (date-fns com locale pt / enGB): as palavras seguem o idioma e o
// dd/mm/aaaa e as horas não. Cobre o dd/mm/aaaa fixo do portal do fornecedor sem deriva de fuso.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatarData, formatarDataHora, formatarDataIso, localeDateFns, padraoDeFormato } from "./formato";

// O tsconfig da app não inclui os tipos do Node; só se precisa de process.env.TZ.
declare const process: { env: Record<string, string | undefined> };

const QUARTA = new Date(2025, 2, 5, 14, 30); // quarta-feira, 5 de março de 2025, 14:30 (hora local)

describe("locales", () => {
  it("date-fns: pt e enGB", () => {
    expect(localeDateFns("pt").code).toBe("pt");
    expect(localeDateFns("en").code).toBe("en-GB");
  });

});

describe("padraoDeFormato", () => {
  it("dia da semana por extenso: «de» só em português", () => {
    expect(padraoDeFormato("diaSemanaLongo", "pt")).toBe("EEEE, d 'de' MMMM 'de' yyyy");
    expect(padraoDeFormato("diaSemanaLongo", "en")).toBe("EEEE, d MMMM yyyy");
  });

  it("longo, curto e numérico", () => {
    expect(padraoDeFormato("longo", "pt")).toBe("d 'de' MMMM 'de' yyyy");
    expect(padraoDeFormato("longo", "en")).toBe("d MMMM yyyy");
    expect(padraoDeFormato("curto", "pt")).toBe("d MMM yyyy");
    expect(padraoDeFormato("curto", "en")).toBe("d MMM yyyy");
    expect(padraoDeFormato("numerico", "pt")).toBe("dd/MM/yyyy");
    expect(padraoDeFormato("numerico", "en")).toBe("dd/MM/yyyy");
  });

  it("com hora: «às» em pt, «at» em en nos formatos por extenso; só a hora nos outros", () => {
    expect(padraoDeFormato("longo", "pt", true)).toBe("d 'de' MMMM 'de' yyyy 'às' HH:mm");
    expect(padraoDeFormato("longo", "en", true)).toBe("d MMMM yyyy 'at' HH:mm");
    expect(padraoDeFormato("diaSemanaLongo", "en", true)).toBe("EEEE, d MMMM yyyy 'at' HH:mm");
    expect(padraoDeFormato("curto", "pt", true)).toBe("d MMM yyyy, HH:mm");
    expect(padraoDeFormato("numerico", "en", true)).toBe("dd/MM/yyyy HH:mm");
  });
});

describe("formatarData", () => {
  it("dia da semana por extenso", () => {
    expect(formatarData(QUARTA, "pt", "diaSemanaLongo")).toBe("quarta-feira, 5 de março de 2025");
    expect(formatarData(QUARTA, "en", "diaSemanaLongo")).toBe("Wednesday, 5 March 2025");
  });

  it("longo, curto e numérico", () => {
    expect(formatarData(QUARTA, "pt", "longo")).toBe("5 de março de 2025");
    expect(formatarData(QUARTA, "en", "longo")).toBe("5 March 2025");
    expect(formatarData(QUARTA, "pt", "curto")).toBe("5 mar 2025");
    expect(formatarData(QUARTA, "en", "curto")).toBe("5 Mar 2025");
    expect(formatarData(QUARTA, "pt", "numerico")).toBe("05/03/2025");
    expect(formatarData(QUARTA, "en", "numerico")).toBe("05/03/2025");
  });

  it("o estilo por omissão é o curto", () => {
    expect(formatarData(QUARTA, "en")).toBe("5 Mar 2025");
  });

  it("cobre todos os meses nos dois idiomas", () => {
    const pt = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (let m = 0; m < 12; m++) {
      expect(formatarData(new Date(2025, m, 15), "pt", "longo")).toBe(`15 de ${pt[m]} de 2025`);
      expect(formatarData(new Date(2025, m, 15), "en", "longo")).toBe(`15 ${en[m]} 2025`);
    }
  });

  it("cobre os dias da semana nos dois idiomas", () => {
    const pt = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
    const en = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2025, 2, 3 + i); // 3 de março de 2025 é segunda-feira
      expect(formatarData(d, "pt", "diaSemanaLongo")).toBe(`${pt[i]}, ${3 + i} de março de 2025`);
      expect(formatarData(d, "en", "diaSemanaLongo")).toBe(`${en[i]}, ${3 + i} March 2025`);
    }
  });

  it("aceita texto ISO com hora e milissegundos desde a época", () => {
    expect(formatarData(QUARTA.toISOString(), "pt", "numerico")).toBe("05/03/2025");
    expect(formatarData(QUARTA.getTime(), "en", "longo")).toBe("5 March 2025");
  });

  it.each([null, undefined, "", "   ", "isto não é uma data", Number.NaN, new Date("x")])(
    "um valor em falta ou inválido (%s) dá «—» e não lança",
    (valor) => {
      expect(formatarData(valor as never, "pt", "curto")).toBe("—");
      expect(formatarDataHora(valor as never, "en", "curto")).toBe("—");
    },
  );

  it("não altera a data recebida", () => {
    const d = new Date(QUARTA);
    formatarData(d, "pt", "longo");
    expect(d.getTime()).toBe(QUARTA.getTime());
  });
});

describe("formatarDataHora", () => {
  it("por extenso: «às» / «at»", () => {
    expect(formatarDataHora(QUARTA, "pt", "longo")).toBe("5 de março de 2025 às 14:30");
    expect(formatarDataHora(QUARTA, "en", "longo")).toBe("5 March 2025 at 14:30");
    expect(formatarDataHora(QUARTA, "en", "diaSemanaLongo")).toBe("Wednesday, 5 March 2025 at 14:30");
  });

  it("curto e numérico", () => {
    expect(formatarDataHora(QUARTA, "pt", "curto")).toBe("5 mar 2025, 14:30");
    expect(formatarDataHora(QUARTA, "en", "curto")).toBe("5 Mar 2025, 14:30");
    expect(formatarDataHora(QUARTA, "pt", "numerico")).toBe("05/03/2025 14:30");
    // O numérico não muda com o idioma: dd/mm/aaaa e HH:mm como sempre.
    expect(formatarDataHora(QUARTA, "en", "numerico")).toBe("05/03/2025 14:30");
  });

  it("o estilo por omissão é o curto, e a hora é de 24 horas com zeros à esquerda", () => {
    expect(formatarDataHora(new Date(2025, 2, 5, 9, 5), "en")).toBe("5 Mar 2025, 09:05");
  });
});

describe("formatarDataIso (dd/mm/aaaa fixo, como formatSpDate)", () => {
  it("troca a ordem sem passar por Date", () => {
    expect(formatarDataIso("2025-03-05", "pt")).toBe("05/03/2025");
    expect(formatarDataIso("2025-03-05", "en")).toBe("05/03/2025");
    expect(formatarDataIso("2025-12-31", "pt")).toBe("31/12/2025");
  });

  it("com hora, fica com a data do próprio texto (igual a formatSpDate)", () => {
    expect(formatarDataIso("2025-03-05T23:30:00Z", "pt")).toBe("05/03/2025");
    expect(formatarDataIso("2025-03-05T00:00:00+05:00", "en")).toBe("05/03/2025");
  });

  it("em falta dá «—»", () => {
    expect(formatarDataIso(null, "pt")).toBe("—");
    expect(formatarDataIso(undefined, "en")).toBe("—");
    expect(formatarDataIso("", "pt")).toBe("—");
  });

  it("um texto que não é data volta como veio; outros formatos válidos passam por dd/mm/aaaa", () => {
    expect(formatarDataIso("sem data", "pt")).toBe("sem data");
    expect(formatarDataIso("March 5, 2025 10:00", "en")).toBe("05/03/2025");
  });
});

describe("sem deriva de fuso", () => {
  const original = process.env.TZ;
  const LOS_ANGELES = "America/Los_Angeles";
  let tzAplicou = false;

  beforeAll(() => {
    process.env.TZ = LOS_ANGELES;
    // Só vale como prova se o Node tiver mesmo mudado de fuso: 2025-03-05 UTC é o dia 4 em Los Angeles.
    tzAplicou = new Date("2025-03-05").getDate() === 4;
  });

  afterAll(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it("o fuso de teste foi aplicado (pré-condição das provas abaixo)", () => {
    expect(tzAplicou).toBe(true);
  });

  it("uma data só com dia (2025-03-05) mostra sempre o dia 5, em qualquer fuso", () => {
    expect(formatarData("2025-03-05", "en", "numerico")).toBe("05/03/2025");
    expect(formatarData("2025-03-05", "pt", "longo")).toBe("5 de março de 2025");
    expect(formatarDataHora("2025-03-05", "en", "numerico")).toBe("05/03/2025 00:00");
  });

  it("o dd/mm/aaaa fixo não depende do fuso", () => {
    expect(formatarDataIso("2025-03-05", "pt")).toBe("05/03/2025");
  });

  it("um instante com hora continua a ser mostrado na hora local", () => {
    expect(formatarDataHora("2025-03-05T22:30:00Z", "en", "numerico")).toBe("05/03/2025 14:30");
  });
});

describe("dinheiro e números não fazem parte do idioma do portal", () => {
  it("o módulo não exporta formatadores de moeda nem de números (só palavras e datas seguem o idioma)", async () => {
    const modulo = (await import("./formato")) as Record<string, unknown>;
    expect(modulo.formatarMoeda).toBeUndefined();
    expect(modulo.formatarNumero).toBeUndefined();
    expect(modulo.localeIntl).toBeUndefined();
  });
});
