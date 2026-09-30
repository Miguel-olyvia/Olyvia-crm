import { useEffect, useState } from "react";
import { Button, cx } from "./ui";
import { AlertTriangle, Check, Clock, X } from "./icons";
import { comoContagem } from "../domain/fila";
import {
  esquecer,
  ligarAoRegressoDaRede,
  ouvirFila,
  recuperarFila,
  tentarEnviar,
  type EstadoDaFila,
} from "../lib/fila";

/**
 * O que ainda não saiu do telemóvel.
 *
 * Só aparece quando há alguma coisa à espera. Uma barra permanente a dizer
 * "tudo enviado" seria ruído — e depois de uma semana ninguém a lê, incluindo
 * no dia em que ela disser outra coisa.
 *
 * Existe porque uma fila calada é pior do que não haver fila nenhuma: o
 * técnico sai do turno convencido de que gravou, e o trabalho está no bolso
 * dele.
 */
export default function BarraDaFila() {
  const [fila, setFila] = useState<EstadoDaFila>({
    porEnviar: [],
    aEnviar: false,
    encalhadas: [],
    enviadasAgora: 0,
  });
  const [acabou, setAcabou] = useState(false);

  useEffect(() => {
    const parar = ouvirFila(setFila);
    void recuperarFila().then(() => void tentarEnviar());
    const desligar = ligarAoRegressoDaRede();
    return () => {
      parar();
      desligar();
    };
  }, []);

  // Um "saiu tudo" que fica um instante e desaparece. Sem isto, a barra some-se
  // e ninguém sabe se foi enviado ou se foi perdido.
  //
  // Depende de terem saído respostas mesmo, e não de a fila ter ficado vazia:
  // descartar uma resposta encalhada também a esvazia, e dizer nesse caso que
  // "já está no servidor" seria mentira.
  useEffect(() => {
    if (fila.enviadasAgora > 0 && fila.porEnviar.length === 0) {
      setAcabou(true);
      const t = setTimeout(() => setAcabou(false), 4000);
      return () => clearTimeout(t);
    }
    setAcabou(false);
  }, [fila.enviadasAgora, fila.porEnviar.length]);

  const nada = fila.porEnviar.length === 0 && fila.encalhadas.length === 0;
  if (nada && !acabou) return null;

  if (nada && acabou) {
    return (
      <Faixa tom="bom">
        <Check width={14} height={14} className="shrink-0" />
        Saiu tudo. O trabalho que estava guardado já está no servidor.
      </Faixa>
    );
  }

  return (
    <>
      {fila.porEnviar.length > 0 && (
        <Faixa tom="espera">
          <Clock width={14} height={14} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {comoContagem(fila.porEnviar.length)} — {fila.aEnviar ? "a enviar…" : "sai sozinho"}{" "}
            quando houver rede.
          </span>
          {!fila.aEnviar && (
            <Button variant="ghost" size="sm" onClick={() => void tentarEnviar()}>
              Tentar agora
            </Button>
          )}
        </Faixa>
      )}

      {/* Estas não se resolvem sozinhas: o servidor recusou-as vezes que
          cheguem, e alguém tem de decidir. Ficar caladas seria pior. */}
      {fila.encalhadas.map((e) => (
        <Faixa key={e.chave} tom="mau">
          <AlertTriangle width={14} height={14} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Uma resposta não foi aceite pelo servidor
            {e.ultimoErro ? `: ${e.ultimoErro}` : "."} Volta a respondê-la na ordem.
          </span>
          <button
            type="button"
            onClick={() => void esquecer(e.chave)}
            className="inline-flex shrink-0 items-center gap-1 text-xs underline-offset-2 hover:underline"
          >
            <X width={12} height={12} /> descartar
          </button>
        </Faixa>
      ))}
    </>
  );
}

function Faixa({
  tom,
  children,
}: {
  tom: "espera" | "bom" | "mau";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2 px-4 py-2 text-xs sm:text-sm print:hidden",
        tom === "espera" && "bg-amber-50 text-amber-900",
        tom === "bom" && "bg-emerald-50 text-emerald-800",
        tom === "mau" && "bg-red-50 text-red-800"
      )}
    >
      {children}
    </div>
  );
}
