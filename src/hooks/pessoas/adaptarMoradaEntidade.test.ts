// A morada da entidade nos quatro campos separados (rua, código postal, localidade, andar), para o atalho «Preencher com os dados da entidade» da
// morada da obra. A `Pessoa.morada` junta o andar à rua; aqui nada se junta.
import { describe, expect, it } from "vitest";
import { paraOpcao } from "@/components/pessoas/pessoaOpcao";
import { adaptarPessoa } from "./adaptarFichaPessoa";
import { fichaDb, pessoaDb } from "./fichaFabrica";

const HOJE = "2026-10-19";
const morada = (extra: Record<string, string | null> = {}) => ({ rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa", andar: "2.º Dto.", ...extra });

describe("adaptarPessoa: moradaCampos", () => {
  it("traz os quatro campos, aparados", () => {
    const p = adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: morada({ rua: "  Rua A 1 " }) }) }), HOJE);
    expect(p.moradaCampos).toEqual({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto." });
  });

  it("campos em falta ficam vazios; sem rua, código postal nem localidade não há morada", () => {
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: morada({ andar: null, localidade: null }) }) }), HOJE).moradaCampos)
      .toEqual({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "", andar: "" });
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: morada({ rua: null, codigo_postal: null, localidade: null }) }) }), HOJE).moradaCampos).toBeUndefined();
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: null }) }), HOJE).moradaCampos).toBeUndefined();
  });

  it("a opção do painel leva-os como moradaEntidade", () => {
    const opcao = paraOpcao(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: morada() }) }), HOJE));
    expect(opcao.moradaEntidade).toEqual({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto." });
    expect(paraOpcao(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ morada: null }) }), HOJE)).moradaEntidade).toBeUndefined();
  });
});
