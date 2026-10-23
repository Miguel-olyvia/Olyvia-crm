// A aba «Anónimas» de «As minhas denúncias». Uma denúncia anónima não fica ligada à pessoa: por isso não há lista dela,
// só o acompanhamento com o código e o PIN (igual ao público) e os códigos que a pessoa guardou nesta sessão, em memória.
import { useState } from "react";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { FormularioAcesso } from "../acompanhar/FormularioAcesso";
import { VistaAcompanhamento } from "../acompanhar/VistaAcompanhamento";
import { guardarCodigo, useCodigosGuardados } from "../dados/codigosGuardados";
import { useDenuncia } from "../dados/loja";

function CodigosGuardados({ codigos, onUsar }: { codigos: readonly string[]; onUsar: (codigo: string) => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="minhas-codigos" className="space-y-2 rounded-lg border bg-card p-4">
      <h3 id="minhas-codigos" className="text-sm font-semibold">{t("cdm.anonimas.guardadosTitulo")}</h3>
      {codigos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("cdm.anonimas.guardadosVazio")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("cdm.anonimas.guardadosNota")}</p>
          <ul className="flex flex-wrap gap-2">
            {codigos.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => onUsar(c)}
                  aria-label={t("cdm.anonimas.usarCodigo", { codigo: c })}
                  className={`min-h-11 rounded-md border bg-muted px-3 font-mono text-sm hover:bg-accent ${FOCO}`}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Aberta({ id, onSair }: { id: string; onSair: () => void }) {
  const { t } = useTranslation();
  const d = useDenuncia(id);
  const guardados = useCodigosGuardados();
  if (!d) return null;
  const jaGuardado = guardados.includes(d.codigo);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="min-h-11" disabled={jaGuardado} onClick={() => guardarCodigo(d.codigo)}>
          {jaGuardado ? t("cdm.codigoGuardado") : t("cdm.guardarCodigo")}
        </Button>
        {jaGuardado && <p role="status" className="text-sm text-muted-foreground">{t("cdm.guardarCodigoNota")}</p>}
      </div>
      <VistaAcompanhamento id={id} onSair={onSair} />
    </div>
  );
}

export function AbaAnonimas({ organizacaoId }: { organizacaoId: string }) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const guardados = useCodigosGuardados();
  return (
    <div className="space-y-4">
      <div role="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("cdm.anonimas.explica")}</p>
      </div>
      {aberta === null ? (
        <FormularioAcesso key={codigo} organizacaoId={organizacaoId} codigoInicial={codigo} onAcesso={setAberta} />
      ) : (
        <Aberta id={aberta} onSair={() => { setAberta(null); setCodigo(""); }} />
      )}
      {aberta === null && <CodigosGuardados codigos={guardados} onUsar={setCodigo} />}
    </div>
  );
}
