// O fecho grava os subsidios de ferias e de Natal, le-os de volta (0 num gravado antigo) e bloqueia com a configuracao por ler.
import { afterEach, describe, expect, it } from "vitest";
import {
  codigoDoErroDoFecho,
  construirResultadoPessoa,
  construirResultadosDoFecho,
  mensagemDeErroDoFecho,
  motivoDeBloqueioDoFecho,
  resultadoDeLinhaGravada,
  type ArgsBloqueioDoFecho,
  type ResultadoLido,
} from "@/lib/hr/resultadosFecho";
import type { ResultadoProcessamentoPessoa } from "@/lib/hr/processamentoTotais";

const PESSOA = "11111111-1111-4111-8111-111111111111";

const resultado = (extra: Partial<ResultadoProcessamentoPessoa> = {}): ResultadoProcessamentoPessoa => ({
  valorHoraReal: 9, baseMes: 1500, divisorDuodecimos: 14, linhasAutomaticas: [], totalCodigosAutomaticos: 0, linhasRegra: [], totalRegras: 0,
  descontoFaltas: 0, subsidioAlimentacao: 0, lancamentosPontuais: 0, totalBrutoEstimado: 1500, avisos: [], ...extra,
});

const gravar = (r: ResultadoProcessamentoPessoa) =>
  construirResultadoPessoa({ pessoaId: PESSOA, resultado: r, versoes: [], lancamentos: [], dataFim: "2026-06-30", regraSalarialId: null, planeadoMinutos: 9600, realizadoMinutos: 9600 });

describe("construirResultadoPessoa grava os subsidios", () => {
  it("os dois valores vao em totais, arredondados ao centimo", () => {
    const r = gravar(resultado({ subsidioFerias: 756.1643, subsidioNatal: 750, totalBrutoEstimado: 3006.16 }));
    expect(r.totais.subsidio_ferias).toBe(756.16);
    expect(r.totais.subsidio_natal).toBe(750);
  });

  it("0 quando nao se paga (ausente ou 0), nunca null nem ausente", () => {
    const sem = gravar(resultado());
    expect(sem.totais.subsidio_ferias).toBe(0);
    expect(sem.totais.subsidio_natal).toBe(0);
    expect(gravar(resultado({ subsidioFerias: 0, subsidioNatal: 0 })).totais).toMatchObject({ subsidio_ferias: 0, subsidio_natal: 0 });
  });

  it("os avisos dos subsidios seguem na lista de avisos gravados", () => {
    const r = gravar(resultado({ avisos: ["sem_regra_salarial"], avisosSubsidios: ["subsidio_sem_vinculo"] }));
    expect(r.avisos).toEqual(["sem_regra_salarial", "subsidio_sem_vinculo"]);
  });
});

const linha = (extra: Partial<ResultadoLido> = {}): ResultadoLido => ({
  pessoa_id: PESSOA, valor_hora: 9, total_bruto: 3000, linhas: [], avisos: [], retribuicao_id: null, cargo_periodo_id: null, regra_salarial_id: null,
  fechado_em: "2026-07-01T00:00:00Z", fechado_por_nome: null,
  totais: { base_mes: 1500, divisor_duodecimos: 14, total_codigos_automaticos: 0, total_regras: 0, desconto_faltas: 0, subsidio_alimentacao: 0, lancamentos_pontuais: 0 },
  ...extra,
});

describe("resultadoDeLinhaGravada", () => {
  it("le os subsidios gravados", () => {
    const r = resultadoDeLinhaGravada(linha({ totais: { ...linha().totais, subsidio_ferias: 750, subsidio_natal: 125.5 } }));
    expect(r.subsidioFerias).toBe(750);
    expect(r.subsidioNatal).toBe(125.5);
  });

  it("num gravado antigo (sem as chaves) ficam a 0", () => {
    const r = resultadoDeLinhaGravada(linha());
    expect(r.subsidioFerias).toBe(0);
    expect(r.subsidioNatal).toBe(0);
  });

  it("os avisos dos subsidios voltam em avisosSubsidios e os outros em avisos", () => {
    const r = resultadoDeLinhaGravada(linha({ avisos: ["sem_regra_salarial", "subsidio_sem_duodecimos", "subsidio_cessacao_por_tratar", "subsidio_contratos_com_intervalo", "desconhecido"] }));
    expect(r.avisos).toEqual(["sem_regra_salarial"]);
    expect(r.avisosSubsidios).toEqual(["subsidio_sem_duodecimos", "subsidio_cessacao_por_tratar", "subsidio_contratos_com_intervalo"]);
  });
});

describe("motivoDeBloqueioDoFecho com a configuracao dos subsidios", () => {
  const ok: ArgsBloqueioDoFecho = {
    direitosLidos: true, retribuicoes: "ok", codigos: "ok", regras: "ok", vinculos: "ok", pessoasObrigatorias: [PESSOA],
    comCalculo: () => true, assiduidadeIncompleta: () => false,
  };

  it("recusada, com erro ou a carregar bloqueia", () => {
    for (const subsidios of ["recusado", "erro", "a_carregar"] as const) {
      expect(motivoDeBloqueioDoFecho({ ...ok, subsidios })).toEqual({ codigo: "subsidios" });
    }
  });

  it("lida (ok), indisponivel (a base ainda nao a tem: desligada) ou sem a leitura nao bloqueia", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, subsidios: "ok" })).toBeNull();
    expect(motivoDeBloqueioDoFecho({ ...ok, subsidios: "indisponivel" })).toBeNull();
    expect(motivoDeBloqueioDoFecho(ok)).toBeNull();
  });

  it("vem depois das regras e antes dos vinculos", () => {
    expect(motivoDeBloqueioDoFecho({ ...ok, subsidios: "erro", vinculos: "erro" })).toEqual({ codigo: "subsidios" });
    expect(motivoDeBloqueioDoFecho({ ...ok, subsidios: "erro", regras: "erro" })).toEqual({ codigo: "regras" });
  });
});

const MD5 = "c".repeat(32);

describe("a assinatura dos subsidios no resultado a gravar", () => {
  const base = { pessoaId: PESSOA, resultado: resultado(), versoes: [], lancamentos: [], dataFim: "2026-06-30", regraSalarialId: null, planeadoMinutos: 9600, realizadoMinutos: 9600 };

  it("com assinatura, o resultado leva subsidios_assinatura tal como veio com o calculo", () => {
    expect(construirResultadoPessoa({ ...base, subsidiosAssinatura: MD5 }).subsidios_assinatura).toBe(MD5);
  });

  it("sem assinatura (pagamento desligado) a chave nao existe: nunca um null nem um texto vazio explicito", () => {
    for (const subsidiosAssinatura of [undefined, null, ""]) {
      const r = construirResultadoPessoa({ ...base, subsidiosAssinatura });
      expect(Object.prototype.hasOwnProperty.call(r, "subsidios_assinatura")).toBe(false);
    }
    expect(Object.prototype.hasOwnProperty.call(construirResultadoPessoa(base), "subsidios_assinatura")).toBe(false);
  });

  it("construirResultadosDoFecho leva a MESMA assinatura em cada pessoa, e as chaves dos totais seguem sempre", () => {
    const { resultados } = construirResultadosDoFecho({
      pessoasObrigatorias: [PESSOA, "22222222-2222-4222-8222-222222222222"],
      resultadoDe: () => resultado({ subsidioFerias: 750 }),
      versoesDe: () => [], lancamentosDe: () => [], dataFim: "2026-06-30", regraSalarialId: null,
      minutosDe: () => ({ planeado: 9600, realizado: 9600 }),
      assinaturaDeSubsidios: MD5,
    });
    expect(resultados.map((r) => r.subsidios_assinatura)).toEqual([MD5, MD5]);
    expect(resultados.every((r) => r.totais.subsidio_ferias === 750 && r.totais.subsidio_natal === 0)).toBe(true);
  });

  it("pagamento desligado: nenhum resultado leva assinatura, mas as chaves dos totais seguem a 0", () => {
    const { resultados } = construirResultadosDoFecho({
      pessoasObrigatorias: [PESSOA], resultadoDe: () => resultado(), versoesDe: () => [], lancamentosDe: () => [], dataFim: "2026-06-30", regraSalarialId: null,
      minutosDe: () => ({ planeado: 9600, realizado: 9600 }),
      assinaturaDeSubsidios: null,
    });
    expect(Object.prototype.hasOwnProperty.call(resultados[0], "subsidios_assinatura")).toBe(false);
    expect(resultados[0].totais).toMatchObject({ subsidio_ferias: 0, subsidio_natal: 0 });
  });
});

describe("os erros do fecho dos subsidios", () => {
  afterEach(() => window.localStorage.removeItem("language"));
  const HRA90 = { code: "HRA90", message: "processamento_fechar_subsidios_desactualizados: o resultado da pessoa x nao foi calculado com a configuracao actual (pagamento desde 2026-01-01)" };
  const MAL_FORMADO = { code: "22023", message: "processamento_fechar_resultado_mal_formado: pessoa x: subsidio_ferias so se paga na folha do mes 6 e esta e a folha de 2026/7." };

  it("HRA90: a configuracao mudou depois do calculo (pt-PT), sem o codigo tecnico", () => {
    const texto = mensagemDeErroDoFecho(HRA90);
    expect(texto).toBe("A configuração dos subsídios mudou depois do cálculo. Atualize a página e feche de novo.");
    expect(codigoDoErroDoFecho(HRA90)).toBe("processamento_fechar_subsidios_desactualizados");
  });

  it("HRA90 em ingles", () => {
    window.localStorage.setItem("language", "en");
    expect(mensagemDeErroDoFecho(HRA90)).toMatch(/changed after the calculation.*[Rr]efresh the page/);
  });

  it("os totais dos subsidios fora do mes (22023) tem o texto generico de inconsistencia", () => {
    expect(mensagemDeErroDoFecho(MAL_FORMADO)).toBe("O cálculo dos subsídios está inconsistente. Atualize a página.");
    window.localStorage.setItem("language", "en");
    expect(mensagemDeErroDoFecho(MAL_FORMADO)).toMatch(/inconsistent.*[Rr]efresh the page/);
  });

  it("outras recusas de resultado mal formado (nada a ver com subsidios) mantem o texto proprio", () => {
    const outro = mensagemDeErroDoFecho({ code: "22023", message: "processamento_fechar_resultado_mal_formado: pessoa x: total_bruto invalido" });
    expect(outro).toBeTruthy();
    expect(outro).not.toMatch(/subsídios/);
  });
});
