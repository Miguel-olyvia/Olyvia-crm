/**
 * Registar um valor avulso (fluxo 11): quilómetros, ajuda de custo ou equipamento. O valor sai da quantidade x valor unitário
 * (sugerido pela empresa e editável); o equipamento leva o valor de compra e a data de entrega e reparte-se por 36 meses.
 * Recusa descrição em branco e valor 0, com o motivo à vista. Uma data num mês já fechado conta no primeiro mês aberto.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { mesAbertoDoCusto, registarAvulso, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { equipamentoPorMes, mesDaData, type ErroAvulso } from "@/components/rh-exemplo/lib/custo";
import type { TipoAvulso } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { euros } from "./formato";

const TIPOS: readonly TipoAvulso[] = ["km", "ajuda", "equipamento"];
const numero = (texto: string): number => Number(texto.trim().replace(",", "."));

interface FormularioProps {
  pessoaId: string;
  autor: string;
  aoFechar: () => void;
}

interface Valores {
  tipo: TipoAvulso;
  data: string;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  devolucao: string;
}

interface CamposProps {
  v: Valores;
  aoMudar: (parcial: Partial<Valores>) => void;
  aoEscolherTipo: (tipo: string) => void;
}

function CamposAvulso({ v, aoMudar, aoEscolherTipo }: CamposProps) {
  const { t } = useTranslation();
  const { tipo } = v;
  const mesFechado = v.data !== "" && mesDaData(v.data) < mesAbertoDoCusto();
  return (
    <>
      <CampoSelect
        id="rhA-avulso-tipo" label={t("rhA.custo.tipo")} valor={tipo} onChange={aoEscolherTipo}
        opcoes={TIPOS.map((x) => ({ value: x, label: t(`rhA.custo.tipo.${x}`) }))}
      />
      <CampoTexto id="rhA-avulso-data" label={t(tipo === "equipamento" ? "rhA.custo.dataEntrega" : "rhA.custo.data")} tipo="date" valor={v.data} onChange={(data) => aoMudar({ data })} />
      {mesFechado && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{t("rhA.custo.mesFechadoAviso")}</p>}
      <CampoTexto id="rhA-avulso-descricao" label={t("rhA.custo.descricao")} valor={v.descricao} onChange={(descricao) => aoMudar({ descricao })} />
      {tipo !== "equipamento" && (
        <CampoTexto id="rhA-avulso-quantidade" label={t(tipo === "km" ? "rhA.custo.quilometros" : "rhA.custo.dias")} tipo="number" min={0} step="0.5" valor={v.quantidade} onChange={(quantidade) => aoMudar({ quantidade })} />
      )}
      <CampoTexto
        id="rhA-avulso-valor" label={t(tipo === "equipamento" ? "rhA.custo.valorCompra" : tipo === "km" ? "rhA.custo.valorPorKm" : "rhA.custo.valorPorDia")}
        tipo="number" min={0} step="0.01" valor={v.valorUnitario} onChange={(valorUnitario) => aoMudar({ valorUnitario })}
        ajuda={tipo === "ajuda" ? t("rhA.custo.valorUnicoAjuda") : undefined}
      />
      {tipo === "equipamento" && (
        <CampoTexto id="rhA-avulso-devolucao" label={t("rhA.custo.dataDevolucao")} tipo="date" valor={v.devolucao} onChange={(devolucao) => aoMudar({ devolucao })} ajuda={t("rhA.custo.devolucaoAjuda")} />
      )}
    </>
  );
}

function Formulario({ pessoaId, autor, aoFechar }: FormularioProps) {
  const { t } = useTranslation();
  const definicoes = useCusto((e) => e.definicoes);
  const [v, setV] = useState<Valores>({ tipo: "km", data: hojeIso(), descricao: "", quantidade: "", valorUnitario: String(definicoes.valorPorKm), devolucao: "" });
  const [erro, setErro] = useState<ErroAvulso | null>(null);
  const mudar = (parcial: Partial<Valores>) => setV((atual) => ({ ...atual, ...parcial }));

  const escolherTipo = (novo: string) => {
    const tipo = novo as TipoAvulso;
    setErro(null);
    if (tipo === "equipamento") mudar({ tipo, valorUnitario: "", quantidade: "1" });
    else mudar({ tipo, valorUnitario: String(tipo === "km" ? definicoes.valorPorKm : definicoes.ajudaPorDia) });
  };

  const unitario = numero(v.valorUnitario);
  const qtd = v.tipo === "equipamento" ? 1 : numero(v.quantidade);
  const previa = v.tipo === "equipamento" ? unitario : Math.round((qtd * unitario + Number.EPSILON) * 100) / 100;

  const guardar = () => {
    const { erro: recusa } = registarAvulso({
      pessoaId, tipo: v.tipo, data: v.data, descricao: v.descricao,
      quantidade: Number.isFinite(qtd) ? qtd : 0,
      valorUnitario: Number.isFinite(unitario) ? unitario : 0,
      devolucao: v.devolucao === "" ? null : v.devolucao,
      autor, podeProcessar: true,
    });
    setErro(recusa);
    if (!recusa) aoFechar();
  };

  const valido = Number.isFinite(unitario) && unitario > 0;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar(); }} noValidate>
      <CamposAvulso v={v} aoMudar={mudar} aoEscolherTipo={escolherTipo} />
      <p className="rounded-md bg-muted/50 p-3 text-sm tabular-nums" role="status">
        {v.tipo === "equipamento"
          ? t("rhA.custo.previaEquipamento", { mes: euros(valido ? equipamentoPorMes(unitario) : 0, "—") })
          : t("rhA.custo.previaValor", { valor: euros(Number.isFinite(previa) ? previa : 0, "—") })}
      </p>
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{t(`rhA.custo.erro.${erro}`)}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t("rhA.custo.registar")}</Button>
      </DialogFooter>
    </form>
  );
}

interface AvulsoDialogProps extends FormularioProps {
  open: boolean;
}

export function AvulsoDialog({ open, pessoaId, autor, aoFechar }: AvulsoDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhA.custo.registarTitulo")}</DialogTitle>
          <DialogDescription>{t("rhA.custo.registarAjuda")}</DialogDescription>
        </DialogHeader>
        <Formulario pessoaId={pessoaId} autor={autor} aoFechar={aoFechar} />
      </DialogContent>
    </Dialog>
  );
}
