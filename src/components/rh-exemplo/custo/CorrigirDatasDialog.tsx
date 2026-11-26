/**
 * «Corrigir datas» (só com `ativos.edit`): a data de entrega e, numa linha já devolvida, a de devolução desta pessoa. Muda a quem pertence
 * cada mês do equipamento (o mês é de quem o tem no último dia, o da devolução incluído), por isso o aviso diz a quantas pessoas pode
 * mudar o custo em meses passados. Só vão para a base as datas que mudaram.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useEquipamentosCustoAcoes } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { useOcupacoesDoAtivo } from "@/hooks/hr/useEquipamentosLivres";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { correcaoDeDatas, type ErroCorrecao } from "./correcaoEquipamento";

interface Props {
  equipamento: EquipamentoPessoa | null;
  aoFechar: () => void;
}

function Formulario({ equipamento, ativoId, aoFechar }: { equipamento: EquipamentoPessoa; ativoId: string; aoFechar: () => void }) {
  const { t } = useTranslation();
  const { corrigir } = useEquipamentosCustoAcoes();
  const { pessoas } = useOcupacoesDoAtivo(ativoId, true);
  const [entrega, setEntrega] = useState(equipamento.entrega);
  const [devolucao, setDevolucao] = useState(equipamento.devolucao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const devolvido = equipamento.estado === "devolvido";

  const guardar = async () => {
    if (aGuardar) return;
    const { correcao, erro: local } = correcaoDeDatas(equipamento, entrega, devolucao);
    if (!correcao) {
      setErro(local ? t(`rhCustos.eq.corrigir.erro.${local as ErroCorrecao}`) : null);
      return;
    }
    setAGuardar(true);
    try {
      const r = await corrigir(ativoId, correcao);
      if (r.ok) {
        aoFechar();
        return;
      }
      setErro(r.mensagem ?? (r.erro ? t(`rhCustos.eq.erro.${r.erro}`) : t("hr.custo.erro.generico")));
    } finally {
      setAGuardar(false);
    }
  };

  const aviso = pessoas === null ? "rhCustos.eq.corrigir.avisoGeral" : pessoas === 1 ? "rhCustos.eq.corrigir.aviso1" : "rhCustos.eq.corrigir.avisoN";
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <CampoTexto id="rhCustos-datas-entrega" label={t("rhCustos.eq.campoEntrega")} tipo="date" valor={entrega} onChange={setEntrega} obrigatorio />
      {devolvido && <CampoTexto id="rhCustos-datas-devolucao" label={t("rhCustos.eq.dataDevolucao")} tipo="date" valor={devolucao} onChange={setDevolucao} obrigatorio />}
      <p className="rounded-md bg-muted/50 p-3 text-xs leading-5">{t("rhCustos.eq.corrigir.regraDoMes")}</p>
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{t(aviso, { n: pessoas ?? 0 })}</p>
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhCustos.eq.corrigir.guardar")}</Button>
      </DialogFooter>
    </form>
  );
}

export function CorrigirDatasDialog({ equipamento, aoFechar }: Props) {
  const { t } = useTranslation();
  const aberto = equipamento !== null && !!equipamento.ativoId;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhCustos.eq.datas.titulo")}</DialogTitle>
          <DialogDescription>{equipamento ? `${equipamento.descricao}. ${t("rhCustos.eq.datas.ajuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {aberto && equipamento.ativoId && <Formulario key={equipamento.id} equipamento={equipamento} ativoId={equipamento.ativoId} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
