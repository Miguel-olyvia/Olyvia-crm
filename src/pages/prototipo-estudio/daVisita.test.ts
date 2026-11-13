// 5/11: o Estúdio abre a partir da Visita: a planta, as alturas e o estilo vêm do negócio.
import { describe, expect, it } from "vitest";
import { gravarPlanta, retangulo } from "@/emylia/planta";
import { abrirEstudio, coresDoTexto, devolverAoNegocio, ditosDoNegocio, estiloDasRespostas, lerVolta, pedidosDoNegocio, projetoDaVisita, CHAVE_ESTUDIO } from "./daVisita";
import { estiloDosDitos } from "./estiloDaConversa";

type EscolhaTeste = { peca: string; escolha: string; decidida?: boolean; acao?: "manter" | "trocar" | "remover" | "acrescentar"; cor?: "preto" | "branco" | "cinza" | "madeira" | "bege" | null; material?: string | null };
const insightsVisita = (escolhas: EscolhaTeste[]) =>
  JSON.stringify({ insights: { resumo: "resumo", escolhas: escolhas.map((e) => ({ decidida: true, ...e })) }, tempos: [], em: "2026-11-13", metricas: {} });

describe("o Estúdio a partir da Visita", () => {
  it("13/11: o modelo é a verdade das cores (as escolhas peça a peça, sem a coordenação a falhar)", () => {
    const f = { insights_visita: insightsVisita([
      { peca: "sanita", escolha: "branca" },
      { peca: "banheira", escolha: "branca" },
      { peca: "móvel", escolha: "em madeira" },
    ]) };
    const o = estiloDosDitos(ditosDoNegocio(f))!;
    expect(o.estilo.porCategoria.sanita).toEqual(["branco"]);
    expect(o.estilo.porCategoria.banheira).toEqual(["branco"]);
    expect(o.estilo.porCategoria.movel).toEqual(["madeira"]);
  });

  it("13/11: sem análise do modelo, as cores saem das regras da transcrição", () => {
    const f = { transcricao_visita: "0:05 Cliente: Quero a sanita preta." };
    expect(estiloDosDitos(ditosDoNegocio(f))!.estilo.porCategoria.sanita).toEqual(["preto"]);
  });

  it("13/11: a cor estruturada do modelo manda, e uma peça a remover não leva cor", () => {
    const f = { insights_visita: insightsVisita([
      { peca: "sanita", acao: "trocar", cor: "preto", escolha: "sanita preta" },
      { peca: "bidé", acao: "remover", escolha: "tirar o bidé" },
    ]) };
    const o = estiloDosDitos(ditosDoNegocio(f))!;
    expect(o.estilo.porCategoria.sanita).toEqual(["preto"]);
    expect(o.estilo.porCategoria.bide ?? []).toEqual([]);
  });

  it("13/11: as ações sobre as peças vêm do modelo (trocar, remover, acrescentar), seja qual for a frase", () => {
    const f = { insights_visita: insightsVisita([
      { peca: "bidé", acao: "remover", escolha: "o bidé sai" },
      { peca: "base de duche", acao: "acrescentar", escolha: "quero uma base de duche" },
      { peca: "sanita", acao: "manter", escolha: "a sanita fica" },
    ]) };
    const porTipo = Object.fromEntries(pedidosDoNegocio(f).pecas.map((x) => [x.tipo, x.acao]));
    expect(porTipo.bide).toBe("tira");
    expect(porTipo.base).toBe("junta");
    expect("sanita" in porTipo).toBe(false);
  });

  it("13/11: os serviços vêm do modelo (nicho pedido, limpeza recusada), seja qual for a frase", () => {
    const f = { insights_visita: JSON.stringify({ insights: { resumo: "r", escolhas: [], servicos: [
      { servico: "um nicho no duche", quer: true },
      { servico: "a limpeza final", quer: false },
    ] }, tempos: [], em: "2026-11-13", metricas: {} }) };
    const byId = Object.fromEntries(pedidosDoNegocio(f).servicos.map((s) => [s.id, s.quer]));
    expect(byId["sv-nicho"]).toBe(true);
    expect(byId["sv-limpeza"]).toBe(false);
  });

  it("13/11: com o modelo analisado, o «tudo branco» global das regras mantém-se (o modelo só dá por peça)", () => {
    const f = { insights_visita: insightsVisita([{ peca: "sanita", escolha: "branca" }]), transcricao_visita: "0:05 Cliente: Quero tudo branco." };
    const o = estiloDosDitos(ditosDoNegocio(f))!;
    expect(o.estilo.cores).toContain("branco");          // o global, das regras
    expect(o.estilo.porCategoria.sanita).toEqual(["branco"]); // o por-peça, do modelo
  });

  it("as cores ditas num texto, pela ordem", () => {
    expect(coresDoTexto("Cinza 120 x 60 retificado")).toEqual(["cinza"]);
    expect(coresDoTexto("Axis Oak")).toEqual(["madeira"]);
    expect(coresDoTexto("Preto e cinza")).toEqual(["preto", "cinza"]);
    expect(coresDoTexto("")).toEqual([]);
  });

  it("o estilo: as cores das paredes, da base e das torneiras; o móvel à parte", () => {
    const e = estiloDasRespostas({ pc_rev_modelo: "Cinza 120 x 60", pc_base_cor: "Preto", pc_torn_cor: "Preto", pc_movel_frentes: "Axis Oak" });
    expect(e.cores).toEqual(["cinza", "preto"]);
    expect(e.porCategoria.movel).toEqual(["madeira"]);
  });

  it("o projeto: a planta da visita é o antes (e o depois começa igual), com o pé-direito e o teto falso", () => {
    const f = { planta: gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [] }), diag_pe_direito_m: "2,6 m", pc_teto: "Teto falso" };
    const p = projetoDaVisita("testeeeeeeee", f);
    expect(p.nome).toBe("testeeeeeeee");
    expect(p.antes.paredes).toEqual(retangulo(234, 177));
    expect(p.depois).toEqual(p.antes);
    expect(p.depois).not.toBe(p.antes);
    expect(p.alturas).toEqual({ peDireito: 260, tetoFalso: 240 });
  });

  it("sem planta desenhada, o Estúdio abre com a planta vazia (desenha-se lá)", () => {
    expect(projetoDaVisita("x", {}).antes.paredes).toEqual([]);
  });

  it("abrir outra vez o mesmo negócio continua o projeto; voltar ao negócio devolve a planta uma vez", () => {
    localStorage.clear();
    const f = { planta: gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }) };
    abrirEstudio("Ana", f, 7, "/negocios");
    const guardado = JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!);
    guardado.escolhas = { x: "san-ria" };
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(guardado));
    abrirEstudio("Ana", f, 7, "/negocios");
    expect(JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!).escolhas).toEqual({ x: "san-ria" });
    abrirEstudio("Rui", f, 8, "/negocios");
    expect(JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!).escolhas).toEqual({});
    devolverAoNegocio({ ...guardado, negocio: 7, antes: { o: { x: 0, y: 0 }, paredes: retangulo(250, 150), pecas: [] } });
    expect(lerVolta(8)).toBeNull();
    expect(lerVolta(7)?.antes.paredes[0].c).toBe(250);
    expect(lerVolta(7)).toBeNull();
  });
});

describe("levar as necessidades do Estúdio para o negócio (5/11)", () => {
  it("a volta leva as linhas com o que são: o produto (com as cores e a peça), a instalação, os trabalhos e os serviços", async () => {
    const { linhasParaLevar } = await import("./levarParaNegocio");
    const { escolherProduto, juntarServico } = await import("./necessidadesEstudio");
    const { PROJETO_EXEMPLO } = await import("./exemploEstudio");
    let p = escolherProduto(PROJETO_EXEMPLO, "a-sanita", "san-nexo-c");
    p = juntarServico(p, "sv-pintura-teto");
    const ls = linhasParaLevar(p);
    expect(ls.find((l) => l.id === "prod-a-sanita")).toMatchObject({ tipo: "produto", chave: "sanita", cores: ["cinza"], par: "a-sanita" });
    expect(ls.find((l) => l.id === "inst-a-sanita")).toMatchObject({ tipo: "servico", chave: "instalar:sanita", par: "a-sanita" });
    expect(ls.find((l) => l.id === "ret-a-sanita")?.chave).toBe("retirar:sanita");
    expect(ls.find((l) => l.id === "serv-sv-pintura-teto")?.chave).toBe("pintura");
    expect(ls.find((l) => l.id === "teto")?.chave).toBe("teto");
  });
});
