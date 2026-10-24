import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoLinha, LinhaLadoALado } from "@/hooks/pessoas/novaLead/tiposNovaLead";

const N = "pessoasPagina.real.newLead.dup.";
const ROTULO_LINHA: Record<LinhaLadoALado["campo"], string> = { nome: "row.name", email: "row.email", telefone: "row.phone", nif: "row.nif" };
const ESTADO_TEXTO: Record<EstadoLinha, string> = { igual: "same", diferente: "different", coincide: "nifMatch", naoIndicado: "notGiven" };

interface LadoALadoProps {
  nome: string;
  linhas: readonly LinhaLadoALado[];
}

/**
 * O que se escreveu ao lado do que está na ficha existente. Cada linha diz «Igual» ou «Diferente» em texto (nunca só pela cor). O NIF
 * está cifrado: não se mostra o da ficha, só se «Coincide» ou «Não indicado».
 */
export function LadoALadoNovaLead({ nome, linhas }: LadoALadoProps) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <caption className="sr-only">{t(`${N}table.caption`, { name: nome })}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">{t(`${N}col.field`)}</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">{t(`${N}col.typed`)}</th>
            <th scope="col" className="py-1.5 font-medium">{t(`${N}col.existing`)}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.campo} className="border-b border-border/60 align-top last:border-0">
              <th scope="row" className="py-1.5 pr-3 font-medium">{t(`${N}${ROTULO_LINHA[l.campo]}`)}</th>
              <td className="break-words py-1.5 pr-3">{l.escrito ?? t(`${N}notGiven`)}</td>
              <td className="break-words py-1.5">
                {l.campo !== "nif" && <>{l.existente ?? t(`${N}notGiven`)}{" · "}</>}
                {/* O estado vai sempre em texto: a cor, se houver, só reforça. */}
                <strong className={l.estado === "diferente" ? "font-semibold text-amber-700 dark:text-amber-300" : "font-semibold"}>
                  {t(`${N}${ESTADO_TEXTO[l.estado]}`)}
                </strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
