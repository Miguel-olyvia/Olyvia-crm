// GUARDA da lista de permissões em uso (permissoesEmUso.ts), a que o editor de papéis mostra. Lê o código fonte de src/ e falha se:
//  - o código verificar uma permissão que não está em PERMISSOES_EM_USO (nem em CODIGOS_SEM_CATALOGO), ou usar uma das escondidas;
//  - uma permissão em uso não couber em nenhum grupo do editor (ficaria invisível sem ninguém dar por isso).
// Quem acrescentar uma permissão nova ao código acrescenta-a a PERMISSOES_EM_USO (com a categoria de anew_permissions) e, se for
// uma categoria nova, dá-lhe grupo em GRUPOS_MENU. Quem voltar a usar uma escondida passa-a de PERMISSOES_ESCONDIDAS para EM_USO.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { agruparPorMenu, permissoesForaDoMenu } from "./gruposPermissoes";
import { fundirPermissoes } from "./matriz";
import {
  CODIGOS_EM_USO, CODIGOS_ESCONDIDOS, CODIGOS_SEM_CATALOGO, ESCONDIDAS_COM_GUARDA, PERMISSOES_EM_USO, PERMISSOES_ESCONDIDAS,
} from "./permissoesEmUso";
import { permissoesDoMenu, type LinhaPermissao } from "./rolesReais";
import { menuSections, topLevelItems } from "@/components/sidebar/menuConfig";
import type { Permissao } from "./tipos";

const SRC = join(process.cwd(), "src");

/**
 * Ficheiros que não verificam permissões: testes e dados de exemplo, documentação, traduções, tipos gerados, esta própria lista,
 * e os pares de sinónimos de lib/permissionAliases.ts (mapeiam nomes, não verificam nada; employees.edit só aparece lá).
 */
const IGNORAR = /\.test\.tsx?$|__tests__\/|\/test\/|supabaseFalso\.ts$|Exemplo\.ts$|permissoesExemplo\.ts$|catalogoExemplo\.ts$|utilizadoresPerfisFalso\.ts$|^pages\/docs\/|^translations\/|^integrations\/supabase\/types\.ts$|^lib\/permissionAliases\.ts$|^components\/utilizadores-perfis\/permissoesEmUso\.ts$/;

/**
 * Páginas LEGADAS: existem em disco mas nada vivo as importa, porque as rotas /leads, /clients e /contacts só redirecionam para /pessoas
 * (RedirectPreservandoPesquisa em App.tsx). As permissões que só elas verificam foram escondidas (03/11/2026) — por isso o scan não
 * as conta. Lista fechada e explícita: o teste «as páginas legadas não são importadas por nada vivo» falha se alguma voltar a ser
 * importada (aí sai daqui e as permissões dela voltam a estar em uso) ou se o ficheiro desaparecer (aí sai da lista).
 * ClientDetailsDialog/ClientDetailHeader (só importados por AnewClients) não precisam de estar aqui: só verificam clients.edit, em uso.
 */
const LEGADO = [
  "pages/AnewLeads.tsx", "pages/AnewClients.tsx", "components/leads/LeadTableRow.tsx",
  // 03/11/2026 (aprovado): as rotas antigas do catálogo redirecionam para /catalogo-custos (App.tsx); estas páginas já não montam e as
  // permissões que só elas verificavam esconderam-se (criar/eliminar serviços, marcas, categorias, subcategorias, atributos, taxas,
  // itens de catálogo, exportar/importar produtos...). Ficam as que o Catálogo novo, a receção, os fornecedores e o assistente usam.
  "pages/Products.tsx", "pages/Services.tsx", "pages/Brands.tsx", "pages/Bundles.tsx", "pages/CatalogItems.tsx",
  "pages/ProductAttributes.tsx", "pages/ProductCategories.tsx", "pages/ProductSubcategories.tsx", "pages/ServiceCatalogItems.tsx",
  "pages/ServiceCategories.tsx", "pages/ServiceFees.tsx", "pages/ServiceSubcategories.tsx",
] as const;
const NOMES_LEGADO = LEGADO.map((f) => f.split("/").pop()!.replace(/\.tsx$/, "")).join("|");
/** Um import (estático ou lazy) de uma página legada: `from "@/pages/AnewLeads"`, `import("./pages/AnewLeads")`. */
const IMPORT_LEGADO = new RegExp(`\\b(?:from|import)\\s*\\(?\\s*["'\`][^"'\`\\n]*/(?:${NOMES_LEGADO})(?:\\.tsx)?["'\`]`);

/**
 * Páginas FORA DO MENU (03/11/2026): o grupo Aquisição saiu do menu (o Negócios em /pessoas e /negocios substitui-o), mas /quotes,
 * /proposals e /client-contracts continuam com rota, porque a ficha do /pessoas ainda as abre (ProcessoProviderReal, notificações,
 * Hoje...). /direct-sales redireciona para /negocios e DirectSales.tsx fica em disco sem rota. As permissões que só estas páginas
 * verificam foram escondidas (exportar, eliminar orçamentos, criar/editar/confirmar/faturar vendas diretas, ver custos da venda direta).
 * Ao contrário de LEGADO, estes ficheiros CONTINUAM no scan: uma permissão fora da lista em uso continua a falhar; só se tolera que
 * usem as escondidas. `paginas`: não podem voltar ao menu (teste abaixo). `soDelas`: componentes/utilitários importados só por
 * ficheiros desta lista (teste abaixo) — se outro ficheiro vivo os passar a importar, saem daqui e a permissão volta a estar em uso.
 */
const FORA_DO_MENU = {
  paginas: [
    { ficheiro: "pages/Quotes.tsx", rota: "/quotes" },
    { ficheiro: "pages/Proposals.tsx", rota: "/proposals" },
    { ficheiro: "pages/ClientContracts.tsx", rota: "/client-contracts" },
    { ficheiro: "pages/DirectSales.tsx", rota: "/direct-sales" },
  ],
  soDelas: [
    "components/directSales/DirectSaleEditor.tsx",
    "utils/generateInternalSalePdfBlob.ts",
    "components/directSales/InternalSaleDocumentPDF.tsx",
  ],
} as const;
const FICHEIROS_FORA_DO_MENU: readonly string[] = [...FORA_DO_MENU.paginas.map((p) => p.ficheiro), ...FORA_DO_MENU.soDelas];

/**
 * PROTÓTIPO (03/11/2026): o Inventário nativo de exemplo (src/emylia/inventario, e a cópia em pages/prototipo-negocios) trabalha numa
 * base em memória com perfis de demonstração (perfil.ts) e verifica os códigos com `exigir`/`can` contra esse perfil, nunca contra a
 * base. Pode usar códigos escondidos (purchase_orders.manage, purchase_orders.view_prices...) sem que isso os torne «em uso»: continuam
 * no scan (um código desconhecido continua a falhar), só se tolera que usem as escondidas.
 */
const PROTOTIPO = /^(?:emylia\/inventario\/|pages\/prototipo-negocios\/)/;
const toleraEscondidas = (ficheiro: string): boolean => FICHEIROS_FORA_DO_MENU.includes(ficheiro) || PROTOTIPO.test(ficheiro);
/** Uma escondida que uma guarda viva ainda pede, no ficheiro dessa guarda (ESCONDIDAS_COM_GUARDA). */
const guardaEscondida = (u: { codigo: string; ficheiro: string }): boolean =>
  CODIGOS_ESCONDIDOS.has(u.codigo) && (ESCONDIDAS_COM_GUARDA[u.codigo] ?? []).includes(u.ficheiro);

/** Um literal com forma de código de permissão: "modulo.acao", "modulo.sub.acao". */
const LITERAL = /["'`]([a-z_]+(?:\.[a-z_]+)+)["'`]/g;
/** Chaves de tradução ("t('leads.view')", "labelKey: 'x.y'") não são permissões, mesmo com o mesmo texto. */
const TRADUCAO = /(?:\b(?:t|txt|tx|translate)\(\s*|[kK]ey\s*[:=]\s*|i18nKey=\{?)$/;
/**
 * O literal está num contexto de verificação de permissão: argumento de hasPermission/hasAnyPermission/getPermissionScope/has/can…
 * ou valor de uma propriedade/atributo permission(s) (PermissionGate, ProtectedRoute, menuConfig), também dentro de uma lista.
 */
const CONTEXTO = /(?:\b(?:hasPermission|hasAnyPermission|hasAllPermissions|getPermissionScope|usePermissionScope|exigir|exigePerm|permissionGate|has|can|tem|perm)\s*\(|\b\w*[pP]ermissions?\w*\s*[:=]\s*\{?)[\s[(,]*(?:["'`][a-z_.]+["'`][\s,]*)*$/;

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

interface Uso { codigo: string; ficheiro: string; contexto: boolean }

const caminhoRelativo = (caminho: string): string => relative(SRC, caminho).split(sep).join("/");

function usosNoCodigo(): Uso[] {
  return ficheiros(SRC).flatMap((caminho) => {
    const ficheiro = caminhoRelativo(caminho);
    if (IGNORAR.test(ficheiro) || (LEGADO as readonly string[]).includes(ficheiro)) return [];
    const texto = readFileSync(caminho, "utf8");
    return [...texto.matchAll(LITERAL)].flatMap((m): Uso[] => {
      const antes = texto.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
      if (TRADUCAO.test(antes)) return [];
      return [{ codigo: m[1] ?? "", ficheiro, contexto: CONTEXTO.test(antes) }];
    });
  });
}

const permissao = (codigo: string, categoria: string): Permissao => ({ codigo, categoria, nome: codigo, perigosa: false, comAmbito: false });
const emUso: Permissao[] = Object.entries(PERMISSOES_EM_USO).flatMap(([categoria, codigos]) => codigos.map((c) => permissao(c, categoria)));

describe("permissões em uso: o código fonte", () => {
  const usos = usosNoCodigo();

  it("não verifica nenhuma permissão fora da lista em uso", () => {
    const fora = usos
      .filter((u) => u.contexto && !CODIGOS_EM_USO.has(u.codigo) && !CODIGOS_SEM_CATALOGO.includes(u.codigo))
      // As páginas FORA_DO_MENU podem verificar escondidas (só essas; uma permissão desconhecida continua a falhar).
      .filter((u) => !(toleraEscondidas(u.ficheiro) && CODIGOS_ESCONDIDOS.has(u.codigo)))
      .filter((u) => !guardaEscondida(u))
      .map((u) => `${u.codigo} (${u.ficheiro})`);
    expect([...new Set(fora)]).toEqual([]);
  });

  it("não usa nenhuma das permissões escondidas, em contexto nenhum (fora das páginas FORA_DO_MENU e do PROTÓTIPO)", () => {
    const escondidas = usos
      .filter((u) => CODIGOS_ESCONDIDOS.has(u.codigo) && !toleraEscondidas(u.ficheiro) && !guardaEscondida(u))
      .map((u) => `${u.codigo} (${u.ficheiro})`);
    expect([...new Set(escondidas)]).toEqual([]);
  });

  it("as páginas FORA_DO_MENU existem e nenhuma rota delas está no menu", () => {
    FICHEIROS_FORA_DO_MENU.forEach((f) => expect(existsSync(join(SRC, f)), f).toBe(true));
    const destinos = [
      ...topLevelItems.map((i) => i.to),
      ...menuSections.flatMap((s) => [...s.items, ...(s.subSections ?? []).flatMap((x) => x.items)].map((i) => i.to)),
    ].map((to) => to.split("?")[0]);
    const caminhos = menuSections.flatMap((s) => s.paths);
    FORA_DO_MENU.paginas.forEach(({ rota }) => {
      expect(destinos, rota).not.toContain(rota);
      expect(caminhos, rota).not.toContain(rota);
    });
    const menu = readFileSync(join(SRC, "components/sidebar/menuConfig.ts"), "utf8");
    FORA_DO_MENU.paginas.forEach(({ rota }) => expect(menu, rota).not.toContain(`"${rota}"`));
  });

  it("os componentes FORA_DO_MENU só são importados por ficheiros FORA_DO_MENU", () => {
    const vivos = ficheiros(SRC).map(caminhoRelativo).filter((f) => !IGNORAR.test(f) && !FICHEIROS_FORA_DO_MENU.includes(f));
    FORA_DO_MENU.soDelas.forEach((f) => {
      const nome = f.split("/").pop()!.replace(/\.tsx?$/, "");
      const importa = new RegExp(`\\b(?:from|import)\\s*\\(?\\s*["'\`][^"'\`\\n]*/${nome}(?:\\.tsx?)?["'\`]`);
      expect(vivos.filter((v) => importa.test(readFileSync(join(SRC, v), "utf8"))), f).toEqual([]);
    });
  });

  it("as páginas legadas ignoradas existem e não são importadas por nada vivo (só umas pelas outras)", () => {
    LEGADO.forEach((f) => expect(existsSync(join(SRC, f)), f).toBe(true));
    const importadoras = ficheiros(SRC)
      .map(caminhoRelativo)
      .filter((f) => !IGNORAR.test(f) && !(LEGADO as readonly string[]).includes(f))
      .filter((f) => IMPORT_LEGADO.test(readFileSync(join(SRC, f), "utf8")));
    expect(importadoras).toEqual([]);
  });

  it("o scan encontra mesmo as verificações (guarda contra um teste que passa por não ler nada)", () => {
    const vistos = new Set(usos.filter((u) => u.contexto).map((u) => u.codigo));
    ["leads.view", "roles.view", "fleet.view", "hr.pessoas.view", "pessoas.view", "settings.update"].forEach((c) => expect(vistos).toContain(c));
  });
});

describe("permissões em uso: a lista", () => {
  it("cabe toda nos grupos do editor", () => {
    expect(permissoesForaDoMenu(emUso).map((p) => p.codigo)).toEqual([]);
    expect(agruparPorMenu(emUso).flatMap((g) => g.permissoes)).toHaveLength(emUso.length);
  });

  it("não repete códigos e não se cruza com as escondidas nem com as sem catálogo", () => {
    const codigos = emUso.map((p) => p.codigo);
    const escondidas = Object.values(PERMISSOES_ESCONDIDAS).flat();
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(new Set(escondidas).size).toBe(escondidas.length);
    expect(codigos.filter((c) => CODIGOS_ESCONDIDOS.has(c))).toEqual([]);
    expect(CODIGOS_SEM_CATALOGO.filter((c) => CODIGOS_EM_USO.has(c) || CODIGOS_ESCONDIDOS.has(c))).toEqual([]);
  });

  it("tem as permissões novas de Negócios, Pessoas e Plataforma", () => {
    [
      "pessoas.view", "pessoas.create", "pessoas.edit", "pessoas.delete", "pessoas.reopen", "pessoas.config",
      "negocios.registar_fatura", "negocios.validar_pagamento", "negocios.orcamento.editar", "negocios.margem.aprovar",
      "negocios.proposta.enviar", "negocios.contrato.editar", "negocios.obra.planear", "negocios.obra.executar", "negocios.obra.materiais",
      "negocios.contacto.registar", "negocios.visita.gerir", "negocios.proposta.decidir", "negocios.obra.imprevistos", "negocios.obra.fechar",
      "negocios.perder",
      "platform.support_access.view", "platform.auth_audit_log.view",
    ].forEach((c) => expect(CODIGOS_EM_USO).toContain(c));
  });

  it("tem a permissão do contrato de fornecedor, no grupo de Inventário", () => {
    expect(CODIGOS_EM_USO).toContain("suppliers.contract_manage");
    const grupo = agruparPorMenu(emUso).find((g) => g.permissoes.some((p) => p.codigo === "suppliers.contract_manage"));
    expect(grupo?.rotulo).toBe("Inventário");
  });

  it("os grupos seguem a ordem do menu, com Negócios e Frota", () => {
    const rotulos = agruparPorMenu(emUso).map((g) => g.rotulo);
    expect(rotulos).toEqual([
      "Dashboard", "Agendamentos", "Operação", "Catálogo e custos", "Organizações", "Negócios", "Documentos do negócio", "Marketing",
      "Inventário", "Frota", "Recursos Humanos", "Utilizadores", "Definições", "Plataforma",
    ]);
    const negocios = agruparPorMenu(emUso).find((g) => g.rotulo === "Negócios");
    expect(negocios?.blocos).toEqual([]);
    expect(negocios?.subgrupos.map((s) => s.rotulo)).toEqual([
      "Geral", "Pessoas: leads e clientes", "Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra",
    ]);
    expect(negocios?.permissoes.filter((p) => p.codigo.startsWith("negocios."))).toHaveLength(15);
    const codigosDe = (rotulo: string) => negocios?.subgrupos.find((s) => s.rotulo === rotulo)?.permissoes.map((p) => p.codigo).sort();
    expect(codigosDe("Geral")).toContain("negocios.perder");
    expect(codigosDe("Por contactar")).toEqual(["leads.assign", "leads.create", "leads.view"]);
    expect(codigosDe("Contacto")).toEqual(["negocios.contacto.registar"]);
    expect(codigosDe("Visita")).toEqual(["negocios.visita.gerir"]);
    expect(codigosDe("Negócio")).toEqual([
      "client_contracts.cancel", "negocios.contrato.editar", "negocios.margem.aprovar", "negocios.orcamento.editar", "negocios.proposta.decidir",
      "negocios.proposta.enviar", "quotes.view_costs",
    ]);
    expect(codigosDe("Obra")).toEqual([
      "negocios.obra.executar", "negocios.obra.fechar", "negocios.obra.imprevistos", "negocios.obra.materiais", "negocios.obra.planear",
    ]);
    expect(negocios?.permissoes.filter((p) => p.codigo.startsWith("pessoas."))).toHaveLength(6);
  });

  it("Negócios › Pessoas tem os dados da pessoa em uso (com os contacts.*), «Por contactar» ver/criar/atribuir leads, e não há grupo CRM", () => {
    const grupos = agruparPorMenu(emUso);
    const negocios = grupos.find((g) => g.rotulo === "Negócios")!;
    const pessoas = negocios.subgrupos.find((s) => s.rotulo === "Pessoas: leads e clientes")!;
    const porContactar = negocios.subgrupos.find((s) => s.rotulo === "Por contactar")!;
    expect(pessoas.permissoes.map((p) => p.codigo).sort()).toEqual([
      "clients.create", "clients.delete", "clients.edit", "clients.import", "clients.view",
      "contacts.create", "contacts.edit", "contacts.import", "contacts.view",
      "leads.config", "leads.convert", "leads.delete", "leads.edit", "leads.import",
    ]);
    expect(grupos.find((g) => g.rotulo === "CRM")).toBeUndefined();
    const foraDeNegocios = grupos
      .flatMap((g) => g.permissoes)
      .filter((p) => ["leads.", "clients.", "contacts."].some((x) => p.codigo.startsWith(x)))
      .filter((p) => !pessoas.permissoes.includes(p) && !porContactar.permissoes.includes(p));
    expect(foraDeNegocios).toEqual([]);
  });

  it("«Ver submissões pendentes» está em Marketing › Formulários e em mais lado nenhum", () => {
    const grupos = agruparPorMenu(emUso);
    const forms = grupos.find((g) => g.rotulo === "Marketing")!.subgrupos.find((s) => s.rotulo === "Formulários")!;
    expect(forms.permissoes.map((p) => p.codigo)).toContain("platform.pending_submissions.view");
    const noutros = grupos.filter((g) => g.rotulo !== "Marketing").flatMap((g) => g.permissoes.map((p) => p.codigo));
    expect(noutros).not.toContain("platform.pending_submissions.view");
  });

  it("as permissões só da página antiga de leads/clientes estão escondidas (fora do editor)", () => {
    ["leads.export", "leads.export_sensitive", "leads.contact", "clients.export", "clients.export_sensitive"].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS).toContain(c);
      expect(CODIGOS_EM_USO).not.toContain(c);
    });
    const noEditor = agruparPorMenu(emUso).flatMap((g) => g.permissoes.map((p) => p.codigo));
    expect(noEditor.filter((c) => CODIGOS_ESCONDIDOS.has(c))).toEqual([]);
  });

  it("quotes.view_costs e client_contracts.cancel estão em Negócios e já não nos Documentos do negócio", () => {
    const grupos = agruparPorMenu(emUso);
    const negocios = grupos.find((g) => g.rotulo === "Negócios")!;
    const aquisicao = grupos.find((g) => g.rotulo === "Documentos do negócio")!;
    const codigosDe = (rotulo: string) => negocios.subgrupos.find((s) => s.rotulo === rotulo)?.permissoes.map((p) => p.codigo) ?? [];
    expect(codigosDe("Negócio")).toContain("quotes.view_costs");
    expect(codigosDe("Negócio")).toContain("client_contracts.cancel");
    const naAquisicao = aquisicao.permissoes.map((p) => p.codigo);
    expect(naAquisicao).not.toContain("quotes.view_costs");
    expect(naAquisicao).not.toContain("client_contracts.cancel");
    expect(naAquisicao).toContain("quotes.view");
    expect(naAquisicao).toContain("client_contracts.edit");
  });
});

describe("03/11: a Aquisição saiu do menu", () => {
  const ESCONDIDAS_AQUISICAO = [
    "proposals.export", "quotes.delete", "quotes.export", "quotes.export_sensitive", "client_contracts.export",
    "direct_sales.create", "direct_sales.edit", "direct_sales.confirm", "direct_sales.register_invoice", "direct_sales.view_costs",
    "contacts.delete",
  ];

  it("as permissões só das páginas fora do menu estão escondidas e fora do editor", () => {
    ESCONDIDAS_AQUISICAO.forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
    const noEditor = agruparPorMenu(emUso).flatMap((g) => g.permissoes.map((p) => p.codigo));
    ESCONDIDAS_AQUISICAO.forEach((c) => expect(noEditor, c).not.toContain(c));
  });

  it("ficam em uso as que algo vivo ainda verifica: direct_sales.view (Encomendas de Cliente) e contacts.view/create/edit (assistente IA)", () => {
    ["direct_sales.view", "contacts.view", "contacts.create", "contacts.edit", "contacts.import"].forEach((c) => expect(CODIGOS_EM_USO, c).toContain(c));
  });

  it("o grupo chama-se «Documentos do negócio», com Pedidos de Proposta, Propostas e orçamentos, Venda Direta (só ver), Contratos e Configuração", () => {
    const grupos = agruparPorMenu(emUso);
    const grupo = grupos.find((g) => g.rotulo === "Documentos do negócio")!;
    expect(grupos.find((g) => g.rotulo === "Aquisição")).toBeUndefined();
    expect(grupo.blocos).toEqual([]);
    expect(grupo.subgrupos.map((s) => s.rotulo)).toEqual(["Pedidos de Proposta", "Propostas e orçamentos", "Venda Direta", "Contratos", "Configuração"]);
    const codigosDe = (r: string) => grupo.subgrupos.find((s) => s.rotulo === r)!.permissoes.map((p) => p.codigo).sort();
    expect(codigosDe("Venda Direta")).toEqual(["direct_sales.view"]);
    expect(codigosDe("Configuração")).toEqual([
      "client_contracts.manage_templates", "proposals.manage",
      "quote_templates.create", "quote_templates.delete", "quote_templates.duplicate", "quote_templates.edit", "quote_templates.view",
    ]);
    expect(codigosDe("Propostas e orçamentos")).toContain("quotes.manage");
    expect(codigosDe("Pedidos de Proposta")).toEqual(["deals.create", "deals.delete", "deals.edit", "deals.view"]);
  });
});

describe("esconder não remove", () => {
  const linha = (code: string, category: string): LinhaPermissao => ({ code, name: code, category, is_dangerous: false });

  it("o catálogo do editor deixa de fora as escondidas", () => {
    const catalogo = permissoesDoMenu([linha("leads.view", "leads"), linha("vacations.view", "hr"), linha("trash.restore", "trash")]);
    expect(catalogo.map((p) => p.codigo)).toEqual(["leads.view"]);
  });

  it("ao gravar uma role, as escondidas que ela já tinha ficam (e as visíveis seguem o que se marcou)", () => {
    const visiveis = permissoesDoMenu([linha("leads.view", "leads"), linha("leads.edit", "leads"), linha("vacations.view", "hr")]);
    const original = ["leads.view", "vacations.view", "trash.restore"];
    const gravado = fundirPermissoes(original, ["leads.edit"], visiveis);
    expect(gravado.sort()).toEqual(["leads.edit", "trash.restore", "vacations.view"]);
  });

  it("as escondidas da página antiga de leads/clientes não chegam ao editor, mas uma role que as tem não as perde ao gravar", () => {
    const visiveis = permissoesDoMenu([
      linha("leads.view", "leads"), linha("leads.export", "leads"), linha("leads.export_sensitive", "leads"), linha("leads.contact", "leads"),
      linha("clients.view", "clients"), linha("clients.export", "clients"), linha("clients.export_sensitive", "clients"),
    ]);
    expect(visiveis.map((p) => p.codigo)).toEqual(["leads.view", "clients.view"]);
    const gravado = fundirPermissoes(["leads.view", "leads.export", "clients.export_sensitive"], ["clients.view"], visiveis);
    expect(gravado.sort()).toEqual(["clients.export_sensitive", "clients.view", "leads.export"]);
  });
});

describe("03/11: Recursos Humanos", () => {
  const rh = () => agruparPorMenu(emUso).find((g) => g.rotulo === "Recursos Humanos")!;
  const codigosDe = (rotulo: string) => rh().subgrupos.find((s) => s.rotulo === rotulo)?.permissoes.map((p) => p.codigo).sort() ?? [];

  it("hr.denuncias.gerir está escondida (sem ação na app viva) e o subgrupo Denúncias desaparece", () => {
    expect(CODIGOS_EM_USO).not.toContain("hr.denuncias.gerir");
    expect(CODIGOS_ESCONDIDOS).toContain("hr.denuncias.gerir");
    expect(CODIGOS_SEM_CATALOGO).not.toContain("hr.denuncias.gerir");
    expect(codigosDe("Denúncias")).toEqual([]);
  });

  it("as cinco sem efeito vivo estão escondidas", () => {
    ["hr.ausencias.tipos.edit", "hr.ausencias.direitos.edit", "hr.pessoas.horario_realizado.edit", "hr.pessoas.duplicados.view",
      "hr.pessoas.acessos_sensiveis.view"].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
  });

  it("o grupo parte-se nos subgrupos pela ordem pedida, sem blocos soltos", () => {
    expect(rh().blocos).toEqual([]);
    expect(rh().subgrupos.map((s) => s.rotulo)).toEqual([
      "Pessoas: ficha", "Dados sensíveis", "Admissão", "Documentos", "Contratos, cargos e ofícios", "Retribuição e custos",
      "Horário e assiduidade", "Ausências", "Processamento salarial", "Centros de trabalho",
    ]);
    expect(rh().permissoes).toHaveLength(emUso.filter((p) => p.categoria === "hr").length);
  });

  it("cada prefixo cai no seu subgrupo", () => {
    expect(codigosDe("Dados sensíveis")).toEqual([
      "hr.pessoas.saude.edit", "hr.pessoas.saude.view", "hr.pessoas.sindicalizacao.edit", "hr.pessoas.sindicalizacao.view",
    ]);
    expect(codigosDe("Retribuição e custos").every((c) => c.startsWith("hr.pessoas.retribuicao."))).toBe(true);
    expect(codigosDe("Admissão")).toEqual(expect.arrayContaining(["hr.pessoas.convite.enviar", "hr.onboarding.approve", "hr.admissao.obrigatorios.gerir"]));
    expect(codigosDe("Documentos").every((c) => c.startsWith("hr.pessoas.documentos."))).toBe(true);
    expect(codigosDe("Contratos, cargos e ofícios")).toEqual(expect.arrayContaining([
      "hr.pessoas.vinculos.view", "hr.contratos.regras.gerir", "hr.cargos.salario.alterar", "hr.pessoas.laborais.view",
    ]));
    expect(codigosDe("Horário e assiduidade")).toEqual(expect.arrayContaining([
      "hr.assiduidade.view", "hr.pessoas.horario.view", "hr.pessoas.horario_realizado.view",
    ]));
    expect(codigosDe("Ausências").every((c) => c.startsWith("hr.ausencias."))).toBe(true);
    expect(codigosDe("Processamento salarial")).toEqual(expect.arrayContaining(["hr.processamento.periodo.view", "hr.vencimento.codigos.view"]));
    expect(codigosDe("Centros de trabalho")).toEqual(["hr.locais.edit", "hr.locais.view"]);
    expect(codigosDe("Pessoas: ficha")).toEqual(expect.arrayContaining([
      "hr.pessoas.view", "hr.pessoas.view.own", "hr.pessoas.create", "hr.pessoas.morada.view", "hr.pessoas.colocacao.view",
      "hr.pessoas.conta.criar", "hr.pessoas.afectacoes.view",
    ]));
    expect(codigosDe("Pessoas: ficha").some((c) => c.startsWith("hr.pessoas.saude."))).toBe(false);
  });
});

describe("03/11: Inventário", () => {
  it("os stocks.* (sem catálogo) deram lugar a inventory.*: o código já não os verifica", () => {
    ["Stocks.tsx", "StockMovements.tsx", "InventoryToday.tsx"].forEach((f) => {
      expect(readFileSync(join(SRC, "pages", f), "utf8"), f).not.toMatch(/(?:permission\s*[:=]\s*|gate\(\s*)["'`]stocks\./);
    });
    expect(CODIGOS_SEM_CATALOGO.filter((c) => c.startsWith("stocks."))).toEqual([]);
  });

  it("Stocks usa inventory.create/edit/delete/export/import e Movimentos inventory.export/edit", () => {
    const stocks = readFileSync(join(SRC, "pages/Stocks.tsx"), "utf8");
    ["inventory.create", "inventory.edit", "inventory.delete", "inventory.export", "inventory.import"].forEach((c) => expect(stocks, c).toContain(`"${c}"`));
    const mov = readFileSync(join(SRC, "pages/StockMovements.tsx"), "utf8");
    ["inventory.export", "inventory.edit"].forEach((c) => expect(mov, c).toContain(`"${c}"`));
    expect(readFileSync(join(SRC, "pages/InventoryToday.tsx"), "utf8")).toContain('PermissionGate permission="inventory.edit"');
  });

  it("inventory.export e inventory.import passam a em uso; inventory.adjust, purchase_orders.manage e purchase_orders.view_prices escondem-se", () => {
    ["inventory.export", "inventory.import"].forEach((c) => {
      expect(CODIGOS_EM_USO, c).toContain(c);
      expect(CODIGOS_ESCONDIDOS, c).not.toContain(c);
    });
    ["inventory.adjust", "purchase_orders.manage", "purchase_orders.view_prices"].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
  });
});

describe("03/11: Catálogo e módulos gerais", () => {
  it("as permissões só das páginas antigas do catálogo estão escondidas; as que o Catálogo novo e os outros módulos usam ficam", () => {
    [
      "services.create", "services.delete", "products.delete", "products.export", "products.import",
      "products.manage_attributes", "brands.create", "brands.delete", "product_attributes.create", "product_attributes.edit",
      "product_attributes.delete", "product_categories.create", "product_categories.edit", "product_categories.delete",
      "product_subcategories.create", "product_subcategories.edit", "product_subcategories.delete", "product_subcategories.view",
      "service_categories.create", "service_categories.edit", "service_categories.delete", "service_categories.view",
      "service_subcategories.create", "service_subcategories.edit", "service_subcategories.delete", "service_subcategories.view",
      "service_fees.create", "service_fees.edit", "service_fees.delete", "catalog_items.view", "catalog_items.delete",
      "catalog_items.export", "catalog_items.import", "service_catalog.view", "service_catalog.delete", "service_catalog.export",
      "service_catalog.import",
    ].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
    [
      "services.view", "services.edit", "services.manage_prices", "services.view_cost", "products.view", "products.create", "products.edit",
      "products.manage_prices", "products.view_cost", "brands.view", "product_attributes.view", "product_categories.view", "service_fees.view",
    ].forEach((c) => expect(CODIGOS_EM_USO, c).toContain(c));
  });

  it("Operação, listas, canais e definições de plataforma sem ecrã vivo estão escondidas; trash.view e lead_sources.view voltam", () => {
    [
      "operations.orders.create", "operations.orders.edit", "operations.orders.execute", "operations.orders.confirm", "operations.orders.cancel",
      "operations.checklists.manage", "operations.locations.view", "operations.locations.manage", "operations.plans.manage",
      "operations.settings.manage", "channels.create", "lists.create", "lists.edit", "lists.delete", "platform.settings.manage",
    ].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
    ["trash.view", "lead_sources.view"].forEach((c) => {
      expect(CODIGOS_EM_USO, c).toContain(c);
      expect(CODIGOS_ESCONDIDOS, c).not.toContain(c);
    });
    const grupos = agruparPorMenu(emUso);
    expect(grupos.find((g) => g.rotulo === "Definições")!.permissoes.map((p) => p.codigo)).toContain("trash.view");
    const origens = grupos.find((g) => g.rotulo === "Marketing")!.subgrupos.find((s) => s.rotulo === "Origens")!;
    expect(origens.permissoes.map((p) => p.codigo)).toContain("lead_sources.view");
  });

  it("os códigos sem catálogo trocados deixaram a lista (scheduling.view, settings.view/manage, countries.view, contract_templates.view, scheduling.items.manage)", () => {
    ["scheduling.view", "settings.view", "settings.manage", "countries.view", "contract_templates.view", "scheduling.items.manage"]
      .forEach((c) => expect(CODIGOS_SEM_CATALOGO, c).not.toContain(c));
  });
});

describe("04/11: o editor mostra o que o servidor exige e esconde o que nada verifica", () => {
  it("products.manage e brands.edit voltaram a ficar escondidas: só as páginas antigas de packs/marcas chamavam as RPCs", () => {
    ["products.manage", "brands.edit"].forEach((c) => {
      expect(CODIGOS_EM_USO, c).not.toContain(c);
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
    });
  });
  it("calendar.*, work_orders.*, scheduling.export e os quatro do RH sem verificação ficam escondidos", () => {
    [
      "calendar.create", "calendar.edit", "calendar.view_company", "work_orders.create", "work_orders.delete", "work_orders.edit",
      "work_orders.view", "scheduling.export", "hr.pessoas.archive", "hr.onboarding.sign_employer", "hr.ausencias.tipos.edit",
      "hr.assiduidade.importar",
    ].forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
    });
  });
});

describe("04/11: escondidas sem ação na app viva (canais, packs/marcas, contratos, denúncias)", () => {
  const ESCONDIDAS_04_11 = ["channels.view", "products.manage", "brands.edit", "client_contracts.manage", "hr.denuncias.gerir"];
  const noEditor = () => agruparPorMenu(emUso).flatMap((g) => g.permissoes.map((p) => p.codigo));

  it("estão escondidas e fora do editor", () => {
    ESCONDIDAS_04_11.forEach((c) => {
      expect(CODIGOS_ESCONDIDOS, c).toContain(c);
      expect(CODIGOS_EM_USO, c).not.toContain(c);
      expect(noEditor(), c).not.toContain(c);
    });
  });

  it("client_contracts.manage_templates continua no editor (Documentos do negócio › Configuração)", () => {
    expect(CODIGOS_EM_USO).toContain("client_contracts.manage_templates");
    expect(noEditor()).toContain("client_contracts.manage_templates");
  });

  it("as ordens e custos de Operações ficam: o Frota (Ligações) lê ops_ordem e lança o custo da deslocação com elas", () => {
    ["operations.orders.view", "operations.orders.view_all", "operations.costs.view"].forEach((c) => {
      expect(CODIGOS_EM_USO, c).toContain(c);
      expect(noEditor(), c).toContain(c);
    });
  });

  it("a guarda da página de Denúncias não muda: rota e menu continuam a pedir hr.denuncias.gerir", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).toMatch(/path="\/rh-exemplo\/denuncias"[^\n]*permission="hr\.denuncias\.gerir"/);
    expect(readFileSync(join(SRC, "components/sidebar/menuConfig.ts"), "utf8")).toContain('denuncias: ["hr.denuncias.gerir"]');
    expect(Object.keys(ESCONDIDAS_COM_GUARDA)).toEqual(["hr.denuncias.gerir"]);
  });

  it("uma role que as tem não as perde ao gravar", () => {
    const linha = (code: string, category: string): LinhaPermissao => ({ code, name: code, category, is_dangerous: false });
    const visiveis = permissoesDoMenu([
      linha("lead_sources.view", "marketing"), linha("channels.view", "marketing"), linha("products.manage", "products"),
      linha("brands.edit", "products"), linha("client_contracts.manage", "client_contracts"), linha("hr.denuncias.gerir", "hr"),
    ]);
    expect(visiveis.map((p) => p.codigo)).toEqual(["lead_sources.view"]);
    const gravado = fundirPermissoes(ESCONDIDAS_04_11, ["lead_sources.view"], visiveis);
    expect(gravado.sort()).toEqual([...ESCONDIDAS_04_11, "lead_sources.view"].sort());
  });
});
