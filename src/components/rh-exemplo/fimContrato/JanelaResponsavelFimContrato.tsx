/**
 * A janela do responsável (fluxo 3): abre pelo sino e mostra os contratos a terminar da equipa dele. Por pessoa,
 * três botões: «Continuar», «Não continuar» e «Por decidir». O responsável só INDICA; nada se renova nem termina
 * aqui. A indicação fica guardada (com quando) e aparece ao RH no cartão «Fim do contrato».
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { atualizarFicha, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useContratosATerminar } from "@/components/rh-exemplo/hooks/useContratosATerminar";
import type { ContratoATerminar, RespostaIndicacao } from "@/components/rh-exemplo/lib/fimContrato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { OPCOES_INDICACAO, aplicarIndicacao, daEquipa, responsaveisDosContratos } from "./indicacaoResponsavel";

interface LinhaProps {
  contrato: ContratoATerminar;
  aoIndicar: (contrato: ContratoATerminar, resposta: RespostaIndicacao) => void;
}

function LinhaDaEquipa({ contrato, aoIndicar }: LinhaProps) {
  const { t } = useTranslation();
  const grupo = `indicacao-${contrato.vinculo_id}`;
  return (
    <li className="space-y-2 rounded-lg border p-3" aria-labelledby={grupo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={grupo} className="font-medium">{contrato.pessoa_nome}</p>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t("rhA.fimContrato.terminaEm", { data: contrato.data_fim, dias: contrato.dias_restantes })}
        </span>
      </div>
      <div role="group" aria-labelledby={grupo} className="flex flex-wrap gap-2">
        {OPCOES_INDICACAO.map(({ resposta, chave }) => {
          const escolhida = contrato.resposta === resposta;
          return (
            <Button
              key={resposta} type="button" variant={escolhida ? "default" : "outline"} aria-pressed={escolhida}
              onClick={() => aoIndicar(contrato, resposta)} className={cn("min-h-11 gap-2", FOCO)}
            >
              {escolhida && <span aria-hidden="true">✓</span>}
              {t(chave)}
            </Button>
          );
        })}
      </div>
      {contrato.resposta === null && <Badge variant="secondary" className="font-normal">{t("rhA.fimContrato.semIndicacao")}</Badge>}
    </li>
  );
}

export function JanelaResponsavelFimContrato({ open, onOpenChange }: { open: boolean; onOpenChange: (aberto: boolean) => void }) {
  const { t } = useTranslation();
  const fichas = useEstadoRh((e) => e.fichas);
  const { contratos } = useContratosATerminar(undefined, null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const responsaveis = responsaveisDosContratos(contratos, fichas);
  const responsavelId = escolhido && responsaveis.includes(escolhido) ? escolhido : (responsaveis[0] ?? null);
  const equipa = responsavelId ? daEquipa(contratos, fichas, responsavelId) : [];
  const nomeDe = (id: string) => fichas[id]?.pessoa.nome_completo ?? id;

  const indicar = (contrato: ContratoATerminar, resposta: RespostaIndicacao) => {
    atualizarFicha(contrato.pessoa_id, (ficha) => aplicarIndicacao(ficha, contrato.vinculo_id, resposta, new Date().toISOString()));
    setAviso(t("rhA.fimContrato.guardada", { nome: contrato.pessoa_nome, resposta: t(`hr.fimContrato.resposta.${resposta}`) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rhA.fimContrato.janelaTitulo")}</DialogTitle>
          <DialogDescription>{t("rhA.fimContrato.janelaAjuda")}</DialogDescription>
        </DialogHeader>

        {responsaveis.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="rhA-responsavel">{t("rhA.fimContrato.verComo")}</Label>
            <NativeSelect
              id="rhA-responsavel" value={responsavelId ?? ""} onValueChange={setEscolhido} className="min-h-11"
              options={responsaveis.map((id) => ({ value: id, label: nomeDe(id) }))}
            />
          </div>
        )}

        {equipa.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("rhA.fimContrato.equipaVazia")}</p>
        ) : (
          <ul className="space-y-3">
            {equipa.map((c) => <LinhaDaEquipa key={c.vinculo_id} contrato={c} aoIndicar={indicar} />)}
          </ul>
        )}

        <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium">{aviso}</p>
        <p className="text-xs text-muted-foreground">{t("rhA.fimContrato.soIndica")}</p>
      </DialogContent>
    </Dialog>
  );
}
