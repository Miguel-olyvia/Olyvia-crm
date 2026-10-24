// O asterisco dos campos obrigatórios, como no resto do projeto (vermelho, só visual): o leitor de ecrã diz "obrigatório" pelo
// `aria-required` do campo, por isso o asterisco fica escondido dele e FORA da etiqueta (não entra no texto nem no nome do campo).
export function MarcaObrigatorio() {
  return <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>;
}
