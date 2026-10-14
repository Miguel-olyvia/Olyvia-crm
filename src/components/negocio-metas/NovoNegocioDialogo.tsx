import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormularioNovoNegocio } from "./FormularioNovoNegocio";
import { FOCO } from "./estilos";
import type { DadosCriarNegocio, PessoaOpcao } from "./novoNegocio";

interface NovoNegocioDialogoProps {
  /** As pessoas a escolher; a página monta a lista (esta pasta não importa de Pessoas). */
  pessoas: readonly PessoaOpcao[];
  /** Chamado ao confirmar, já com o diálogo a fechar. */
  aoCriar: (dados: DadosCriarNegocio) => void;
}

/**
 * O botão "Novo negócio" (a única ação principal da página) e o diálogo com o formulário. Ao abrir, o foco vai para o
 * primeiro campo; Esc ou Cancelar fecham e devolvem o foco ao botão. Ao criar, o foco não volta ao botão: quem cria
 * abre o painel do novo negócio e leva lá o foco. Só exemplo: nada é gravado.
 */
export function NovoNegocioDialogo({ pessoas, aoCriar }: NovoNegocioDialogoProps) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const primeiroCampo = useRef<HTMLButtonElement>(null);
  const criou = useRef(false);

  const confirmar = (dados: DadosCriarNegocio) => {
    criou.current = true;
    setAberto(false);
    aoCriar(dados);
  };

  return (
    <>
      <Button ref={botao} type="button" onClick={() => setAberto(true)} className={`min-h-11 ${FOCO}`}>
        <Plus aria-hidden="true" />
        {t("businessGoals.new.open")}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent
          hideClose
          onOpenAutoFocus={(e) => { e.preventDefault(); primeiroCampo.current?.focus(); }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!criou.current) botao.current?.focus();
            criou.current = false;
          }}
          className="max-w-md motion-reduce:!animate-none motion-reduce:!duration-0"
        >
          <DialogHeader>
            <DialogTitle>{t("businessGoals.new.title")}</DialogTitle>
            <DialogDescription>{t("businessGoals.new.description")}</DialogDescription>
          </DialogHeader>
          <FormularioNovoNegocio pessoas={pessoas} primeiroCampo={primeiroCampo} aoConfirmar={confirmar} />
        </DialogContent>
      </Dialog>
    </>
  );
}
