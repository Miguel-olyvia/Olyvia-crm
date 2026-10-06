import { etiquetaServico, separarNome } from "../domain/nomesTarefas";

/**
 * O nome de uma tarefa sem o nome do serviço à frente ("<serviço>: <passo>"
 * → o passo, com o serviço numa linha pequena por baixo). O nome completo
 * fica no `title`.
 */
export default function NomeTarefa({ nome, className }: { nome: string; className?: string }) {
  const { prefixo, resto } = separarNome(nome);
  return (
    <>
      <p className={className} title={nome}>
        {prefixo ? resto : nome}
      </p>
      {prefixo && <p className="truncate text-[11px] text-slate-400">{etiquetaServico(prefixo, 60)}</p>}
    </>
  );
}
