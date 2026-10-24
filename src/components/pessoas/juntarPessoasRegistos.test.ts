// `juntarPessoas` com os REGISTOS da pessoa: a etapa, a Parte do Quadro, o próximo passo e o próximo contacto vêm dos registos.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { MORADA_VAZIA } from "@/components/negocio-metas/moradaObra";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import { pessoaBase } from "./fabricaTestes";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

const HOJE = "2026-10-15";
const vazio: EstadoRegistos = { contactos: [], visitas: [], levantamentos: [] };
const visita = (id: string, data: string, estado: "porFazer" | "feita", hora = "") => ({
  id, pessoaId: "a", negocioId: null, data, hora, feitoPor: "Ana", estado, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "",
});

describe("juntarPessoas com registos", () => {
  it("uma pessoa sem registos é nova, está na Parte 1 (Por contactar) e tem como passo registar a chamada", () => {
    const [r] = juntarPessoas([pessoaBase("a")], [], HOJE, vazio);
    expect(r).toMatchObject({ etapa: "nova", parte: "abordagem", coluna: "porContactar", proximoDeVisita: false, proximoContacto: null });
    expect(r.proximo?.id).toBe("registarChamada");
  });

  it("uma visita por fazer põe-na em Visita; o próximo contacto, a hora e a origem vêm dela", () => {
    const registos: EstadoRegistos = { ...vazio, visitas: [visita("rv-1", "2026-10-20", "porFazer", "14:30")] };
    const [r] = juntarPessoas([pessoaBase("a")], [], HOJE, registos);
    expect(r).toMatchObject({ etapa: "visitaMarcada", coluna: "visita", proximoContacto: "2026-10-20", proximoHora: "14:30", proximoDeVisita: true });
    expect(r.proximo?.id).toBe("fecharLevantamento");
    expect(r.registos.visitas).toHaveLength(1);
  });

  it("com a chamada agendada mais cedo, o próximo contacto é a chamada e não vem da visita", () => {
    const registos: EstadoRegistos = { ...vazio, visitas: [visita("rv-1", "2026-10-20", "porFazer", "14:30")] };
    const [r] = juntarPessoas([pessoaBase("a", { proximoContacto: "2026-10-16", proximoHora: "09:00" })], [], HOJE, registos);
    expect(r).toMatchObject({ proximoContacto: "2026-10-16", proximoHora: "09:00", proximoDeVisita: false });
  });

  it("uma pessoa encerrada não tem próximo contacto, nem Parte do Quadro", () => {
    const encerrada = pessoaBase("a", { encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-10" }, proximoContacto: "2026-10-16" });
    const [r] = juntarPessoas([encerrada], [], HOJE, vazio);
    expect(r.parte).toBe("nenhuma");
    expect(r.proximo).toEqual({ id: "nenhum", prazo: null });
  });
});

describe("os exemplos, com os registos de exemplo", () => {
  const resumos = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO);

  it("ninguém está nas duas Partes do Quadro ao mesmo tempo (a parte é uma só)", () => {
    resumos.forEach((r) => {
      expect(["abordagem", "negocios", "nenhuma"]).toContain(r.parte);
      if (r.parte === "abordagem") expect(r.abertos).toHaveLength(0);
      if (r.parte === "negocios") expect(r.abertos.length).toBeGreaterThan(0);
    });
  });

  it("há pessoas nas duas Partes e a abordagem tem as três colunas", () => {
    expect(resumos.filter((r) => r.parte === "negocios").length).toBeGreaterThan(0);
    const colunas = new Set(resumos.filter((r) => r.parte === "abordagem").map((r) => r.coluna));
    expect([...colunas].sort()).toEqual(["contactado", "porContactar", "visita"]);
  });
});
