/**
 * As regras do cargo e da parte pessoal da retribuicao no rascunho do
 * assistente de nova pessoa (fluxo 2). Puras, sem React nem base.
 */
import { describe, expect, it } from "vitest";
import {
  DUODECIMOS_PROPOSTO,
  dataDeAberturaDoCargo,
  dataDaPrimeiraRetribuicao,
  parteDaPessoaDoContrato,
  problemaDoCargo,
  problemaDoSubsidio,
  type ContratoParteDaPessoa,
} from "@/lib/hr/novaPessoaCargo";

const SEM_NADA: ContratoParteDaPessoa = { subsidio: "", subsidio_modo: "", duodecimos_pct: "" };

describe("problemaDoCargo", () => {
  it("sem cargo e um problema bloqueante, com o rotulo e a mensagem do cargo", () => {
    expect(problemaDoCargo({ cargo_id: "" })).toEqual({
      seccao: "laborais",
      campoId: "hr-novo-cargo",
      rotuloKey: "hr.columns.cargo",
      mensagemKey: "hr.form.cargoObrigatorio",
    });
  });

  it("so espacos tambem conta como sem cargo", () => {
    expect(problemaDoCargo({ cargo_id: "   " })).not.toBeNull();
  });

  it("com cargo nao ha problema", () => {
    expect(problemaDoCargo({ cargo_id: "c1" })).toBeNull();
  });
});

describe("problemaDoSubsidio", () => {
  it("vazio nao e erro; numero valido nao e erro (virgula ou ponto)", () => {
    expect(problemaDoSubsidio(SEM_NADA)).toBeNull();
    expect(problemaDoSubsidio({ ...SEM_NADA, subsidio: "6,5" })).toBeNull();
    expect(problemaDoSubsidio({ ...SEM_NADA, subsidio: "0" })).toBeNull();
  });

  it("negativo e ilegivel sao erro, no campo do subsidio", () => {
    const esperado = {
      seccao: "contrato",
      campoId: "hr-novo-subsidio",
      rotuloKey: "hr.retribuicaoCartao.subsidioAlimentacao",
      mensagemKey: "hr.form.erroNumero",
    };
    expect(problemaDoSubsidio({ ...SEM_NADA, subsidio: "-1" })).toEqual(esperado);
    expect(problemaDoSubsidio({ ...SEM_NADA, subsidio: "abc" })).toEqual(esperado);
  });
});

describe("parteDaPessoaDoContrato", () => {
  it("a proposta de duodecimos e 50", () => {
    expect(DUODECIMOS_PROPOSTO).toBe(50);
  });

  it("sem nada preenchido nao ha parte da pessoa (ninguem ganha uma versao sem querer)", () => {
    expect(parteDaPessoaDoContrato(SEM_NADA)).toBeNull();
  });

  it("com subsidio e modo mas sem duodecimos, propoe 50", () => {
    expect(
      parteDaPessoaDoContrato({ subsidio: "7.5", subsidio_modo: "dinheiro", duodecimos_pct: "" }),
    ).toEqual({ subsidio: 7.5, subsidioModo: "dinheiro", duodecimosPct: 50 });
  });

  it("os duodecimos escolhidos prevalecem, incluindo 0", () => {
    expect(parteDaPessoaDoContrato({ ...SEM_NADA, duodecimos_pct: "0" })).toEqual({
      subsidio: null,
      subsidioModo: null,
      duodecimosPct: 0,
    });
    expect(parteDaPessoaDoContrato({ ...SEM_NADA, duodecimos_pct: "100" })?.duodecimosPct).toBe(100);
  });

  it("hexadecimal e notacao cientifica nao sao subsidios validos (0x10, 1e3)", () => {
    for (const subsidio of ["0x10", "1e3"]) {
      expect(problemaDoSubsidio({ ...SEM_NADA, subsidio })).not.toBeNull();
      expect(
        parteDaPessoaDoContrato({ subsidio, subsidio_modo: "cartao", duodecimos_pct: "50" })?.subsidio,
      ).toBeNull();
    }
  });

  it("um subsidio ilegivel vira null em vez de NaN", () => {
    expect(
      parteDaPessoaDoContrato({ subsidio: "abc", subsidio_modo: "cartao", duodecimos_pct: "50" })?.subsidio,
    ).toBeNull();
  });
});

/**
 * O trigger `hr_pessoas_cargo_primeira_linha` abre o cargo em `data_admissao`
 * (ou `current_date`). A primeira retribuicao nao pode comecar ANTES disso: a
 * base recusa com HRC11 ("sem cargo nessa data").
 */
describe("dataDeAberturaDoCargo", () => {
  it("e a data de admissao, ou hoje (da base) quando nao ha", () => {
    expect(dataDeAberturaDoCargo("2026-03-01", "2026-10-06")).toBe("2026-03-01");
    expect(dataDeAberturaDoCargo(null, "2026-10-06")).toBe("2026-10-06");
  });
});

describe("dataDaPrimeiraRetribuicao", () => {
  const HOJE = "2026-10-06";

  it("inicio do vinculo, senao admissao, senao hoje", () => {
    expect(dataDaPrimeiraRetribuicao("2026-04-01", "2026-03-01", HOJE)).toBe("2026-04-01");
    expect(dataDaPrimeiraRetribuicao(undefined, "2026-03-01", HOJE)).toBe("2026-03-01");
    expect(dataDaPrimeiraRetribuicao(null, null, HOJE)).toBe(HOJE);
  });

  it("vinculo ANTERIOR a admissao: nunca antes de o cargo abrir (evita HRC11)", () => {
    expect(dataDaPrimeiraRetribuicao("2026-01-01", "2026-03-01", HOJE)).toBe("2026-03-01");
  });

  it("sem admissao, o cargo abre hoje: um inicio de vinculo no passado nao pode ficar antes", () => {
    expect(dataDaPrimeiraRetribuicao("2026-01-01", null, HOJE)).toBe(HOJE);
  });

  it("o inicio do vinculo igual a abertura do cargo fica como esta", () => {
    expect(dataDaPrimeiraRetribuicao("2026-03-01", "2026-03-01", HOJE)).toBe("2026-03-01");
  });

  it("e nunca anterior a data em que o cargo abre, qualquer que seja a combinacao", () => {
    const datas = [null, "2025-01-01", "2026-03-01", HOJE, "2027-01-01"];
    for (const inicio of datas) {
      for (const admissao of datas) {
        const desde = dataDaPrimeiraRetribuicao(inicio, admissao, HOJE);
        expect(desde >= dataDeAberturaDoCargo(admissao, HOJE), `${inicio}/${admissao}`).toBe(true);
      }
    }
  });
});
