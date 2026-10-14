// Permissões, roles e organizações de exemplo (em memória). Seis módulos, 30 permissões.
import type { AcaoId, ModuloId, Organizacao, Permissao, Role } from "./tipos";

export const MODULOS: ModuloId[] = ["clients", "deals", "contracts", "hr", "users", "settings"];

const BASICAS: AcaoId[] = ["view", "create", "edit", "delete"];
const EXTRAS: Record<ModuloId, AcaoId> = {
  clients: "export", deals: "export", contracts: "sign", hr: "sensitive", users: "resetPassword", settings: "integrations",
};
const PERIGOSAS = new Set(["clients.export", "deals.export", "contracts.sign", "hr.sensitive", "hr.delete", "users.delete", "users.resetPassword"]);
const COM_AMBITO = new Set(["clients.view", "clients.edit", "deals.view", "deals.edit", "contracts.view", "hr.view", "hr.sensitive"]);

export const PERMISSOES: Permissao[] = MODULOS.flatMap((modulo) =>
  [...BASICAS, EXTRAS[modulo]].map((acao) => {
    const codigo = `${modulo}.${acao}`;
    return { codigo, modulo, acao, perigosa: PERIGOSAS.has(codigo), comAmbito: COM_AMBITO.has(codigo) };
  }),
);

const ver = (...modulos: ModuloId[]) => modulos.map((m) => `${m}.view`);
const tudoDe = (...modulos: ModuloId[]) => PERMISSOES.filter((p) => modulos.includes(p.modulo)).map((p) => p.codigo);

export const ROLES_EXEMPLO: Role[] = [
  {
    id: "r-super", codigo: "super_admin", nome: "Super administrador", sistema: true, podeAssinar: true,
    descricao: "Acesso total à plataforma. Protegida: não se edita nem se atribui por aqui.",
    permissoes: PERMISSOES.map((p) => p.codigo),
  },
  {
    id: "r-admin", codigo: "org_admin", nome: "Administrador da organização", sistema: true, podeAssinar: true,
    descricao: "Gere utilizadores, roles e definições da própria organização.",
    permissoes: PERMISSOES.filter((p) => p.codigo !== "hr.sensitive").map((p) => p.codigo),
  },
  {
    id: "r-comercial", codigo: "comercial", nome: "Comercial", sistema: false, podeAssinar: false,
    descricao: "Trabalha clientes e negócios; não vê recursos humanos.",
    permissoes: [...tudoDe("clients", "deals").filter((c) => c !== "clients.delete" && c !== "deals.delete"), ...ver("contracts")],
  },
  {
    id: "r-rh", codigo: "rh", nome: "Recursos humanos", sistema: false, podeAssinar: false,
    descricao: "Gere as fichas das pessoas da equipa, incluindo dados sensíveis.",
    permissoes: [...tudoDe("hr"), ...ver("users", "clients")],
  },
  {
    id: "r-operacoes", codigo: "operacoes", nome: "Operações", sistema: false, podeAssinar: true,
    descricao: "Prepara e assina contratos; vê clientes e negócios.",
    permissoes: [...tudoDe("contracts").filter((c) => c !== "contracts.delete"), ...ver("clients", "deals")],
  },
  {
    id: "r-leitura", codigo: "leitura", nome: "Só leitura", sistema: false, podeAssinar: false,
    descricao: "Consulta clientes, negócios e contratos, sem alterar nada.",
    permissoes: ver("clients", "deals", "contracts"),
  },
  {
    id: "r-parceiro", codigo: "parceiro_externo", nome: "Parceiro externo", sistema: false, podeAssinar: false,
    descricao: "Role personalizada para parceiros: só vê e edita negócios que são seus.",
    permissoes: ["deals.view", "deals.edit", "clients.view"],
  },
];

export const ORGANIZACOES_EXEMPLO: Organizacao[] = [
  { id: "o-aurora", nome: "Casa Aurora" },
  { id: "o-norte", nome: "Atelier Norte" },
  { id: "o-sul", nome: "Lar do Sul" },
];
