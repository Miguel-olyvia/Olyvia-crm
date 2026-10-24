// vistaDoResumo: o protótipo continua a mostrar exatamente o que mostrava (resumo completo, dados de exemplo).
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { pessoaBase, resumoBase } from "./fabricaTestes";
import { COLUNAS_PROTOTIPO, vistaDoResumo } from "./vistaLinhaPessoa";

describe("COLUNAS_PROTOTIPO", () => {
  it("são as 8 colunas do protótipo, pela ordem de sempre", () => {
    expect(COLUNAS_PROTOTIPO).toEqual(["person", "place", "stage", "form", "lastContact", "next", "value", "deals"]);
  });
});

describe("vistaDoResumo", () => {
  const resumo = resumoBase(
    pessoaBase("a", {
      nome: "Ana", ultimoContactoDias: 9, resultadoContacto: "naoAtendeu", qualificacao: "SQL",
      morada: { linha: "Rua X", cp: "1000-001", localidade: "Lisboa" }, empresa: { nome: "Ana Lda" },
    }),
    [], HOJE_EXEMPLO,
  );

  it("marca a vista como de exemplo", () => {
    expect(vistaDoResumo(resumo, false).exemplo).toBe(true);
  });
  it("leva tudo o que a linha do protótipo mostra", () => {
    const v = vistaDoResumo({ ...resumo, formulario: "Orçamento" }, true);
    expect(v).toMatchObject({
      id: "a", nome: "Ana", papel: "lead", empresa: true, qualificacao: "SQL", voltou: true, localidade: "Lisboa",
      formulario: "Orçamento", diasSemContacto: 9, resultado: "naoAtendeu", etapa: resumo.etapa, perdidaMotivo: null, encerrada: null,
    });
    expect(v.passo).toBe(resumo.proximo.id);
    expect(v.valorEmJogo).toBe(resumo.emJogo);
    expect(v.atrasada).toBe(resumo.atrasada);
  });
  it("sem resultado registado o protótipo continua a mostrar «Sem contacto»", () => {
    const v = vistaDoResumo(resumoBase(pessoaBase("b", { ultimoContactoDias: null }), [], HOJE_EXEMPLO), false);
    expect(v.resultado).toBe("semContacto");
  });
  it("sem morada a localidade é null (o protótipo mostra «Sem localidade») e sem formulário é null (Registada à mão)", () => {
    const v = vistaDoResumo(resumoBase(pessoaBase("c"), [], HOJE_EXEMPLO), false);
    expect(v.localidade).toBeNull();
    expect(v.formulario).toBeNull();
  });
  it("perdida e encerrada passam o motivo e o resultado", () => {
    const perdida = vistaDoResumo(resumoBase(pessoaBase("d", { perdida: { motivo: "preco", data: "2026-10-01" } }), [], HOJE_EXEMPLO), false);
    expect(perdida.perdidaMotivo).toBe("preco");
    const encerrada = vistaDoResumo(
      resumoBase(pessoaBase("e", { encerrada: { resultado: "obraInviavel", motivo: "outro", data: "2026-10-01" } }), [], HOJE_EXEMPLO), false,
    );
    expect(encerrada.encerrada).toBe("obraInviavel");
  });
});
