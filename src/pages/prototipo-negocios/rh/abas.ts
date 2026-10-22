// As entradas do grupo "Recursos Humanos" do protótipo: cada uma é um ecrã dos ecrãs de RH de exemplo (src/pages/rh-exemplo, vindos do ramo
// feature/rh-pessoas) com o caminho que a moldura (RhPagina) abre. Só dados de teste em memória, sem base de dados.
import { CalendarClock, CalendarDays, CalendarRange, Clock, Coins, Eye, FileText, FolderOpen, IdCard, MapPin, Megaphone, Network, Receipt, ShieldAlert, Users, type LucideIcon } from "lucide-react";

export type AbaRh =
  | "pessoas" | "agenda" | "organizacao" | "assiduidade" | "centros" | "processamento" | "modelos" | "custos" | "denuncias" | "verComoPessoa"
  | "documentos" | "ausencias" | "ponto" | "minhasDenuncias";
export type Idioma = "pt" | "en";
export type GrupoRh = "gestao" | "eu";

export interface AbaRhDef {
  k: AbaRh;
  caminho: string;
  grupo: GrupoRh;
  icone: LucideIcon;
  rotulo: Record<Idioma, string>;
  /** Só este caminho exacto (e não os que começam por ele) pertence à aba. */
  exato?: true;
}

export const ICONE_RH = IdCard;
export const TITULO_RH: Record<Idioma, string> = { pt: "Recursos Humanos", en: "Human Resources" };
export const GRUPO_RH: Record<GrupoRh, Record<Idioma, string>> = {
  gestao: { pt: "Gestão", en: "Management" },
  eu: { pt: "A minha área", en: "My area" },
};

export const ABAS_RH: readonly AbaRhDef[] = [
  { k: "pessoas", caminho: "/rh-exemplo/pessoas", grupo: "gestao", icone: Users, rotulo: { pt: "Pessoas", en: "People" } },
  // 22/10: a agenda da equipa: ecrã do protótipo (equipa/), não do RH de exemplo. Não passa pelo router interno (RhPagina mostra-a direto):
  // o caminho só existe para CAMINHO_DE. Os técnicos de obra não têm aba: são pessoas, e a ficha deles em Pessoas tem o bloco "Obra".
  { k: "agenda", caminho: "/rh-exemplo/agenda-da-equipa", grupo: "gestao", icone: CalendarClock, exato: true, rotulo: { pt: "Agenda", en: "Team schedule" } },
  { k: "organizacao", caminho: "/rh-exemplo/organizacao", grupo: "gestao", icone: Network, rotulo: { pt: "Organização", en: "Organisation" } },
  { k: "assiduidade", caminho: "/rh-exemplo/assiduidade-e-ausencias", grupo: "gestao", icone: CalendarRange, rotulo: { pt: "Assiduidade e ausências", en: "Attendance and absences" } },
  { k: "centros", caminho: "/rh-exemplo/centros", grupo: "gestao", icone: MapPin, rotulo: { pt: "Centros de trabalho", en: "Work centres" } },
  { k: "processamento", caminho: "/rh-exemplo/processamento-salarial", grupo: "gestao", icone: Receipt, rotulo: { pt: "Processamento salarial", en: "Payroll" } },
  { k: "modelos", caminho: "/rh-exemplo/documentos/modelos", grupo: "gestao", icone: FileText, rotulo: { pt: "Modelos de documentos", en: "Document templates" } },
  { k: "custos", caminho: "/rh-exemplo/custos", grupo: "gestao", icone: Coins, rotulo: { pt: "Custos", en: "Costs" } },
  { k: "denuncias", caminho: "/rh-exemplo/denuncias", grupo: "gestao", icone: ShieldAlert, rotulo: { pt: "Denúncias", en: "Reports" } },
  { k: "verComoPessoa", caminho: "/rh-exemplo/admissao", grupo: "gestao", icone: Eye, exato: true, rotulo: { pt: "Ver como pessoa", en: "View as employee" } },
  { k: "documentos", caminho: "/rh-exemplo/documentos", grupo: "eu", icone: FolderOpen, exato: true, rotulo: { pt: "Os meus documentos", en: "My documents" } },
  { k: "ausencias", caminho: "/rh-exemplo/ausencias", grupo: "eu", icone: CalendarDays, rotulo: { pt: "As minhas ausências", en: "My absences" } },
  { k: "ponto", caminho: "/rh-exemplo/assiduidade", grupo: "eu", icone: Clock, exato: true, rotulo: { pt: "O meu ponto", en: "My attendance" } },
  { k: "minhasDenuncias", caminho: "/rh-exemplo/minhas-denuncias", grupo: "eu", icone: Megaphone, rotulo: { pt: "As minhas denúncias", en: "My reports" } },
];

export const CAMINHO_DE: Record<AbaRh, string> = Object.fromEntries(ABAS_RH.map((a) => [a.k, a.caminho])) as Record<AbaRh, string>;

/** A língua da interface (a mesma que o resto da aplicação guarda); o protótipo só fala português e inglês. */
export function idioma(): Idioma {
  try { return localStorage.getItem("language") === "en" ? "en" : "pt"; } catch { return "pt"; }
}

/** A aba a que um caminho do router interno pertence; undefined quando não é de nenhuma (configurações, convites): o menu fica onde está. */
export function abaDeCaminho(pathname: string): AbaRh | undefined {
  const limpo = pathname.replace(/\/+$/, "");
  return ABAS_RH.find((a) => (a.exato ? limpo === a.caminho : limpo === a.caminho || limpo.startsWith(a.caminho + "/")))?.k;
}
