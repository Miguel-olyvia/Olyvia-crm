// GUARDA da lista de permissões em uso (permissoesEmUso.ts), a que o editor de papéis mostra. Lê o código fonte de src/ e falha se:
//  - o código verificar uma permissão que não está em PERMISSOES_EM_USO (nem em CODIGOS_SEM_CATALOGO), ou usar uma das escondidas;
//  - uma permissão em uso não couber em nenhum grupo do editor (ficaria invisível sem ninguém dar por isso).
// Quem acrescentar uma permissão nova ao código acrescenta-a a PERMISSOES_EM_USO (com a categoria de anew_permissions) e, se for
// uma categoria nova, dá-lhe grupo em GRUPOS_MENU. Quem voltar a usar uma escondida passa-a de PERMISSOES_ESCONDIDAS para EM_USO.
import { readdirSync, readFileSync, statSync } from "node:fs";
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

function usosNoCodigo(): Uso[] {
  return ficheiros(SRC).flatMap((caminho) => {
    const ficheiro = relative(SRC, caminho).split(sep).join("/");
    if (IGNORAR.test(ficheiro)) return [];
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
    expect(negocios?.blocos.map((b) => b.categoria)).toEqual(["pessoas", "negocios"]);
    expect(negocios?.permissoes.filter((p) => p.codigo.startsWith("negocios."))).toHaveLength(9);
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
});
