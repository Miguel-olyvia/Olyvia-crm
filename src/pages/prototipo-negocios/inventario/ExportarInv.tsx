// O botão "Exportar" das listas do Inventário (doExport do mockup): descarrega em CSV o que está filtrado e avisa quantas linhas saíram.
import { Download } from "lucide-react";
import { csvDe, descarregarCsv, nomeCsv } from "../funcCsv";
import { useCtxInv } from "./ctxInv";
import { Sec } from "./pecasInv";

type Celula = string | number | null | undefined;

interface Props { nome: string; rotulo: string; cabecalho: readonly string[]; linhas: () => Celula[][] }
export function ExportarInv({ nome, rotulo, cabecalho, linhas }: Props) {
  const { avisar } = useCtxInv();
  const exportar = (): void => {
    const l = linhas();
    const ok = descarregarCsv(nomeCsv(nome), csvDe([...cabecalho], l));
    avisar(ok ? `Exportados ${l.length} ${rotulo}` : "Não foi possível descarregar o CSV neste browser.", !ok);
  };
  return <Sec onClick={exportar}><Download className="ic" aria-hidden="true" />Exportar</Sec>;
}
