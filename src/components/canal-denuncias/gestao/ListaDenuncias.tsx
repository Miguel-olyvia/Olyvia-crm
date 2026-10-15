// A lista compacta (~45 px por linha). Clicar na linha, ou usar o código com o teclado, abre o painel da denúncia.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { EstadoChip, OrigemChip, PrazoTexto } from "../comum/Etiquetas";
import { nomeDoResponsavel } from "../dados/exemplo";
import { prazoAtual } from "../lib/prazos";
import type { Denuncia } from "../lib/tipos";

interface ListaDenunciasProps {
  denuncias: readonly Denuncia[];
  hoje: string;
  onAbrir: (id: string) => void;
}

const COLUNAS = ["codigo", "tipo", "resumo", "origem", "estado", "prazo", "responsavel"] as const;

export function ListaDenuncias({ denuncias, hoje, onAbrir }: ListaDenunciasProps) {
  const { t } = useTranslation();
  if (denuncias.length === 0) {
    return <p role="status" className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t("cd.lista.vazia")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table aria-label={t("cd.lista.titulo")}>
        <TableHeader>
          <TableRow>
            {COLUNAS.map((c) => <TableHead key={c} className="h-10 whitespace-nowrap">{t(`cd.coluna.${c}`)}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {denuncias.map((d) => (
            <TableRow key={d.id} className="h-[45px] cursor-pointer" onClick={() => onAbrir(d.id)}>
              <TableCell className="py-0">
                <button
                  type="button"
                  className={`h-11 whitespace-nowrap rounded-sm px-1 font-mono text-sm font-medium underline-offset-2 hover:underline ${FOCO}`}
                  onClick={(e) => { e.stopPropagation(); onAbrir(d.id); }}
                  aria-label={t("cd.lista.abrir", { codigo: d.codigo })}
                >
                  {d.codigo}
                </button>
              </TableCell>
              <TableCell className="whitespace-nowrap py-0 text-sm">{t(`cd.tipo.${d.tipo}`)}</TableCell>
              <TableCell className="max-w-[20rem] truncate py-0 text-sm" title={d.resumo}>{d.resumo}</TableCell>
              <TableCell className="py-0"><OrigemChip anonima={d.anonima} /></TableCell>
              <TableCell className="py-0"><EstadoChip estado={d.estado} /></TableCell>
              <TableCell className="whitespace-nowrap py-0 text-sm"><PrazoTexto prazo={prazoAtual(d, hoje)} /></TableCell>
              <TableCell className="whitespace-nowrap py-0 text-sm">{nomeDoResponsavel(d.responsavelId) ?? <span className="text-muted-foreground">{t("cd.semResponsavel")}</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
