import { describe, expect, it } from "vitest";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { ehHistorico, type ResumoPessoa } from "./pessoasTipos";

const resumos = () => juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO);
const de = (nome: string): ResumoPessoa => {
  const r = resumos().find((x) => x.pessoa.nome === nome);
  if (!r) throw new Error(`sem ${nome}`);
  return r;
};

describe("dados de exemplo das pessoas", () => {
  it("tem 13 pessoas: 6 clientes e 7 leads", () => {
    const todos = resumos();
    expect(todos).toHaveLength(13);
    expect(todos.filter((r) => r.papel === "cliente").map((r) => r.pessoa.nome).sort()).toEqual(
      ["Helena Tavares", "Inês Pacheco", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos"],
    );
    expect(todos.filter((r) => r.papel === "lead")).toHaveLength(7);
  });

  it("a relação pessoa-negócio é a de Negócios: os 10 pessoaId vêm de DADOS_EXEMPLO", () => {
    const idsNegocios = DADOS_EXEMPLO.negocios.map((n) => n.pessoaId);
    const ids = PESSOAS_EXEMPLO.map((p) => p.id);
    idsNegocios.forEach((id) => expect(ids).toContain(id));
    const nega = DADOS_EXEMPLO.negocios.find((n) => n.pessoaId === "p-rui")!;
    expect(PESSOAS_EXEMPLO.find((p) => p.id === "p-rui")!.contacto).toEqual(nega.contacto);
    expect(PESSOAS_EXEMPLO.find((p) => p.id === "p-rui")!.comercial).toBe(nega.comercial);
  });

  it("os negócios históricos são dois e ficam fora do mês", () => {
    const historicos = NEGOCIOS_PESSOAS_EXEMPLO.filter(ehHistorico);
    expect(historicos.map((h) => [h.pessoa, h.mes, h.resultado])).toEqual([
      ["Marta Silveira", "2026-06", "ganho"],
      ["Nuno Barros", "2026-08", "perdido"],
    ]);
  });

  it("não altera os negócios de Negócios", () => {
    expect(DADOS_EXEMPLO.negocios).toHaveLength(10);
  });
});

describe("juntarPessoas", () => {
  it("Marta e Nuno têm 2 negócios; há 3 pessoas sem negócio", () => {
    expect(de("Marta Silveira").negocios).toHaveLength(2);
    expect(de("Nuno Barros").negocios).toHaveLength(2);
    expect(resumos().filter((r) => r.semNegocio).map((r) => r.pessoa.nome).sort()).toEqual(
      ["Beatriz Sampaio", "Hugo Teixeira", "Lúcia Faria"],
    );
  });

  it("conta só os negócios abertos ou ganhos e soma o valor", () => {
    const marta = de("Marta Silveira");
    expect(marta.numero).toBe(2);
    expect(marta.valor).toBe(9800 + 4300);
    const nuno = de("Nuno Barros");
    expect(nuno.numero).toBe(1);
    expect(nuno.valor).toBe(8600);
  });

  it("a fase é a mais avançada entre os abertos ou ganhos", () => {
    expect(de("Marta Silveira").fase).toBe("financeiro");
    expect(de("Vasco Pinto").fase).toBe("contrato");
    expect(de("Nuno Barros").fase).toBe("proposta");
    expect(de("Tiago Rocha").fase).toBe("orcamento");
  });

  it("a saúde é a do pior negócio aberto; ganhos não contam", () => {
    expect(de("Nuno Barros").saude).toBe("atraso");
    expect(de("Clara Dias").saude).toBe("urgente");
    expect(de("Vasco Pinto").saude).toBe("emDia");
    expect(de("Marta Silveira").saude).toBeNull();
    expect(de("Marta Silveira").piorAberto).toBeNull();
  });

  it("sem negócio: sem fase, sem saúde, sem valor", () => {
    const beatriz = de("Beatriz Sampaio");
    expect(beatriz).toMatchObject({ semNegocio: true, soHistorico: false, numero: 0, valor: 0, fase: null, saude: null });
    expect(beatriz.papel).toBe("lead");
  });

  it("só histórico perdido: tem negócios mas nenhum aberto nem ganho", () => {
    const so = juntarPessoas(
      [PESSOAS_EXEMPLO.find((p) => p.id === "p-nuno")!],
      NEGOCIOS_PESSOAS_EXEMPLO.filter(ehHistorico).filter((h) => h.resultado === "perdido"),
      HOJE_EXEMPLO,
    )[0];
    expect(so).toMatchObject({ semNegocio: false, soHistorico: true, numero: 0, fase: null, saude: null, papel: "lead" });
  });

  it("o papel deriva do negócio ganho, também do histórico", () => {
    const soHistGanho = juntarPessoas(
      [PESSOAS_EXEMPLO.find((p) => p.id === "p-marta")!],
      NEGOCIOS_PESSOAS_EXEMPLO.filter(ehHistorico).filter((h) => h.resultado === "ganho"),
      HOJE_EXEMPLO,
    )[0];
    expect(soHistGanho.papel).toBe("cliente");
  });

  it("não depende do relógio: o mesmo resultado em dois chamadas", () => {
    expect(resumos()).toEqual(resumos());
  });

  it("lista vazia dá lista vazia", () => {
    expect(juntarPessoas([], [], HOJE_EXEMPLO)).toEqual([]);
  });
});
