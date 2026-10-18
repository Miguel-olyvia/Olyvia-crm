// Os registos de exemplo (contactos, visitas e levantamentos das pessoas): nascem das sementes e dos exemplos variados. Aqui ficam o que
// eles garantem (ids, ligações, casos cobertos), cada caso de semente, e a matriz das 17 pessoas de antes (papel, etapa, atraso, próximo
// passo e Parte do Quadro), para nenhum caso de exemplo se perder.
import { describe, expect, it } from "vitest";
import { registosDaPessoa } from "@/components/negocio-metas/acoesRegistos";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negocioBase, sementeBase } from "./fabricaTestes";
import { proximoPasso } from "./etapaPessoa";
import { juntarPessoas } from "./juntarPessoas";
import type { PessoaSemente, VisitaSemente } from "./pessoaSemente";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SEMENTES_EXEMPLO } from "./pessoasExemplo";
import { NEGOCIOS_VARIADO } from "./negociosExemploVariado";
import { ID_ORCAMENTO_BLOQUEADO, ID_ORCAMENTO_DIRECAO, ID_ORCAMENTO_VERIFICADO } from "./processo/extrasExemploVariado";
import { abordagensDeSementes, REGISTOS_EXEMPLO } from "./registosExemplo";

const HOJE = "2026-10-13";
const NOVOS = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO);
const novoDe = (id: string) => NOVOS.find((r) => r.pessoa.id === id)!;

describe("os registos de exemplo", () => {
  it("só existem registos de pessoas de exemplo, sem ids repetidos; os das abordagens ficam por ligar e só os de registosLigadosExemplo estão ligados", () => {
    const ids = new Set(PESSOAS_EXEMPLO.map((p) => p.id));
    const todos = [...REGISTOS_EXEMPLO.contactos, ...REGISTOS_EXEMPLO.visitas, ...REGISTOS_EXEMPLO.levantamentos];
    expect(todos.length).toBeGreaterThan(0);
    expect(todos.every((r) => ids.has(r.pessoaId))).toBe(true);
    // Os ids dos registos ligados de exemplo são rcl-, rvl- e rll-: nenhum outro está ligado a um negócio.
    expect(todos.filter((r) => r.negocioId !== null).every((r) => /^r[cvl]l-/.test(r.id))).toBe(true);
    for (const lista of [REGISTOS_EXEMPLO.contactos, REGISTOS_EXEMPLO.visitas, REGISTOS_EXEMPLO.levantamentos]) {
      expect(new Set(lista.map((r) => r.id)).size).toBe(lista.length);
    }
  });

  it("há no máximo um contacto de exemplo por pessoa por ligar e cada levantamento aponta para uma visita da mesma pessoa", () => {
    const porPessoa = REGISTOS_EXEMPLO.contactos.filter((c) => c.negocioId === null).map((c) => c.pessoaId);
    expect(new Set(porPessoa).size).toBe(porPessoa.length);
    for (const l of REGISTOS_EXEMPLO.levantamentos) {
      if (l.visitaId !== null) expect(REGISTOS_EXEMPLO.visitas.find((v) => v.id === l.visitaId)?.pessoaId).toBe(l.pessoaId);
    }
  });

  it("os exemplos têm contactos, visitas feitas, por fazer e canceladas, e levantamentos", () => {
    expect(REGISTOS_EXEMPLO.contactos.length).toBeGreaterThan(5);
    expect(REGISTOS_EXEMPLO.visitas.some((v) => v.estado === "feita")).toBe(true);
    expect(REGISTOS_EXEMPLO.visitas.some((v) => v.estado === "porFazer")).toBe(true);
    expect(REGISTOS_EXEMPLO.visitas.some((v) => v.estado === "cancelada")).toBe(true);
    expect(REGISTOS_EXEMPLO.levantamentos.length).toBeGreaterThan(0);
  });
});

describe("os registos de exemplo ligados a negócios: cada negócio tem só o que aconteceu", () => {
  const ligados = (id: string) => ({
    contactos: REGISTOS_EXEMPLO.contactos.filter((r) => r.negocioId === id).length,
    visitas: REGISTOS_EXEMPLO.visitas.filter((r) => r.negocioId === id).length,
    levantamentos: REGISTOS_EXEMPLO.levantamentos.filter((r) => r.negocioId === id).length,
  });
  it.each([
    ["só falado: um contacto", "vn-leonor-orc", { contactos: 1, visitas: 0, levantamentos: 0 }],
    ["contacto e visita, sem levantamento", "vn-vitor-prop", { contactos: 1, visitas: 1, levantamentos: 0 }],
    ["só levantamento, sem visita nem contacto", ID_ORCAMENTO_VERIFICADO, { contactos: 0, visitas: 0, levantamentos: 1 }],
    ["só visita, sem contacto nem levantamento", ID_ORCAMENTO_BLOQUEADO, { contactos: 0, visitas: 1, levantamentos: 0 }],
    ["contacto e levantamento, sem visita", ID_ORCAMENTO_DIRECAO, { contactos: 1, visitas: 0, levantamentos: 1 }],
    ["contacto, visita e levantamento", "vn-zita-con", { contactos: 1, visitas: 1, levantamentos: 1 }],
    ["nada ligado (criado sem abordagem)", "vn-otilia-orc", { contactos: 0, visitas: 0, levantamentos: 0 }],
    ["nada ligado, com registos da abordagem por ligar", "vn-pascoal-prop", { contactos: 0, visitas: 0, levantamentos: 0 }],
  ])("%s", (_nome, id, esperado) => {
    expect(ligados(id)).toEqual(esperado);
  });

  it("a Zita tem um contacto novo por ligar ao lado do negócio, e a Pascoal tem visitas por ligar", () => {
    expect(REGISTOS_EXEMPLO.contactos.filter((c) => c.pessoaId === "pv-zita" && c.negocioId === null)).toHaveLength(1);
    expect(REGISTOS_EXEMPLO.visitas.filter((v) => v.pessoaId === "pv-pascoal" && v.negocioId === null).length).toBeGreaterThan(0);
  });

  it("cada registo ligado aponta para um negócio da mesma pessoa, e um levantamento ligado a uma visita fica no mesmo negócio que ela", () => {
    const donoDe = new Map(NEGOCIOS_VARIADO.map((n) => [n.id, n.pessoaId]));
    const todos = [...REGISTOS_EXEMPLO.contactos, ...REGISTOS_EXEMPLO.visitas, ...REGISTOS_EXEMPLO.levantamentos];
    for (const r of todos) if (r.negocioId !== null) expect(donoDe.get(r.negocioId), r.id).toBe(r.pessoaId);
    for (const l of REGISTOS_EXEMPLO.levantamentos) {
      if (l.visitaId !== null) expect(REGISTOS_EXEMPLO.visitas.find((v) => v.id === l.visitaId)?.negocioId, l.id).toBe(l.negocioId);
    }
  });
});

const moradaLead = { linha: "Rua do Mar 9", cp: "2900-100", localidade: "Setúbal" };
const visita = (extra: Partial<VisitaSemente> = {}): VisitaSemente => ({
  data: "2026-10-20", hora: "10:30", comercial: "Bruno Costa", igualALead: false,
  moradaVisita: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" }, ...extra,
});
const gerar = (pessoa: PessoaSemente, abertos = [] as ReturnType<typeof negocioBase>[], papel: "lead" | "cliente" = "lead") =>
  abordagensDeSementes([{ pessoa, papel, abertos }], HOJE);

describe("abordagensDeSementes: cada caso de semente", () => {
  it("uma lead nova sem chamada tem uma abordagem por contactar, sem visitas", () => {
    const [a] = gerar(sementeBase("a", { etapa: "nova", desde: "2026-10-11" }));
    expect(a).toMatchObject({ pessoaId: "a", comercial: "Ana Ribeiro", criadoEm: "2026-10-11", contactado: false, visitas: [] });
    expect(a.levantamento).toBeUndefined();
  });

  it("uma lead nova com resultado de chamada conta como contactada; em contacto, também (sem desde, criadoEm é hoje)", () => {
    expect(gerar(sementeBase("a", { etapa: "nova", resultadoContacto: "naoAtendeu" }))[0].contactado).toBe(true);
    expect(gerar(sementeBase("a", { etapa: "emContacto", resultadoContacto: "atendeuMaisTarde" }))[0]).toMatchObject({ contactado: true, visitas: [], criadoEm: HOJE });
  });

  it("uma visita marcada passa a uma visita Por fazer do tipo levantamento: data, hora, morada, comercial e nota de acesso", () => {
    const [a] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: visita({ notaAcesso: "Tocar à campainha." }) }));
    expect(a.contactado).toBe(true);
    expect(a.visitas).toHaveLength(1);
    expect(a.visitas[0]).toMatchObject({
      data: "2026-10-20", hora: "10:30", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "levantamento", igualALead: false,
      nota: "Tocar à campainha.", morada: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" },
    });
  });

  it("a morada da visita é uma cópia: mudá-la não mexe na semente", () => {
    const v = visita();
    const [a] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: v }));
    expect(a.visitas[0].morada).not.toBe(v.moradaVisita);
    expect(a.visitas[0].morada).toEqual(v.moradaVisita);
  });

  it("a ficha antiga (visitaMarcada sem visita, com próximo contacto) passa a uma visita na morada da lead; sem próximo contacto não inventa visita", () => {
    const [a] = gerar(sementeBase("a", { etapa: "visitaMarcada", proximoContacto: "2026-10-18", proximoHora: "09:00", morada: moradaLead }));
    expect(a.visitas[0]).toMatchObject({
      data: "2026-10-18", hora: "09:00", feitoPor: "Ana Ribeiro", estado: "porFazer", igualALead: true,
      morada: { rua: "Rua do Mar 9", codigoPostal: "2900-100", localidade: "Setúbal", andar: "" },
    });
    expect(gerar(sementeBase("a", { etapa: "visitaMarcada", proximoContacto: null }))[0]).toMatchObject({ contactado: true, visitas: [] });
  });

  it("uma visita feita com levantamento passa a visita Feita e leva o levantamento", () => {
    const levantamento = {
      linhas: [{ id: "l1", divisao: "cozinha", trabalho: "pavimento", trabalhoOutro: "", medida: "12", unidade: "m2", observacoes: "" }],
      observacoes: "Cliente em casa", respostas: { q1: "a" },
    };
    const [a] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true, levantamento }) }));
    expect(a.visitas[0].estado).toBe("feita");
    expect(a.levantamento).toEqual(levantamento);
  });

  it("com negócio aberto só há abordagem se há visita; um cliente sem visita não tem; uma lead perdida tem", () => {
    const abertos = [negocioBase("n1")];
    expect(gerar(sementeBase("a", { etapa: "qualificada" }), abertos)).toEqual([]);
    expect(gerar(sementeBase("a", { etapa: "cliente", visita: visita() }), abertos, "cliente")[0].visitas).toHaveLength(1);
    expect(gerar(sementeBase("a", { etapa: "cliente" }), [], "cliente")).toEqual([]);
    expect(gerar(sementeBase("a", { etapa: "emContacto", perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } }))[0].contactado).toBe(true);
  });

  it("cada semente com visita dá registos com a mesma data, hora, morada e comercial", () => {
    const comVisita = SEMENTES_EXEMPLO.filter((p) => p.visita);
    expect(comVisita.length).toBeGreaterThanOrEqual(3);
    for (const pessoa of comVisita) {
      const v = pessoa.visita as VisitaSemente;
      const dela = registosDaPessoa(REGISTOS_EXEMPLO, pessoa.id).visitas;
      expect(dela[0], pessoa.id).toMatchObject({
        data: v.data, hora: v.hora, feitoPor: v.comercial, morada: v.moradaVisita, igualALead: v.igualALead,
        estado: v.feita ? "feita" : "porFazer", nota: v.notaAcesso ?? "",
      });
    }
  });
});

/** [papel, etapa, atrasada, passo, prazo, Parte do Quadro, coluna] das 17 pessoas de antes dos exemplos variados. */
const MATRIZ_ANTIGA: Record<string, readonly [string, string, boolean, string, string | null, string, string | null]> = {
  "p-marta": ["cliente", "cliente", false, "criarProposta", "2026-10-16", "negocios", null],
  "p-rui": ["cliente", "cliente", false, "nenhum", null, "nenhuma", null],
  "p-helena": ["cliente", "cliente", false, "nenhum", null, "nenhuma", null],
  "p-paulo": ["cliente", "cliente", true, "esperarCliente", "2026-10-10", "negocios", null],
  "p-sofia": ["cliente", "cliente", false, "nenhum", null, "nenhuma", null],
  "p-nuno": ["lead", "qualificada", false, "esperarCliente", "2026-10-11", "negocios", null],
  "p-ines": ["cliente", "cliente", false, "nenhum", null, "nenhuma", null],
  "p-tiago": ["lead", "qualificada", true, "criarProposta", "2026-10-09", "negocios", null],
  "p-clara": ["lead", "qualificada", false, "enviarProposta", "2026-10-13", "negocios", null],
  "p-vasco": ["lead", "qualificada", false, "recolherAssinatura", "2026-10-16", "negocios", null],
  "p-beatriz": ["lead", "nova", false, "registarChamada", "2026-10-14", "abordagem", "porContactar"],
  "p-hugo": ["lead", "nova", false, "registarChamada", "2026-10-15", "abordagem", "porContactar"],
  "p-lucia": ["lead", "emContacto", true, "marcarVisita", "2026-10-08", "abordagem", "contactado"],
  "p-rita": ["lead", "visitaMarcada", false, "fecharLevantamento", "2026-10-13", "abordagem", "visita"],
  "p-goncalo": ["lead", "visitaMarcada", true, "fecharLevantamento", "2026-10-12", "abordagem", "visita"],
  "p-joana": ["lead", "emContacto", false, "nenhum", null, "nenhuma", null],
  "p-fabio": ["lead", "emContacto", false, "nenhum", null, "nenhuma", null],
};

describe("a matriz das pessoas de antes, lida dos registos de exemplo", () => {
  it("há as 34 pessoas, as 17 de antes e as 17 variadas", () => {
    expect(NOVOS).toHaveLength(34);
    expect(NOVOS.map((r) => r.pessoa.id)).toEqual(PESSOAS_EXEMPLO.map((p) => p.id));
    expect(Object.keys(MATRIZ_ANTIGA)).toHaveLength(17);
  });

  it.each(Object.entries(MATRIZ_ANTIGA))("%s: papel, etapa, atraso, próximo passo, prazo, Parte e coluna", (id, esperado) => {
    const r = novoDe(id);
    const passo = proximoPasso(r);
    expect([r.papel, r.etapa, r.atrasada, passo.id, passo.prazo, r.parte, r.coluna]).toEqual(esperado);
  });

  it("quem tem um negócio aberto está só na Parte 2, e a abordagem tem as colunas Por contactar, Contactado e Visita", () => {
    for (const r of NOVOS) {
      if (r.abertos.length > 0) expect([r.pessoa.id, r.parte]).toEqual([r.pessoa.id, "negocios"]);
    }
    expect(novoDe("pv-ema")).toMatchObject({ parte: "abordagem", coluna: "porContactar" });
    expect(novoDe("pv-rodrigo").coluna).toBe("porContactar");
    expect(novoDe("pv-gaspar").coluna).toBe("visita");
    expect(novoDe("pv-duarte").coluna).toBe("contactado");
  });

  it("a Quitéria, que tinha dois pedidos de abordagem, tem um só contacto e entra uma vez na abordagem", () => {
    expect(registosDaPessoa(REGISTOS_EXEMPLO, "pv-quiteria").contactos).toHaveLength(1);
    expect(novoDe("pv-quiteria").coluna).toBe("contactado");
  });

  it("os registos de exemplo de uma pessoa com negócio aberto ficam por ligar, à vista na ficha", () => {
    const pascoal = novoDe("pv-pascoal");
    expect(pascoal.abertos.length).toBeGreaterThan(0);
    expect(pascoal.registos.visitas.length).toBe(2);
    expect(pascoal.registos.visitas.every((v) => v.negocioId === null)).toBe(true);
  });
});
