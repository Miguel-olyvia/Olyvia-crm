/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe (abriu por ?open=, ou a ficha fechou-se a si própria), o separador ativo ou o título da página. */
export function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return document.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? titulo;
}
