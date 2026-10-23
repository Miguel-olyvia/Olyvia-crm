/**
 * «Alterar como conta»: muda o «Como conta» de um equipamento ou de um valor avulso já registado. O valor, a data de entrega
 * (ou da data) e a devolução não mudam; só a forma de contar, e a alteração vale logo para todos os meses. Só memória.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { alterarContaAvulso, alterarContaEquipamento } from "@/components/rh-exemplo/dados/lojaCusto";
import type { ErroConta } from "@/components/rh-exemplo/lib/comoConta";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ComoContaCampos } from "./ComoContaCampos";
import { contaDaEscolha, escolhaDe, type EscolhaConta } from "./escolhaConta";

export type AlvoConta = { tipo: "equipamento"; item: EquipamentoPessoa } | { tipo: "avulso"; item: AvulsoCusto };

interface Props {
  alvo: AlvoConta | null;
  aoFechar: () => void;
}

const dataDe = (a: AlvoConta): string => (a.tipo === "equipamento" ? a.item.entrega : a.item.data);

function Formulario({ alvo, aoFechar }: { alvo: AlvoConta; aoFechar: () => void }) {
  const { t } = useTranslation();
  const [escolha, setEscolha] = useState<EscolhaConta>(() => escolhaDe(alvo.item.conta.modo, alvo.item.conta));
  const [erro, setErro] = useState<ErroConta | null>(null);
  const guardar = () => {
    const conta = contaDaEscolha(escolha, dataDe(alvo));
    const { erro: recusa } = alvo.tipo === "equipamento" ? alterarContaEquipamento(alvo.item.id, conta) : alterarContaAvulso(alvo.item.id, conta);
    setErro(recusa);
    if (!recusa) aoFechar();
  };
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <ComoContaCampos
        idBase="rhCustos-editar-conta" escolha={escolha} aoMudar={(p) => setEscolha((e) => ({ ...e, ...p }))}
        valor={alvo.item.valor} data={dataDe(alvo)} comDevolucao={alvo.tipo === "equipamento"} erro={erro}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t("rhCustos.conta.guardar")}</Button>
      </DialogFooter>
    </form>
  );
}

export function EditarContaDialog({ alvo, aoFechar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={alvo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhCustos.conta.editar")}</DialogTitle>
          <DialogDescription>{alvo ? `${alvo.item.descricao}. ${t("rhCustos.conta.editarAjuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {alvo && <Formulario key={alvo.item.id} alvo={alvo} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
