// O texto que o RH le sobre cada desvio e NOSSO, por tipo, nas duas linguas; o detalhe cru da base (que cita RPCs)
// nunca chega ao ecra.
import { describe, expect, it } from "vitest";
import { rhExemploFluxosBTranslations } from "@/translations/rhExemploFluxosB";
import { textoDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import { TIPOS_DESVIO, type Desvio } from "@/components/rh-exemplo/tiposAssiduidade";

const traduzir = (lingua: "pt" | "en") => (chave: string): string => rhExemploFluxosBTranslations[lingua][chave] ?? chave;

function desvio(extra: Partial<Desvio> = {}): Desvio {
  return {
    organization_id: "org", pessoa_id: "p", data: "2026-10-06", tipo: "pendente_par", hora_inicio: "09:00:00", hora_fim: null,
    minutos: null, planeado_id: null, local_id: null, referencia_id: "x", detalhe: null, ...extra,
  };
}
const CRU = "entrada sem saida: o intervalo nao se fecha. Corrigir com rpc_hr_picagem_corrigir, ou registar a saida em falta.";

describe("textoDoDesvio", () => {
  it("pendente_par (entrada sem saida) em pt-PT, com acentos", () => {
    expect(textoDoDesvio(desvio({ detalhe: CRU }), traduzir("pt"))).toBe(
      "Entrada sem saída: o intervalo não se fecha e não há horas contabilizadas. Corrija a picagem ou lance a saída em falta.",
    );
  });

  it("planeado_sem_realizado em pt-PT: decide-se, nao se infere", () => {
    expect(textoDoDesvio(desvio({ tipo: "planeado_sem_realizado" }), traduzir("pt"))).toBe(
      "Havia turno planeado e não há horas registadas. Pode ser falta ou picagem esquecida: decide-se, não se infere.",
    );
  });

  it("a saida sem entrada tem o seu proprio texto (o desvio nao traz o sentido: le-se do detalhe da base)", () => {
    const texto = textoDoDesvio(desvio({ detalhe: "saida sem entrada: a consolidacao nao forma par nenhum a partir dela." }), traduzir("pt"));
    expect(texto).toMatch(/^Saída sem entrada/);
  });

  it("pendente_par com texto da base irreconhecivel ou vazio: texto neutro, sem prometer lancar a saida", () => {
    for (const detalhe of [null, "", "texto novo da base"]) {
      expect(textoDoDesvio(desvio({ detalhe }), traduzir("pt"))).toBe("Picagem por emparelhar: corrija a picagem.");
      expect(textoDoDesvio(desvio({ detalhe }), traduzir("en"))).toBe("Clocking to be paired: correct the clocking.");
    }
  });

  it("todos os tipos conhecidos tem texto proprio, nas duas linguas, sem nome de RPC, e o detalhe cru nao passa", () => {
    for (const lingua of ["pt", "en"] as const) {
      for (const tipo of TIPOS_DESVIO) {
        const texto = textoDoDesvio(desvio({ tipo, detalhe: CRU }), traduzir(lingua));
        expect(texto, `${lingua}/${tipo}`).toBeTruthy();
        expect(texto).not.toMatch(/rpc_/i);
        expect(texto).not.toBe(CRU);
      }
    }
    expect(textoDoDesvio(desvio({ tipo: "planeado_sem_realizado" }), traduzir("en"))).toMatch(/not inferred/);
  });

  it("tipo desconhecido: usa o detalhe da base so se nao citar uma RPC", () => {
    const desconhecido = { tipo: "tipo_novo" as unknown as Desvio["tipo"] };
    expect(textoDoDesvio(desvio({ ...desconhecido, detalhe: "Qualquer coisa legivel." }), traduzir("pt"))).toBe("Qualquer coisa legivel.");
    expect(textoDoDesvio(desvio({ ...desconhecido, detalhe: "Usar rpc_hr_xpto para corrigir" }), traduzir("pt"))).toBeNull();
    expect(textoDoDesvio(desvio({ ...desconhecido, detalhe: "Usar RPC_HR_XPTO" }), traduzir("pt"))).toBeNull();
    expect(textoDoDesvio(desvio({ ...desconhecido, detalhe: null }), traduzir("pt"))).toBeNull();
    expect(textoDoDesvio(desvio({ ...desconhecido, detalhe: "   " }), traduzir("pt"))).toBeNull();
  });
});
