// A migração das sementes: cada pessoa de exemplo com visita, ou lead sem negócio aberto, passa a ter um pedido, e nenhum
// caso de exemplo se perde.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negocioBase, sementeBase } from "./fabricaTestes";
import { PEDIDOS_EXEMPLO, pedidosDeExemplo } from "./pedidosDeExemplo";
import type { PessoaSemente, VisitaSemente } from "./pessoaSemente";
import { SEMENTES_EXEMPLO } from "./pessoasExemplo";

const HOJE = "2026-10-13";
const gerar = (pessoa: PessoaSemente, abertos = [] as ReturnType<typeof negocioBase>[], papel: "lead" | "cliente" = "lead") =>
  pedidosDeExemplo([{ pessoa, papel, abertos }], HOJE);

const moradaLead = { linha: "Rua do Mar 9", cp: "2900-100", localidade: "Setúbal" };
const visita = (extra: Partial<VisitaSemente> = {}): VisitaSemente => ({
  data: "2026-10-20", hora: "10:30", comercial: "Bruno Costa", igualALead: false,
  moradaVisita: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" }, ...extra,
});

describe("pedidosDeExemplo: cada caso de semente", () => {
  it("uma lead nova sem chamada gera um pedido por contactar, sem visitas", () => {
    const [p] = gerar(sementeBase("a", { etapa: "nova", desde: "2026-10-11" }));
    expect(p).toMatchObject({ id: "pd-1", pessoaId: "a", servico: "", comercial: "Ana Ribeiro", criadoEm: "2026-10-11", contactado: false, visitas: [] });
    expect(p.levantamento).toBeUndefined();
  });

  it("uma lead nova com resultado de chamada conta como contactada (a regra vive no gerador)", () => {
    const [p] = gerar(sementeBase("a", { etapa: "nova", resultadoContacto: "naoAtendeu" }));
    expect(p.contactado).toBe(true);
    expect(p.visitas).toEqual([]);
  });

  it("uma lead em contacto gera um pedido contactado, sem visitas; sem desde, criadoEm é hoje", () => {
    const [p] = gerar(sementeBase("a", { etapa: "emContacto", resultadoContacto: "atendeuMaisTarde" }));
    expect(p).toMatchObject({ contactado: true, visitas: [], criadoEm: HOJE });
  });

  it("uma visita marcada passa a uma visita Por fazer do tipo levantamento: data, hora, morada, comercial e nota de acesso", () => {
    const [p] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: visita({ notaAcesso: "Tocar à campainha.", servico: "Pintura" }) }));
    expect(p.contactado).toBe(true);
    expect(p.servico).toBe("Pintura");
    expect(p.visitas).toHaveLength(1);
    expect(p.visitas[0]).toMatchObject({
      id: "pd-1-v1", data: "2026-10-20", hora: "10:30", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "levantamento", igualALead: false,
      nota: "Tocar à campainha.", quemVaiEstar: "", duracao: "",
      morada: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" },
    });
  });

  it("a morada da visita é uma cópia: mudar o pedido não mexe na pessoa", () => {
    const v = visita();
    const [p] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: v }));
    expect(p.visitas[0].morada).not.toBe(v.moradaVisita);
    expect(p.visitas[0].morada).toEqual(v.moradaVisita);
  });

  it("a ficha antiga (visitaMarcada sem visita, com próximo contacto) passa a uma visita na morada da lead, com a hora do próximo contacto", () => {
    const [p] = gerar(sementeBase("a", { etapa: "visitaMarcada", proximoContacto: "2026-10-18", proximoHora: "09:00", morada: moradaLead }));
    expect(p.visitas).toHaveLength(1);
    expect(p.visitas[0]).toMatchObject({
      data: "2026-10-18", hora: "09:00", feitoPor: "Ana Ribeiro", estado: "porFazer", igualALead: true,
      morada: { rua: "Rua do Mar 9", codigoPostal: "2900-100", localidade: "Setúbal", andar: "" },
    });
  });

  it("a ficha antiga sem próximo contacto não inventa visita (só fica contactada)", () => {
    const [p] = gerar(sementeBase("a", { etapa: "visitaMarcada", proximoContacto: null }));
    expect(p).toMatchObject({ contactado: true, visitas: [] });
  });

  it("uma visita feita com levantamento passa a visita Feita e leva o levantamento para o pedido", () => {
    const levantamento = {
      linhas: [{ id: "l1", divisao: "cozinha", trabalho: "pavimento", trabalhoOutro: "", medida: "12", unidade: "m2", observacoes: "" }],
      observacoes: "Cliente em casa", respostas: { q1: "a" },
    };
    const [p] = gerar(sementeBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true, levantamento }) }));
    expect(p.visitas[0].estado).toBe("feita");
    expect(p.levantamento).toEqual(levantamento);
  });

  it("uma pessoa com negócio aberto e sem visita não gera pedido; uma com visita gera, ao lado do negócio aberto", () => {
    const abertos = [negocioBase("n1")];
    expect(gerar(sementeBase("a", { etapa: "qualificada" }), abertos)).toEqual([]);
    const [p] = gerar(sementeBase("a", { etapa: "cliente", visita: visita() }), abertos, "cliente");
    expect(p.visitas).toHaveLength(1);
    expect(p.contactado).toBe(true);
  });

  it("um cliente sem visita não gera pedido; uma lead perdida gera (a ficha não perde o passo em que ficou)", () => {
    expect(gerar(sementeBase("a", { etapa: "cliente" }), [], "cliente")).toEqual([]);
    const [p] = gerar(sementeBase("a", { etapa: "emContacto", perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } }));
    expect(p.contactado).toBe(true);
  });

  it("os ids seguem a ordem das pessoas (pd-1, pd-2...)", () => {
    const entradas = [sementeBase("a", { etapa: "nova" }), sementeBase("b", { etapa: "emContacto" })].map((pessoa) => ({ pessoa, papel: "lead" as const, abertos: [] }));
    expect(pedidosDeExemplo(entradas, HOJE).map((p) => p.id)).toEqual(["pd-1", "pd-2"]);
  });
});

describe("PEDIDOS_EXEMPLO: nenhum caso de exemplo se perde", () => {
  it("cada semente com visita dá um pedido com a mesma data, hora, morada e comercial", () => {
    const comVisita = SEMENTES_EXEMPLO.filter((p) => p.visita);
    expect(comVisita.length).toBeGreaterThanOrEqual(3);
    for (const pessoa of comVisita) {
      const v = pessoa.visita as VisitaSemente;
      const pedido = PEDIDOS_EXEMPLO.find((p) => p.pessoaId === pessoa.id);
      expect(pedido, pessoa.id).toBeDefined();
      expect(pedido?.visitas, pessoa.id).toHaveLength(1);
      expect(pedido?.visitas[0], pessoa.id).toMatchObject({
        data: v.data, hora: v.hora, feitoPor: v.comercial, morada: v.moradaVisita, igualALead: v.igualALead,
        estado: v.feita ? "feita" : "porFazer", nota: v.notaAcesso ?? "",
      });
    }
  });

  it("o cliente com visita marcada (o Paulo) fica com o pedido ao lado dos negócios abertos", () => {
    const paulo = PEDIDOS_EXEMPLO.filter((p) => p.pessoaId === "p-paulo");
    expect(paulo).toHaveLength(1);
    expect(paulo[0].visitas[0]).toMatchObject({ hora: "10:30", feitoPor: "Bruno Costa", nota: "Tocar à campainha da portaria." });
  });

  it("as sete leads sem negócio aberto têm um pedido, e o único outro é o do Paulo (tem visita)", () => {
    const ids = PEDIDOS_EXEMPLO.map((p) => p.pessoaId).sort();
    expect(ids).toEqual(["p-beatriz", "p-fabio", "p-goncalo", "p-hugo", "p-joana", "p-lucia", "p-paulo", "p-rita"]);
  });

  it("a Beatriz e o Hugo (novos, sem chamada) estão por contactar; a Lúcia (em contacto) está contactada", () => {
    const de = (id: string) => PEDIDOS_EXEMPLO.find((p) => p.pessoaId === id);
    expect(de("p-beatriz")?.contactado).toBe(false);
    expect(de("p-hugo")?.contactado).toBe(false);
    expect(de("p-lucia")?.contactado).toBe(true);
  });

  it("a visita da Rita é hoje, na morada da lead, e a do Gonçalo ficou por concluir (dia passado)", () => {
    const rita = PEDIDOS_EXEMPLO.find((p) => p.pessoaId === "p-rita")?.visitas[0];
    const goncalo = PEDIDOS_EXEMPLO.find((p) => p.pessoaId === "p-goncalo")?.visitas[0];
    expect(rita).toMatchObject({ data: HOJE_EXEMPLO, hora: "15:00", igualALead: true });
    expect((goncalo?.data ?? "") < HOJE_EXEMPLO).toBe(true);
    expect(goncalo?.estado).toBe("porFazer");
  });

  it("os ids são únicos e no formato pd-<n>", () => {
    const ids = PEDIDOS_EXEMPLO.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^pd-\d+$/));
  });
});
