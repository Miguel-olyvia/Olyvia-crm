/**
 * O termo de ENTREGA ou de DEVOLUÇÃO de um equipamento (um ativo atribuído a esta pessoa). Escolhe-se o momento e um modelo do tipo
 * recibo (ativo e sem variáveis de retribuição: a base recusa os outros com ATV37) e emite-se o documento do RH, que fica «a aguardar
 * assinatura». NÃO envia nada ao colaborador (sem SMS): o envio faz-se no RH, a partir da ligação ao documento. A devolução só se oferece
 * numa linha já devolvida (a base diz ATV36 se não). Quem pode emitir e o resto das regras decidem-se na base; aqui só se apresenta.
 */
import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useModelosDocumentosRH } from "@/components/rh-exemplo/hooks/useModelosDocumentosRH";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { useTermoAtivo, type MomentoTermo, type TermoEmitido } from "@/hooks/ativos/useTermoAtivo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Um modelo com variáveis de retribuição não serve para um termo de ativo (a base recusa-o com ATV37). */
const TEM_RETRIBUICAO = /\{\{\s*retribuicao_/i;

interface Props {
  equipamento: EquipamentoPessoa | null;
  /** A pessoa da ficha (para a ligação ao documento no RH). */
  pessoaId: string;
  aoFechar: () => void;
}

function Formulario({ equipamento, pessoaId, aoFechar }: { equipamento: EquipamentoPessoa; pessoaId: string; aoFechar: () => void }) {
  const { t } = useTranslation();
  const { emitir, aEmitir } = useTermoAtivo();
  const { modelos, isLoading, error } = useModelosDocumentosRH();
  const [momento, setMomento] = useState<MomentoTermo>("entrega");
  const [modeloId, setModeloId] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<TermoEmitido | null>(null);

  const devolvido = equipamento.estado === "devolvido";
  const validos = modelos.filter((m) => m.activo && m.tipo === "recibo" && !TEM_RETRIBUICAO.test(m.corpo_html ?? ""));

  const confirmar = async () => {
    if (aEmitir || modeloId === "") return;
    setMensagem(null);
    const r = await emitir(equipamento.id, momento, modeloId);
    if (r.ok && r.termo) setEmitido(r.termo);
    else setMensagem(r.mensagem ?? null);
  };

  if (emitido) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
          <FileCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-success" />
          <div className="space-y-1">
            <p className="font-semibold">{t("ativos.termo.emitido")}</p>
            {emitido.titulo && <p className="text-muted-foreground">{emitido.titulo}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button asChild variant="outline" className={cn("min-h-11", FOCO)}>
            <Link to={`/rh-exemplo/pessoas/${pessoaId}?tab=documentos`}>{t("ativos.termo.verDocumento")}</Link>
          </Button>
          <Button type="button" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.termo.fechar")}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
      <div className="space-y-1.5">
        <Label htmlFor="termo-momento">{t("ativos.termo.momento")}</Label>
        <NativeSelect
          id="termo-momento" value={momento} className={cn("h-11", FOCO)} aria-describedby={devolvido ? undefined : "termo-momento-ajuda"}
          onValueChange={(v) => setMomento(v === "devolucao" ? "devolucao" : "entrega")}
          options={[
            { value: "entrega", label: t("ativos.termo.momento.entrega") },
            { value: "devolucao", label: t("ativos.termo.momento.devolucao"), disabled: !devolvido },
          ]}
        />
        {!devolvido && <p id="termo-momento-ajuda" className="text-xs text-muted-foreground">{t("ativos.termo.soDevolvido")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="termo-modelo">{t("ativos.termo.modelo")}</Label>
        <NativeSelect
          id="termo-modelo" value={modeloId} className={cn("h-11", FOCO)} placeholder={t("ativos.termo.modeloEscolher")}
          disabled={isLoading || validos.length === 0} onValueChange={setModeloId}
          options={validos.map((m) => ({ value: m.id, label: m.nome }))}
        />
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">{t("ativos.termo.modelosErro")}</p>
        ) : !isLoading && validos.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("ativos.termo.semModelos")}</p>
        )}
      </div>
      {mensagem && <p role="alert" className="text-sm font-medium text-destructive">{mensagem}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={aEmitir || modeloId === ""} className={cn("min-h-11", FOCO)}>
          {aEmitir ? t("ativos.termo.aEmitir") : t("ativos.termo.emitir")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TermoEquipamentoDialog({ equipamento, pessoaId, aoFechar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={equipamento !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ativos.termo.titulo")}</DialogTitle>
          <DialogDescription>
            {equipamento ? `${equipamento.descricao}${equipamento.ativo?.codigo ? ` (${equipamento.ativo.codigo})` : ""}. ${t("ativos.termo.ajuda")}` : ""}
          </DialogDescription>
        </DialogHeader>
        {equipamento && <Formulario key={equipamento.id} equipamento={equipamento} pessoaId={pessoaId} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
