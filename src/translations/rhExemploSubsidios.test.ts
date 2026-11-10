// Os textos dos subsidios de ferias e de Natal: cada chave que o codigo usa existe em pt e en, com os mesmos marcadores.
import { describe, expect, it } from "vitest";
import { rhExemploSubsidiosTranslations as textos } from "./rhExemploSubsidios";
import { AVISO_SUBSIDIO_CHAVE } from "@/lib/hr/subsidiosExtra";

const CHAVES = [
  ...Object.values(AVISO_SUBSIDIO_CHAVE),
  "rhSubs.aviso.configNaoLida",
  "rhSubs.aviso.configRecusada",
  "rhSubs.erro.guardar",
  "rhSubs.erro.semPermissao",
  "rhSubs.erro.emCurso",
  "rhSubs.erro.folhaFechada",
  "rhSubs.erro.meses",
  "rhSubs.erro.configInvalida",
  "rhProcReal.fecho.bloqueio.subsidios",
  "rhProcReal.fecho.bloqueio.subsidiosAReler",
  "rhContas.linha.subsidioFerias",
  "rhContas.linha.subsidioNatal",
  "rhContas.rotuloParteSemDuodecimos",
  "rhSubs.linha.ferias",
  "rhSubs.linha.natal",
  "rhSubs.passo.conta",
];

const marcadores = (s: string): string[] => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

describe("rhExemploSubsidiosTranslations", () => {
  it.each(["pt", "en"] as const)("%s tem todas as chaves, nao vazias", (lingua) => {
    for (const chave of CHAVES) expect(textos[lingua][chave], chave).toBeTruthy();
  });

  it("pt e en tem as mesmas chaves e os mesmos marcadores", () => {
    expect(Object.keys(textos.en).sort()).toEqual(Object.keys(textos.pt).sort());
    for (const chave of Object.keys(textos.pt)) expect(marcadores(textos.en[chave]), chave).toEqual(marcadores(textos.pt[chave]));
  });

  it("os tres avisos novos dizem o que o utilizador pediu, em pt-PT", () => {
    expect(textos.pt["rhSubs.aviso.semDuodecimos"]).toBe("Subsídio por pagar: os duodécimos da pessoa ainda não foram definidos.");
    expect(textos.pt["rhSubs.aviso.semVinculo"]).toBe("Sem contrato conhecido: subsídio não calculado.");
    expect(textos.pt["rhSubs.aviso.cessacao"]).toBe("Pessoa com contrato a terminar: o subsídio proporcional da cessação não é calculado aqui.");
  });

  it("o aviso dos contratos com intervalo e o aviso de configNaoLida dizem o que o utilizador pediu", () => {
    expect(textos.pt["rhSubs.aviso.contratosComIntervalo"]).toBe("Contratos com intervalo no ano: o subsídio não foi calculado.");
    expect(textos.en["rhSubs.aviso.contratosComIntervalo"]).toBeTruthy();
    expect(AVISO_SUBSIDIO_CHAVE.subsidio_contratos_com_intervalo).toBe("rhSubs.aviso.contratosComIntervalo");
    expect(textos.pt["rhSubs.aviso.configNaoLida"]).toMatch(/ou os contratos de que ela precisa/);
    expect(textos.en["rhSubs.aviso.configNaoLida"]).toMatch(/or the contracts they need/);
  });

  it("o texto do fecho bloqueado e o da formula usam os nomes certos", () => {
    expect(textos.pt["rhProcReal.fecho.bloqueio.subsidios"]).toMatch(/^Não se pode fechar/);
    expect(textos.pt["rhContas.rotuloParteSemDuodecimos"]).toBe("a parte que não vai em duodécimos");
  });
});
