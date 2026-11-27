// 27/11 (Rúben: «nas equipas permitir criar novos perfis, que gera novas contas logo, porque podemos ter subcontratados»): a ficha
// «Nova pessoa» do RH aberta no Estúdio da obra. Cria a pessoa (usePessoas) e, com «Criar e enviar convite», manda-lhe o convite para
// criar a conta. Para entrar nas equipas e nas tarefas, a ficha leva o cargo de técnico de obra e o ofício (como na área Pessoas).
import { useMemo } from "react";
import { NovaPessoaDialogo } from "@/components/hr/NovaPessoaDialogo";
import { usePessoas } from "@/hooks/usePessoas";
import { toast } from "@/lib/toast";

export default function NovaPessoaNaObra({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const { pessoas, criarPessoa } = usePessoas();
  const colegas = useMemo(() => pessoas.map((p) => ({ id: p.id, nome_completo: p.nome_completo })), [pessoas]);
  return (
    <NovaPessoaDialogo open={aberto} onOpenChange={(v) => { if (!v) fechar(); }} colegas={colegas} onCriar={criarPessoa}
      onCriada={() => {
        toast.success("Pessoa criada", { description: "Entra nas equipas e nas tarefas quando a ficha tiver o cargo de técnico de obra e o ofício. Recarregue o Estúdio para a ver." });
        fechar();
      }} />
  );
}
