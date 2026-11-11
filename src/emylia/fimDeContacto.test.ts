// 11/11 (fim de contacto): a assistente comercial (negocios.contacto.registar sem nenhuma permissão do Negócio além do contacto) acaba o
// Contacto com «Passar ao comercial»; quem tem negocios.visita.gerir continua a marcar a visita. F3: as respostas retif_… pedem obra.planear.
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, permDoCampo, proximo, seed } from "./motor";
import { CHAVE_CONTACTO_CONCLUIDO, avisoDaFase, codigosDaFase, comOComercial, definirPermissoesReais, faltaDaFase, permEmFaltaDoPasso, soAteAoContacto } from "./permissoes";

const ASSISTENTE = ["negocios.contacto.registar", "pessoas.edit", "pessoas.view"];
const reais = (codigos: string[]) => definirPermissoesReais({ codigos: new Set(codigos), simular: false });

afterEach(() => definirPermissoesReais(null));

describe("fim de contacto", () => {
  it("a assistente é quem tem contacto.registar e nenhuma permissão além do contacto", () => {
    expect(soAteAoContacto()).toBe(false); // sem conta real
    reais(ASSISTENTE);
    expect(soAteAoContacto()).toBe(true);
    reais([...ASSISTENTE, "negocios.visita.gerir"]);
    expect(soAteAoContacto()).toBe(false);
    reais([...ASSISTENTE, "negocios.obra.tecnico"]);
    expect(soAteAoContacto()).toBe(false);
  });

  it("o próximo passo em Contacto: a assistente passa ao comercial; quem gere visitas marca a visita", () => {
    const S = seed(), d = S.deals.find((x) => x.fase === 1 && !x.perdido)!;
    reais(ASSISTENTE);
    expect(proximo(d, S)).toMatchObject({ act: "passarAoComercial", btn: "Passar ao comercial" });
    expect(permEmFaltaDoPasso({ role: "comercial" }, "passarAoComercial")).toBeNull();
    d.f[CHAVE_CONTACTO_CONCLUIDO] = "2026-11-11";
    expect(proximo(d, S)).toMatchObject({ t: "Com o comercial", wait: true });
    expect(comOComercial(d)).toBe(true);
    reais([...ASSISTENTE, "negocios.visita.gerir"]);
    expect(proximo(d, S)).toMatchObject({ act: "marcarVisita", sub: expect.stringContaining("pronto para marcar a visita") });
  });

  it("«Passar ao comercial» grava a marca e o histórico e deixa o negócio em Contacto", () => {
    const S = seed(), d = S.deals.find((x) => x.fase === 1 && !x.perdido)!;
    // as perguntas do Contacto respondidas (o portão)
    Object.assign(d.f, { resultado: "Atendeu · interessado", alteracoes: "x", estado_atual: "y", morada: "Rua A 1", imovel: "Moradia",
      posse: "Proprietário", poder_decisao: "Sim", orc_cliente: "Não sabe", outros_orc: "Não" });
    reais(ASSISTENTE);
    const A = acoes(S, vi.fn(), (f) => f());
    A.passarAoComercial(d.id);
    expect(d.fase).toBe(1);
    expect(d.f[CHAVE_CONTACTO_CONCLUIDO]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.hist[0].t).toBe("Contacto concluído · passou ao comercial");
  });

  it("sem contacto.registar não passa ao comercial", () => {
    const S = seed(), d = S.deals.find((x) => x.fase === 1 && !x.perdido)!;
    reais(["pessoas.edit", "pessoas.view"]);
    const avisar = vi.fn();
    acoes(S, avisar, (f) => f()).passarAoComercial(d.id);
    expect(d.f[CHAVE_CONTACTO_CONCLUIDO]).toBeUndefined();
    expect(avisar).toHaveBeenCalled();
  });

  it("as permissões das respostas: a marca é do contacto; as medidas retificadas são de quem planeia a obra (F3)", () => {
    expect(permDoCampo(CHAVE_CONTACTO_CONCLUIDO)).toBe("contacto.registar");
    expect(permDoCampo("retif_aceite")).toBe("obra.planear");
    expect(permDoCampo("retif_pav")).toBe("obra.planear");
    expect(permDoCampo("posse")).toBeNull();
  });

  // 20270113130000: cada fase pede a sua permissão (o mesmo mapa do servidor)
  it("cada fase pede a sua permissão: o Gestor de obra (pessoas.edit + obra.*) só lê o Contacto e a Visita", () => {
    const GESTOR = ["pessoas.view", "pessoas.edit", "negocios.obra.planear", "negocios.obra.executar", "negocios.obra.materiais", "negocios.obra.imprevistos", "negocios.obra.fechar"];
    const neg = (fase: number, f: Record<string, string> = {}) => ({ fase, f });
    expect(faltaDaFase(codigosDaFase(neg(2)))).toBeNull(); // sem conta real: o ecrã não bloqueia
    reais(GESTOR);
    expect(faltaDaFase(codigosDaFase(neg(1)))).toBe("negocios.contacto.registar");
    // o comercial sem contacto.registar (só visita.gerir) abre o Contacto para marcar a visita
    reais(["pessoas.edit", "negocios.visita.gerir", "negocios.orcamento.editar"]);
    expect(faltaDaFase(codigosDaFase(neg(1)))).toBeNull();
    reais(GESTOR);
    expect(faltaDaFase(codigosDaFase(neg(2)))).toBe("negocios.visita.gerir");
    expect(faltaDaFase(codigosDaFase(neg(3)))).toBeNull(); // obra.planear: as medidas e o plano antes do contrato
    expect(faltaDaFase(codigosDaFase(neg(4)))).toBeNull(); // o Financeiro não pede permissão de fase
    expect(faltaDaFase(codigosDaFase(neg(5)))).toBeNull();
    expect(avisoDaFase("negocios.visita.gerir")).toContain("(negocios.visita.gerir)");
    reais(ASSISTENTE);
    expect(faltaDaFase(codigosDaFase(neg(1)))).toBeNull();
    expect(faltaDaFase(codigosDaFase(neg(1, { [CHAVE_CONTACTO_CONCLUIDO]: "2026-11-11" })))).toBe("negocios.visita.gerir");
    expect(avisoDaFase("negocios.visita.gerir")).toContain("já está com o comercial");
    expect(faltaDaFase(codigosDaFase(neg(3)))).toBe("negocios.orcamento.editar");
  });
});
