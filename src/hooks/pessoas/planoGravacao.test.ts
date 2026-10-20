// planoGravacao: o que o painel «Visita e levantamento» grava na base, e por que ordem. Função pura: nada de relógio (o instante de agora chega por
// parâmetro), nada de rede. Visitas por ordem (criar, alterar, concluir, cancelar), o levantamento a seguir, e uma recusa ANTES de escrever o que a
// base não aceitaria (hora em falta, visita feita no futuro, sem quadro ou recurso por omissão).
import { describe, expect, it } from "vitest";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { planoGravacao, type BaseVisita, type EntradaPlano, type LevantamentoLivre, type Passo } from "./planoGravacao";

const AGORA = Date.parse("2026-10-20T12:00:00Z");
const MORADA = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const RASCUNHO_VAZIO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };

const visita = (id: string, extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-22", hora: "10:00", feitoPor: "Bruno", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "h1",
  morada: { ...MORADA }, igualALead: false, nota: "", ...extra,
});
const gravada = (id: string, extra: Partial<VisitaPessoa> = {}): BaseVisita => ({
  idReal: id,
  visita: {
    ...visita(id), pessoaId: "p1", negocioId: null, agenda: { boardId: "q1", recursos: [{ id: "r1", nome: "Bruno" }], duracaoMinutos: 60 }, ...extra,
  },
});

function entrada(sobre: Partial<EntradaPlano> = {}): EntradaPlano {
  return {
    organizationId: "org-1", pessoaId: "p1", nome: "Ana Lopes", visitas: [], base: new Map(), omissao: { boardId: "q-omissao", recursoId: "r-omissao" },
    tituloDoTipo: (tipo) => ({ levantamento: "Levantamento", revisita: "Revisita", medicao: "Medição", materiais: "Materiais", "": "" })[tipo],
    agora: AGORA, hoje: "2026-10-20", comercial: "Bruno", negocioId: null, rascunho: RASCUNHO_VAZIO, levantamentoLivre: null, novoIdLevantamento: () => "lev-novo",
    ...sobre,
  };
}
const comBase = (...b: BaseVisita[]): ReadonlyMap<string, BaseVisita> => new Map(b.map((x) => [x.visita.id, x]));
const passos = (e: EntradaPlano): Passo[] => {
  const p = planoGravacao(e);
  if (!p.ok) throw new Error(`recusado: ${p.falta}`);
  return p.passos;
};
const tipos = (e: EntradaPlano): string[] => passos(e).map((p) => (p.tipo === "levantamento" ? "levantamento" : `${p.tipo}:${p.id}`));

describe("visitas novas", () => {
  it("uma visita nova por fazer cria-se com o quadro e o recurso por omissão, o título «tipo · nome» e a morada, sem lat nem lng à mão", () => {
    const [p] = passos(entrada({ visitas: [visita("nova", { nota: " levar fita ", quemVaiEstar: "casal" })] }));
    expect(p).toMatchObject({
      tipo: "criarVisita", id: "nova",
      entrada: {
        boardId: "q-omissao", recursos: ["r-omissao"], data: "2026-10-22", hora: "10:00", duracao: "h1", tipo: "levantamento", titulo: "Levantamento · Ana Lopes",
        nota: "levar fita", quemVaiEstar: "casal", morada: MORADA, igualALead: false, negocioId: null,
      },
    });
  });

  it("a visita nasce ligada ao negócio quando o painel vem de um negócio", () => {
    const [p] = passos(entrada({ negocioId: "neg-1", visitas: [visita("nova")] }));
    expect(p).toMatchObject({ tipo: "criarVisita", entrada: { negocioId: "neg-1" } });
  });

  it("uma visita nova já feita cria-se e conclui-se (sem resultado); a concluir ainda não conhece o id da base", () => {
    const e = entrada({ visitas: [visita("nova", { estado: "feita", data: "2026-10-19" })] });
    expect(tipos(e)).toEqual(["criarVisita:nova", "concluirVisita:nova"]);
    expect(passos(e)[1]).toMatchObject({ tipo: "concluirVisita", idReal: null });
  });

  it("uma visita nova marcada como cancelada não se cria", () => {
    expect(passos(entrada({ visitas: [visita("nova", { estado: "cancelada" })] }))).toEqual([]);
  });

  it("sem visitas nem levantamento não há nada a gravar", () => {
    expect(passos(entrada())).toEqual([]);
  });
});

describe("visitas que já existem na base", () => {
  it("sem alterações não se grava nada", () => {
    expect(passos(entrada({ visitas: [visita("v1")], base: comBase(gravada("v1")) }))).toEqual([]);
  });

  it("alterar reenvia a visita inteira, com o quadro e os recursos da base: a mesma lista de recursos e a duração da base preservam-se", () => {
    const base = gravada("v1", { duracao: "", agenda: { boardId: "q1", recursos: [{ id: "r1", nome: "B" }, { id: "r2", nome: "C" }], duracaoMinutos: 45 } });
    const [p] = passos(entrada({ visitas: [visita("v1", { data: "2026-10-23", duracao: "" })], base: comBase(base) }));
    expect(p).toMatchObject({
      tipo: "alterarVisita", id: "v1", idReal: "v1", recursosAtuais: ["r1", "r2"],
      entrada: { boardId: "q1", recursos: ["r1", "r2"], data: "2026-10-23", hora: "10:00", duracaoMinutos: 45, titulo: "" },
    });
  });

  it("mudar a duração larga a duração da base; mudar o tipo refaz o título", () => {
    const [p] = passos(entrada({ visitas: [visita("v1", { duracao: "h2", tipo: "medicao" })], base: comBase(gravada("v1")) }));
    expect(p).toMatchObject({ tipo: "alterarVisita", entrada: { duracao: "h2", titulo: "Medição · Ana Lopes" } });
    expect((p as Extract<Passo, { tipo: "alterarVisita" }>).entrada.duracaoMinutos).toBeUndefined();
  });

  it.each<[string, Partial<VisitaNegocio>]>([
    ["a hora", { hora: "11:00" }], ["a nota", { nota: "x" }], ["a morada", { morada: { ...MORADA, rua: "Outra" } }],
    ["quem vai estar", { quemVaiEstar: "casal" }], ["«igual à da lead»", { igualALead: true }],
  ])("mudar %s é uma alteração", (_nome, extra) => {
    expect(tipos(entrada({ visitas: [visita("v1", extra)], base: comBase(gravada("v1")) }))).toEqual(["alterarVisita:v1"]);
  });

  it("espaços à volta do texto não contam como alteração", () => {
    const e = entrada({ visitas: [visita("v1", { nota: "  ", morada: { ...MORADA, rua: " Rua A 1 " } })], base: comBase(gravada("v1")) });
    expect(passos(e)).toEqual([]);
  });

  it("passar a feita conclui-se; com alterações, altera-se primeiro e conclui-se depois", () => {
    const base = comBase(gravada("v1", { data: "2026-10-19" }));
    expect(tipos(entrada({ visitas: [visita("v1", { estado: "feita", data: "2026-10-19" })], base }))).toEqual(["concluirVisita:v1"]);
    expect(tipos(entrada({ visitas: [visita("v1", { estado: "feita", data: "2026-10-19", hora: "11:00" })], base }))).toEqual(["alterarVisita:v1", "concluirVisita:v1"]);
  });

  it("passar a cancelada cancela-se, sem alterar o que se tenha mexido", () => {
    const e = entrada({ visitas: [visita("v1", { estado: "cancelada", nota: "mexi" })], base: comBase(gravada("v1")) });
    expect(passos(e)).toEqual([{ tipo: "cancelarVisita", id: "v1", idReal: "v1" }]);
  });

  it.each<["feita" | "cancelada"]>([["feita"], ["cancelada"]])("uma visita %s na base nunca sai, mesmo editada", (estado) => {
    const e = entrada({ visitas: [visita("v1", { estado, nota: "mexi", hora: "09:00" })], base: comBase(gravada("v1", { estado })) });
    expect(passos(e)).toEqual([]);
  });

  it("uma visita de um negócio altera-se na mesma (a base decide se o negócio ainda o permite)", () => {
    const e = entrada({ visitas: [visita("v1", { nota: "x" })], base: comBase(gravada("v1", { negocioId: "neg-1" })) });
    expect(tipos(e)).toEqual(["alterarVisita:v1"]);
  });
});

describe("a ordem", () => {
  it("criar, alterar, concluir, cancelar e só então o levantamento; as visitas por ordem cronológica dentro de cada grupo", () => {
    const base = comBase(gravada("a", { data: "2026-10-18" }), gravada("b"), gravada("c", { data: "2026-10-18" }), gravada("d"));
    const e = entrada({
      base, rascunho: { ...RASCUNHO_VAZIO, observacoes: "obs" },
      visitas: [
        visita("d", { estado: "cancelada" }), visita("c", { estado: "feita", data: "2026-10-18" }), visita("b", { nota: "x" }),
        visita("n2", { data: "2026-10-26" }), visita("n1", { data: "2026-10-24" }), visita("a", { data: "2026-10-18", estado: "feita" }),
      ],
    });
    expect(tipos(e)).toEqual([
      "criarVisita:n1", "criarVisita:n2", "alterarVisita:b", "concluirVisita:c", "concluirVisita:a", "cancelarVisita:d", "levantamento",
    ]);
  });
});

describe("visitas criadas nesta sessão (o painel repete depois de uma falha a meio)", () => {
  it("uma já criada e sem alterações não se cria outra vez: usa o id da base que ficou guardado", () => {
    const criada: BaseVisita = { ...gravada("local-1"), idReal: "uuid-real" };
    expect(passos(entrada({ visitas: [visita("local-1")], base: comBase(criada) }))).toEqual([]);
    expect(passos(entrada({ visitas: [visita("local-1", { nota: "x" })], base: comBase(criada) })))
      .toEqual([expect.objectContaining({ tipo: "alterarVisita", id: "local-1", idReal: "uuid-real" })]);
  });

  it("uma criada que o utilizador tirou do painel entretanto cancela-se, e só ela", () => {
    const criada: BaseVisita = { ...gravada("local-1"), idReal: "uuid-real" };
    const daFicha = gravada("v9");
    const e = entrada({ visitas: [], base: comBase(criada, daFicha), sessao: new Set(["local-1"]) });
    expect(passos(e)).toEqual([{ tipo: "cancelarVisita", id: "local-1", idReal: "uuid-real" }]);
  });
});

describe("visitas criadas na sessão e que já não estão por fazer", () => {
  it("uma criada que entretanto ficou concluída e que o utilizador tirou do painel não se cancela: não há passo (o painel não pode desfazer o que já aconteceu)", () => {
    const concluida: BaseVisita = { ...gravada("local-1", { estado: "feita" }), idReal: "uuid-real" };
    const e = entrada({ visitas: [], base: comBase(concluida), sessao: new Set(["local-1"]) });
    expect(passos(e)).toEqual([]);
  });
});

describe("recusas antes de escrever", () => {
  const recusa = (e: EntradaPlano) => {
    const p = planoGravacao(e);
    return p.ok ? null : { falta: p.falta, visitaId: p.visitaId };
  };

  it("sem dia ou sem hora recusa-se, a dizer qual visita", () => {
    expect(recusa(entrada({ visitas: [visita("v", { data: "" })] }))).toEqual({ falta: "dataEmFalta", visitaId: "v" });
    expect(recusa(entrada({ visitas: [visita("v", { hora: "" })] }))).toEqual({ falta: "horaEmFalta", visitaId: "v" });
  });

  it("uma visita que ainda não aconteceu não se dá como feita", () => {
    expect(recusa(entrada({ visitas: [visita("v", { estado: "feita", data: "2026-10-25" })] }))).toEqual({ falta: "feitaNoFuturo", visitaId: "v" });
    const base = comBase(gravada("v"));
    expect(recusa(entrada({ visitas: [visita("v", { estado: "feita", data: "2026-10-25" })], base }))).toEqual({ falta: "feitaNoFuturo", visitaId: "v" });
  });

  it("sem quadro ou sem recurso por omissão recusa-se uma visita nova (não há onde escolher)", () => {
    expect(recusa(entrada({ visitas: [visita("v")], omissao: { boardId: null, recursoId: "r" } }))?.falta).toBe("quadroEmFalta");
    expect(recusa(entrada({ visitas: [visita("v")], omissao: { boardId: "q", recursoId: null } }))?.falta).toBe("recursoEmFalta");
  });

  it("uma visita da base usa o quadro e os recursos dela: a falta de omissão não a impede", () => {
    const e = entrada({ visitas: [visita("v1", { nota: "x" })], base: comBase(gravada("v1")), omissao: { boardId: null, recursoId: null } });
    expect(tipos(e)).toEqual(["alterarVisita:v1"]);
  });

  it("o que não se grava não se valida: visitas canceladas, só de leitura ou sem alterações podem ter campos em falta", () => {
    const e = entrada({
      visitas: [visita("c", { estado: "cancelada", hora: "" }), visita("f", { hora: "" }), visita("g", { data: "" })],
      base: comBase(gravada("f", { estado: "feita", hora: "" }), gravada("g", { estado: "cancelada", data: "" })),
    });
    expect(passos(e)).toEqual([]);
  });

  it("um dia que não existe recusa-se como inválido (nada chega à base)", () => {
    expect(recusa(entrada({ visitas: [visita("v", { data: "2026-02-30" })] }))?.falta).toBe("horaInvalida");
  });
});

describe("o levantamento", () => {
  const COM_LINHAS: RascunhoLevantamento = {
    linhas: [
      { id: "l1", divisao: "cozinha", trabalho: "pavimento", trabalhoOutro: "ignorado", medida: "12,5", unidade: "m2", observacoes: " ao fundo " },
      { id: "l2", divisao: "sala", trabalho: "outro", trabalhoOutro: " Rodapé ", medida: "3.0004", unidade: "m", observacoes: "" },
    ],
    observacoes: " notas ", respostas: { acesso: "dificil" }, moradaObra: { rua: " Rua B 2 ", codigoPostal: "2000-002", localidade: "", andar: "" },
  };

  it("um levantamento novo com conteúdo grava-se com a data e o estado da visita que o representa, e as linhas no formato da base", () => {
    const e = entrada({
      rascunho: COM_LINHAS, visitas: [visita("v1", { estado: "feita", data: "2026-10-19" })], base: comBase(gravada("v1", { estado: "feita", data: "2026-10-19" })),
    });
    const l = passos(e).find((p) => p.tipo === "levantamento");
    expect(l).toEqual({
      tipo: "levantamento", levantamentoId: "lev-novo", negocioId: null, visitaPainelId: "v1", respostas: { acesso: "dificil" },
      dados: {
        data_levantamento: "2026-10-19", estado: "feito", notas: "notas", morada_rua: "Rua B 2", morada_codigo_postal: "2000-002",
      },
      linhas: [
        { divisao: "cozinha", trabalho: "pavimento", medida: 12.5, unidade: "m2", observacoes: "ao fundo" },
        { divisao: "sala", trabalho: "outro", trabalho_outro: "Rodapé", medida: 3, unidade: "m" },
      ],
    });
  });

  it("sem visitas vale hoje e por fazer, e não se liga a nenhuma visita; a visita cancelada nunca o representa", () => {
    const e = entrada({ rascunho: COM_LINHAS, visitas: [visita("v1", { estado: "cancelada" })], base: comBase(gravada("v1")) });
    const l = passos(e).find((p) => p.tipo === "levantamento") as Extract<Passo, { tipo: "levantamento" }>;
    expect(l.dados).toMatchObject({ data_levantamento: "2026-10-20", estado: "por_fazer" });
    expect(l.visitaPainelId).toBeNull();
  });

  it("liga-se à Feita do tipo levantamento, depois a outra Feita, depois à Por fazer", () => {
    const vs = [
      visita("p", { data: "2026-10-21" }), visita("f", { estado: "feita", data: "2026-10-18", tipo: "medicao" }),
      visita("fl", { estado: "feita", data: "2026-10-19", tipo: "levantamento" }),
    ];
    const base = comBase(gravada("p"), gravada("f", { estado: "feita" }), gravada("fl", { estado: "feita" }));
    const ligada = (visitas: VisitaNegocio[]) =>
      (passos(entrada({ rascunho: COM_LINHAS, visitas, base })).find((p) => p.tipo === "levantamento") as Extract<Passo, { tipo: "levantamento" }>).visitaPainelId;
    expect(ligada(vs)).toBe("fl");
    expect(ligada(vs.filter((v) => v.id !== "fl"))).toBe("f");
    expect(ligada(vs.filter((v) => v.id === "p"))).toBe("p");
  });

  it("sem conteúdo e sem levantamento livre não se chama; só marcar uma visita não cria um levantamento (nem pela morada que a visita sugere)", () => {
    const e = entrada({ visitas: [visita("nova")], rascunho: { ...RASCUNHO_VAZIO, moradaObra: { ...MORADA } } });
    expect(tipos(e)).toEqual(["criarVisita:nova"]);
  });

  it("a morada que uma visita cancelada sugere também não conta como escrita à mão (o formulário deriva-a de todas as visitas)", () => {
    const e = entrada({ visitas: [visita("v1", { estado: "cancelada" })], base: comBase(gravada("v1")), rascunho: { ...RASCUNHO_VAZIO, moradaObra: { ...MORADA } } });
    expect(tipos(e)).toEqual(["cancelarVisita:v1"]);
  });

  it("uma morada escrita à mão, diferente da das visitas, já é conteúdo", () => {
    const e = entrada({ rascunho: { ...RASCUNHO_VAZIO, moradaObra: { ...MORADA, rua: "Outra" } } });
    expect(tipos(e)).toEqual(["levantamento"]);
  });

  it("o negócio liga-se na mesma gravação (p_negocio_id), não à parte", () => {
    const l = passos(entrada({ negocioId: "neg-1", rascunho: COM_LINHAS })).find((p) => p.tipo === "levantamento");
    expect(l).toMatchObject({ negocioId: "neg-1" });
  });

  describe("com um levantamento livre já gravado", () => {
    const LIVRE: LevantamentoLivre = {
      id: "lev-1", rascunho: COM_LINHAS, visitaId: "v1", data: "2026-10-19", estado: "feito",
      morada: { rua: "Rua B 2", codigoPostal: "2000-002", localidade: "", andar: "" },
    };
    const visitas = [visita("v1", { estado: "feita", data: "2026-10-19" })];
    const base = comBase(gravada("v1", { estado: "feita", data: "2026-10-19" }));

    it("sem alterações não se volta a gravar (não se reescreve o que a pessoa não mexeu)", () => {
      expect(passos(entrada({ rascunho: COM_LINHAS, levantamentoLivre: LIVRE, visitas, base }))).toEqual([]);
    });

    it.each<[string, Partial<RascunhoLevantamento>]>([
      ["uma linha", { linhas: [COM_LINHAS.linhas[0]] }], ["as observações", { observacoes: "outras" }], ["uma resposta", { respostas: { acesso: "facil" } }],
      ["a morada escrita à mão", { moradaObra: { rua: "Nova", codigoPostal: "2000-002", localidade: "", andar: "" } }],
    ])("mudar %s grava com o id do levantamento que já existe", (_nome, mudanca) => {
      const l = passos(entrada({ rascunho: { ...COM_LINHAS, ...mudanca }, levantamentoLivre: LIVRE, visitas, base })).find((p) => p.tipo === "levantamento");
      expect(l).toMatchObject({ tipo: "levantamento", levantamentoId: "lev-1" });
    });

    it("outra visita passa a representar o levantamento: grava para o ligar a ela", () => {
      expect(tipos(entrada({ rascunho: COM_LINHAS, levantamentoLivre: { ...LIVRE, visitaId: "antiga" }, visitas, base }))).toEqual(["levantamento"]);
    });

    it("uma visita feita que ainda não existe na base também passa a representá-lo (liga-se ao id que a criação devolver)", () => {
      const vs = [visita("nova", { estado: "feita", data: "2026-10-19" })];
      expect(tipos(entrada({ rascunho: COM_LINHAS, levantamentoLivre: LIVRE, visitas: vs }))).toEqual(["criarVisita:nova", "concluirVisita:nova", "levantamento"]);
    });

    it("sem visitas que o representem conserva a data, a visita e o estado que já tinha (nada se apaga por omissão)", () => {
      const l = passos(entrada({ rascunho: { ...COM_LINHAS, observacoes: "outras" }, levantamentoLivre: LIVRE })).find((p) => p.tipo === "levantamento") as Extract<Passo, { tipo: "levantamento" }>;
      expect(l.dados).toMatchObject({ data_levantamento: "2026-10-19", visita_id: "v1" });
      expect("estado" in l.dados).toBe(false);
      expect(l.visitaPainelId).toBeNull();
    });

    it("limpar tudo grava um levantamento vazio por cima do que havia (o utilizador tirou o conteúdo)", () => {
      const l = passos(entrada({ rascunho: RASCUNHO_VAZIO, levantamentoLivre: LIVRE })).find((p) => p.tipo === "levantamento");
      expect(l).toMatchObject({ tipo: "levantamento", levantamentoId: "lev-1", linhas: [], respostas: {} });
    });
  });

  it("o código postal fora do formato da base não vai na morada (a base recusaria o levantamento inteiro)", () => {
    const e = entrada({ rascunho: { ...COM_LINHAS, moradaObra: { rua: "R", codigoPostal: "12", localidade: "", andar: "" } } });
    const l = passos(e).find((p) => p.tipo === "levantamento") as Extract<Passo, { tipo: "levantamento" }>;
    expect(l.dados).toMatchObject({ morada_rua: "R" });
    expect("morada_codigo_postal" in l.dados).toBe(false);
  });
});

describe("pureza", () => {
  it("não muda a entrada", () => {
    const e = entrada({
      visitas: [visita("v1", { nota: "x" }), visita("n")], base: comBase(gravada("v1")), rascunho: { ...RASCUNHO_VAZIO, observacoes: "obs" },
    });
    const antes = JSON.stringify([e.visitas, [...e.base.entries()], e.rascunho]);
    planoGravacao(e);
    expect(JSON.stringify([e.visitas, [...e.base.entries()], e.rascunho])).toBe(antes);
  });
});
