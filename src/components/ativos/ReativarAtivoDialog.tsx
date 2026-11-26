/**
 * «Reativar ativo»: pede confirmação antes, porque reativar apaga a data de desativação e a quota (do comprado) ou a renda (do alugado)
 * voltam a contar nos meses desde então, também nos meses passados, e isso muda o custo de quem teve o equipamento. Um erro da base
 * (por exemplo ATV30: o armazém já tem outro ativo vivo) aparece aqui, traduzido, e o diálogo fica aberto.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvisoAtivo } from "./AvisoAtivo";
import type { Ativo } from "./lib/tipos";

interface Props {
  ativo: Ativo | null;
  aoFechar: () => void;
  /** Ao fechar, devolve o foco a quem abriu (a página guarda a origem). */
  aoFecharFoco?: (e: Event) => void;
  /** Depois de reativar: o nome do ativo e se a base avisou que o passado muda (a página diz-o). */
  aoReativar?: (r: { nome: string; aviso: boolean }) => void;
}

function Conteudo({ ativo, aoFechar, aoReativar }: { ativo: Ativo; aoFechar: () => void; aoReativar?: Props["aoReativar"] }) {
  const { t } = useTranslation();
  const { reativar } = useAtivoMutacoes();
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const ocupado = useRef(false);

  const confirmar = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    setAGuardar(true);
    setErro(null);
    try {
      const r = await reativar(ativo.id);
      if (r.ok) {
        aoReativar?.({ nome: ativo.nome, aviso: r.aviso === true });
        aoFechar();
      } else setErro(r.mensagem ?? "");
    } finally {
      ocupado.current = false;
      setAGuardar(false);
    }
  };

  return (
    <>
      <AvisoAtivo tom="aviso" role="note" data-testid="reativar-aviso">{t("ativos.reativar.aviso")}</AvisoAtivo>
      {erro && <AvisoAtivo tom="erro" role="alert">{erro}</AvisoAtivo>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
        <Button type="button" disabled={aGuardar} onClick={() => void confirmar()} className={cn("min-h-11", FOCO)}>{t("ativos.reativar.confirmar")}</Button>
      </DialogFooter>
    </>
  );
}

export function ReativarAtivoDialog({ ativo, aoFechar, aoFecharFoco, aoReativar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={ativo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={aoFecharFoco}>
        <DialogHeader>
          <DialogTitle>{ativo ? t("ativos.reativar.titulo", { nome: ativo.nome }) : ""}</DialogTitle>
          <DialogDescription>{ativo ? t("ativos.reativar.descricao", { codigo: ativo.codigo ?? ativo.nome }) : ""}</DialogDescription>
        </DialogHeader>
        {ativo && <Conteudo key={ativo.id} ativo={ativo} aoFechar={aoFechar} aoReativar={aoReativar} />}
      </DialogContent>
    </Dialog>
  );
}
