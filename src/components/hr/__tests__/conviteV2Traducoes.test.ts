/**
 * Os textos novos do convite de admissao na V2 (selos de estado, validade,
 * Prolongar, Cancelar e erros) existem em portugues e em ingles, nao vazios e
 * diferentes da propria chave. es, fr e de caem para o ingles (regra de
 * `useTranslation`). A lista sai do codigo-fonte dos componentes e hooks que a
 * usam (o cartao da ficha e os selos que ele partilha com o pipeline), mais os estados (chaves dinamicas) expandidos pela lista real.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { ESTADOS_ADMISSAO } from "@/lib/hr/estadoAdmissao";

const FONTES = import.meta.glob(
  [
    "../PessoaConviteAdmissaoEstado.tsx",
    "../admissao/SelosAdmissao.tsx",
    "../admissao/aspectoSelos.ts",
    "../ProlongarConviteDialog.tsx",
    "../CancelarConviteDialog.tsx",
    "../EnviarConviteDialog.tsx",
    "../../../hooks/useAcoesConviteAdmissao.ts",
    "../../../lib/hr/errosAdmissao.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const tabela = translations as unknown as Record<string, Record<string, string>>;

function chavesDoCodigo(): string[] {
  const achadas = new Set<string>();
  for (const texto of Object.values(FONTES)) {
    for (const m of texto.matchAll(/["'`](hr\.convite\.[A-Za-z_.]+)["'`]/g)) achadas.add(m[1]);
  }
  return [...achadas];
}

const DINAMICAS = [
  ...ESTADOS_ADMISSAO.map((e) => `hr.convite.estadoAdmissao.${e}`),
  "hr.convite.estadoAdmissao.terminado",
  "hr.convite.estadoAdmissao.desconhecido",
  ...["ativo", "expirado", "revogado", "encerrado", "desconhecido"].map((e) => `hr.convite.estadoPortal.${e}`),
];

describe("traducoes da admissao V2 (pt e en)", () => {
  const chaves = [...new Set([...chavesDoCodigo(), ...DINAMICAS])];

  it("le as fontes (a glob nao esta vazia) e apanha as chaves novas", () => {
    expect(Object.keys(FONTES).length).toBe(8);
    expect(chaves).toEqual(
      expect.arrayContaining([
        "hr.convite.prolongar.titulo",
        "hr.convite.cancelar.aviso",
        "hr.convite.erro.limiteExcedido",
        "hr.convite.selo.admissao",
      ]),
    );
  });

  it.each(["pt", "en"])("%s tem todas as chaves, nenhuma vazia nem igual a chave", (lingua) => {
    const emFalta = chaves.filter((c) => !tabela[lingua][c] || tabela[lingua][c] === c);
    expect(emFalta, `${lingua}: por traduzir`).toEqual([]);
  });

  it.each(["pt", "en"])("%s: os textos com parametros mantem-nos", (lingua) => {
    const esperados: Record<string, string[]> = {
      "hr.convite.estado.enviadoPara": ["email"],
      "hr.convite.validade.ativo": ["data"],
      "hr.convite.validade.expirado": ["data"],
      "hr.convite.prolongar.dias": ["n"],
      "hr.convite.prolongar.validoAte": ["data"],
    };
    for (const [chave, parametros] of Object.entries(esperados)) {
      for (const p of parametros) expect(tabela[lingua][chave], `${lingua}/${chave}`).toContain(`{{${p}}}`);
    }
  });

  it("cancelar diz que NAO e rejeitar e que o link deixa de funcionar (pt e en)", () => {
    expect(tabela.pt["hr.convite.cancelar.aviso"]).toMatch(/não é rejeitar/i);
    expect(tabela.pt["hr.convite.cancelar.aviso"]).toMatch(/deixa de funcionar/i);
    expect(tabela.en["hr.convite.cancelar.aviso"]).toMatch(/not rejecting/i);
    expect(tabela.en["hr.convite.cancelar.aviso"]).toMatch(/stops working/i);
  });

  it("limite_excedido diz o limite por hora em portugues claro, e em ingles", () => {
    expect(tabela.pt["hr.convite.erro.limiteExcedido"]).toBe("Atingiu o limite de ações por hora, tente mais tarde.");
    expect(tabela.en["hr.convite.erro.limiteExcedido"]).toMatch(/hourly limit/i);
  });

  it("as chaves da V1 que o ecra novo deixou orfas ja nao existem em nenhuma lingua", () => {
    const orfas = [
      "hr.convite.reenviar",
      "hr.convite.tituloReenviar",
      "hr.convite.estado.pendente",
      "hr.convite.estado.pendenteSemEmail",
      "hr.convite.estado.usado",
      "hr.convite.estado.expirado",
    ];
    for (const lingua of ["en", "pt", "es", "fr", "de"]) {
      for (const chave of orfas) expect(tabela[lingua][chave], `${lingua}/${chave}`).toBeUndefined();
    }
  });

  it("os textos que mandavam 'Reenviar' ja nao o mandam, em nenhuma lingua", () => {
    for (const lingua of ["en", "pt", "es", "fr", "de"]) {
      for (const chave of ["hr.convite.emailNaoEnviado", "hr.convite.criadoSemLink"]) {
        expect(tabela[lingua][chave], `${lingua}/${chave}`).not.toMatch(/reenviar|resend|renvoyer|erneut senden/i);
      }
    }
  });
});
