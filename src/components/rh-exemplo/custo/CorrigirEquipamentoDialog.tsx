/**
 * «Corrigir equipamento» (só com `ativos.edit`, nunca com a permissão das retribuições do RH): corrige o nome, o valor, a vida e a data de
 * compra de um equipamento comprado, ou a renda e as datas do contrato de um alugado. Corrigir muda o custo das pessoas em meses
 * passados: o aviso diz a quantas, ANTES de confirmar. Só vão para a base os campos que mudaram.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useEquipamentosCustoAcoes } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { useOcupacoesDoAtivo } from "@/hooks/hr/useEquipamentosLivres";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { correcaoDoFormulario, formularioDaCorrecao, type ErroCorrecao, type FormularioCorrecao } from "./correcaoEquipamento";

interface Props {
  equipamento: EquipamentoPessoa | null;
  aoFechar: () => void;
}

/** O aviso de quantas pessoas muda (lido do ativo antes de confirmar); sem o número, o aviso geral. */
function AvisoDePessoas({ ativoId }: { ativoId: string }) {
  const { t } = useTranslation();
  const { pessoas } = useOcupacoesDoAtivo(ativoId, true);
  const chave = pessoas === null ? "rhCustos.eq.corrigir.avisoGeral" : pessoas === 1 ? "rhCustos.eq.corrigir.aviso1" : "rhCustos.eq.corrigir.avisoN";
  return <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{t(chave, { n: pessoas ?? 0 })}</p>;
}

function Formulario({ ativo, ativoId, aoFechar }: { ativo: AtivoDoEquipamento; ativoId: string; aoFechar: () => void }) {
  const { t } = useTranslation();
  const { corrigir } = useEquipamentosCustoAcoes();
  const [f, setF] = useState<FormularioCorrecao>(() => formularioDaCorrecao(ativo));
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const mudar = (p: Partial<FormularioCorrecao>) => setF((x) => ({ ...x, ...p }));

  const guardar = async () => {
    if (aGuardar) return;
    const { correcao, erro: local } = correcaoDoFormulario(ativo, f);
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

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <CampoTexto id="rhCustos-corr-nome" label={t("rhCustos.eq.descricao")} valor={f.nome} onChange={(nome) => mudar({ nome })} obrigatorio />
      {ativo.forma === "comprado" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto id="rhCustos-corr-compra" label={t("rhCustos.eq.campoValor")} tipo="number" min={0} step="0.01" valor={f.valorCompra} onChange={(valorCompra) => mudar({ valorCompra })} obrigatorio />
            <CampoTexto id="rhCustos-corr-residual" label={t("rhCustos.eq.corrigir.residual")} tipo="number" min={0} step="0.01" valor={f.valorResidual} onChange={(valorResidual) => mudar({ valorResidual })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto id="rhCustos-corr-data" label={t("rhCustos.eq.dataCompraObrigatoria")} tipo="date" valor={f.dataCompra} onChange={(dataCompra) => mudar({ dataCompra })} obrigatorio />
            <CampoTexto id="rhCustos-corr-vida" label={t("rhCustos.eq.vida.mesesManual")} tipo="number" min={1} max={600} step="1" valor={f.vidaMeses} onChange={(vidaMeses) => mudar({ vidaMeses })} obrigatorio />
          </div>
        </>
      ) : (
        <>
          <CampoTexto id="rhCustos-corr-renda" label={t("rhCustos.eq.campoRenda")} tipo="number" min={0} step="0.01" valor={f.rendaMensal} onChange={(rendaMensal) => mudar({ rendaMensal })} obrigatorio />
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto id="rhCustos-corr-inicio" label={t("rhCustos.eq.inicioAluguer")} tipo="date" valor={f.inicioAluguer} onChange={(inicioAluguer) => mudar({ inicioAluguer })} obrigatorio />
            <CampoTexto id="rhCustos-corr-fim" label={t("rhCustos.eq.fimAluguer")} tipo="date" valor={f.fimAluguer} onChange={(fimAluguer) => mudar({ fimAluguer })} ajuda={t("rhCustos.eq.fimAluguerAjuda")} />
          </div>
        </>
      )}
      <AvisoDePessoas ativoId={ativoId} />
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhCustos.eq.corrigir.guardar")}</Button>
      </DialogFooter>
    </form>
  );
}

export function CorrigirEquipamentoDialog({ equipamento, aoFechar }: Props) {
  const { t } = useTranslation();
  const ativo = equipamento?.ativo ?? null;
  const aberto = equipamento !== null && ativo !== null && !!equipamento.ativoId;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhCustos.eq.corrigir.titulo")}</DialogTitle>
          <DialogDescription>{equipamento ? `${equipamento.descricao}. ${t("rhCustos.eq.corrigir.ajuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {aberto && equipamento.ativoId && ativo && <Formulario key={equipamento.id} ativo={ativo} ativoId={equipamento.ativoId} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
