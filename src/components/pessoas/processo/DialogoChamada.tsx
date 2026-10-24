// "Registar a chamada" a partir do "A fazer": o mesmo `FormChamada` da ficha (resultado, nota, próximo passo), num diálogo
// montado uma vez ao nível da página. O contacto é da pessoa (não há pedidos). O formulário não depende da ficha (só de `registarChamada`), por isso reaproveita-se
// tal e qual, sem o "← Voltar" (que só faz sentido na vista da ficha): fica o "Cancelar".
import { useId, useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { FormChamada } from "../FormChamada";
import type { AcoesFicha } from "../PainelBase";
import type { PassoChamada, ResumoPessoa } from "../pessoasTipos";

interface DialogoChamadaProps {
  /** A pessoa a quem se regista a chamada; `null` com o diálogo fechado. */
  resumo: ResumoPessoa | null;
  hoje: string;
  acoes: AcoesFicha;
  aoFechar: () => void;
  /**
   * Depois de guardar: a pessoa a quem se registou a chamada (o aviso fala do que mudou), a frase que o formulário escreveu
   * (a visita marcada, a chamada agendada, a perdida) e o próximo passo escolhido.
   */
  aoConcluir: (pessoaId: string, mensagem: string, passo?: PassoChamada) => void;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function DialogoChamada({ resumo, hoje, acoes, aoFechar, aoConcluir, aoDevolverFoco }: DialogoChamadaProps) {
  const { t } = useTranslation();
  const id = useId();
  // Enquanto o diálogo sai, continua a mostrar a última pessoa (o formulário não se remonta a meio da saída).
  const ultimo = useRef(resumo);
  if (resumo) ultimo.current = resumo;
  const mostrado = resumo ?? ultimo.current;
  const idTitulo = `${id}-titulo`;
  return (
    <Dialog open={resumo !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      {/* O diálogo chama-se pelo título visível do formulário (o h3): um segundo título só para leitores de ecrã repetia-o. */}
      <DialogContent
        hideClose aria-labelledby={idTitulo} className="max-w-xl gap-0 p-0 motion-reduce:!animate-none"
        onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}
      >
        <DialogDescription className="sr-only">{t("pessoasPagina.call.subtitle", { name: mostrado?.pessoa.nome ?? "" })}</DialogDescription>
        {mostrado && (
          <FormChamada
            key={mostrado.pessoa.id} id={`${id}-chamada`} idTitulo={idTitulo} pessoa={mostrado.pessoa} resumo={mostrado}
            hoje={hoje} acoes={acoes} semVoltar
            aoFechar={aoFechar} aoConcluir={(mensagem, passo) => { aoConcluir(mostrado.pessoa.id, mensagem, passo); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
