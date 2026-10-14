import { describe, expect, it } from "vitest";
import { criarEstadoInicial } from "./exemplo";
import { aplicarExtras, type ExtrasNovaPessoa } from "./fichaNovaPessoa";

const VAZIOS: ExtrasNovaPessoa = {
  dataNascimento: null, genero: null, nif: null, niss: null, emailPessoal: null, telefonePessoal: null, emailTrabalho: null,
  moradaLinha1: null, moradaCodigoPostal: null, moradaLocalidade: null, moradaDistrito: null, horasSemana: null, salarioBase: null,
  criarAcesso: false,
};

const base = () => {
  const ficha = Object.values(criarEstadoInicial().fichas).find((f) => f.pendencias.length > 0 && f.dadosPessoais && f.identificacao);
  if (!ficha) throw new Error("os dados de exemplo deviam ter uma ficha com pendências");
  return ficha;
};

describe("aplicarExtras", () => {
  it("o que ficou em branco fica em branco, em vez de dados inventados", () => {
    const ficha = aplicarExtras(base(), VAZIOS);
    expect(ficha.identificacao?.nif).toBeNull();
    expect(ficha.identificacao?.niss_ultimos4).toBeNull();
    expect(ficha.morada).toBeNull();
    expect(ficha.pessoa.email_pessoal).toBeNull();
    expect(ficha.dadosPessoais?.telefone_pessoal).toBeNull();
    expect(ficha.dadosPessoais?.data_nascimento).toBeNull();
  });

  it("põe na ficha o que se escreveu: identificadores, contactos, morada e retribuição", () => {
    const ficha = aplicarExtras(base(), {
      ...VAZIOS, nif: "123456789", niss: "12345678902", emailPessoal: "t@x.pt", telefonePessoal: "912345678",
      moradaLinha1: "Rua A, 1", moradaCodigoPostal: "1000-001", moradaLocalidade: "Lisboa", salarioBase: 1250, emailTrabalho: "t@emp.pt",
    });
    expect(ficha.identificacao).toMatchObject({ nif: "123456789", niss_ultimos4: "8902" });
    expect(ficha.segredos.niss).toBe("12345678902");
    expect(ficha.morada).toMatchObject({ linha1: "Rua A, 1", codigo_postal: "1000-001", localidade: "Lisboa", distrito: null });
    expect(ficha.pessoa).toMatchObject({ email_pessoal: "t@x.pt", email_trabalho: "t@emp.pt" });
    expect(ficha.retribuicoes.every((r) => r.valor_base === 1250)).toBe(true);
  });

  it("dá por resolvidas as pendências de NIF e NISS preenchidos, e só essas", () => {
    const original = base();
    const antes = original.pendencias.map((p) => p.codigo);
    const depois = aplicarExtras(original, { ...VAZIOS, nif: "123456789" }).pendencias.map((p) => p.codigo);
    expect(depois).toEqual(antes.filter((c) => c !== "nif"));
  });

  it("não muta a ficha de origem", () => {
    const original = base();
    const copia = JSON.stringify(original);
    aplicarExtras(original, { ...VAZIOS, nif: "123456789", salarioBase: 1 });
    expect(JSON.stringify(original)).toBe(copia);
  });
});
