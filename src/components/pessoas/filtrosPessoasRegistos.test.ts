// Os filtros da lista com os REGISTOS da pessoa: «Por contactar» é a abordagem sem contacto (nunca uma encerrada) e «Com visita» é a pessoa em
// abordagem com uma visita (a coluna Visita do quadro).
import { describe, expect, it } from "vitest";
import { contactoBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { filtrarPessoas, FILTROS_INICIAIS } from "./filtrosPessoas";

const HOJE = "2026-10-13";
const nova = resumoBase(pessoaBase("nova", { nome: "Nova" }), [], HOJE, "lead", registosBase());
const contactada = resumoBase(pessoaBase("contactada", { nome: "Contactada" }), [], HOJE, "lead", registosBase({ contactos: [contactoBase("rc-1", { pessoaId: "contactada" })] }));
const comVisita = resumoBase(pessoaBase("visita", { nome: "Com visita" }), [], HOJE, "lead", registosBase({ visitas: [visitaPessoaBase("rv-1", { pessoaId: "visita" })] }));
const encerrada = resumoBase(
  pessoaBase("enc", { nome: "Encerrada", encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } }), [], HOJE, "lead", registosBase(),
);
const TODAS = [nova, contactada, comVisita, encerrada];
const nomes = (f: Partial<typeof FILTROS_INICIAIS>) => filtrarPessoas(TODAS, { ...FILTROS_INICIAIS, tipo: "todos", ...f }, new Set()).map((r) => r.pessoa.nome);

describe("filtros com registos", () => {
  it("«Por contactar» só tem a abordagem sem nenhum registo (nem uma encerrada)", () => {
    expect(nomes({ chip: "porContactar" })).toEqual(["Nova"]);
  });

  it("«Com visita» é a pessoa em abordagem com uma visita", () => {
    expect(nomes({ comVisita: true })).toEqual(["Com visita"]);
  });

  it("uma pessoa com a abordagem encerrada continua na lista (em «Todas» e em «Leads»), à vista", () => {
    expect(nomes({})).toContain("Encerrada");
    expect(nomes({ tipo: "leads" })).toContain("Encerrada");
  });

  it("uma encerrada nunca está atrasada, mesmo com o próximo contacto passado", () => {
    const comAtraso = resumoBase(
      pessoaBase("enc2", { nome: "Encerrada 2", proximoContacto: "2026-10-01", encerrada: { resultado: "obraInviavel", motivo: "outro", motivoOutro: "x", data: "2026-10-01" } }),
      [], HOJE, "lead", registosBase(),
    );
    expect(filtrarPessoas([comAtraso], { ...FILTROS_INICIAIS, tipo: "todos", chip: "atrasadas" }, new Set())).toEqual([]);
  });
});
