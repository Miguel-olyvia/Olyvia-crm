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
  CODIGOS_EM_USO, CODIGOS_ESCONDIDOS, CODIGOS_SEM_CATALOGO, PERMISSOES_EM_USO, PERMISSOES_ESCONDIDAS,
} from "./permissoesEmUso";
import { permissoesDoMenu, type LinhaPermissao } from "./rolesReais";
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
const LEGADO = ["pages/AnewLeads.tsx", "pages/AnewClients.tsx", "components/leads/LeadTableRow.tsx"] as const;
/** Um import (estático ou lazy) de uma página legada: `from "@/pages/AnewLeads"`, `import("./pages/AnewLeads")`. */
const IMPORT_LEGADO = /\b(?:from|import)\s*\(?\s*["'`][^"'`\n]*\/(?:AnewLeads|AnewClients|LeadTableRow)(?:\.tsx)?["'`]/;

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
      .map((u) => `${u.codigo} (${u.ficheiro})`);
    expect([...new Set(fora)]).toEqual([]);
  });

  it("não usa nenhuma das permissões escondidas, em contexto nenhum", () => {
    const escondidas = usos.filter((u) => CODIGOS_ESCONDIDOS.has(u.codigo)).map((u) => `${u.codigo} (${u.ficheiro})`);
    expect([...new Set(escondidas)]).toEqual([]);
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
      "Dashboard", "Agendamentos", "Operação", "Catálogo e custos", "Organizações", "Negócios", "CRM", "Aquisição", "Marketing",
      "Inventário", "Frota", "Recursos Humanos", "Utilizadores", "Definições", "Plataforma",
    ]);
    const negocios = agruparPorMenu(emUso).find((g) => g.rotulo === "Negócios");
    expect(negocios?.blocos).toEqual([]);
    expect(negocios?.subgrupos.map((s) => s.rotulo)).toEqual([
      "Geral", "Pessoas: leads e clientes", "Orçamento e proposta", "Contrato", "Financeiro", "Obra",
    ]);
    expect(negocios?.permissoes.filter((p) => p.codigo.startsWith("negocios."))).toHaveLength(9);
    expect(negocios?.permissoes.filter((p) => p.codigo.startsWith("pessoas."))).toHaveLength(6);
  });

  it("Negócios › Pessoas tem os dados da pessoa em uso, e o CRM só os contacts.* que o servidor ainda verifica", () => {
    const grupos = agruparPorMenu(emUso);
    const pessoas = grupos.find((g) => g.rotulo === "Negócios")!.subgrupos.find((s) => s.rotulo === "Pessoas: leads e clientes")!;
    expect(pessoas.permissoes.map((p) => p.codigo).sort()).toEqual([
      "clients.create", "clients.delete", "clients.edit", "clients.import", "clients.view",
      "leads.assign", "leads.config", "leads.convert", "leads.create", "leads.delete", "leads.edit", "leads.import", "leads.view",
    ]);
    const crm = grupos.find((g) => g.rotulo === "CRM")!;
    expect(crm.permissoes.map((p) => p.codigo).sort()).toEqual([
      "contacts.create", "contacts.delete", "contacts.edit", "contacts.import", "contacts.view",
    ]);
    const foraDePessoas = grupos
      .flatMap((g) => g.permissoes)
      .filter((p) => (p.codigo.startsWith("leads.") || p.codigo.startsWith("clients.")) && !pessoas.permissoes.includes(p));
    expect(foraDePessoas).toEqual([]);
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

  it("quotes.view_costs e client_contracts.cancel estão em Negócios e já não em Aquisição", () => {
    const grupos = agruparPorMenu(emUso);
    const negocios = grupos.find((g) => g.rotulo === "Negócios")!;
    const aquisicao = grupos.find((g) => g.rotulo === "Aquisição")!;
    const codigosDe = (rotulo: string) => negocios.subgrupos.find((s) => s.rotulo === rotulo)?.permissoes.map((p) => p.codigo) ?? [];
    expect(codigosDe("Orçamento e proposta")).toContain("quotes.view_costs");
    expect(codigosDe("Contrato")).toContain("client_contracts.cancel");
    const naAquisicao = aquisicao.permissoes.map((p) => p.codigo);
    expect(naAquisicao).not.toContain("quotes.view_costs");
    expect(naAquisicao).not.toContain("client_contracts.cancel");
    expect(naAquisicao).toContain("quotes.view");
    expect(naAquisicao).toContain("client_contracts.edit");
  });
});

describe("esconder não remove", () => {
  const linha = (code: string, category: string): LinhaPermissao => ({ code, name: code, category, is_dangerous: false });

  it("o catálogo do editor deixa de fora as escondidas", () => {
    const catalogo = permissoesDoMenu([linha("leads.view", "leads"), linha("vacations.view", "hr"), linha("trash.view", "trash")]);
    expect(catalogo.map((p) => p.codigo)).toEqual(["leads.view"]);
  });

  it("ao gravar uma role, as escondidas que ela já tinha ficam (e as visíveis seguem o que se marcou)", () => {
    const visiveis = permissoesDoMenu([linha("leads.view", "leads"), linha("leads.edit", "leads"), linha("vacations.view", "hr")]);
    const original = ["leads.view", "vacations.view", "trash.view"];
    const gravado = fundirPermissoes(original, ["leads.edit"], visiveis);
    expect(gravado.sort()).toEqual(["leads.edit", "trash.view", "vacations.view"]);
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
