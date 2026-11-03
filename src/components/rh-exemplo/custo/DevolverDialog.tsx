/**
 * «Devolver» um equipamento: a data e o estado em que volta. Conta ATÉ AO MÊS DA DEVOLUÇÃO, inclusive, e deixa de contar
 * nos meses seguintes; fica na lista como devolvido, com a data e o estado. Grava na base.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeLocal } from "@/components/rh-exemplo/hooks/dataLocal";
import { useEquipamentosCustoAcoes } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { ESTADOS_DEVOLUCAO, type EquipamentoPessoa, type ErroDevolucao } from "@/components/rh-exemplo/lib/equipamentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface Props {
  equipamento: EquipamentoPessoa | null;
  aoFechar: () => void;
}

function Formulario({ equipamento, aoFechar }: { equipamento: EquipamentoPessoa; aoFechar: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState(hojeLocal());
  const [estado, setEstado] = useState("");
  const [erro, setErro] = useState<ErroDevolucao | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const { devolver } = useEquipamentosCustoAcoes();
  const confirmar = async () => {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const resultado = await devolver(equipamento, data, estado);
      setErro(resultado.erro as ErroDevolucao | null);
      setMensagem(resultado.mensagem);
      if (resultado.ok) aoFechar();
    } finally {
      setAGuardar(false);
    }
  };
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
      <CampoTexto id="rhCustos-dev-data" label={t("rhCustos.eq.dataDevolucao")} tipo="date" valor={data} onChange={setData} obrigatorio />
      <CampoSelect
        id="rhCustos-dev-estado" label={t("rhCustos.eq.estadoDevolucao")} valor={estado} onChange={setEstado} obrigatorio
        placeholder={t("rhCustos.eq.estadoDevolucao")}
        opcoes={ESTADOS_DEVOLUCAO.map((x) => ({ value: x, label: t(`rhCustos.eq.estadoDevolucao.${x}`) }))}
      />
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{t(`rhCustos.eq.erroDevolucao.${erro}`)}</p>}
      {mensagem && <p role="alert" className="text-sm font-medium text-destructive">{mensagem}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhCustos.eq.confirmarDevolver")}</Button>
      </DialogFooter>
    </form>
  );
}

export function DevolverDialog({ equipamento, aoFechar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={equipamento !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhCustos.eq.devolverTitulo")}</DialogTitle>
          <DialogDescription>{equipamento ? `${equipamento.descricao}. ${t("rhCustos.eq.devolverAjuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {equipamento && <Formulario key={equipamento.id} equipamento={equipamento} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
