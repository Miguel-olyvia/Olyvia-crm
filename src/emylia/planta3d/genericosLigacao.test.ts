// Os 7 genéricos novos LIGADOS à app (quadro «subcategoria → modelo genérico 3D», 23/11, aprovado pelo dono) e as opções que passam a sair do
// nome do produto. Nomes reais do quadro (Mudelar), com a subcategoria real em `sub`, passados pelo classificador verdadeiro (modeloDoProduto).
import { describe, expect, it } from "vitest";
import { modeloDoProduto, temModeloGenerico, type ProdutoModelo3D } from "./catalogo3d";
import { categoriaDoTipo, categoriaPorId, opcoesComOmissao, type CategoriaGlb, type ParamsGenerico } from "./categoriasGlb";

const prod = (n: string, sub = ""): ProdutoModelo3D => modeloDoProduto({ id: n, n, sub, no: null });
const gen = (n: string, sub = "") => prod(n, sub).mockup3d.generico;
const cm = (m: ProdutoModelo3D): number[] => [m.dimensoes.larguraCm, m.dimensoes.profundidadeCm, m.dimensoes.alturaCm].map((x) => Math.round(x * 10) / 10);
const cat = (id: string): CategoriaGlb => {
  const c = categoriaPorId(id);
  if (!c) throw new Error(`falta a categoria ${id}`);
  return c;
};
const visiveis = (c: CategoriaGlb, p: ParamsGenerico): string[] => c.partes.filter((x) => (x.ver ? x.ver(p) : true)).map((x) => x.nome);
const parte = (c: CategoriaGlb, nome: string) => {
  const x = c.partes.find((k) => k.nome === nome);
  if (!x) throw new Error(`${c.id} não tem a parte ${nome}`);
  return x;
};

describe("ligação: cada subcategoria nova cai no seu genérico", () => {
  it("Tampos & Bancadas WC → tampo_wc, com a cuba e o lado lidos do nome e a espessura de 12 cm", () => {
    const sem = prod("Encimera BREDA sem lavabo Solid Bath a medida 70cm", "Tampos & Bancadas WC");
    expect(sem.tipo).toBe("bancada");
    expect(sem.mockup3d.generico).toEqual({ id: "tampo_wc", o: { cuba: false, posicao: "centrada", furo: true } });
    expect(cm(sem)).toEqual([70, 46, 12]);
    const com = prod("Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 100cm)", "Tampos & Bancadas WC");
    expect(com.mockup3d.generico?.o).toMatchObject({ cuba: true, posicao: "esquerda" });
    expect(cm(com)[0]).toBe(100);
    expect(cm(prod("Encimera Piedra Compacta (Resina) 140x46 (p/ Maná/Sia)", "Tampos & Bancadas WC"))).toEqual([140, 46, 12]);
  });

  it("Cubas inox e compósito: o tipo lava_loica fica ligado ao genérico; os do catálogo continuam com o modelo do HTML (exacto ou o mais parecido)", () => {
    const c = categoriaDoTipo("lava_loica", "Lava-louças ROMA 2 CUBAS", true);
    expect(c?.id).toBe("lava_loica");
    expect(c && opcoesComOmissao(c, "lava_loica", {}, "Lava-louças ROMA 2 CUBAS")).toEqual({ cubas: "2", escorredor: false, lado: "direita", rebordo: true });
    expect(categoriaDoTipo("lava_loica", "Lava-louças SOLO 1 CUBA", true)?.id).toBe("lava_loica");
    // o HTML continua a ter prioridade: o «mais parecido» não passa ao genérico (é uma decisão por tomar)
    expect(prod("Lava-louças ROMA 2 CUBAS", "Cubas inox").mockup3d.params).toMatchObject({ k: "lava_loica", html: { exacto: false } });
    for (const n of ["Lava-louças LAGUNA 1 CUBA", "Lava-louças UNA 55 - 2 CUBAS", "Lava-louças AMBAR 1 CUBA 80"]) {
      const m = prod(n, "Cubas inox");
      expect(m.mockup3d.generico, n).toBeUndefined();
      expect(m.mockup3d.params?.k, n).toBe("lava_loica");
    }
  });

  it("Máquinas de lavar, de lavar e secar e de secar roupa → maquina_roupa", () => {
    expect(gen("Máquina lavar roupa ENCASTRE INDESIT", "Máquinas lavar roupa")).toEqual({ id: "maquina_roupa", o: { tipo: "lavar", encastre: true } });
    expect(gen("Máquina lavar & secar roupa INDESIT", "Máquinas lavar & secar roupa")).toEqual({ id: "maquina_roupa", o: { tipo: "lavar_secar", encastre: false } });
    expect(gen("Máquina secar roupa WHIRPOOL", "Máquinas secar roupa")?.o.tipo).toBe("secar");
    // a máquina de loiça continua a sua
    expect(gen("Máquina lavar loiça INDESIT BRANCO", "Máquinas lavar loiça")?.id).toBe("maquina_loica");
  });

  it("Termoacumulador e Esquentador → termoacumulador, na parede, com medidas pelo volume (o esquentador não fica 60×60×85)", () => {
    const t150 = prod("Termoacumulador VULCANO 150L", "Termoacumulador");
    expect(t150.mockup3d.generico).toEqual({ id: "termoacumulador", o: { forma: "cilindro", orientacao: "vertical", chamine: false } });
    expect(t150.montagem).toBe("parede");
    expect(t150.alturaOmissao).toBe(1.2);
    expect(cm(t150)).toEqual([56, 56, 125]);
    expect(cm(prod("Termoacumulador VULCANO 57L", "Termoacumulador"))).toEqual([45, 45, 80]);
    expect(cm(prod("Termoacumulador VULCANO 30L", "Termoacumulador"))).toEqual([36, 36, 60]);
    const slim = prod("Termoacumulador SLIM TEKA 100L", "Termoacumulador");
    expect(slim.mockup3d.generico?.o.forma).toBe("caixa");
    expect(cm(slim)[1]).toBe(30);
    const esq = prod("Esquentador VULCANO 15L GÁS NATURAL", "Esquentador");
    expect(esq.mockup3d.generico).toEqual({ id: "termoacumulador", o: { forma: "caixa", orientacao: "vertical", chamine: true } });
    expect(cm(esq)).toEqual([31, 22, 58]);
  });

  it("Apliques LED → aplique, na parede, com a largura do nome («60CM»)", () => {
    const a = prod("Aplique LED Beatriz 60CM", "Apliques LED");
    expect(a.tipo).toBe("candeeiro");
    expect(a.mockup3d.generico?.id).toBe("aplique");
    expect(cm(a)).toEqual([60, 7, 5]);
    expect(a.montagem).toBe("parede");
    expect(cm(prod("Aplique LED Ana 18CM", "Apliques LED"))[0]).toBe(18);
  });

  it("Garrafeira → garrafeira (não o frigorífico), maior quando leva mais garrafas", () => {
    const g24 = prod("Garrafeira SOMMELIER TEKA 24 GARRAFAS", "Garrafeira");
    expect(g24.mockup3d.generico).toEqual({ id: "garrafeira", o: { encastre: false, garrafas: true } });
    expect(cm(g24)).toEqual([40, 55, 84]);
    expect(cm(prod("Garrafeira SOMMELIER TEKA 41 GARRAFAS", "Garrafeira"))).toEqual([60, 57, 127]);
  });

  it("acessórios pequenos (kits, cabides, piaçabas, porta-rolos, pegas) → acessorio, com a forma e a medida típica do nome", () => {
    const k = (n: string, sub: string) => { const m = prod(n, sub); return { id: m.mockup3d.generico?.id, forma: m.mockup3d.generico?.o.forma, cm: cm(m), mont: m.montagem }; };
    expect(k("PLACA DE ACIONAMENTO REDONDO BRANCO MATE", "Kit´s para Sanitários")).toMatchObject({ id: "acessorio", mont: "parede" });
    expect(k("Cabide SMOOTH CROMADO", "Cabides")).toEqual({ id: "acessorio", forma: "cabide", cm: [5, 6, 7], mont: "parede" });
    expect(k("Piaçaba MARINA PRETO MATE", "Piaçaba")).toMatchObject({ forma: "piacaba", cm: [10, 13, 38] });
    expect(k("Porta-Rolos SMOOTH BRANCO MATE", "Porta-rolos")).toMatchObject({ forma: "porta_rolos", cm: [16, 10, 12] });
    expect(k("Pega De Segurança 30cm CROMADO", "Pega De Segurança")).toMatchObject({ forma: "barra", cm: [30, 8, 7] });
  });
});

describe("ligação: o que não se mexe", () => {
  it("o cesto deixa de ser coluna de duche (regra de exclusão) e fica sem genérico", () => {
    const c = prod("Cesto DE COLUNA DE DUCHE CROMADO", "Cestos");
    expect(c.tipo).toBe("acessorio");
    expect(c.mockup3d.generico).toBeUndefined();
  });

  it("caixas de reserva aceitáveis, sifões e auxiliares ficam sem genérico, como estavam", () => {
    for (const [n, s] of [["Banco REBATIVEL", "Bancos"], ["Cadeira AJUSTADA", "Cadeiras"], ["Ventax WC", "Ventax"], ["Sifão de garrafa", ""], ["Auxiliar c/porta Rolo + Piaçaba DE PE ALTO CROMADO", "Auxiliares"], ["Puxador PEGA", "Puxadores"]]) {
      expect(gen(n, s), n).toBeUndefined();
    }
  });

  it("Acessórios de Cozinha (subcategoria mista) fica exactamente como estava", () => {
    expect([prod("BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMP", "Acessórios de Cozinha")].map((m) => [m.tipo, m.mockup3d.generico, cm(m)])).toEqual([["caixa", undefined, [45, 40, 75]]]);
    expect(gen("ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE", "Acessórios de Cozinha")).toBeUndefined();
    expect(gen("Puxadores asa prata (valor unitário)", "Acessórios de Cozinha")).toBeUndefined();
  });

  it("as Colunas Duche que são pratos ou braços continuam como estavam (decisão do dono)", () => {
    expect(gen("Prato Redondo SIRIO TITANIO", "Colunas Duche")).toEqual({ id: "coluna_duche", o: { mao: true } });
  });

  it("sem nome de produto (peças antigas e do Estúdio), os genéricos novos nunca são escolhidos", () => {
    for (const t of ["bancada", "tampo", "lava_loica", "acessorio", "eletro", "candeeiro"] as const) expect(categoriaDoTipo(t), t).toBeUndefined();
    // as peças do Estúdio têm nome mas não são produtos: o painel e o visualizador não lhes dão um genérico novo
    expect(categoriaDoTipo("bancada", "Bancada")).toBeUndefined();
    expect(categoriaDoTipo("lava_loica", "Lava")).toBeUndefined();
  });

  it("as peças com geometria própria (tampo e lava-loiça das famílias, chapa, bancada composta) não passam a genérico", () => {
    const base = prod("Tampo de bancada 240x65", "");
    const comParams = (params: NonNullable<ProdutoModelo3D["mockup3d"]["params"]>, tipo: ProdutoModelo3D["tipo"]): ProdutoModelo3D => ({ ...base, tipo, mockup3d: { ...base.mockup3d, tipo, params, generico: undefined } });
    expect(temModeloGenerico(comParams({ k: "tampo", espessura: 0.012 }, "tampo"))).toBe(false);
    expect(temModeloGenerico(comParams({ k: "lava_loica", cubas: [], escorredor: false, degrau: false }, "lava_loica"))).toBe(false);
    expect(temModeloGenerico(comParams({ k: "chapa", series: "moma", tone: "gris" }, "bancada"))).toBe(false);
  });
});

describe("opções lidas do nome", () => {
  it("resguardo: de abrir, de correr ou fixo (valor novo); fixo é um só vidro a toda a largura", () => {
    const ab = (n: string) => gen(n, "Resguardos de Duche")?.o.abertura;
    expect(ab("Resguardo Glass Bisagra a Pared Combi 2 67.6-70.1 Titanio")).toBe("abrir");
    expect(ab("Resguardo Frontal Abatible 90 Transparente")).toBe("abrir");
    expect(ab("Resguardo Frontal Corredera 140 Transparente")).toBe("correr");
    expect(ab("Resguardo Banheira Basic Bañera + Lateral Fijo Combinado 145x75 Frost")).toBe("fixo");
    expect(ab("Resguardo Glass Combi C Fijo+Porta 97-100b Cobre")).toBe("correr");
    expect(ab("Resguardo Glass Combi 120 Cromado")).toBe("correr");
    const c = cat("resguardo"), p = { w: 1, d: 0.04, h: 1.95, o: { abertura: "fixo" } };
    expect(visiveis(c, p)).not.toContain("vidro_porta");
    expect(visiveis(c, p)).not.toContain("puxador");
    expect(parte(c, "vidro_fixo").colocar(p)).toMatchObject({ pos: [0, expect.any(Number), 0], esc: [1, expect.any(Number), expect.any(Number)] });
    // as portas de abrir e de correr desenham-se como antes
    expect(parte(c, "vidro_fixo").colocar({ ...p, o: { abertura: "correr" } })).toEqual({ pos: [-0.25, 0.975, 0], esc: [0.5, 1.93, 0.008] });
  });

  it("resguardo de banheira: 150 cm de altura quando o nome não a dá; o de duche continua com 195", () => {
    expect(cm(prod("Resguardo Banheira Fijo Transparente", "Resguardos de Duche"))[2]).toBe(150);
    expect(cm(prod("Resguardo Glass Bisagra a Pared Combi 2 67.6-70.1 Titanio", "Resguardos de Duche"))[2]).toBe(195);
  });

  it("móvel de lavatório: gavetas ou portas, e suspenso, com pés ou assente no chão", () => {
    const o = (n: string) => gen(n, "Móveis de lavatório")?.o;
    const omni = prod("Móvel OMNI Suspenso 120x50x45 - 1 Pio Esquerdo / 2 Gav + Porta (80+40)", "Móveis de lavatório");
    expect(omni.mockup3d.generico?.o).toEqual({ gavetas: "gavetas", apoio: "suspenso" });
    expect(omni.montagem).toBe("parede");
    expect(omni.alturaOmissao).toBeCloseTo(0.4);
    expect(o("Móvel Lavatório NOVA com pés 2 Portas 80x80x45")).toEqual({ gavetas: "portas", apoio: "pes" });
    expect(o("Bajo Lavabo BREDA 3 cajones 120cm")).toEqual({ gavetas: "gavetas", apoio: "chao" });
    const c = cat("movel_lavatorio"), p = { w: 0.8, d: 0.45, h: 0.8, o: { gavetas: "portas", apoio: "pes" } };
    expect(visiveis(c, p)).toEqual(expect.arrayContaining(["pe_1", "pe_2", "pe_3", "pe_4"]));
    const caixa = parte(c, "caixa").colocar(p);
    expect(caixa.pos[1] - caixa.esc[1] / 2).toBeGreaterThan(0.1);
    // sem pés, desenha-se como antes
    const chao = { ...p, o: { gavetas: "gavetas", apoio: "chao" } };
    expect(visiveis(c, chao).some((n) => n.startsWith("pe_"))).toBe(false);
    expect(parte(c, "caixa").colocar(chao)).toEqual({ pos: [0, (0.8 - 0.03) / 2, 0], esc: [0.8, 0.8 - 0.03, 0.45] });
  });

  it("bidé suspenso (opção nova): o pé deixa de chegar ao chão", () => {
    expect(gen("BIDÉ ELEGANT SUSPENSO CAPPUCINNO", "Bidés")?.o).toEqual({ torneira: true, suspenso: true });
    expect(gen("BIDÉ BOHEMIC BTW BRANCO BRILHO", "Bidés")?.o.suspenso).toBe(false);
    const c = cat("bide"), p = { w: 0.36, d: 0.55, h: 0.4, o: { torneira: true, suspenso: true } };
    const pe = parte(c, "pe").colocar(p);
    expect(pe.pos[1] - pe.esc[1] / 2).toBeGreaterThan(0.1);
    expect(parte(c, "pe").colocar({ ...p, o: { torneira: true, suspenso: false } })).toEqual({ pos: [0, (0.4 - 0.06) / 2, 0.55 * 0.02], esc: [0.36 * 0.6, 0.4 - 0.06, 0.55 * 0.5] });
  });

  it("sanita BTW: o depósito só quando o nome o diz; as outras continuam com depósito", () => {
    expect(gen("SANITA MAX BTW BRANCO BRILHO", "Sanitas")?.o.deposito).toBe(false);
    expect(gen("SANITA MAX BTW com depósito BRANCO BRILHO", "Sanitas")?.o.deposito).toBe(true);
    expect(gen("SANITA COMPACTA ROCA BRANCO", "Sanitas")?.o.deposito).toBe(true);
  });

  it("lavatório: sem coluna, a menos que o nome fale dela", () => {
    expect(gen("Lavatório BREAK RULES PRETO MATE", "Lavatórios")?.o.coluna).toBe(false);
    expect(gen("Lavatório LILLE com coluna BRANCO BRILHO", "Lavatórios")?.o.coluna).toBe(true);
  });

  it("toalheiro de uma só barra (valor novo): uma barra a meia altura, dois suportes, sem tubos", () => {
    expect(gen("Toalheiro MARINA BARRA 45cm PRETO MATE", "Toalheiros")?.o.tipo).toBe("barra");
    expect(gen("Toalheiro escada CROMADO 50x120", "Toalheiros")?.o.tipo).toBe("barras");
    const c = cat("toalheiro"), v = visiveis(c, { w: 0.45, d: 0.1, h: 1.2, o: { tipo: "barra" } });
    expect(v.filter((n) => n.startsWith("barra_"))).toEqual(["barra_1"]);
    expect(v).not.toContain("tubo_esq");
    expect(v.filter((n) => n.startsWith("suporte_"))).toHaveLength(2);
    expect(v).not.toContain("valvula");
  });

  it("as peças já guardadas mantêm a opção gravada", () => {
    expect(opcoesComOmissao(cat("resguardo"), "resguardo", { abertura: "correr" }, "Resguardo Fijo 90").abertura).toBe("correr");
    expect(opcoesComOmissao(cat("movel_lavatorio"), "movel_lavatorio", { gavetas: "gavetas" }, "Móvel 2 Portas").gavetas).toBe("gavetas");
    expect(opcoesComOmissao(cat("sanita"), "sanita", { deposito: true }, "SANITA BTW").deposito).toBe(true);
  });
});
