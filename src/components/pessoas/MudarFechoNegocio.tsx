// O botão «Mudar o tipo de fecho» do detalhe de um negócio, com o seu diálogo. Só na ficha real, com permissão de editar, com o negócio ABERTO
// (a base recusa a mudança num negócio ganho ou perdido: NG022) e com o tipo conhecido (sem ele não se sabe para onde mudar).
// Um diálogo já aberto não se desmonta quando a ficha se refaz e o negócio deixa de estar aberto (um NG022 por isso mesmo): fica com a sua
// mensagem até se fechar, e o foco passa então para um sítio estável (`aoSemBotao`, o título do detalhe), porque o botão já não existe.
import { useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { MudarFechoDialogo } from "./MudarFechoDialogo";

interface MudarFechoNegocioProps {
  negocio: NegocioMes;
  /** Ao fechar o diálogo quando o botão que o abriu já não existe: leva o foco para um sítio estável. */
  aoSemBotao?: () => void;
}

export function MudarFechoNegocio({ negocio, aoSemBotao }: MudarFechoNegocioProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  if (dados?.podeEditar !== true || !mutacoes?.mudarFecho || !negocio.fecho) return null;
  const aberturaPossivel = negocio.estadoReal === "aberto";
  if (!aberturaPossivel && !aberto) return null;
  // O botão que abriu o diálogo continua aí (o rótulo não muda): o foco volta-lhe ao fechar, também depois de gravar.
  const fechar = () => {
    setAberto(false);
    setTimeout(() => (botao.current ? botao.current.focus() : aoSemBotao?.()), 0);
  };
  return (
    <>
      {aberturaPossivel && (
        <Button ref={botao} type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setAberto(true)}>
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          {t("pessoasPagina.neg.fecho.change.button")}
        </Button>
      )}
      <MudarFechoDialogo negocio={aberto ? negocio : null} aoFechar={fechar} aoConcluido={avisar} />
    </>
  );
}
