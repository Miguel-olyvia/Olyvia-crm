import { useState } from "react";
import { Button, Field, Input, Modal } from "./ui";
import { rotuloDaMedida, unidadeDaMedida } from "../domain/planeamento";

/**
 * "Quanto fizeste?" — ao dar por feita uma tarefa que mede trabalho (m² de
 * azulejo, pontos de água…). Vem preenchido com o previsto: na maioria das
 * vezes é só confirmar. É com este número que o motor aprende o ritmo real
 * de cada tarefa (minutos por m², por ponto…).
 */
export default function ObraMedidaReal({
  medida,
  prevista,
  aoCancelar,
  aoConfirmar,
}: {
  medida: string;
  prevista: number | null;
  aoCancelar: () => void;
  aoConfirmar: (medidaReal: number | null) => void;
}) {
  const [valor, setValor] = useState(prevista == null ? "" : String(prevista).replace(".", ","));
  const numero = Number(valor.replace(",", "."));
  const valido = valor.trim() === "" || (Number.isFinite(numero) && numero >= 0 && numero <= 100000);
  const unidade = unidadeDaMedida(medida);

  return (
    <Modal
      title="Quanto fizeste?"
      onClose={aoCancelar}
      footer={
        <>
          <Button variant="secondary" onClick={aoCancelar}>
            Voltar
          </Button>
          <Button
            onClick={() => aoConfirmar(valor.trim() === "" ? null : numero)}
            disabled={!valido}
            className="min-w-[8rem]"
          >
            Continuar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {rotuloDaMedida(medida)} feitos nesta tarefa. Se foi o previsto, é só continuar.
        </p>
        <Field label={`Feito (${unidade || "quantidade"})`}>
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              aria-label="Medida feita"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-32 text-right font-mono text-lg"
              autoFocus
            />
            <span className="text-sm text-slate-500">{unidade}</span>
          </div>
        </Field>
        {prevista != null && (
          <p className="text-xs text-slate-400">
            Previsto: {String(prevista).replace(".", ",")} {unidade}
          </p>
        )}
        {!valido && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Um número de 0 a 100000.</p>}
      </div>
    </Modal>
  );
}
