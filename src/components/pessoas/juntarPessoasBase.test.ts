import { describe, expect, it } from "vitest";
import { isNegocioGanho, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pessoaBase } from "./fabricaTestes";
import { juntarPessoas, resumir } from "./juntarPessoas";
import type { NegocioPessoa } from "./pessoasTipos";

const HOJE = "2026-10-13";
const REGISTOS = { contactos: [], visitas: [], levantamentos: [] };
const comContratoAssinado = (extra: Partial<NegocioMes> = {}): NegocioMes =>
  negocioBase("n1", { contrato: { estado: "assinado" }, ...extra });

describe("resumir com a base (ficha real)", () => {
  it("sem base infere como sempre: contrato assinado é negócio ganho e a pessoa é cliente", () => {
    const [r] = juntarPessoas([pessoaBase("a")], [comContratoAssinado({ pessoaId: "a" })], HOJE);
    expect(r.papel).toBe("cliente");
    expect(r.abertos).toEqual([]);
  });

  it("com base, o papel, os abertos e a etapa vêm dela", () => {
    const aberto = comContratoAssinado({ pessoaId: "a", estadoReal: "aberto", valorBase: 900 });
    const r = resumir(pessoaBase("a"), [aberto], REGISTOS, HOJE, { papel: "lead", abertos: [aberto], etapa: "qualificada" });
    expect(r.papel).toBe("lead");
    expect(r.etapa).toBe("qualificada");
    expect(r.abertos).toEqual([aberto]);
    expect(r.emJogo).toBe(900);
    expect(r.semNegocio).toBe(false);
    expect(r.soHistorico).toBe(false);
  });

  it("um aberto com contrato assinado fica «pronto a ganhar»: não conta como ganho", () => {
    const aberto = comContratoAssinado({ pessoaId: "a", estadoReal: "aberto" });
    expect(isNegocioGanho(aberto)).toBe(false);
  });

  it("um cliente sem negócios continua cliente (a base manda no papel)", () => {
    const r = resumir(pessoaBase("a"), [], REGISTOS, HOJE, { papel: "cliente", abertos: [], etapa: "cliente" });
    expect(r.papel).toBe("cliente");
    expect(r.etapa).toBe("cliente");
    expect(r.semNegocio).toBe(true);
  });

  it("só com históricos perdidos, soHistorico é verdadeiro mesmo com a base", () => {
    const perdido: NegocioPessoa = { ...negocioBase("p", { pessoaId: "a", estadoReal: "perdido" }), mes: "2026-08", resultado: "perdido" };
    const r = resumir(pessoaBase("a"), [perdido], REGISTOS, HOJE, { papel: "lead", abertos: [], etapa: "emContacto" });
    expect(r.soHistorico).toBe(true);
    expect(r.abertos).toEqual([]);
  });
});
