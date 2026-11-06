import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { comDemonstracao, modeloDoProduto, produtosParaEspaco } from "./catalogo3d";
import { modeloHtmlDoProduto } from "./htmlDoCatalogo";

// o caminho do utilizador: os produtos REAIS da lista «Produtos do catálogo» na cozinha
const K = catalogo0();
const cozinha = produtosParaEspaco(comDemonstracao(K.produtos, K.arvore), K.arvore, "cozinha", { max: 100000 });
const doTipo = (t: string) => cozinha.filter((m) => m.tipo === t);
const html = (nome: string) => { const m = cozinha.find((x) => x.nome === nome)!; return (m.mockup3d.params as { html?: { modelo: string; acab: string; exacto?: boolean } }).html; };

describe("cada produto do catálogo de cozinha usa o modelo do HTML, escolhido pelo nome e pela medida", () => {
  it("lava-loiças: os 33 do catálogo têm modelo do HTML; só o Blanco Lemis não existe no HTML (usa o mais parecido)", () => {
    const l = doTipo("lava_loica");
    expect(l).toHaveLength(33);
    expect(l.every((m) => (m.mockup3d.params as { html?: unknown }).html)).toBe(true);
    expect(html("Lava-louças VELAR 1 CUBA 50")).toEqual({ modelo: "velar50", acab: "inox", exacto: true });
    expect(html("Lava-louças VELAR 1 CUBA 70")?.modelo).toBe("velar71");
    expect(html("Lava-louças AMBAR 1 CUBA 40 N")?.modelo).toBe("ambar40n");
    expect(html("Lava-louças AMBAR 1.5 CUBA 55")?.modelo).toBe("ambar55");
    expect(html("Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS")?.modelo).toBe("ambar116");
    expect(html("Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA")?.modelo).toBe("keran86");
    expect(html("Lava-louças LODY PVD 1 CUBA 70")).toMatchObject({ modelo: "lody70", acab: "oro" });
    expect(html("Lava-louças DUO 60 - 2 CUBAS")?.modelo).toBe("duo60");
    expect(html("Lava-louças BELÉM 1 CUBA")?.modelo).toBe("belem");
    expect(l.filter((m) => (m.mockup3d.params as { html?: { exacto?: boolean } }).html?.exacto === false).map((m) => m.nome)).toEqual(["LAVA LOUÇA BLANCO INOX LEMIS 45 S-IF 523 030 86CM"]);
    // as medidas passam a ser as do modelo, não as de omissão
    expect(cozinha.find((m) => m.nome === "Lava-louças VELAR 1 CUBA 50")!.dimensoes).toMatchObject({ larguraCm: 54, profundidadeCm: 44, alturaCm: 20 });
  });
  it("placas: deixam de ser «eletrodomésticos» (caixa) e usam a placa do HTML", () => {
    expect(html("Placa DE INDUÇÃO INDESIT")).toEqual({ modelo: "ib65b60", acab: "negro", exacto: true });
    expect(html("Placa DE INDUÇÃO WHIRPOOL")?.modelo).toBe("wlb1160");
    expect(html("Placa VITROCERÂMICA INDESIT")?.modelo).toBe("ri161");
    expect(html("Placa VITROCERÂMICA WHIRPOOL")?.modelo).toBe("akt8090");
    expect(html("Placa DE GÁS INDESIT INOX")).toMatchObject({ modelo: "thp642", acab: "inox" });
    expect(html("Placa DE GÁS INDESIT BRANCO")).toMatchObject({ modelo: "ing61t", acab: "blanco" });
    expect(html("Placa DE GÁS WHIRPOOL INOX 90")?.modelo).toBe("gmwl958");
    expect(doTipo("placa").filter((m) => (m.mockup3d.params as { html?: { exacto?: boolean } }).html?.exacto === false).map((m) => m.nome).sort()).toEqual([
      "PLACA COM EXAUSTOR INTGRADO AEG - TH84CB03FB 80CM", "Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 60", "Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 90"]);
  });
  it("torneiras de cozinha: as 7 do HTML pelo nome (as misturadoras de lava-loiça ficam sobre a bancada, não na parede)", () => {
    for (const [nome, modelo] of [["Misturadoras Monocomando Extraível ROUND", "round"], ["Misturadoras Monocomando NOAH", "noah"], ["Misturadoras Monocomando Extraível SMOOTH", "smooth"], ["Misturadoras Monocomando Extraível STICK MV", "stick"],
      ["Misturadoras Monocomando Flexivel CIRA SILICONE EDITION", "cira"], ["Misturadoras Monocomando Abatível ALEXIA", "alexia"], ["Misturadoras Monocomando Abatível GRANADA", "granada"]]) expect(html(nome)?.modelo).toBe(modelo);
    expect(cozinha.find((m) => m.nome.includes("ROUND"))!.montagem).toBe("chao");
    // as torneiras de banho (lavatório, bidé, banheira) continuam a ser de banho
    expect(cozinha.find((m) => m.nome === "Torneira de Lavatório SIRIO")!.tipo).toBe("torneira");
  });
  it("tampos: as séries Coverlam do HTML levam a chapa com a imagem do fabricante", () => {
    const chapa = (n: string) => cozinha.find((m) => m.nome.includes(n))!.mockup3d.params;
    expect(chapa("CANELA ROMA")).toEqual({ k: "chapa", series: "canela-roma", tone: "beige" });
    expect(chapa("CARMAGUE ARENA")).toEqual({ k: "chapa", series: "camargue", tone: "arena" });
    expect(chapa("JUNGLA Roble")).toEqual({ k: "chapa", series: "jungla", tone: "roble" });
    expect(chapa("BIANCO ORO")).toBeUndefined();
  });
  it("o que o HTML não tem fica sem modelo (e diz-se)", () => {
    expect(modeloHtmlDoProduto("Frigorífico 60×65×185 (demo)", "frigorifico")).toBeNull();
    expect(modeloDoProduto({ id: "x", n: "Misturadoras Monocomando Giratória SOPHIE METAL", no: null, sub: "Misturadoras Monocomando Giratória" }).mockup3d.params).toMatchObject({ k: "torneira", estilo: "monocomando" });
  });
});
