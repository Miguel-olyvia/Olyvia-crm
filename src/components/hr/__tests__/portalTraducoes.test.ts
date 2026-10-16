/**
 * O portal temporario da admissao (V3a): todas as chaves `portal.*` que o codigo usa existem em
 * portugues e em ingles (es, fr e de caem para o ingles, regra de `useTranslation`), nao vazias,
 * diferentes da propria chave, com os parametros e os acentos certos. A lista sai do codigo-fonte
 * dos componentes, do hook e das pecas puras, mais as chaves dinamicas expandidas pelas listas reais.
 *
 * Tambem aqui, porque e o sitio que le o codigo-fonte: nada do portal pode importar do exemplo
 * (rh-exemplo), tocar em localStorage, usar toasts ou registar com console.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { CODIGOS_DE_ERRO_DO_PORTAL, PASSOS_PROGRESSO } from "@/lib/hr/portalAdmissao";

const FONTES = import.meta.glob(
  [
    "../portal/*.tsx",
    "../portal/*.ts",
    "../../../pages/ConviteAdmissao.tsx",
    "../../../hooks/useConviteAdmissaoPublico.ts",
    "../../../lib/hr/portalAdmissao.ts",
    "../../../lib/hr/portalSessao.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const tabela = translations as unknown as Record<string, Record<string, string>>;

function chavesDoCodigo(): string[] {
  const achadas = new Set<string>();
  for (const texto of Object.values(FONTES)) {
    for (const m of texto.matchAll(/["'`](portal\.[A-Za-z0-9_.]+)["'`]/g)) achadas.add(m[1]);
  }
  return [...achadas];
}

// So a vista "em analise" e do portal; as outras (link invalido, revogado, encerrado, expirado, bloqueado)
// usam o cartao de link invalido que ja existia, com os textos hr.convite.motivo.* em cinco linguas.
const VISTAS = ["analise"];

const DINAMICAS = [
  ...VISTAS.flatMap((v) => [`portal.vista.${v}.titulo`, `portal.vista.${v}.texto`]),
  ...PASSOS_PROGRESSO.map((_, i) => `portal.progresso.passo.${i}`),
  "portal.resta.umDia",
  "portal.resta.dias",
  "portal.resta.horas",
  "portal.resta.minutos",
  "portal.resta.terminado",
  ...[
    "otpInvalido",
    "otpInvalidoUma",
    "otpInvalidoSemContagem",
    "otpBloqueado",
    "otpExpirado",
    "otpEspera",
    "otpLimiteDiario",
    "emailNaoEnviado",
    "sessaoExpirada",
    "sessaoSubstituida",
    "campoBloqueado",
    "emAtualizacao",
    "pedidoInvalido",
  ].map((k) => `portal.erro.${k}`),
];

describe("traducoes do portal da admissao (pt e en)", () => {
  const chaves = [...new Set([...chavesDoCodigo(), ...DINAMICAS])];

  it("le as fontes (a glob nao esta vazia) e apanha chaves de cada parte", () => {
    expect(Object.keys(FONTES).length).toBeGreaterThanOrEqual(8);
    expect(chaves).toEqual(
      expect.arrayContaining([
        "portal.consulta.botao",
        "portal.otp.rotulo",
        "portal.sair",
        "portal.proxima.razao",
        "portal.sensiveis.guardarNiss",
        "portal.sessao.terminada",
      ]),
    );
  });

  it.each(["pt", "en"])("%s tem todas as chaves, nenhuma vazia nem igual a chave", (lingua) => {
    const emFalta = chaves.filter((c) => !tabela[lingua][c] || tabela[lingua][c] === c);
    expect(emFalta, `${lingua}: por traduzir`).toEqual([]);
  });

  it.each(["pt", "en", "es", "fr", "de"])("%s: o que o portal reutiliza do convite (cartao de link invalido, saudacao, botoes) tem texto", (lingua) => {
    const reutilizadas = [
      "hr.convite.tokenInvalidoTitulo",
      "hr.convite.demasiadasTentativasTitulo",
      "hr.convite.motivo.usado",
      "hr.convite.motivo.substituido",
      "hr.convite.motivo.expirado",
      "hr.convite.motivo.bloqueado",
      "hr.convite.motivo.inexistente",
      "hr.convite.motivo.demasiadasTentativas",
      "hr.convite.tituloPagina",
      "hr.convite.saudacao",
      "hr.convite.paginaDe",
      "hr.convite.seguinte",
      "hr.convite.anterior",
    ];
    const emFalta = reutilizadas.filter((c) => !tabela[lingua][c] || tabela[lingua][c] === c);
    expect(emFalta, `${lingua}: por traduzir`).toEqual([]);
  });

  it("pt e en tem exactamente as mesmas chaves portal.*", () => {
    const pt = Object.keys(tabela.pt).filter((k) => k.startsWith("portal.")).sort();
    const en = Object.keys(tabela.en).filter((k) => k.startsWith("portal.")).sort();
    expect(pt).toEqual(en);
  });

  it("nao ha chaves portal.* escritas e nunca usadas (nem dinamicas)", () => {
    const todas = Object.keys(tabela.pt).filter((k) => k.startsWith("portal."));
    const usadas = new Set(chaves);
    expect(todas.filter((k) => !usadas.has(k))).toEqual([]);
  });

  it("todo o codigo de erro do portal vai dar a uma chave portal.erro.* que existe", () => {
    expect(CODIGOS_DE_ERRO_DO_PORTAL.length).toBeGreaterThanOrEqual(15);
    for (const k of DINAMICAS.filter((d) => d.startsWith("portal.erro."))) {
      expect(tabela.pt[k], k).toBeTruthy();
    }
  });

  it.each(["pt", "en"])("%s: os textos com parametros mantem-nos", (lingua) => {
    const esperados: Record<string, string[]> = {
      "portal.selo.estado": ["estado"],
      "portal.selo.prazo": ["data", "resta"],
      "portal.resta.dias": ["n"],
      "portal.resta.horas": ["n"],
      "portal.resta.minutos": ["n"],
      "portal.otp.descricaoEmail": ["email"],
      "portal.otp.tentativas": ["n"],
      "portal.otp.tentativasRestantes": ["n"],
      "portal.otp.reenviarEm": ["n"],
      "portal.otp.enviado": ["n"],
      "portal.erro.otpInvalido": ["n"],
      "portal.vista.analise.estado": ["estado"],
    };
    for (const [chave, parametros] of Object.entries(esperados)) {
      for (const p of parametros) expect(tabela[lingua][chave], `${lingua}/${chave}`).toContain(`{{${p}}}`);
    }
  });

  it("o texto do portal em portugues leva acentos onde os deve levar", () => {
    const pt = tabela.pt;
    expect(pt["portal.consulta.botao"]).toBe("Confirmar identidade para editar");
    expect(pt["portal.sair"]).toBe("Terminar sessão");
    expect(pt["portal.proxima.razao"]).toBe("Disponível na próxima fase.");
    expect(pt["portal.erro.sessaoExpirada"]).toMatch(/confirme de novo o código/i);
    expect(pt["portal.progresso.passo.2"]).toBe("Análise do RH");
    expect(pt["portal.vista.analise.titulo"]).toMatch(/análise/);
    // nenhuma palavra comum fica sem acento
    const todos = Object.entries(pt)
      .filter(([k]) => k.startsWith("portal."))
      .map(([, v]) => v)
      .join("\n");
    for (const semAcento of [/\bsessao\b/i, /\bidentificacao\b/i, /\bcodigo\b/i, /\banalise\b/i, /\bnao\b/i, /\bja\b/i, /\bpagina\b/i, /\bseguranca\b/i, /\bnumero\b/i, /\bcorrecao\b/i, /\bcorrecoes\b/i, /\bduvida\b/i, /\bproxima\b/i, /\bdisponivel\b/i, /\bvalido\b/i]) {
      expect(todos, String(semAcento)).not.toMatch(semAcento);
    }
  });

  it("nenhum texto do portal em portugues parece ingles esquecido, nem o contrario", () => {
    expect(tabela.pt["portal.sair"]).not.toBe(tabela.en["portal.sair"]);
    expect(tabela.en["portal.sair"]).toBe("End session");
    expect(tabela.en["portal.proxima.razao"]).toBe("Available in the next phase.");
  });
});

describe("o portal em codigo: nada do exemplo, nada de armazenamento ou registo indevido", () => {
  const entradas = Object.entries(FONTES);

  it.each(["rh-exemplo", "rhExemplo", "SeloExemplo", "agoraExemplo"])("nenhum ficheiro refere %s", (palavra) => {
    for (const [ficheiro, texto] of entradas) expect(texto, ficheiro).not.toContain(palavra);
  });

  it("nunca se usa localStorage, toast, console, error.details nem document.cookie", () => {
    for (const [ficheiro, texto] of entradas) {
      const semComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(semComentarios, ficheiro).not.toMatch(/localStorage/);
      expect(semComentarios, ficheiro).not.toMatch(/\btoast\b|sonner|use-toast/);
      expect(semComentarios, ficheiro).not.toMatch(/console\./);
      expect(semComentarios, ficheiro).not.toMatch(/\.details\b/);
      expect(semComentarios, ficheiro).not.toMatch(/document\.cookie/);
    }
  });

  it("o hook nao escreve o token nem a sessao no URL (sem navigate, history, location, searchParams)", () => {
    const bruto = entradas.find(([f]) => f.endsWith("useConviteAdmissaoPublico.ts"))?.[1] ?? "";
    const hook = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(hook.length).toBeGreaterThan(100);
    expect(hook).not.toMatch(/navigate|history\.|location\.|searchParams|useSearchParams/);
  });

  it("a sessao vive so em memoria: nenhum ficheiro do portal usa sessionStorage, localStorage, IndexedDB ou cookies", () => {
    for (const [ficheiro, texto] of entradas) {
      const semComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(semComentarios, ficheiro).not.toMatch(/sessionStorage|localStorage|indexedDB|document\.cookie/);
    }
  });
});
