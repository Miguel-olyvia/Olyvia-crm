import { describe, it, expect } from "vitest";
import {
  FICHA_TECNICA_VAZIA,
  FICHA_TECNICA_VALORES_VAZIOS,
  MENSAGENS_FICHA_TECNICA,
  fichaTecnicaVazia,
  linhasResumoFichaLocal,
  pisoNumerico,
  resumoExterior,
  resumoFichaTecnica,
  resumoInterior,
  validarFichaTecnica,
  valoresDaFichaTecnica,
  type FichaTecnicaEdificio,
  type FichaTecnicaValores,
} from "../fichaTecnicaEdificio";

const v = (over: Partial<FichaTecnicaValores>): FichaTecnicaValores => ({ ...FICHA_TECNICA_VALORES_VAZIOS, ...over });

describe("pisoNumerico", () => {
  it("lê o número do andar", () => {
    expect(pisoNumerico("3")).toBe(3);
    expect(pisoNumerico("3º")).toBe(3);
    expect(pisoNumerico("3.º Esq")).toBe(3);
    expect(pisoNumerico("-1")).toBe(-1);
    expect(pisoNumerico("12")).toBe(12);
  });
  it("rés-do-chão é 0", () => {
    expect(pisoNumerico("R/C")).toBe(0);
    expect(pisoNumerico("rc")).toBe(0);
    expect(pisoNumerico("Rés-do-chão")).toBe(0);
  });
  it("sem número → null", () => {
    expect(pisoNumerico("Cave")).toBeNull();
    expect(pisoNumerico("")).toBeNull();
    expect(pisoNumerico(null)).toBeNull();
    expect(pisoNumerico("12345")).toBeNull();
  });
});

describe("validarFichaTecnica", () => {
  it("vazia é válida e não gera ficha", () => {
    expect(validarFichaTecnica(FICHA_TECNICA_VALORES_VAZIOS)).toEqual({ valido: true, erros: {}, ficha: null });
  });

  it("ficha completa", () => {
    const r = validarFichaTecnica(v({
      acesso: "dificil", impacto_percent: "15", estacionamento: "pago", zona_estacionamento: "verde",
      tem_elevador: true, n_elevadores: "1", n_andares: "5", n_fracoes_por_andar: "4",
    }), "3");
    expect(r.valido).toBe(true);
    expect(r.ficha).toEqual({
      ...FICHA_TECNICA_VAZIA,
      acesso: "dificil", impacto_percent: 15, estacionamento: "pago", zona_estacionamento: "verde",
      tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
    });
  });

  it("com dados e sem elevador grava tem_elevador = false", () => {
    const r = validarFichaTecnica(v({ n_andares: "2" }));
    expect(r.ficha?.tem_elevador).toBe(false);
  });

  it("impacto só com acesso difícil e entre 0 e 100", () => {
    expect(validarFichaTecnica(v({ acesso: "facil", impacto_percent: "10" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoSoDificil);
    expect(validarFichaTecnica(v({ impacto_percent: "10" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoSoDificil);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "101" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "-1" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "2.5" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "0" })).valido).toBe(true);
  });

  it("elevadores só com elevador e ≥ 1", () => {
    expect(validarFichaTecnica(v({ n_elevadores: "2" })).erros.n_elevadores)
      .toBe(MENSAGENS_FICHA_TECNICA.elevadoresSemElevador);
    expect(validarFichaTecnica(v({ tem_elevador: true, n_elevadores: "0" })).erros.n_elevadores)
      .toBe(MENSAGENS_FICHA_TECNICA.elevadoresIntervalo);
    expect(validarFichaTecnica(v({ tem_elevador: true })).valido).toBe(true);
  });

  it("zona só com estacionamento", () => {
    expect(validarFichaTecnica(v({ zona_estacionamento: "verde" })).erros.zona_estacionamento)
      .toBe(MENSAGENS_FICHA_TECNICA.zonaSemEstacionamento);
    expect(validarFichaTecnica(v({ estacionamento: "sem_estacionamento", zona_estacionamento: "verde" })).erros.zona_estacionamento)
      .toBe(MENSAGENS_FICHA_TECNICA.zonaSemEstacionamento);
    expect(validarFichaTecnica(v({ estacionamento: "nao_pago", zona_estacionamento: "amarela" })).valido).toBe(true);
  });

  it("limites de andares e frações", () => {
    expect(validarFichaTecnica(v({ n_andares: "201" })).erros.n_andares).toBe(MENSAGENS_FICHA_TECNICA.andaresIntervalo);
    expect(validarFichaTecnica(v({ n_fracoes_por_andar: "abc" })).erros.n_fracoes_por_andar)
      .toBe(MENSAGENS_FICHA_TECNICA.fracoesIntervalo);
    expect(validarFichaTecnica(v({ n_andares: "0", n_fracoes_por_andar: "0" })).valido).toBe(true);
  });

  it("piso não pode passar o número de andares", () => {
    expect(validarFichaTecnica(v({ n_andares: "5" }), "6º").erros.piso).toBe(MENSAGENS_FICHA_TECNICA.pisoAcimaDosAndares);
    expect(validarFichaTecnica(v({ n_andares: "5" }), "5").valido).toBe(true);
    expect(validarFichaTecnica(v({ n_andares: "0" }), "R/C").valido).toBe(true);
    expect(validarFichaTecnica(v({ n_andares: "2" }), "Sótão").valido).toBe(true);
  });
});

describe("valoresDaFichaTecnica / fichaTecnicaVazia", () => {
  it("ida e volta", () => {
    const ficha: FichaTecnicaEdificio = {
      ...FICHA_TECNICA_VAZIA,
      acesso: "dificil", impacto_percent: 20, estacionamento: "pago", zona_estacionamento: null,
      tem_elevador: true, n_elevadores: 2, n_andares: 8, n_fracoes_por_andar: 3,
    };
    expect(validarFichaTecnica(valoresDaFichaTecnica(ficha)).ficha).toEqual(ficha);
  });
  it("vazia", () => {
    expect(fichaTecnicaVazia(null)).toBe(true);
    expect(valoresDaFichaTecnica(null)).toEqual(FICHA_TECNICA_VALORES_VAZIOS);
  });
});

describe("resumoFichaTecnica", () => {
  it("exemplo completo", () => {
    expect(resumoFichaTecnica({
      ...FICHA_TECNICA_VAZIA,
      acesso: "dificil", impacto_percent: 15, estacionamento: "pago", zona_estacionamento: null,
      tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
    }, "3")).toBe("Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1 · 4 frações/andar");
  });
  it("partes soltas", () => {
    expect(resumoFichaTecnica({
      ...FICHA_TECNICA_VAZIA,
      acesso: "facil", impacto_percent: null, estacionamento: "nao_pago", zona_estacionamento: "vermelha",
      tem_elevador: false, n_elevadores: null, n_andares: 2, n_fracoes_por_andar: null,
    }, "")).toBe("Exterior: Fácil acesso · Estac. não pago (zona vermelha) · 2 andares · sem elevador");
    expect(resumoFichaTecnica(null)).toBe("");
  });
});

describe("validarFichaTecnica — interior (a casa)", () => {
  const ANO = 2026;

  it("interior completo", () => {
    const r = validarFichaTecnica(v({
      tipologia: "T3", area_util_m2: "95,5", n_divisoes: "5", n_casas_banho: "2", ano_construcao: "1985",
      pavimento: "ceramico", eletrica: "antiga", quadro_diferencial: true, canalizacao: "ferro", gas: "canalizado",
      amianto: "nao_sei", habitada_durante_obra: true, animais: false, notas_interior: "  Cão em casa  ",
    }), null, ANO);
    expect(r.valido).toBe(true);
    expect(r.ficha).toEqual({
      ...FICHA_TECNICA_VAZIA,
      tipologia: "T3", area_util_m2: 95.5, n_divisoes: 5, n_casas_banho: 2, ano_construcao: 1985,
      pavimento: "ceramico", eletrica: "antiga", quadro_diferencial: true, canalizacao: "ferro", gas: "canalizado",
      amianto: "nao_sei", habitada_durante_obra: true, animais: false, notas_interior: "Cão em casa",
    });
  });

  it("interruptores: false só na secção com dados", () => {
    // Só interior -> o elevador (exterior) fica por indicar.
    const soInterior = validarFichaTecnica(v({ tipologia: "T1" }), null, ANO).ficha;
    expect(soInterior?.tem_elevador).toBeNull();
    expect(soInterior?.habitada_durante_obra).toBe(false);
    expect(soInterior?.animais).toBe(false);
    expect(soInterior?.quadro_diferencial).toBe(false);
    // Só exterior -> os interruptores do interior ficam por indicar.
    const soExterior = validarFichaTecnica(v({ n_andares: "3" }), null, ANO).ficha;
    expect(soExterior?.tem_elevador).toBe(false);
    expect(soExterior?.habitada_durante_obra).toBeNull();
    expect(soExterior?.animais).toBeNull();
    // Um interruptor ligado chega para a secção ter dados.
    const soAnimais = validarFichaTecnica(v({ animais: true }), null, ANO).ficha;
    expect(soAnimais?.animais).toBe(true);
    expect(soAnimais?.habitada_durante_obra).toBe(false);
  });

  it("área útil: > 0, ≤ 10000, até 2 casas decimais, aceita vírgula", () => {
    const area = (a: string) => validarFichaTecnica(v({ area_util_m2: a }), null, ANO);
    expect(area("0").erros.area_util_m2).toBe(MENSAGENS_FICHA_TECNICA.areaIntervalo);
    expect(area("10000.01").erros.area_util_m2).toBe(MENSAGENS_FICHA_TECNICA.areaIntervalo);
    expect(area("95.555").erros.area_util_m2).toBe(MENSAGENS_FICHA_TECNICA.areaIntervalo);
    expect(area("-5").erros.area_util_m2).toBe(MENSAGENS_FICHA_TECNICA.areaIntervalo);
    expect(area("abc").erros.area_util_m2).toBe(MENSAGENS_FICHA_TECNICA.areaIntervalo);
    expect(area("10000").ficha?.area_util_m2).toBe(10000);
    expect(area("0,5").ficha?.area_util_m2).toBe(0.5);
    expect(area("72.25").ficha?.area_util_m2).toBe(72.25);
  });

  it("divisões 0–100, casas de banho 0–50, inteiros", () => {
    const M = MENSAGENS_FICHA_TECNICA;
    expect(validarFichaTecnica(v({ n_divisoes: "101" }), null, ANO).erros.n_divisoes).toBe(M.divisoesIntervalo);
    expect(validarFichaTecnica(v({ n_divisoes: "2.5" }), null, ANO).erros.n_divisoes).toBe(M.divisoesIntervalo);
    expect(validarFichaTecnica(v({ n_casas_banho: "51" }), null, ANO).erros.n_casas_banho).toBe(M.casasBanhoIntervalo);
    expect(validarFichaTecnica(v({ n_casas_banho: "-1" }), null, ANO).erros.n_casas_banho).toBe(M.casasBanhoIntervalo);
    expect(validarFichaTecnica(v({ n_divisoes: "0", n_casas_banho: "0" }), null, ANO).valido).toBe(true);
    expect(validarFichaTecnica(v({ n_divisoes: "100", n_casas_banho: "50" }), null, ANO).valido).toBe(true);
  });

  it("ano de construção entre 1800 e o ano atual", () => {
    const M = MENSAGENS_FICHA_TECNICA;
    expect(validarFichaTecnica(v({ ano_construcao: "1799" }), null, ANO).erros.ano_construcao).toBe(M.anoIntervalo);
    expect(validarFichaTecnica(v({ ano_construcao: "2027" }), null, ANO).erros.ano_construcao).toBe(M.anoIntervalo);
    expect(validarFichaTecnica(v({ ano_construcao: "1800" }), null, ANO).valido).toBe(true);
    expect(validarFichaTecnica(v({ ano_construcao: "2026" }), null, ANO).valido).toBe(true);
    // Por omissão compara com o ano corrente.
    expect(validarFichaTecnica(v({ ano_construcao: String(new Date().getFullYear() + 1) })).erros.ano_construcao)
      .toBe(M.anoIntervalo);
  });

  it("listas fechadas", () => {
    const erro = (over: Partial<Record<keyof FichaTecnicaValores, string>>) =>
      Object.values(validarFichaTecnica(v(over as unknown as Partial<FichaTecnicaValores>), null, ANO).erros)[0];
    const M = MENSAGENS_FICHA_TECNICA;
    expect(erro({ tipologia: "T6" })).toBe(M.tipologiaInvalida);
    expect(erro({ pavimento: "marmore" })).toBe(M.pavimentoInvalido);
    expect(erro({ eletrica: "nova" })).toBe(M.eletricaInvalida);
    expect(erro({ canalizacao: "chumbo" })).toBe(M.canalizacaoInvalida);
    expect(erro({ gas: "natural" })).toBe(M.gasInvalido);
    expect(erro({ amianto: "talvez" })).toBe(M.amiantoInvalido);
    expect(validarFichaTecnica(v({ tipologia: "T5+" }), null, ANO).valido).toBe(true);
  });

  it("notas até 2000 caracteres (sem os espaços das pontas); vazias = null", () => {
    expect(validarFichaTecnica(v({ notas_interior: "a".repeat(2001) }), null, ANO).erros.notas_interior)
      .toBe(MENSAGENS_FICHA_TECNICA.notasDemasiadoLongas);
    expect(validarFichaTecnica(v({ notas_interior: `  ${"a".repeat(2000)}  ` }), null, ANO).valido).toBe(true);
    expect(validarFichaTecnica(v({ notas_interior: "   " }), null, ANO)).toEqual({ valido: true, erros: {}, ficha: null });
  });

  it("ida e volta com o interior", () => {
    const ficha: FichaTecnicaEdificio = {
      ...FICHA_TECNICA_VAZIA,
      acesso: "facil", tem_elevador: false,
      tipologia: "T2", area_util_m2: 70.25, ano_construcao: 1960, canalizacao: "misto",
      quadro_diferencial: false, habitada_durante_obra: true, animais: false, notas_interior: "Chave na porteira",
    };
    expect(validarFichaTecnica(valoresDaFichaTecnica(ficha), null, ANO).ficha).toEqual(ficha);
  });
});

describe("resumo da ficha do local (duas linhas)", () => {
  it("exterior e interior", () => {
    const ficha: FichaTecnicaEdificio = {
      ...FICHA_TECNICA_VAZIA,
      acesso: "dificil", impacto_percent: 15, estacionamento: "pago", tem_elevador: true, n_elevadores: 1, n_andares: 5,
      tipologia: "T3", area_util_m2: 95, n_casas_banho: 2, ano_construcao: 1985, canalizacao: "ferro",
      habitada_durante_obra: true, animais: false, quadro_diferencial: false,
    };
    expect(resumoFichaTecnica(ficha, "3")).toBe(
      "Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1\n"
      + "Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada",
    );
    expect(linhasResumoFichaLocal(ficha, "3").map((l) => l.seccao)).toEqual(["exterior", "interior"]);
  });

  it("só interior; resto dos campos", () => {
    expect(resumoInterior({
      ...FICHA_TECNICA_VAZIA,
      area_util_m2: 72.5, n_divisoes: 4, pavimento: "vinilico", eletrica: "renovada", quadro_diferencial: true,
      gas: "garrafa", amianto: "sim", animais: true,
    })).toBe("72,5 m² · 4 divisões · pavimento vinílico · elétrica renovada c/ diferencial · gás de garrafa · com amianto · animais");
    expect(resumoFichaTecnica({ ...FICHA_TECNICA_VAZIA, tipologia: "T0", habitada_durante_obra: false }))
      .toBe("Interior: T0");
    expect(resumoExterior({ ...FICHA_TECNICA_VAZIA, tipologia: "T0" })).toBe("");
    expect(resumoInterior({ ...FICHA_TECNICA_VAZIA, notas_interior: "x" })).toBe("com notas");
  });
});
