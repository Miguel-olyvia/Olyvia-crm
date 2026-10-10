import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { leadsDe, pessoasDe } from "./leadsDocs";
import { CANAL_DE_ORIGEM, ESTADO_TOQUE, ORIGENS, campanhaDe, canalDe, infoOrigem, toquesDe, utmTexto, type Toque } from "./toquesDocs";

const LEADS = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"];
const CLIENTES = ["Tiago Almeida", "Marta Lima", "Joana Ribeiro"];
const todos = (S = seed()): Record<string, Toque[]> => Object.fromEntries([...LEADS, ...CLIENTES].map((n) => [n, toquesDe(S, n)]));

describe("toques · mapa origem para canal", () => {
  it("o mapa fixo da empresa", () => {
    for (const o of ["Meta Ads", "TikTok Ads"]) expect(canalDe(o)).toBe("Redes sociais pagas");
    expect(canalDe("Google Ads")).toBe("Pesquisa");
    for (const o of ["Outdoor", "Panfleto", "Feira"]) expect(canalDe(o)).toBe("Offline");
    for (const o of ["Influencer", "Indicação"]) expect(canalDe(o)).toBe("Parcerias");
    for (const o of ["Site", "Chamada", "qualquer outra"]) expect(canalDe(o)).toBe("Outros");
  });
  it("todas as origens da empresa têm canal e nenhum canal está fora da lista", () => {
    for (const o of ORIGENS) expect(CANAL_DE_ORIGEM[o]).toBeTruthy();
    expect(Object.keys(CANAL_DE_ORIGEM).filter((o) => !ORIGENS.includes(o))).toEqual([]);
  });
});

describe("toques · determinismo", () => {
  it("duas chamadas dão o mesmo resultado", () => {
    expect(todos(seed())).toEqual(todos(seed()));
  });
  it("os campos-chave de cada pessoa estão fixos (origem, via, campanha)", () => {
    const chave = Object.fromEntries(Object.entries(todos()).map(([n, ts]) => [n, ts.map((t) => [t.origem, t.via, t.campanha])]));
    expect(chave).toEqual({
      "Ana Martins": [["TikTok Ads", "online", null]],
      "Pedro Lopes": [["Site", "online", null]],
      "Rita Sousa": [["Meta Ads", "online", "Cozinhas outubro"]],
      "Manuel Costa": [["Chamada", "mao", null]],
      "Luísa Freitas": [["Google Ads", "online", "Cozinhas outubro"]],
      "Hugo Matos": [["Indicação", "mao", null], ["Site", "online", null]],
      "Carla Nunes": [["Outdoor", "online", "Outdoor A1"], ["Google Ads", "online", "Cozinhas outubro"]],
      "Sérgio Pinto": [["Chamada", "mao", null]],
      "Tiago Almeida": [["Site", "online", null]],
      "Marta Lima": [["Feira", "mao", null]],
      "Joana Ribeiro": [["Indicação", "mao", null]],
    });
  });
  it("quem não existe não tem toques", () => {
    expect(toquesDe(seed(), "Ninguém")).toEqual([]);
  });
});

describe("toques · cobertura e variedade", () => {
  const T = todos();
  const todosToques = Object.values(T).flat();

  it("as 8 leads e os 3 clientes da seed têm pelo menos um toque", () => {
    for (const n of [...LEADS, ...CLIENTES]) expect(T[n].length, n).toBeGreaterThanOrEqual(1);
    expect(leadsDe(seed()).map((p) => p.nome).sort()).toEqual([...LEADS].sort());
  });
  it("cada toque tem origem da lista da empresa e o canal certo", () => {
    for (const t of todosToques) {
      expect(ORIGENS).toContain(t.origem);
      expect(t.exemplo).toBe(true);
      expect(ESTADO_TOQUE[t.estado]).toBeTruthy();
    }
  });
  it("o canal de cada pessoa é o esperado, deduzido da origem", () => {
    const canais = (n: string) => T[n].map((t) => t.canal);
    expect(canais("Luísa Freitas")).toEqual(["Pesquisa"]);
    expect(canais("Rita Sousa")).toEqual(["Redes sociais pagas"]);
    expect(canais("Ana Martins")).toEqual(["Redes sociais pagas"]);
    expect(canais("Carla Nunes")).toEqual(["Offline", "Pesquisa"]);
    expect(canais("Hugo Matos")).toEqual(["Parcerias", "Outros"]);
    expect(canais("Manuel Costa")).toEqual(["Outros"]);
  });
  it("Google Ads (gclid) e Meta Ads (fbclid), ambos na campanha Cozinhas outubro e com formulário", () => {
    const g = todosToques.find((t) => t.origem === "Google Ads" && t.utm?.clickId?.startsWith("gclid="));
    const m = todosToques.find((t) => t.origem === "Meta Ads" && t.utm?.clickId?.startsWith("fbclid="));
    for (const t of [g, m]) {
      expect(t).toBeDefined();
      expect(t!.campanha).toBe("Cozinhas outubro");
      expect(t!.formulario).toBeTruthy();
      expect(t!.via).toBe("online");
    }
  });
  it("Indicação e chamada são registadas à mão, sem campanha e sem formulário", () => {
    const ind = T["Hugo Matos"][0], cham = T["Manuel Costa"][0];
    expect(ind.origem).toBe("Indicação");
    expect(cham.origem).toBe("Chamada");
    for (const t of [ind, cham]) { expect(t.via).toBe("mao"); expect(t.campanha).toBeNull(); expect(t.formulario).toBeNull(); expect(t.utm).toBeNull(); }
  });
  it("Outdoor por QR, online, na campanha Outdoor A1", () => {
    const t = todosToques.find((x) => x.origem === "Outdoor")!;
    expect(t.via).toBe("online");
    expect(t.campanha).toBe("Outdoor A1");
    expect(t.utm?.source).toBe("qr");
  });
  it("Site online, sem campanha", () => {
    const t = T["Pedro Lopes"][0];
    expect(t.origem).toBe("Site");
    expect(t.via).toBe("online");
    expect(t.campanha).toBeNull();
    expect(t.formulario).toBeTruthy();
  });
  it("uma UTM de TikTok: a origem vem da UTM, mas a campanha fica por mapear", () => {
    const t = todosToques.find((x) => x.porMapear)!;
    expect(t).toBeDefined();
    expect(t.utm?.source).toBe("tiktok");
    expect(t.origem).toBe("TikTok Ads");
    expect(t.canal).toBe("Redes sociais pagas");
    expect(t.motivo).toMatch(/Origem reconhecida pelo UTM; campanha por mapear/);
    expect(campanhaDe(t)).toMatch(/por mapear/i);
    expect(t.campanha).toBeNull();
    expect(t.estado).toBe("por_rever");
    expect(todosToques.filter((x) => x.porMapear)).toHaveLength(1);
  });
  it("uma lead voltou por outra campanha: segundo toque associado à ficha, sem lead duplicada", () => {
    const duas = Object.entries(T).filter(([, ts]) => ts.some((t) => t.estado === "associada"));
    expect(duas.length).toBeGreaterThanOrEqual(1);
    const ts = T["Carla Nunes"];
    expect(ts).toHaveLength(2);
    expect(ts[0].campanha).not.toBe(ts[1].campanha);
    expect(ts[1].estado).toBe("associada");
    expect(ts[1].motivo).toBeTruthy();
    expect(ts[0].estado).not.toBe("associada");
    expect(leadsDe(seed()).filter((p) => p.nome === "Carla Nunes")).toHaveLength(1);
  });
  it("um aviso de conflito: email de uma pessoa e telefone de outra, por rever", () => {
    const c = todosToques.filter((t) => t.conflito);
    expect(c).toHaveLength(1);
    expect(c[0].estado).toBe("por_rever");
    expect(c[0].motivo).toBeTruthy();
    expect(c[0].conflito).toMatch(/email/i);
    expect(c[0].conflito).toMatch(/telefone/i);
  });
  it("há vias e origens distintas", () => {
    expect(new Set(todosToques.map((t) => t.via))).toEqual(new Set(["online", "mao"]));
    expect(new Set(todosToques.map((t) => t.origem)).size).toBeGreaterThanOrEqual(7);
  });
  it("UTM só nos toques online; a UTM em bruto vem como texto", () => {
    for (const t of todosToques) if (t.via === "mao") expect(t.utm).toBeNull();
    const g = todosToques.find((t) => t.origem === "Google Ads")!;
    expect(utmTexto(g.utm)).toContain("utm_source=google");
    expect(utmTexto(g.utm)).toContain("gclid=");
    expect(utmTexto(null)).toBe("");
  });
  it("os campos são etiqueta e valor, coerentes com a linha do negócio", () => {
    const coz = T["Rita Sousa"][0].campos, wc = T["Ana Martins"][0].campos;
    for (const c of [...coz, ...wc]) { expect(c.rotulo).toBeTruthy(); expect(c.valor).toBeTruthy(); }
    for (const r of ["Tipologia", "Área (m²)", "Prazo desejado", "Orçamento estimado", "Localidade", "Observações"]) {
      expect(coz.map((c) => c.rotulo)).toContain(r);
    }
    expect(coz.find((c) => c.rotulo === "Orçamento estimado")!.valor).toMatch(/6\.000|10\.000/);
    expect(wc.find((c) => c.rotulo === "Orçamento estimado")!.valor).toMatch(/3\.000/);
    expect(T["Hugo Matos"][0].campos.map((c) => c.rotulo)).toContain("Registada por");
  });
  it("a primeira ficha de cada pessoa gerou lead, foi revista ou está por rever; só o segundo toque é associado", () => {
    for (const ts of Object.values(T)) expect(ts[0].estado).not.toBe("associada");
  });
});

describe("toques · informação de origem", () => {
  it("resume origem, canal, campanha, formulário, via e os toques", () => {
    const S = seed();
    const i = infoOrigem(toquesDe(S, "Luísa Freitas"));
    const rotulos = i.origem.map((c) => c.rotulo);
    for (const r of ["Origem", "Canal", "Campanha", "Formulário", "Via de entrada", "Primeiro toque", "Último toque"]) expect(rotulos).toContain(r);
    expect(i.origem.find((c) => c.rotulo === "Canal")!.valor).toBe("Pesquisa");
    expect(i.aviso).toBeNull();
  });
  it("avisa o conflito e o duplicado evitado", () => {
    const S = seed();
    expect(infoOrigem(toquesDe(S, "Hugo Matos")).aviso?.tipo).toBe("conflito");
    expect(infoOrigem(toquesDe(S, "Carla Nunes")).aviso?.tipo).toBe("duplicado");
  });
  it("sem campanha e sem formulário diz-se por palavras", () => {
    const i = infoOrigem(toquesDe(seed(), "Manuel Costa"));
    expect(i.origem.find((c) => c.rotulo === "Campanha")!.valor).toMatch(/sem campanha/i);
    expect(i.origem.find((c) => c.rotulo === "Formulário")!.valor).toMatch(/sem formulário/i);
  });
});

describe("toques · não mutam o Estado", () => {
  it("nada muda o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const n of [...LEADS, ...CLIENTES]) infoOrigem(toquesDe(S, n));
    for (const p of pessoasDe(S)) toquesDe(S, p.nome);
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("toques · negócios sem registo, derivados da origem", () => {
  const com = (origem: string, f: Record<string, string> = {}) => {
    const S = seed();
    S.deals.unshift({ ...structuredClone(S.deals[0]), id: 3002, nome: "Nova Pessoa", tel: "910 000 001", origem, quando: "hoje 10:00", f } as (typeof S.deals)[number]);
    return toquesDe(S, "Nova Pessoa");
  };
  it("uma origem de campanha dá um toque online de Meta Ads com a campanha e o formulário", () => {
    const [t] = com("campanha cozinhas", { campanha: "cozinhas verão · Meta" });
    expect(t.origem).toBe("Meta Ads");
    expect(t.canal).toBe("Redes sociais pagas");
    expect(t.via).toBe("online");
    expect(t.campanha).toBe("Cozinhas verão");
    expect(t.formulario).toBeTruthy();
    expect(t.utm?.source).toBe("facebook");
  });
  it("uma recomendação dá um toque à mão de Indicação, sem campanha nem UTM", () => {
    const [t] = com("recomendação de um amigo");
    expect(t.origem).toBe("Indicação");
    expect(t.canal).toBe("Parcerias");
    expect(t.via).toBe("mao");
    expect(t.campanha).toBeNull();
    expect(t.utm).toBeNull();
  });
});

describe("toques · negócios criados à mão", () => {
  it("uma lead criada no ecrã tem um toque registado à mão", () => {
    const S = seed();
    S.deals.unshift({ ...structuredClone(S.deals[0]), id: 3001, nome: "Nova Pessoa", tel: "910 000 000", origem: "à mão", quando: "hoje 10:00", f: {} });
    const ts = toquesDe(S, "Nova Pessoa");
    expect(ts).toHaveLength(1);
    expect(ts[0].via).toBe("mao");
    expect(ts[0].data).toBe("hoje 10:00");
  });
});
