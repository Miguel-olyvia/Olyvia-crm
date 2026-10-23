// Roles e organizações da plataforma de exemplo (em memória). As permissões vêm de `permissoesExemplo.ts` (lista completa).
import { PERMISSOES } from "./permissoesExemplo";
import type { Organizacao, Permissao, Role } from "./tipos";

export { PERMISSOES };

/** Quem está a ver o ecrã neste exemplo: um administrador de sistema, que vê todas as permissões (como em Roles.tsx). */
export const EDITOR_EXEMPLO = { administradorSistema: true, codigos: [] as string[] };

const acaoDe = (p: Permissao): string => p.codigo.split(".").pop() ?? "";
const codigos = (filtro: (p: Permissao) => boolean): string[] => PERMISSOES.filter(filtro).map((p) => p.codigo);
const emCategorias = (...categorias: string[]) => (p: Permissao) => categorias.includes(p.categoria);
const ACOES_DE_TRABALHO = ["view", "create", "edit", "export", "contact", "convert", "generate_pdf", "send_signature", "duplicate", "register_invoice"];
const trabalho = (p: Permissao): boolean => !p.perigosa && ACOES_DE_TRABALHO.includes(acaoDe(p));

const COMERCIAL = codigos((p) =>
  (trabalho(p) && emCategorias("leads", "contacts", "clients", "deals", "proposals", "quotes", "direct_sales", "client_contracts", "marketing", "scheduling", "dashboard")(p))
  || ["quote_templates.view", "products.view", "services.view", "brands.view", "platform.pending_submissions.view"].includes(p.codigo));

const GESTAO_UTILIZADORES = codigos((p) =>
  (!p.perigosa && emCategorias("users")(p)) || ["roles.view", "dashboard.view", "organizations.view"].includes(p.codigo));

const OPERACOES = codigos((p) =>
  (trabalho(p) && emCategorias("suppliers", "warehouses", "purchase_orders", "receiving", "stocks", "inventory", "client_orders")(p))
  || ["purchase_orders.receive", "receiving.receive", "client_orders.confirm_stock_exit", "products.view", "dashboard.view"].includes(p.codigo));

const SEM_LEITURA = ["users", "roles", "settings", "smtp", "email_templates", "forms"];
const LEITURA = codigos((p) => acaoDe(p) === "view" && !p.perigosa && !SEM_LEITURA.includes(p.categoria));

export const ROLES_EXEMPLO: Role[] = [
  {
    id: "r-super", codigo: "super_admin", nome: "Super administrador", sistema: true, podeAssinar: true,
    descricao: "Acesso total à plataforma. Protegida: não se edita nem se atribui por aqui.",
    permissoes: PERMISSOES.map((p) => p.codigo),
  },
  {
    id: "r-admin", codigo: "org_admin", nome: "Administrador da organização", sistema: true, podeAssinar: true,
    descricao: "Gere utilizadores, roles e definições da própria organização; sem as permissões perigosas.",
    permissoes: codigos((p) => !p.perigosa),
  },
  {
    id: "r-comercial", codigo: "comercial", nome: "Comercial", sistema: false, podeAssinar: false,
    descricao: "Trabalha leads, clientes e negócios; não elimina nem exporta dados sensíveis.",
    permissoes: COMERCIAL,
  },
  {
    id: "r-gestor", codigo: "gestor_utilizadores", nome: "Gestão de utilizadores", sistema: false, podeAssinar: false,
    descricao: "Convida e gere os utilizadores da plataforma e vê as roles; não elimina utilizadores.",
    permissoes: GESTAO_UTILIZADORES,
  },
  {
    id: "r-operacoes", codigo: "operacoes", nome: "Operações", sistema: false, podeAssinar: true,
    descricao: "Compras, receção, stock e encomendas de cliente; recebe mercadoria e confirma saídas de stock.",
    permissoes: OPERACOES,
  },
  {
    id: "r-leitura", codigo: "leitura", nome: "Só leitura", sistema: false, podeAssinar: false,
    descricao: "Consulta a atividade comercial e de inventário, sem alterar nada.",
    permissoes: LEITURA,
  },
  {
    id: "r-parceiro", codigo: "parceiro_externo", nome: "Parceiro externo", sistema: false, podeAssinar: false,
    descricao: "Role personalizada para parceiros: só vê e edita pedidos de proposta e vê os clientes e agendamentos.",
    permissoes: ["dashboard.view", "deals.view", "deals.edit", "clients.view", "scheduling.items.view"],
  },
];

/** As organizações da plataforma: um grupo e duas empresas dele. Um utilizador tem vínculo (organização e role) com cada uma que usa. */
export const ORGANIZACOES_EXEMPLO: Organizacao[] = [
  { id: "o-grupo", nome: "Grupo Aurora" },
  { id: "o-remodelacoes", nome: "Aurora Remodelações", pai: "Grupo Aurora" },
  { id: "o-climatizacao", nome: "Aurora Climatização", pai: "Grupo Aurora" },
];
