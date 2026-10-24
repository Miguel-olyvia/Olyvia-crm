// O distrito de cada pessoa: deriva-se da localidade (o concelho), com um mapa fixo. Função pura; nada aqui muda o Estado.

/** O mapa fixo de concelho para distrito (os concelhos que a demonstração usa e alguns vizinhos). */
const DISTRITO_DE_CONCELHO: Readonly<Record<string, string>> = {
  Lisboa: "Lisboa", Sintra: "Lisboa", Amadora: "Lisboa", Loures: "Lisboa", Cascais: "Lisboa", Oeiras: "Lisboa", Odivelas: "Lisboa", Mafra: "Lisboa",
  "Vila Franca de Xira": "Lisboa",
  Setúbal: "Setúbal", Barreiro: "Setúbal", Almada: "Setúbal", Seixal: "Setúbal", Montijo: "Setúbal", Palmela: "Setúbal", Sesimbra: "Setúbal",
  Porto: "Porto", "Vila Nova de Gaia": "Porto", Matosinhos: "Porto", Maia: "Porto", Gondomar: "Porto", Valongo: "Porto",
  Braga: "Braga", Guimarães: "Braga", Barcelos: "Braga",
  Faro: "Faro", Albufeira: "Faro", Loulé: "Faro", Portimão: "Faro", Lagos: "Faro",
  Coimbra: "Coimbra", Figueira: "Coimbra",
};

const semAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const POR_NOME: ReadonlyMap<string, string> = new Map(Object.entries(DISTRITO_DE_CONCELHO).map(([c, d]) => [semAcentos(c), d]));

/** O distrito de uma localidade; `null` quando não está no mapa (ou não há localidade). */
export function distritoDe(localidade: string): string | null {
  return POR_NOME.get(semAcentos(localidade)) ?? null;
}

/** O texto do distrito para mostrar: o distrito, ou "Por indicar". */
export const distritoTexto = (localidade: string): string => distritoDe(localidade) ?? "Por indicar";
