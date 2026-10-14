// O endereço da lista de pessoas de RH com (ou sem) a ficha aberta: "/…/pessoas" e "/…/pessoas/:id". Abrir, passar à
// seguinte ou fechar a ficha atualiza o endereço sem mudar de página (a lista e a pesquisa ficam como estão), e quem abre a
// ligação direta recebe a lista com a ficha aberta. Função pura.

const PADRAO = /^(.*\/pessoas)(?:\/[^/]+)?\/?$/;

/** O caminho com a ficha de `id` aberta (ou fechada, com `null`); um caminho que não é o da lista fica como está. */
export function caminhoDaFicha(caminho: string, id: string | null): string {
  const encontrado = PADRAO.exec(caminho);
  if (!encontrado) return caminho;
  return id === null ? encontrado[1] : `${encontrado[1]}/${encodeURIComponent(id)}`;
}
