// Utilizadores da plataforma e clientes do portal de exemplo (em memória). Nomes e emails inventados. Os vínculos são com organizações da plataforma.
import { PERMISSOES } from "./catalogoExemplo";
import type { Ambito, ClientePortal, Utilizador, Vinculo } from "./tipos";

/** O "hoje" do exemplo: os últimos acessos contam-se a partir daqui, para o ecrã não mudar de dia para dia. */
export const HOJE_EXEMPLO = "2026-10-14";

const ambitosTodos = (a: Ambito): Record<string, Ambito> =>
  Object.fromEntries(PERMISSOES.filter((p) => p.comAmbito).map((p) => [p.codigo, a]));

const vinculo = (organizacaoId: string, roleId: string, ambito: Ambito = "OWNED", ativo = true): Vinculo => ({
  organizacaoId, roleId, ativo, ambitos: ambitosTodos(ambito),
});

export const UTILIZADORES_EXEMPLO: Utilizador[] = [
  {
    id: "u-01", nome: "Helena Marques", email: "helena.marques@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-14",
    vinculos: [vinculo("o-grupo", "r-super", "ORG"), vinculo("o-remodelacoes", "r-super", "ORG")],
    atividade: [{ data: "2026-10-14", texto: "Entrou na plataforma" }, { data: "2026-10-02", texto: "Alterou a role de Rui Pacheco" }],
  },
  {
    id: "u-02", nome: "Rui Pacheco", email: "rui.pacheco@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-13",
    vinculos: [vinculo("o-grupo", "r-admin", "ORG"), vinculo("o-remodelacoes", "r-comercial", "TEAM"), vinculo("o-climatizacao", "r-leitura", "ORG")],
    atividade: [{ data: "2026-10-13", texto: "Convidou Marta Silveira" }, { data: "2026-09-28", texto: "Foi-lhe atribuída a role Só leitura em Aurora Climatização" }],
  },
  {
    id: "u-03", nome: "Marta Silveira", email: "marta.silveira@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-12",
    vinculos: [vinculo("o-grupo", "r-comercial", "TEAM")],
    atividade: [{ data: "2026-10-12", texto: "Entrou na plataforma" }],
  },
  {
    id: "u-04", nome: "Tiago Valente", email: "tiago.valente@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-14",
    vinculos: [vinculo("o-grupo", "r-comercial", "OWNED")],
    atividade: [{ data: "2026-10-14", texto: "Entrou na plataforma" }],
  },
  {
    id: "u-05", nome: "Inês Carvalhal", email: "ines.carvalhal@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-09",
    vinculos: [vinculo("o-remodelacoes", "r-gestor", "ORG")],
    atividade: [{ data: "2026-10-09", texto: "Convidou um utilizador" }],
  },
  {
    id: "u-06", nome: "Paulo Seabra", email: "paulo.seabra@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-11",
    vinculos: [vinculo("o-climatizacao", "r-operacoes", "TEAM")],
    atividade: [{ data: "2026-10-11", texto: "Confirmou a saída de stock de uma encomenda" }],
  },
  {
    id: "u-07", nome: "Carla Mendes", email: "carla.mendes@exemplo.pt", ativo: true, ultimoAcesso: "2026-09-30",
    vinculos: [vinculo("o-grupo", "r-leitura", "ORG")],
    atividade: [{ data: "2026-09-30", texto: "Entrou na plataforma" }],
  },
  {
    id: "u-08", nome: "Duarte Lopes", email: "duarte.lopes@exemplo.pt", ativo: false, ultimoAcesso: "2026-06-18",
    vinculos: [vinculo("o-remodelacoes", "r-comercial", "OWNED", false)],
    atividade: [{ data: "2026-07-01", texto: "Desativado" }, { data: "2026-06-18", texto: "Entrou na plataforma" }],
  },
  {
    id: "u-09", nome: "Sofia Brandão", email: "sofia.brandao@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-10",
    vinculos: [vinculo("o-climatizacao", "r-parceiro", "OWNED")],
    atividade: [{ data: "2026-10-10", texto: "Atualizou um negócio" }],
  },
  {
    id: "u-10", nome: "Nuno Ferraz", email: "nuno.ferraz@exemplo.pt", ativo: true, ultimoAcesso: null,
    vinculos: [vinculo("o-remodelacoes", "r-operacoes", "OWNED")],
    atividade: [{ data: "2026-10-13", texto: "Convite enviado, ainda não aceite" }],
  },
  {
    id: "u-11", nome: "Beatriz Sampaio", email: "beatriz.sampaio@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-13",
    vinculos: [vinculo("o-grupo", "r-gestor", "ORG"), vinculo("o-climatizacao", "r-leitura", "ORG")],
    atividade: [{ data: "2026-10-13", texto: "Entrou na plataforma" }],
  },
  {
    id: "u-12", nome: "Hugo Taborda", email: "hugo.taborda@exemplo.pt", ativo: true, ultimoAcesso: "2026-10-08",
    vinculos: [vinculo("o-remodelacoes", "r-admin", "ORG")],
    atividade: [{ data: "2026-10-08", texto: "Criou uma role personalizada" }],
  },
];

export const CLIENTES_PORTAL_EXEMPLO: ClientePortal[] = [
  { id: "p-1", nome: "Joana Ribeiro", organizacaoId: "o-grupo", ativo: true, ultimoAcesso: "2026-10-12" },
  { id: "p-2", nome: "Armando Vidal", organizacaoId: "o-grupo", ativo: true, ultimoAcesso: "2026-10-01" },
  { id: "p-3", nome: "Clínica Dentária Sorriso", organizacaoId: "o-remodelacoes", ativo: true, ultimoAcesso: "2026-09-20" },
  { id: "p-4", nome: "Fernanda Teles", organizacaoId: "o-climatizacao", ativo: false, ultimoAcesso: "2026-05-04" },
  { id: "p-5", nome: "Oficina Rocha e Filhos", organizacaoId: "o-remodelacoes", ativo: true, ultimoAcesso: null },
];
