import { describe, expect, it } from "vitest";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { registosBase, contactoBase, pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { juntarPessoas, papelEAbertos } from "./juntarPessoas";
import { NEGOCIOS_ANTIGOS, PESSOAS_ANTIGAS, REGISTOS_ANTIGOS } from "./exemploAntigoParaTestes";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { ehHistorico, type ResumoPessoa } from "./pessoasTipos";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

// As contagens e listas abaixo são as das 17 pessoas de antes; os exemplos variados (mais 17) têm o seu teste e a sua matriz.
const resumos = () => juntarPessoas(PESSOAS_ANTIGAS, NEGOCIOS_ANTIGOS, HOJE_EXEMPLO, REGISTOS_ANTIGOS);
const de = (nome: string): ResumoPessoa => {
  const r = resumos().find((x) => x.pessoa.nome === nome);
  if (!r) throw new Error(`sem ${nome}`);
  return r;
};

describe("dados de exemplo das pessoas", () => {
  it("tem 17 pessoas: 6 clientes e 11 leads (2 perdidas)", () => {
    const todos = resumos();
    expect(todos).toHaveLength(17);
    expect(todos.filter((r) => r.papel === "cliente").map((r) => r.pessoa.nome).sort()).toEqual(
      ["Helena Tavares", "Inês Pacheco", "Marta Silveira", "Paulo Neves", "Rui Figueiredo", "Sofia Matos"],
    );
    expect(todos.filter((r) => r.papel === "lead")).toHaveLength(11);
    expect(todos.filter((r) => r.pessoa.perdida).map((r) => r.pessoa.nome)).toEqual(["Joana Bastos", "Fábio Lemos"]);
  });

  it("com os exemplos variados há 34 pessoas: 15 clientes e 19 leads (2 perdidas), e 14 negócios terminados", () => {
    const todos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO);
    expect(todos).toHaveLength(34);
    expect(todos.filter((r) => r.papel === "cliente")).toHaveLength(15);
    expect(todos.filter((r) => r.papel === "lead")).toHaveLength(19);
    expect(todos.filter((r) => r.pessoa.perdida)).toHaveLength(2);
    expect(NEGOCIOS_PESSOAS_EXEMPLO.filter(ehHistorico)).toHaveLength(14);
  });

  it("a relação pessoa-negócio é a de Negócios: os 10 pessoaId vêm de DADOS_EXEMPLO", () => {
    const idsNegocios = DADOS_EXEMPLO.negocios.map((n) => n.pessoaId);
    const ids = PESSOAS_EXEMPLO.map((p) => p.id);
    idsNegocios.forEach((id) => expect(ids).toContain(id));
    const nega = DADOS_EXEMPLO.negocios.find((n) => n.pessoaId === "p-rui")!;
    expect(PESSOAS_EXEMPLO.find((p) => p.id === "p-rui")!.contacto).toEqual(nega.contacto);
    expect(PESSOAS_EXEMPLO.find((p) => p.id === "p-rui")!.comercial).toBe(nega.comercial);
  });

  it("os negócios históricos são três e ficam fora do mês", () => {
    const historicos = NEGOCIOS_ANTIGOS.filter(ehHistorico);
    expect(historicos.map((h) => [h.pessoa, h.mes, h.resultado])).toEqual([
      ["Marta Silveira", "2026-06", "ganho"],
      ["Nuno Barros", "2026-08", "perdido"],
      ["Fábio Lemos", "2026-09", "perdido"],
    ]);
  });

  it("não altera os negócios de Negócios e os negócios novos não colidem com os do quadro", () => {
    expect(DADOS_EXEMPLO.negocios).toHaveLength(10);
    const ids = NEGOCIOS_PESSOAS_EXEMPLO.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("juntarPessoas", () => {
  it("há 6 pessoas sem negócio; Marta e Nuno têm negócios de mais de um tipo", () => {
    expect(resumos().filter((r) => r.semNegocio).map((r) => r.pessoa.nome).sort()).toEqual(
      ["Beatriz Sampaio", "Gonçalo Matias", "Hugo Teixeira", "Joana Bastos", "Lúcia Faria", "Rita Albuquerque"],
    );
    expect(de("Marta Silveira").negocios).toHaveLength(3);
    expect(de("Nuno Barros").negocios).toHaveLength(2);
  });

  it("o valor em jogo é a soma dos negócios abertos (nem ganhos nem perdidos)", () => {
    expect(de("Marta Silveira").emJogo).toBe(3200);
    expect(de("Nuno Barros").emJogo).toBe(8600);
    expect(de("Vasco Pinto").emJogo).toBe(24000 + 5600);
    expect(de("Clara Dias").emJogo).toBe(15200);
    expect(de("Rui Figueiredo").emJogo).toBe(0);
    expect(de("Rui Figueiredo").abertos).toEqual([]);
  });

  it("um cliente com um negócio novo em aberto continua cliente e mostra o valor desse negócio", () => {
    const paulo = de("Paulo Neves");
    expect(paulo).toMatchObject({ papel: "cliente", etapa: "cliente", emJogo: 4100 });
    expect(paulo.abertos).toHaveLength(1);
  });

  it("a etapa e a fase vêm do negócio aberto mais avançado", () => {
    expect(de("Vasco Pinto")).toMatchObject({ etapa: "qualificada", faseEtapa: "contrato" });
    expect(de("Nuno Barros")).toMatchObject({ etapa: "qualificada", faseEtapa: "proposta" });
    expect(de("Tiago Rocha")).toMatchObject({ etapa: "qualificada", faseEtapa: "orcamento" });
    expect(de("Rita Albuquerque")).toMatchObject({ etapa: "visitaMarcada", faseEtapa: null });
  });

  it("atrasada: leads pelo próximo contacto, clientes só com negócio em curso atrasado", () => {
    const atrasadas = resumos().filter((r) => r.atrasada).map((r) => r.pessoa.nome).sort();
    expect(atrasadas).toEqual(["Gonçalo Matias", "Lúcia Faria", "Paulo Neves", "Tiago Rocha"]);
    expect(de("Sofia Matos").atrasada).toBe(false);
    expect(de("Inês Pacheco").atrasada).toBe(false);
  });

  it("o formulário vem da pessoa; sem ele, null (registada à mão)", () => {
    expect(de("Hugo Teixeira").formulario).toBe("Casa de banho");
    expect(de("Lúcia Faria").formulario).toBeNull();
  });

  it("a saúde é a do pior negócio aberto; ganhos não contam", () => {
    expect(de("Nuno Barros").saude).toBe("atraso");
    expect(de("Vasco Pinto").saude).toBe("semOrcamento");
    expect(de("Marta Silveira").saude).toBe("emDia");
    expect(de("Sofia Matos").saude).toBeNull();
    expect(de("Sofia Matos").piorAberto).toBeNull();
  });

  it("sem negócio: sem saúde, sem valor, sem fase", () => {
    expect(de("Beatriz Sampaio")).toMatchObject({ semNegocio: true, soHistorico: false, emJogo: 0, faseEtapa: null, saude: null, papel: "lead" });
  });

  it("só histórico perdido: tem negócios mas nenhum aberto nem ganho", () => {
    expect(de("Fábio Lemos")).toMatchObject({ semNegocio: false, soHistorico: true, emJogo: 0, saude: null, papel: "lead" });
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

describe("juntarPessoas: registos", () => {
  it("cada resumo leva só os registos da sua pessoa", () => {
    const registos = registosBase({
      contactos: [contactoBase("rc-1", { pessoaId: "b" }), contactoBase("rc-2", { pessoaId: "a" })],
      visitas: [visitaPessoaBase("rv-1", { pessoaId: "a" })],
    });
    const [a, b, c] = juntarPessoas([pessoaBase("a"), pessoaBase("b"), pessoaBase("c")], [], HOJE_EXEMPLO, registos);
    expect([a.registos.contactos.map((r) => r.id), a.registos.visitas.map((r) => r.id)]).toEqual([["rc-2"], ["rv-1"]]);
    expect(b.registos.contactos.map((r) => r.id)).toEqual(["rc-1"]);
    expect(c.registos).toEqual({ contactos: [], visitas: [], levantamentos: [] });
  });

  it("sem registos, ninguém os tem", () => {
    expect(juntarPessoas([pessoaBase("a")], [], HOJE_EXEMPLO)[0].registos).toEqual({ contactos: [], visitas: [], levantamentos: [] });
  });

  it("as leads sem negócio aberto e quem tem visita têm registos de exemplo", () => {
    expect(de("Beatriz Sampaio").registos.contactos).toEqual([]);
    expect(de("Lúcia Faria").registos.contactos).toHaveLength(1);
    expect(de("Rita Albuquerque").registos.visitas).toHaveLength(1);
    expect(de("Paulo Neves").registos.visitas).toHaveLength(1);
    expect(de("Nuno Barros").registos.visitas).toEqual([]);
  });

  it("uma pessoa com visita de exemplo deixa de ter próximo contacto próprio: a visita é a dos registos", () => {
    expect(PESSOAS_EXEMPLO.find((p) => p.id === "p-rita")!.proximoContacto).toBeNull();
    expect(de("Rita Albuquerque").etapa).toBe("visitaMarcada");
  });
});

describe("papelEAbertos", () => {
  it("é cliente com um negócio ganho (também do histórico) e lead sem ele; os abertos são os do quadro sem contrato assinado", () => {
    const doNuno = NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => n.pessoaId === "p-nuno");
    expect(papelEAbertos(doNuno).papel).toBe("lead");
    expect(papelEAbertos(doNuno).abertos.length).toBeGreaterThan(0);
    expect(papelEAbertos(NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => n.pessoaId === "p-marta")).papel).toBe("cliente");
    expect(papelEAbertos([])).toEqual({ papel: "lead", abertos: [] });
  });
});
