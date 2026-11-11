// GARANTIAS das permissões do editor de papéis (06/11/2026). Testes que falham sozinhos quando alguma coisa fica errada:
//  1. cada dependência (dependenciasPermissoes.ts) aponta para um código que está no editor (nem escondido, nem inexistente);
//  2. não há ciclos nas dependências;
//  3. cada permissão do editor é verificada em pelo menos um ficheiro vivo (src/ ou edge function), e cada código verificado em src/
//     existe no catálogo (em uso ou escondido);
//  4. cada entrada do menu (menuConfig.ts) pede as mesmas permissões que a rota em App.tsx, ou um subconjunto coerente; e uma rota que
//     aceita A OU B não pode ter A a depender de B no editor (a alternativa seria inútil).
// As divergências que já existiam e não são deste trabalho ficam em listas de exceções conhecidas («06/11: por decidir»): o teste
// falha se aparecer uma nova OU se uma conhecida deixar de o ser (para a lista não apodrecer).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { menuSections, topLevelItems, type MenuItem } from "@/components/sidebar/menuConfig";
import { construirDependencias, DEPENDE_DE, dependenciasDe, EXIGE_TAMBEM, exigidasDe, SEM_DEPENDENCIA } from "./dependenciasPermissoes";
import { agruparPorMenu } from "./gruposPermissoes";
import { alternarPermissao, definirConjunto, emFaltaDetalhe, emFaltaPara, podeAlterar } from "./matriz";
import { CODIGOS_EM_USO, CODIGOS_ESCONDIDOS, CODIGOS_SEM_CATALOGO, PERMISSOES_EM_USO } from "./permissoesEmUso";
import { permissoesDoMenu } from "./rolesReais";
import type { Permissao } from "./tipos";
import { caminhoRelativo, ficheiros, IGNORAR, LEGADO, SRC, usosNoCodigo } from "./__tests__/varrimentoPermissoes";

const catalogo = (): Permissao[] => permissoesDoMenu(Object.entries(PERMISSOES_EM_USO).flatMap(([category, codigos]) =>
  codigos.map((code) => ({ code, name: code, category, is_dangerous: false }))));

// ---------------------------------------------------------------------------------------------------------------------------------
// 1 e 2: o mapa de dependências
// ---------------------------------------------------------------------------------------------------------------------------------
describe("garantia 1: cada dependência aponta para uma permissão do editor", () => {
  it("nenhuma dependência para um código escondido ou inexistente (foi o erro de «Anular contrato» / «Ver custos»)", () => {
    const erradas = Object.entries(DEPENDE_DE).flatMap(([codigo, deps]) => [
      ...(CODIGOS_EM_USO.has(codigo) ? [] : [`${codigo} (não está no editor)`]),
      ...deps.filter((d) => !CODIGOS_EM_USO.has(d)).map((d) => `${codigo} → ${d}${CODIGOS_ESCONDIDOS.has(d) ? " (escondida)" : " (inexistente)"}`),
    ]);
    expect(erradas).toEqual([]);
  });

  it("a dependência está no MESMO grupo do editor (o erro (a): «Anular contrato»/«Ver custos» em Negócios, presas ao Ver dos Documentos)", () => {
    const grupoDe = new Map(agruparPorMenu(catalogo()).flatMap((g) => g.permissoes.map((p) => [p.codigo, g.rotulo] as const)));
    const noutroGrupo = Object.entries(DEPENDE_DE)
      .filter(([codigo, deps]) => !deps.some((d) => grupoDe.get(d) === grupoDe.get(codigo)))
      .map(([codigo, deps]) => `${codigo} (${grupoDe.get(codigo)}) → ${deps.map((d) => `${d} (${grupoDe.get(d)})`).join(" | ")}`);
    expect(noutroGrupo).toEqual([]);
  });

  it("nenhuma depende de si própria nem tem a lista vazia; as SEM_DEPENDENCIA estão no editor e não dependem de nada", () => {
    Object.entries(DEPENDE_DE).forEach(([codigo, deps]) => {
      expect(deps.length, codigo).toBeGreaterThan(0);
      expect(deps, codigo).not.toContain(codigo);
    });
    SEM_DEPENDENCIA.forEach((c) => {
      expect(CODIGOS_EM_USO, c).toContain(c);
      expect(dependenciasDe(c), c).toEqual([]);
    });
  });

  it("uma dependência para um código fora do editor não entra no mapa (construirDependencias só olha para o editor)", () => {
    const mapa = construirDependencias(new Set(["deals.delete", "trash.view", "leads.view", "leads.edit"]));
    expect(mapa).toEqual({ "leads.edit": ["leads.view"] });
  });
});

describe("garantia 2: sem ciclos", () => {
  it("seguir as dependências nunca volta ao ponto de partida", () => {
    const ciclos: string[] = [];
    const visitar = (codigo: string, caminho: readonly string[]) => {
      if (caminho.includes(codigo)) {
        ciclos.push([...caminho.slice(caminho.indexOf(codigo)), codigo].join(" → "));
        return;
      }
      dependenciasDe(codigo).forEach((d) => visitar(d, [...caminho, codigo]));
    };
    Object.keys(DEPENDE_DE).forEach((c) => visitar(c, []));
    expect([...new Set(ciclos)]).toEqual([]);
  });
});

describe("as dependências declaradas", () => {
  const PARTES_RH = [
    "pessoais", "identificacao", "morada", "emergencia", "bancarios", "saude", "sindicalizacao", "laborais", "afectacoes", "colocacao",
    "vinculos", "retribuicao", "horario", "horario_realizado", "documentos",
  ];

  it("RH: os separadores da ficha dependem de «Ficha › Ver» OU «Ver a própria ficha»; a edição depende do ver da mesma parte", () => {
    PARTES_RH.forEach((parte) => expect(dependenciasDe(`hr.pessoas.${parte}.view`), parte).toEqual(["hr.pessoas.view", "hr.pessoas.view.own"]));
    expect(dependenciasDe("hr.pessoas.edit")).toEqual(["hr.pessoas.view", "hr.pessoas.view.own"]);
    expect(dependenciasDe("hr.pessoas.pessoais.edit")).toEqual(["hr.pessoas.pessoais.view"]);
    expect(dependenciasDe("hr.pessoas.retribuicao.corrigir")).toEqual(["hr.pessoas.retribuicao.view"]);
    expect(dependenciasDe("hr.pessoas.identificacao.reveal")).toEqual(["hr.pessoas.identificacao.view"]);
    expect(dependenciasDe("hr.pessoas.vinculos.horas.corrigir")).toEqual(["hr.pessoas.vinculos.view"]);
    expect(dependenciasDe("hr.pessoas.create")).toEqual(["hr.pessoas.view"]);
  });

  it("RH: a ficha, a própria ficha e os documentos próprios não dependem de nada", () => {
    ["hr.pessoas.view", "hr.pessoas.view.own", "hr.pessoas.documentos.view.own", "hr.assiduidade.view.own", "hr.ausencias.view.own",
      "hr.pessoas.documentos.modelos.view"].forEach((c) => expect(dependenciasDe(c), c).toEqual([]));
  });

  it("todas as hr.pessoas.* do editor, menos as próprias/independentes, levam (direta ou indiretamente) à ficha", () => {
    const leva = (c: string, vistos = new Set<string>()): boolean => {
      if (c === "hr.pessoas.view") return true;
      if (vistos.has(c)) return false;
      vistos.add(c);
      return dependenciasDe(c).some((d) => leva(d, vistos));
    };
    const LIVRES = ["hr.pessoas.view", "hr.pessoas.view.own", "hr.pessoas.documentos.view.own", "hr.pessoas.documentos.modelos.view",
      "hr.pessoas.documentos.modelos.edit"];
    const soltas = [...CODIGOS_EM_USO].filter((c) => c.startsWith("hr.pessoas.") && !LIVRES.includes(c) && !leva(c));
    expect(soltas).toEqual([]);
  });

  it("mantém o que já estava certo: o Ver do módulo (leads.edit → leads.view) e as exceções da linha Negócio", () => {
    expect(dependenciasDe("leads.edit")).toEqual(["leads.view"]);
    expect(dependenciasDe("suppliers.contract_manage")).toEqual(["suppliers.view"]);
    expect(dependenciasDe("quotes.edit")).toEqual(["quotes.view"]);
    ["quotes.view_costs", "client_contracts.cancel", "deals.delete"].forEach((c) => expect(dependenciasDe(c), c).toEqual([]));
  });

  it("no editor real: o separador marca-se com a ficha OU a própria; «Tudo» da linha marca a ficha primeiro; tirar a ficha tira em cascata", () => {
    const cat = catalogo();
    expect(podeAlterar("hr.pessoas.pessoais.view", [], cat)).toBe(false);
    expect(emFaltaPara("hr.pessoas.pessoais.view", [], cat)).toEqual(["hr.pessoas.view", "hr.pessoas.view.own"]);
    expect(podeAlterar("hr.pessoas.pessoais.view", ["hr.pessoas.view.own"], cat)).toBe(true);
    expect(podeAlterar("hr.pessoas.pessoais.edit", ["hr.pessoas.view"], cat)).toBe(false);

    const linha = cat.filter((p) => ["hr.pessoas.pessoais.edit", "hr.pessoas.pessoais.view", "hr.pessoas.view"].includes(p.codigo));
    expect(definirConjunto([], linha, true, cat).sort()).toEqual(["hr.pessoas.pessoais.edit", "hr.pessoas.pessoais.view", "hr.pessoas.view"]);

    const tudo = ["hr.pessoas.view", "hr.pessoas.pessoais.view", "hr.pessoas.pessoais.edit", "hr.pessoas.create", "leads.view"];
    expect(alternarPermissao(tudo, "hr.pessoas.view", cat)).toEqual(["leads.view"]);
    // Com a própria ficha marcada, os separadores ficam (servem a própria ficha); criar pessoas sai (precisa da lista).
    expect(alternarPermissao([...tudo, "hr.pessoas.view.own"], "hr.pessoas.view", cat))
      .toEqual(["hr.pessoas.pessoais.view", "hr.pessoas.pessoais.edit", "leads.view", "hr.pessoas.view.own"]);
  });

  it("tirar só arrasta dependentes do que saiu: uma concedida antiga sem a dependência não sai por se mexer noutra", () => {
    const cat = catalogo();
    expect(alternarPermissao(["hr.pessoas.colocacao.view", "leads.view"], "leads.view", cat)).toEqual(["hr.pessoas.colocacao.view"]);
  });

  it("10/11: configurar o canal de denúncias depende de geri-lo", () => {
    expect(dependenciasDe("hr.denuncias.configurar")).toEqual(["hr.denuncias.gerir"]);
    expect(dependenciasDe("hr.denuncias.gerir")).toEqual([]);
    const cat = catalogo();
    expect(podeAlterar("hr.denuncias.configurar", [], cat)).toBe(false);
    expect(alternarPermissao(["hr.denuncias.gerir", "hr.denuncias.configurar"], "hr.denuncias.gerir", cat)).toEqual([]);
  });
});

describe("10/11: EXIGE_TAMBEM («todas de»)", () => {
  const CONTA = "hr.pessoas.conta.criar";

  it("cada código do mapa e cada exigida está no editor; nenhuma se exige a si própria", () => {
    const erradas = Object.entries(EXIGE_TAMBEM).flatMap(([codigo, exigidas]) => [
      ...(CODIGOS_EM_USO.has(codigo) ? [] : [`${codigo} (não está no editor)`]),
      ...exigidas.filter((d) => !CODIGOS_EM_USO.has(d) || d === codigo).map((d) => `${codigo} → ${d}`),
    ]);
    expect(erradas).toEqual([]);
    expect(exigidasDe(CONTA)).toEqual(["users.create"]);
  });

  it("DEPENDE_DE fica como estava: conta.criar continua a depender só da ficha", () => {
    expect(dependenciasDe(CONTA)).toEqual(["hr.pessoas.view"]);
  });

  it("ligar conta.criar sem users.create fica bloqueado, e diz o que falta", () => {
    const cat = catalogo();
    expect(podeAlterar(CONTA, ["hr.pessoas.view"], cat)).toBe(false);
    expect(alternarPermissao(["hr.pessoas.view"], CONTA, cat)).toEqual(["hr.pessoas.view"]);
    expect(emFaltaPara(CONTA, ["hr.pessoas.view"], cat)).toEqual(["users.create"]);
    expect(emFaltaDetalhe(CONTA, ["hr.pessoas.view"], cat)).toEqual({ qualquerDe: [], todas: ["users.create"] });
    // Sem nada: falta a ficha (qualquer de) E users.create (todas).
    expect(emFaltaDetalhe(CONTA, [], cat)).toEqual({ qualquerDe: ["hr.pessoas.view"], todas: ["users.create"] });
    expect(emFaltaPara(CONTA, ["users.create"], cat)).toEqual(["hr.pessoas.view"]);
    expect(podeAlterar(CONTA, ["hr.pessoas.view", "users.create"], cat)).toBe(true);
    expect(alternarPermissao(["hr.pessoas.view", "users.create"], CONTA, cat)).toEqual(["hr.pessoas.view", "users.create", CONTA]);
  });

  it("tirar users.create tira conta.criar em cascata; tirar outra coisa não", () => {
    const cat = catalogo();
    const tem = ["hr.pessoas.view", "users.create", CONTA, "leads.view"];
    expect(alternarPermissao(tem, "users.create", cat)).toEqual(["hr.pessoas.view", "leads.view"]);
    expect(alternarPermissao(tem, "leads.view", cat)).toEqual(["hr.pessoas.view", "users.create", CONTA]);
    // A ficha continua a arrastá-la (DEPENDE_DE), como antes.
    expect(alternarPermissao(tem, "hr.pessoas.view", cat)).toEqual(["users.create", "leads.view"]);
    // Um papel antigo com conta.criar sem users.create não a perde por se mexer noutra coisa.
    expect(alternarPermissao(["hr.pessoas.view", CONTA, "leads.view"], "leads.view", cat)).toEqual(["hr.pessoas.view", CONTA]);
  });

  it("marcar um conjunto respeita-o: sem users.create no conjunto nem concedida, conta.criar fica por marcar", () => {
    const cat = catalogo();
    const de = (...codigos: string[]) => cat.filter((p) => codigos.includes(p.codigo));
    expect(definirConjunto([], de("hr.pessoas.view", CONTA), true, cat)).toEqual(["hr.pessoas.view"]);
    expect(definirConjunto(["users.create"], de("hr.pessoas.view", CONTA), true, cat).sort())
      .toEqual(["hr.pessoas.view", CONTA, "users.create"].sort());
    expect(definirConjunto(["hr.pessoas.view", "users.create", CONTA], de("users.create"), false, cat)).toEqual(["hr.pessoas.view"]);
  });

  it("users.create fora do catálogo de quem edita não bloqueia (como as dependências)", () => {
    const semUsers = catalogo().filter((p) => p.codigo !== "users.create");
    expect(podeAlterar(CONTA, ["hr.pessoas.view"], semUsers)).toBe(true);
  });
});

describe("11/11: receber mercadoria por leitura exige as três juntas (F13)", () => {
  const RECEBER = "receiving.receive";
  const RECEBER_PO = "purchase_orders.receive";
  const EDITAR_STOCK = "inventory.edit";

  it("exige purchase_orders.receive e inventory.edit, e continua a depender de receiving.view", () => {
    expect(exigidasDe(RECEBER)).toEqual([RECEBER_PO, EDITAR_STOCK]);
    expect(dependenciasDe(RECEBER)).toEqual(["receiving.view"]);
  });

  it("não se marca sem as outras duas, e diz quais faltam", () => {
    const cat = catalogo();
    const base = ["receiving.view", RECEBER_PO];
    expect(podeAlterar(RECEBER, base, cat)).toBe(false);
    expect(alternarPermissao(base, RECEBER, cat)).toEqual(base);
    expect(emFaltaDetalhe(RECEBER, base, cat)).toEqual({ qualquerDe: [], todas: [EDITAR_STOCK] });
    expect(emFaltaDetalhe(RECEBER, ["receiving.view"], cat)).toEqual({ qualquerDe: [], todas: [RECEBER_PO, EDITAR_STOCK] });
    const completo = [...base, EDITAR_STOCK];
    expect(podeAlterar(RECEBER, completo, cat)).toBe(true);
    expect(alternarPermissao(completo, RECEBER, cat)).toEqual([...completo, RECEBER]);
  });

  it("tirar inventory.edit ou purchase_orders.receive arrasta receiving.receive; a outra direção não", () => {
    const cat = catalogo();
    const tem = ["receiving.view", RECEBER_PO, EDITAR_STOCK, RECEBER];
    expect(alternarPermissao(tem, EDITAR_STOCK, cat)).not.toContain(RECEBER);
    expect(alternarPermissao(tem, RECEBER_PO, cat)).not.toContain(RECEBER);
    // Não se exige o contrário: purchase_orders.receive continua a marcar-se sozinha (âmbito inalterado).
    expect(exigidasDe(RECEBER_PO)).toEqual([]);
    expect(alternarPermissao(tem, RECEBER, cat)).toEqual(["receiving.view", RECEBER_PO, EDITAR_STOCK]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// 3: em uso ⇔ verificado
// ---------------------------------------------------------------------------------------------------------------------------------
const FUNCOES = join(process.cwd(), "supabase", "functions");
/** Um literal com forma de código de permissão nas edge functions (checkUserPermission, has_anew_permission, listas de códigos). */
const LITERAL_EDGE = /["'`]([a-z_]+(?:\.[a-z_]+)+)["'`]/g;

function codigosNasEdgeFunctions(): Set<string> {
  if (!existsSync(FUNCOES)) return new Set();
  return new Set(ficheiros(FUNCOES)
    .filter((f) => !/\.test\.ts$/.test(f))
    .flatMap((f) => [...readFileSync(f, "utf8").matchAll(LITERAL_EDGE)].map((m) => m[1] ?? "")));
}

/** Os códigos que o Negócio pergunta por fn_cat_pode (emylia/permissoes.ts: CODIGO_BASE, ALTERNATIVAS, CODIGO_VER_CUSTOS). */
function codigosDoNegocio(): Set<string> {
  const texto = readFileSync(join(SRC, "emylia/permissoes.ts"), "utf8");
  const blocos = [/CODIGO_BASE[^=]*=\s*\{([\s\S]*?)\};/, /ALTERNATIVAS[^=]*=\s*\{([\s\S]*?)\};/].map((r) => texto.match(r)?.[1] ?? "");
  const valores = blocos.flatMap((b) => [...b.matchAll(/:\s*(?:\[\s*)?["']([a-z_.]+)["']/g)].map((m) => m[1] ?? ""));
  const custos = texto.match(/CODIGO_VER_CUSTOS\s*=\s*["']([a-z_.]+)["']/)?.[1];
  return new Set([...valores, ...(custos ? [custos] : [])]);
}

/**
 * As verificações indiretas que o varrimento geral (CONTEXTO) não apanha, nos ficheiros vivos de src/:
 * - podeNeg(papel, "obra.materiais") — o código curto do Negócio como 2.º argumento (emylia/permissoes.ts);
 * - constantes com o código: PERMISSAO_ATRIBUIR_COMERCIAL = "leads.assign", CODIGO_VER_CUSTOS = "quotes.view_costs";
 * - os mapas PERM = { ver: "fleet.view", gerir: "fleet.manage", … } (components/frota/contexto.ts).
 */
function verificadosIndiretamente(): Set<string> {
  const vivos = ficheiros(SRC).filter((f) => {
    const r = caminhoRelativo(f);
    return !IGNORAR.test(r) && !(LEGADO as readonly string[]).includes(r);
  });
  const codigos = vivos.flatMap((f) => {
    const texto = readFileSync(f, "utf8");
    const negocio = [...texto.matchAll(/\bpodeNeg\(\s*[^,()]+,\s*["'`]([a-z_.]+)["'`]\s*\)/g)].map((m) => m[1] ?? "");
    const constantes = [...texto.matchAll(/\b(?:PERMISSAO|CODIGO)_[A-Z_]+\s*(?::\s*\w+\s*)?=\s*["'`]([a-z_]+(?:\.[a-z_]+)+)["'`]/g)].map((m) => m[1] ?? "");
    const mapas = [...texto.matchAll(/\bconst\s+PERM\w*\s*=\s*\{([^}]*)\}/g)]
      .flatMap((m) => [...(m[1] ?? "").matchAll(/:\s*["'`]([a-z_]+(?:\.[a-z_]+)+)["'`]/g)].map((x) => x[1] ?? ""));
    return [...negocio, ...constantes, ...mapas];
  });
  return new Set(codigos);
}

/**
 * 06/11: por decidir — permissões do editor que NENHUM ficheiro vivo de src/ nem nenhuma edge function verifica: só o servidor
 * (policies/RPCs na base), que este teste não consegue ler (não há base aqui). Todas já estavam documentadas como «só no servidor»;
 * falta confirmar na base que a verificação continua lá. Lista fechada: o teste falha se aparecer outra, ou se uma destas passar a ser
 * verificada no código (aí sai daqui).
 */
const SO_NO_SERVIDOR_POR_DECIDIR: readonly string[] = [
  // 06/11: por decidir. Só policies/RPCs (permissoesEmUso.ts, categoria hr).
  "hr.ausencias.tipos.view",
  // 10/11: só as RPCs denuncias_* (20270111300000: ligar o canal, designar responsáveis); a página de Denúncias ainda não a pergunta.
  "hr.denuncias.configurar",
  // 06/11: por decidir. rpc_hr_admissao_listar, convite_admissao_resumo, rever_ler mascaram os processos terminados sem ela (CartaoAdmissao).
  "hr.onboarding.restrito",
  // 06/11: por decidir. A chave do registo de alterações (entity_audit_log), só na policy da leitura direta (rolesReais.ts).
  "product_categories.view",
  // 06/11: por decidir. O servidor calcula can_manage/can_countersign… em rpc_supplier_contracts_list/get; o ecrã usa as flags.
  "suppliers.contract_manage",
];

/**
 * 06/11: por decidir — códigos verificados em ficheiros vivos de src/ que não existem no catálogo (nem em uso nem escondidos): ninguém
 * os pode dar pelo editor. É a lista CODIGOS_SEM_CATALOGO de permissoesEmUso.ts; este teste só confirma que continua certa.
 */
describe("garantia 3: em uso ⇔ verificado no código", () => {
  const usos = usosNoCodigo();
  const verificadosEmSrc = new Set(usos.filter((u) => u.contexto).map((u) => u.codigo));
  const naEdge = codigosNasEdgeFunctions();
  const doNegocio = codigosDoNegocio();
  const indiretos = verificadosIndiretamente();

  it("o varrimento lê mesmo alguma coisa (src/, edge functions e o Negócio)", () => {
    expect(verificadosEmSrc.size).toBeGreaterThan(100);
    expect(naEdge.size).toBeGreaterThan(10);
    expect(doNegocio).toContain("negocios.validar_pagamento");
    expect(doNegocio).toContain("quotes.view_costs");
    ["fleet.manage", "leads.assign", "obra.materiais"].forEach((c) => expect(indiretos, c).toContain(c));
  });

  it("cada permissão do editor é verificada em pelo menos um ficheiro vivo (ou está na lista «só no servidor, por decidir»)", () => {
    const naoVerificadas = [...CODIGOS_EM_USO]
      .filter((c) => !verificadosEmSrc.has(c) && !indiretos.has(c) && !naEdge.has(c) && !doNegocio.has(c))
      .sort();
    expect(naoVerificadas).toEqual([...SO_NO_SERVIDOR_POR_DECIDIR].sort());
  });

  it("cada código verificado em src/ existe no catálogo (em uso ou escondido); os que não existem são só os de CODIGOS_SEM_CATALOGO", () => {
    const foraDoCatalogo = [...verificadosEmSrc, ...indiretos].filter((c) => !CODIGOS_EM_USO.has(c) && !CODIGOS_ESCONDIDOS.has(c)).sort();
    expect(foraDoCatalogo.filter((c) => !CODIGOS_SEM_CATALOGO.includes(c))).toEqual([]);
    // E a lista não apodrece: cada código sem catálogo ainda aparece verificado em algum ficheiro vivo.
    expect(CODIGOS_SEM_CATALOGO.filter((c) => !verificadosEmSrc.has(c) && !indiretos.has(c))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// 4: o menu e as rotas pedem o mesmo
// ---------------------------------------------------------------------------------------------------------------------------------
interface Guarda { permissoes: string[]; todas: boolean }

/** As guardas ProtectedRoute das rotas em App.tsx, pelo caminho (sem o «:id?» final). `null`: a rota tem outra guarda (ou nenhuma). */
function guardasDasRotas(): Map<string, Guarda | null> {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const rotas = new Map<string, Guarda | null>();
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([^\n]*)/g)) {
    const caminho = (m[1] ?? "").replace(/\/:[a-zA-Z]+\??$/, "");
    const elemento = m[2] ?? "";
    const protegida = elemento.match(/^<ProtectedRoute\b([^>]*)>/);
    if (!protegida) {
      if (!rotas.has(caminho)) rotas.set(caminho, null);
      continue;
    }
    const atributos = protegida[1] ?? "";
    const uma = atributos.match(/\bpermission="([^"]+)"/)?.[1];
    const varias = atributos.match(/\bpermissions=\{\[([^\]]*)\]\}/)?.[1];
    const permissoes = uma ? [uma] : [...(varias ?? "").matchAll(/["']([^"']+)["']/g)].map((x) => x[1] ?? "");
    rotas.set(caminho, { permissoes, todas: /\brequireAll\b(?!=\{false\})/.test(atributos) });
  }
  return rotas;
}

interface Entrada { to: string; permissoes: string[]; todas: boolean }

function entradasDoMenu(): Entrada[] {
  const doItem = (i: MenuItem): Entrada => ({
    to: i.to, permissoes: i.permissions ?? (i.permission ? [i.permission] : []), todas: i.requireAll === true,
  });
  return [
    ...topLevelItems.map((i) => ({ to: i.to, permissoes: i.permissions, todas: i.requireAll === true })),
    ...menuSections.flatMap((s) => [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)].map(doItem)),
  ];
}

/** Quem vê a entrada do menu passa sempre na rota? (o menu pode pedir menos gente, nunca mais.) */
function coerente(menu: Entrada, rota: Guarda): boolean {
  if (rota.permissoes.length === 0) return true;
  if (menu.permissoes.length === 0) return false;
  if (rota.todas) return menu.todas && rota.permissoes.every((p) => menu.permissoes.includes(p));
  // Rota com «qualquer de»: o menu com «qualquer de» tem de pedir um subconjunto; com «todas», basta uma estar na rota.
  return menu.todas ? menu.permissoes.some((p) => rota.permissoes.includes(p)) : menu.permissoes.every((p) => rota.permissoes.includes(p));
}

/**
 * Rotas do menu guardadas por um componente próprio em vez de ProtectedRoute: a guarda equivalente, e o texto que tem de continuar no
 * componente (se mudar, o teste falha e isto revê-se).
 */
const GUARDAS_PROPRIAS: Readonly<Record<string, { ficheiro: string; contem: string; guarda: Guarda }>> = {
  // RotaNegocios: pessoas.view, ou (sem ela) um Papel no Negócio pelo RH — o Papel não é uma permissão do editor.
  "/negocios": { ficheiro: "components/RotaNegocios.tsx", contem: 'permissions={["pessoas.view", ...PERMS_OBRA]}', guarda: { permissoes: ["pessoas.view", "negocios.obra.executar", "negocios.obra.planear", "negocios.obra.tecnico"], todas: false } },
};

/** Rotas do menu sem guarda de permissão (basta a sessão); a entrada do menu também não pede nenhuma. */
const SEM_GUARDA: Readonly<Record<string, string>> = {
  "/home": "o Hoje, primeiro ecrã depois do login",
  "/rh-exemplo/minhas-denuncias": "o canal de denúncias de quem denuncia (RhSemFichaDenuncias trata quem não tem ficha)",
};

/** 06/11: por decidir — divergências reais entre o menu e a rota (o menu mostra a entrada a quem a rota recusa). Lista fechada. */
const DIVERGENCIAS_MENU_ROTA_POR_DECIDIR: readonly string[] = [
  // preenchido a partir do resultado do teste
];

describe("garantia 4: o menu pede o mesmo que a rota", () => {
  const rotas = guardasDasRotas();
  Object.entries(GUARDAS_PROPRIAS).forEach(([caminho, { guarda }]) => rotas.set(caminho, guarda));
  const entradas = entradasDoMenu();
  const semQuery = (to: string) => to.split("?")[0] ?? to;

  it("o varrimento de App.tsx encontra as rotas protegidas", () => {
    expect(rotas.get("/dashboard")).toEqual({ permissoes: ["dashboard.view"], todas: false });
    expect(rotas.get("/rh-exemplo/pessoas")).toEqual({ permissoes: ["hr.pessoas.view", "hr.pessoas.view.own"], todas: false });
    expect(entradas.length).toBeGreaterThan(30);
  });

  it("cada entrada do menu tem rota em App.tsx", () => {
    expect(entradas.filter((e) => !rotas.has(semQuery(e.to))).map((e) => e.to)).toEqual([]);
  });

  it("as guardas próprias continuam a pedir o que se diz", () => {
    Object.values(GUARDAS_PROPRIAS).forEach(({ ficheiro, contem }) => expect(readFileSync(join(SRC, ficheiro), "utf8"), ficheiro).toContain(contem));
  });

  it("as entradas sem guarda na rota são só as conhecidas, e o menu também não lhes pede permissão", () => {
    const semGuarda = entradas.filter((e) => rotas.get(semQuery(e.to)) === null);
    expect([...new Set(semGuarda.map((e) => semQuery(e.to)))].sort()).toEqual(Object.keys(SEM_GUARDA).sort());
    semGuarda.forEach((e) => expect(e.permissoes, e.to).toEqual([]));
  });

  it("cada entrada pede as permissões da rota (ou um subconjunto coerente); as divergências são só as conhecidas", () => {
    const divergentes = entradas.flatMap((e) => {
      const rota = rotas.get(semQuery(e.to));
      if (!rota || coerente(e, rota)) return [];
      const fmt = (p: string[], todas: boolean) => `[${p.join(todas ? " E " : " OU ")}]`;
      return [`${e.to}: menu ${fmt(e.permissoes, e.todas)} ≠ rota ${fmt(rota.permissoes, rota.todas)}`];
    });
    expect([...new Set(divergentes)].sort()).toEqual([...DIVERGENCIAS_MENU_ROTA_POR_DECIDIR].sort());
  });

  it("uma rota que aceita A OU B não tem, no editor, A a depender de B (a alternativa seria inútil)", () => {
    const leva = (de: string, para: string, vistos = new Set<string>()): boolean => {
      if (vistos.has(de)) return false;
      vistos.add(de);
      return dependenciasDe(de).some((d) => d === para || leva(d, para, vistos));
    };
    const guardas = [...rotas.values()].filter((g): g is Guarda => g !== null && !g.todas && g.permissoes.length > 1);
    const inuteis = guardas.flatMap((g) => g.permissoes.flatMap((a) => g.permissoes.filter((b) => a !== b && leva(a, b)).map((b) => `${a} → ${b}`)));
    expect([...new Set(inuteis)]).toEqual([]);
  });

  it("o mesmo para as entradas do menu com «qualquer de»", () => {
    const inuteis = entradas.filter((e) => !e.todas).flatMap((e) =>
      e.permissoes.flatMap((a) => e.permissoes.filter((b) => a !== b && dependenciasDe(a).includes(b)).map((b) => `${e.to}: ${a} → ${b}`)));
    expect(inuteis).toEqual([]);
  });
});
