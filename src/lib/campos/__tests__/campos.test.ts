import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGO_SISTEMA, CHAVES_RESERVADAS, chaveDeRotulo, type LinhaCampo } from "../catalogo";
import {
  combinarFicha, emFalta, formatarValor, linhasParaGravar, paraFormulario, resumoExtra,
  rotulo, rotuloOpcao, seccoesExtra, validarValores, visivel,
} from "../definicoes";
import { MODELOS_SETOR } from "../modelosSetor";
import { combinarTermos, termosParaGravar, TERMOS_PADRAO } from "../termos";
import { CAMPOS_EXTERIOR, CAMPOS_INTERIOR } from "@/lib/addresses/fichaTecnicaEdificio";
import { CAMPOS_PLANEAMENTO } from "@/lib/deals/diagnosticoPlaneamento";

const MIGRACAO = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261209100000_campos_configuraveis.sql"), "utf8");

const arraySql = (ficha: string, funcao: string) => {
  const corpo = MIGRACAO.slice(MIGRACAO.indexOf(`FUNCTION public.${funcao}(`));
  const m = new RegExp(`WHEN '${ficha}' THEN ARRAY\\[([^\\]]*)\\]`).exec(corpo);
  return (m?.[1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
};

describe("catálogo de sistema", () => {
  it("diz o mesmo que fn_cfg_chaves_sistema", () => {
    for (const f of ["local", "diagnostico"] as const) {
      expect(CATALOGO_SISTEMA[f].map((d) => d.chave).sort()).toEqual(arraySql(f, "fn_cfg_chaves_sistema").sort());
    }
  });

  it("as reservadas extra dizem o mesmo que fn_cfg_chaves_reservadas", () => {
    for (const f of ["local", "diagnostico", "cliente", "lead"] as const) {
      const sistema = CATALOGO_SISTEMA[f].map((d) => d.chave);
      const extra = CHAVES_RESERVADAS[f].filter((k) => !sistema.includes(k));
      expect(extra).toEqual(arraySql(f, "fn_cfg_chaves_reservadas"));
    }
  });

  it("cobre todos os campos da ficha do local e do diagnóstico", () => {
    expect(new Set(CATALOGO_SISTEMA.local.map((d) => d.chave))).toEqual(new Set([...CAMPOS_EXTERIOR, ...CAMPOS_INTERIOR]));
    expect(CATALOGO_SISTEMA.diagnostico.map((d) => d.chave).sort())
      .toEqual(CAMPOS_PLANEAMENTO.map((c) => `diag_${c.campo}`).sort());
  });
});

const LINHAS: LinhaCampo[] = [
  { chave: "habitada_durante_obra", sistema: true, rotulo: "Loja aberta", ordem: 0 },
  { chave: "tipologia", sistema: true, ativo: false, ordem: 1 },
  { chave: "pavimento", sistema: true, opcoes: [{ valor: "outro", rotulo: "Betão" }], ordem: 2 },
  { chave: "horario", sistema: false, tipo: "escolha", rotulo: "Horário", seccao: "acessos",
    opcoes: [{ valor: "manha", rotulo: "Manhã" }, { valor: "tarde", rotulo: "Tarde" }], obrigatorio: true, ordem: 3 },
  { chave: "credencia", sistema: false, tipo: "sim_nao", rotulo: "Credenciação", ordem: 4 },
  { chave: "quem", sistema: false, tipo: "texto", rotulo: "Quem", condicao: { campo: "credencia", valores: ["true"] }, ordem: 5 },
  { chave: "cacifos", sistema: false, tipo: "numero", rotulo: "Cacifos", minimo: 0, maximo: 20, ordem: 6 },
  { chave: "area", sistema: false, tipo: "numero", rotulo: "Área", casas_decimais: 2, unidade: "m²", ordem: 7 },
  { chave: "tipo_elev", sistema: false, tipo: "escolha", rotulo: "Elevador", ordem: 8,
    opcoes: [{ valor: "carga", rotulo: "Carga" }], condicao: { campo: "tem_elevador", valores: ["true"] } },
  { chave: "vistoria", sistema: false, tipo: "data", rotulo: "Vistoria", ordem: 9 },
  { chave: "velho", sistema: false, tipo: "texto", rotulo: "Velho", ativo: false, ordem: 10 },
];

describe("combinarFicha", () => {
  const f = combinarFicha("local", LINHAS);

  it("sem configuração = a ficha de sempre", () => {
    const v = combinarFicha("local", []);
    expect(v.configurada).toBe(false);
    expect(v.extra).toEqual([]);
    expect(visivel(v, "tipologia")).toBe(true);
    expect(rotulo(v, "acesso", "Acesso (t)")).toBe("Acesso (t)");
  });

  it("aplica rótulos, esconder e rótulos de opções aos campos de sistema", () => {
    expect(rotulo(f, "habitada_durante_obra", "Habitada")).toBe("Loja aberta");
    expect(rotulo(f, "acesso", "Acesso (t)")).toBe("Acesso (t)");
    expect(visivel(f, "tipologia")).toBe(false);
    expect(rotuloOpcao(f, "pavimento", "outro", "Outro (t)")).toBe("Betão");
    expect(rotuloOpcao(f, "pavimento", "madeira", "Madeira (t)")).toBe("Madeira (t)");
  });

  it("os campos da empresa ativos, pela ordem, e as secções", () => {
    expect(f.extra.map((d) => d.chave)).toEqual(["horario", "credencia", "quem", "cacifos", "area", "tipo_elev", "vistoria"]);
    expect(seccoesExtra(f).map((s) => s.chave)).toEqual(["interior", "acessos"]);
  });

  it("linhasParaGravar só guarda o que muda nos de sistema e volta ao mesmo", () => {
    const linhas = linhasParaGravar("local", f.todos);
    const acesso = linhas.find((l) => l.chave === "acesso")!;
    expect(acesso.rotulo).toBeNull();
    expect(acesso.opcoes).toEqual([]);
    const pav = linhas.find((l) => l.chave === "pavimento")!;
    expect(pav.opcoes).toEqual([{ valor: "outro", rotulo: "Betão" }]);
    const de_novo = combinarFicha("local", linhas);
    expect(de_novo.extra.map((d) => d.chave)).toEqual(f.extra.map((d) => d.chave));
    expect(rotulo(de_novo, "habitada_durante_obra", "x")).toBe("Loja aberta");
  });
});

describe("validarValores (= fn_cfg_validar_valores)", () => {
  const f = combinarFicha("local", LINHAS);

  it("limpa, converte e aplica condições", () => {
    const r = validarValores(f.todos, {
      horario: "tarde", credencia: false, quem: "PSP", cacifos: "3", area: "95,5", tipo_elev: "carga", vistoria: "2026-10-20",
    }, { tem_elevador: true });
    expect(r.erros).toEqual({});
    expect(r.valores).toEqual({ horario: "tarde", credencia: false, cacifos: 3, area: 95.5, tipo_elev: "carga", vistoria: "2026-10-20" });
  });

  it("condição sobre campo de sistema", () => {
    expect(validarValores(f.todos, { tipo_elev: "carga" }, { tem_elevador: false }).valores).toEqual({});
  });

  it("erros com o rótulo, como na base", () => {
    const r = validarValores(f.todos, { horario: "noite", cacifos: "21", area: "1,234", vistoria: "2026-02-31" });
    expect(r.erros.horario).toBe("Horário: opção inválida");
    expect(r.erros.cacifos).toBe("Cacifos: tem de estar entre 0 e 20");
    expect(r.erros.area).toMatch(/casa/);
    expect(r.erros.vistoria).toBe("Vistoria: data inválida");
  });

  it("um campo escondido pela condição não dá erro", () => {
    const r = validarValores(f.todos, { quem: "x".repeat(300), credencia: false });
    expect(r.erros).toEqual({});
  });

  it("obrigatórios em falta (só aviso)", () => {
    expect(emFalta(f.extra, {}).map((d) => d.chave)).toEqual(["horario"]);
    expect(emFalta(f.extra, { horario: "manha" })).toEqual([]);
  });

  it("paraFormulario e resumo", () => {
    expect(paraFormulario(f.extra, { area: 95.5, credencia: true, horario: "manha" }))
      .toEqual({ area: "95,5", credencia: true, horario: "manha" });
    expect(resumoExtra(f.extra, { horario: "manha", credencia: true, area: 95.5 }))
      .toBe("Horário: Manhã · Credenciação · Área: 95,5 m²");
    expect(formatarValor(f.extra.find((d) => d.chave === "vistoria")!, "2026-10-20")).toBe("20/10/2026");
  });
});

describe("modelos de setor", () => {
  it("só usam chaves válidas: de sistema existentes ou da empresa não reservadas", () => {
    for (const m of MODELOS_SETOR) {
      for (const [ficha, linhas] of Object.entries(m.fichas) as [keyof typeof CATALOGO_SISTEMA, LinhaCampo[]][]) {
        const chaves = linhas.map((l) => l.chave);
        expect(new Set(chaves).size, `${m.chave}/${ficha} repetidas`).toBe(chaves.length);
        for (const l of linhas) {
          if (l.sistema) expect(CATALOGO_SISTEMA[ficha].some((d) => d.chave === l.chave), `${m.chave}/${l.chave}`).toBe(true);
          else {
            expect(CHAVES_RESERVADAS[ficha], `${m.chave}/${l.chave}`).not.toContain(l.chave);
            expect(l.chave).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
            if (l.tipo === "escolha") expect(l.opcoes?.length).toBeGreaterThan(0);
            if (l.condicao) expect([...chaves, ...CATALOGO_SISTEMA[ficha].map((d) => d.chave)]).toContain(l.condicao.campo);
          }
        }
      }
    }
  });
});

describe("termos", () => {
  it("junta com os de sempre e só grava o que muda", () => {
    const t = combinarTermos({ cliente: { singular: "Condomínio", plural: "Condomínios" }, obra: { singular: "" } });
    expect(t.cliente.plural).toBe("Condomínios");
    expect(t.obra).toEqual(TERMOS_PADRAO.obra);
    expect(termosParaGravar(t)).toEqual({ cliente: { singular: "Condomínio", plural: "Condomínios" } });
  });

  it("chaveDeRotulo", () => {
    expect(chaveDeRotulo("Horário de acesso")).toBe("horario_de_acesso");
    expect(chaveDeRotulo("2.º contacto")).toBe("c_2_contacto");
  });
});
