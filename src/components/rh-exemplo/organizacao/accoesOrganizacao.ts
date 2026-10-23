/** As ações da página sobre o store em memória: guardar (ligar ou alterar, conforme a pessoa já esteja ligada) e desligar. */
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { alterar, desligar, ligar } from "@/components/rh-exemplo/organizacao/acoes";
import { definirOrganizacao, ESTRUTURA_ORGANIZACAO, lerOrganizacao } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import type { PedidoLigacao, Resultado, TipoEvento } from "@/components/rh-exemplo/organizacao/tipos";

function aplicar(r: Resultado): Resultado {
  if (r.ok) definirOrganizacao(r.estado);
  return r;
}

/** Guarda a ligação; devolve também se foi uma ligação nova ou uma alteração. */
export function guardarLigacao(p: PedidoLigacao): Resultado & { tipo: TipoEvento } {
  const estado = lerOrganizacao();
  const jaLigada = estado.ligacoes.some((l) => l.pessoaId === p.pessoaId);
  const tipo: TipoEvento = jaLigada ? "alterar" : "ligar";
  const r = aplicar((jaLigada ? alterar : ligar)(estado, ESTRUTURA_ORGANIZACAO, p));
  return { ...r, tipo };
}

export function desligarPessoa(pessoaId: string, motivo: string): Resultado {
  return aplicar(desligar(lerOrganizacao(), pessoaId, motivo, hojeIso()));
}
