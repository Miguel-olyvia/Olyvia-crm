// 9/11: o endereço que abre um negócio na página dos Negócios (o Estúdio e o indicador da gravação voltam a ele sem recarregar a app).
export const urlDoNegocio = (id: number) => `/negocios?negocio=${id}`;

/** Ir para outra página da app sem a recarregar (a gravação da visita continua). Sem precisar do router: o BrowserRouter ouve o
 *  «popstate» e mostra a página nova. */
export function irPara(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
