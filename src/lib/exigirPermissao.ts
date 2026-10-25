// A guarda das gravações feitas a partir do guia do negócio: o botão desativado não basta (uma guarda no ecrã não é uma guarda), por isso a própria
// função de gravação recusa quando a sessão não tem o código que a página de origem exige.
// Falha FECHADA: sem lista de permissões (`undefined`: a página ainda não a leu, ou a leitura falhou) a gravação recusa-se também. Quem chama tem de
// esperar pela lista; a base continua a ser a última guarda, mas não é a única.

/** Lança com uma razão legível quando a lista de permissões é desconhecida ou não inclui `codigo`. */
export function exigirPermissao(permissoes: readonly string[] | undefined, codigo: string, acao: string): void {
  if (permissoes === undefined) throw new Error(`Não foi possível confirmar as suas permissões para ${acao}: aguarde que carreguem ou recarregue a página.`);
  if (!permissoes.includes(codigo)) throw new Error(`Sem permissão para ${acao} (${codigo}).`);
}
