/**
 * "Alterar salario" de um cargo (fluxo 2): o gesto que muda o salario de TODAS as
 * pessoas com o cargo de uma vez. Por isso e perigoso (`hr.cargos.salario.alterar`,
 * decidido pelo Miguel) e o dialogo AVISA antes de confirmar:
 *
 *  - "Afecta pelo menos N pessoas com este cargo" (N conta as fichas com este
 *    `cargo_id` da lista recebida, que pode estar filtrada: o numero real so a
 *    RPC o sabe, e chega no aviso de sucesso);
 *  - "de X para Y", a partir do salario do cargo NA DATA escolhida;
 *  - "Corrige a subida agendada para D" quando a data e a de uma subida que ja
 *    estava marcada (a base corrige-a em vez de abrir outra).
 *
 * DATAS (D3): a subida do cargo e de HOJE PARA A FRENTE -- nunca passada. Subidas
 * retroactivas e promocoes agendadas aguardam o processamento (fluxo 10), que
 * ainda nao sabe tratar acertos nem meses fechados. O motivo e obrigatorio (tres
 * caracteres ou mais).
 *
 * Quem confirma e a RPC (`useCargos.definirSalario`): fecha o periodo em vigor,
 * abre o novo e refaz as versoes de retribuicao de quem tem o cargo, tudo ou
 * nada. Os erros voltam traduzidos (`mensagemDeErroCargo`) e o dialogo fica
 * aberto para corrigir.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import {
  estadoDoPeriodo,
  formatarSalario,
  periodoDoCargoEm,
  type HrCargoPeriodo,
} from "@/lib/hr/cargosPeriodos";
import { mensagemDeErroCargo } from "@/lib/hr/errosCargo";
import type { HrCargo, ResultadoDefinirSalario } from "@/hooks/useCargos";
import type { Periodicidade } from "@/types/hr";

/** O motivo tem de ter pelo menos isto (sem contar espacos nas pontas) -- como a base. */
const MOTIVO_MINIMO = 3;
/** `hr_cargos_periodos` so aceita estas tres periodicidades. */
const PERIODICIDADES_CARGO: readonly Periodicidade[] = ["mensal", "anual", "hora"];

interface CargoSalarioDialogProps {
  cargo: HrCargo;
  /** Os periodos de TODOS os cargos; o dialogo escolhe os do cargo. */
  periodos: HrCargoPeriodo[];
  /** Quantas fichas da lista recebida tem este cargo (por `cargo_id`): um minimo, a lista pode estar filtrada. */
  nPessoas: number;
  isSaving: boolean;
  onClose: () => void;
  onConfirmar: (args: {
    salarioBase: number;
    periodicidade: Periodicidade;
    validoDe: string;
    motivo: string;
  }) => Promise<ResultadoDefinirSalario>;
}

function numeroDe(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function CargoSalarioDialog({
  cargo,
  periodos,
  nPessoas,
  isSaving,
  onClose,
  onConfirmar,
}: CargoSalarioDialogProps) {
  const { t } = useTranslation();
  const hoje = dataDeHojeISO();
  const traduzir = (chave: string) => t(chave);

  // O que a base compara e o periodo MAIS RECENTE do cargo (pode ser uma subida
  // agendada), nao o que esta em vigor hoje: e esse o valor que se propoe.
  const maisRecente = periodos
    .filter((p) => p.cargo_id === cargo.id)
    .reduce<HrCargoPeriodo | null>(
      (melhor, p) => (melhor === null || p.valido_de > melhor.valido_de ? p : melhor),
      null,
    );
  const [salario, setSalario] = useState(maisRecente ? String(maisRecente.salario_base) : "");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(
    maisRecente?.periodicidade ?? "mensal",
  );
  const [validoDe, setValidoDe] = useState(hoje);
  const [motivo, setMotivo] = useState("");

  const valor = numeroDe(salario);
  const valorValido = valor !== null && valor >= 0;
  const motivoValido = motivo.trim().length >= MOTIVO_MINIMO;
  const dataValida = validoDe !== "" && validoDe >= hoje;

  // Porque e que Confirmar esta desactivado (o primeiro que falta).
  const motivoDesactivado = !valorValido
    ? "hr.cargos.alterarSalarioFaltaValor"
    : !dataValida
      ? "hr.cargos.alterarSalarioFaltaData"
      : !motivoValido
        ? "hr.cargos.alterarSalarioFaltaMotivo"
        : null;

  // O salario em vigor NA DATA escolhida, para o "de X para Y".
  const naData = validoDe === "" ? null : periodoDoCargoEm(periodos, cargo.id, validoDe);
  const mudaAlgo =
    valorValido &&
    naData !== null &&
    (naData.salario_base !== valor || naData.periodicidade !== periodicidade);

  // Uma subida ja agendada, na mesma data: a base corrige-a em vez de abrir outra.
  const subidaNessaData = periodos.find(
    (p) =>
      p.cargo_id === cargo.id &&
      p.valido_de === validoDe &&
      estadoDoPeriodo(p, hoje) === "agendado",
  );

  const confirmar = async () => {
    if (!valorValido || !dataValida || !motivoValido || valor === null) return;
    try {
      const resposta = await onConfirmar({
        salarioBase: valor,
        periodicidade,
        validoDe,
        motivo: motivo.trim(),
      });
      toast.success(t("hr.cargos.alterarSalarioSucesso", { n: resposta?.pessoas_actualizadas ?? 0 }));
      onClose();
    } catch (erro) {
      toast.error(await mensagemDeErroCargo(erro, "hr-cargo-definir-salario"));
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("hr.cargos.alterarSalarioTitulo")} -- {cargo.nome}
          </DialogTitle>
          <DialogDescription>{t("hr.cargos.alterarSalarioAjuda")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CampoTexto
              id="cargo-salario-valor"
              label={t("hr.cargos.salarioBase")}
              tipo="number"
              min={0}
              step="0.01"
              valor={salario}
              onChange={setSalario}
            />
            <CampoSelect
              id="cargo-salario-periodicidade"
              label={t("hr.contrato.periodicidade")}
              valor={periodicidade}
              opcoes={PERIODICIDADES_CARGO.map((p) => ({
                value: p,
                label: t(`hr.periodicidade.${p}`),
              }))}
              onChange={(v) => setPeriodicidade(v as Periodicidade)}
            />
          </div>
          <CampoTexto
            id="cargo-salario-data"
            label={t("hr.cargos.dataInicio")}
            tipo="date"
            min={hoje}
            valor={validoDe}
            onChange={setValidoDe}
          />
          <CampoTexto
            id="cargo-salario-motivo"
            label={t("hr.cargos.motivo")}
            valor={motivo}
            onChange={setMotivo}
          />

          <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm" role="status">
            <p className="font-medium">{t("hr.cargos.avisoPessoasAfectadasMinimo", { n: nPessoas })}</p>
            {mudaAlgo && naData && valor !== null && (
              <p>
                {t("hr.cargos.avisoDeParaSalario", {
                  antes: formatarSalario(
                    { salarioBase: naData.salario_base, periodicidade: naData.periodicidade },
                    traduzir,
                  ),
                  depois: formatarSalario({ salarioBase: valor, periodicidade }, traduzir),
                })}
              </p>
            )}
            {subidaNessaData && (
              <p className="text-amber-700 dark:text-amber-500">
                {t("hr.cargos.avisoCorrigeAgendada", { data: subidaNessaData.valido_de })}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={isSaving || motivoDesactivado !== null}
            aria-describedby={motivoDesactivado ? "cargo-salario-motivo-desactivado" : undefined}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("hr.cargos.alterarSalario")}
          </Button>
        </DialogFooter>
        {motivoDesactivado && (
          <p id="cargo-salario-motivo-desactivado" className="text-right text-xs text-muted-foreground">
            {t(motivoDesactivado)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
