// 3/11 (Rúben): os campos das fases ajustados pela organização chegam aos ecrãs reais (S.campos → efetivo) e ao orçamento (as regras).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AREA, CONTACTO, EXTERIOR, LEAD, efetivo, emFalta } from "../campos";
import { definirEfeitosCampos, efeitosDoCampo } from "../efeitosLevantamento";
import { estadoVazio } from "../estadoOrganizacao";
import { carregarCamposConfig, lerCamposConfig, lerCfgCampos } from "./camposConfig";

// o Estado da organização puxa ecrãs que criam o cliente do Supabase (sem URL nos testes)
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

afterEach(() => definirEfeitosCampos(null));

const sbCom = (r: { data?: unknown; error?: { message: string } | null }) =>
  ({ rpc: vi.fn().mockResolvedValue({ data: r.data ?? null, error: r.error ?? null }) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };

describe("os ajustes da organização aos campos das fases", () => {
  it("sem ajustes, os grupos ficam exatamente como hoje", () => {
    const S = estadoVazio("org");
    expect(S.campos ?? {}).toEqual({});
    for (const g of [...LEAD, ...CONTACTO, EXTERIOR, AREA]) expect(efetivo(S.campos, g)).toBe(g);
  });

  it("nome, opções, obrigatório, ordem, esconder e um campo novo chegam ao grupo que os ecrãs mostram", () => {
    // 4/11: a Qualificação do Contacto (a Origem da Lead saiu com o levantamento da chamada)
    const campos = lerCfgCampos({
      Qualificação: {
        nome: "O cliente",
        rotulos: { posse: "Quem é o cliente" },
        opcoes: { posse: ["Proprietário", "Inquilino", "Outro"] },
        obrig: { outros_orc: false },
        ordem: ["outros_orc", "posse"],
        ocultos: ["orc_cliente"],
        novos: [{ k: "c_vendedor", l: "Vendedor", t: "escolha", op: ["Ana", "Rui"], obrigatorio: true }],
      },
    });
    const g = efetivo(campos, CONTACTO[3]);
    expect(g.nome).toBe("O cliente");
    expect(g.campos.map((c) => c.k)).toEqual(["outros_orc", "posse", "poder_decisao", "c_vendedor"]);
    expect(g.campos.find((c) => c.k === "posse")).toMatchObject({ l: "Quem é o cliente", op: ["Proprietário", "Inquilino", "Outro"] });
    // a regra de «não passa de fase sem preencher» segue o que a organização marcou
    const falta = emFalta([g], { posse: "Inquilino", poder_decisao: "Sim" }).map((c) => c.k);
    expect(falta).toEqual(["c_vendedor"]);
  });

  it("os campos de que o motor depende não se apagam: escondem-se e mudam de nome, mas não saem pela configuração", () => {
    const campos = lerCfgCampos({
      "Local · exterior (edifício e acessos)": {
        rotulos: { estacionamento: "Parque" },
        ocultos: ["andar", "nao_existe"],
        // um «novo» com a chave de um campo de sistema não o substitui
        novos: [{ k: "estacionamento", l: "Outro", t: "texto" }, { k: "c_garagem", l: "Tem garagem", t: "sim_nao" }],
      },
    });
    const a = campos["Local · exterior (edifício e acessos)"];
    expect(a.ocultos).toEqual(["andar"]);
    expect(a.novos?.map((n) => n.k)).toEqual(["c_garagem"]);
    const g = efetivo(campos, EXTERIOR);
    expect(g.campos.find((c) => c.k === "estacionamento")).toMatchObject({ l: "Parque", papel: "sugestoes" });
    expect(g.campos.some((c) => c.k === "andar")).toBe(false);
  });

  it("o que não serve fica de fora: grupos desconhecidos, campos novos sem opções suficientes, tipos inventados, escolhas com menos de duas opções", () => {
    const campos = lerCfgCampos({
      "Grupo que não existe": { nome: "X" },
      Pedido: {
        opcoes: { tipo_cliente: ["Só um"] },
        novos: [{ k: "c_a", l: "A", t: "escolha", op: ["Um"] }, { k: "c_b", l: "B", t: "mapa" }, { k: "sem_prefixo", l: "C", t: "texto" }],
      },
    });
    expect(campos).toEqual({});
    expect(lerCfgCampos("lixo")).toEqual({});
  });

  it("ler e aplicar: S.campos fica com os ajustes e o orçamento passa a usar as regras da organização", async () => {
    const S = estadoVazio("org");
    const sb = sbCom({ data: { campos: { Qualificação: { rotulos: { posse: "Quem é" } } }, efeitos: { estacionamento: { v: { dia_amarela: 10 } } } } });
    await carregarCamposConfig(sb, "org", S);
    expect(sb.rpc).toHaveBeenCalledWith("neg_ler_campos_config", { p_org: "org" });
    expect(efetivo(S.campos, CONTACTO[3]).campos.find((c) => c.k === "posse")?.l).toBe("Quem é");
    expect(efeitosDoCampo("estacionamento", { estacionamento: "Pago" })[0]).toMatchObject({ d: "Estacionamento pago (10 dias × 10 €)", preco: 100 });
  });

  it("se a base falhar (ex.: a migration ainda não está aplicada), fica tudo como sempre", async () => {
    const S = estadoVazio("org");
    S.campos = { Origem: { nome: "Antes" } };
    definirEfeitosCampos({ elevador: { off: true } });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await carregarCamposConfig(sbCom({ error: { message: "function neg_ler_campos_config does not exist" } }), "org", S);
    expect(S.campos).toEqual({});
    expect(efeitosDoCampo("tem_elevador", { tem_elevador: "Sim" })).toHaveLength(1);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("a resposta da base sem campos nem efeitos lê-se como vazia", () => {
    expect(lerCamposConfig({ campos: {}, efeitos: {}, atualizado_em: null })).toEqual({ campos: {}, efeitos: {} });
    expect(lerCamposConfig(null)).toEqual({ campos: {}, efeitos: {} });
  });
});
