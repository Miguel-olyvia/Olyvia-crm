/**
 * «Desativar ativo»: a data e o motivo (abatido, vendido, perdido, outro) e uma nota opcional. Um ativo nunca se apaga: fica
 * desativado e deixa de depreciar nessa data. Se estiver atribuído a uma pessoa a base recusa (ATV17: «Devolva-o primeiro no RH»)
 * e o texto aparece aqui, traduzido.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useTranslation } from "@/hooks/useTranslation";
import { dataMaxima, hojeLocal } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";
import { LIMITES_ATIVO, MOTIVOS_DESATIVACAO, type Ativo } from "./lib/tipos";
import { dataValida } from "./lib/validarAtivo";

interface Props {
  ativo: Ativo | null;
  aoFechar: () => void;
  /** Depois de desativar: o nome do ativo (a página avisa). */
  aoDesativar?: (aviso: { nome: string }) => void;
}

function Formulario({ ativo, aoFechar, aoDesativar }: { ativo: Ativo; aoFechar: () => void; aoDesativar?: Props["aoDesativar"] }) {
  const { t } = useTranslation();
  const { desativar } = useAtivoMutacoes();
  const [data, setData] = useState(() => hojeLocal());
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [erroData, setErroData] = useState<string | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const ocupado = useRef(false);

  const confirmar = async () => {
    if (ocupado.current) return;
    const dataMa = !dataValida(data) || data < ativo.dataCompra;
    const semMotivo = motivo === "";
    const notaLonga = nota.trim().length > LIMITES_ATIVO.notaDesativacao;
    setErroData(dataMa ? t("ativos.desativar.valData") : null);
    setErroMotivo(semMotivo ? t("ativos.desativar.valMotivo") : null);
    setAviso(notaLonga ? t("ativos.val.notas") : null);
    if (dataMa || semMotivo || notaLonga) return;
    ocupado.current = true;
    setAGuardar(true);
    try {
      const r = await desativar(ativo.id, { data, motivo, nota: nota.trim() === "" ? null : nota.trim() });
      if (r.ok) {
        aoDesativar?.({ nome: ativo.nome });
        aoFechar();
      } else setAviso(r.mensagem);
    } finally {
      ocupado.current = false;
      setAGuardar(false);
    }
  };

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
      <CampoTexto id="ativo-des-data" label={t("ativos.desativar.data")} tipo="date" valor={data} onChange={setData} obrigatorio min={ativo.dataCompra} max={dataMaxima()} erro={erroData} />
      <CampoSelect
        id="ativo-des-motivo" label={t("ativos.desativar.motivo")} valor={motivo} onChange={setMotivo} obrigatorio erro={erroMotivo}
        vazioLabel={t("ativos.desativar.motivoEscolher")} opcoes={MOTIVOS_DESATIVACAO.map((x) => ({ value: x, label: t(`ativos.desativar.motivo.${x}`) }))}
      />
      <CampoTexto id="ativo-des-nota" label={t("ativos.desativar.nota")} valor={nota} onChange={setNota} />
      {aviso && <p role="alert" className="text-sm font-medium text-destructive">{aviso}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
        <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("ativos.desativar.confirmar")}</Button>
      </DialogFooter>
    </form>
  );
}

export function DesativarAtivoDialog({ ativo, aoFechar, aoDesativar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={ativo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ativos.desativar.titulo")}</DialogTitle>
          <DialogDescription>{ativo ? `${ativo.nome}. ${t("ativos.desativar.ajuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {ativo && <Formulario key={ativo.id} ativo={ativo} aoFechar={aoFechar} aoDesativar={aoDesativar} />}
      </DialogContent>
    </Dialog>
  );
}
