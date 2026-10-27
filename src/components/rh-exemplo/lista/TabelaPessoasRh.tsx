// A tabela compacta de pessoas de RH. A coluna do estado do contrato só existe para quem pode ver vínculos: o cabeçalho e a
// célula desaparecem juntos (não há "Sem contrato" a fingir resposta a quem não pode mesmo ver).
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PessoaListItem } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoAdmissao } from "@/components/rh-exemplo/hooks/aspectoSelosAdmissao";
import { LinhaPessoaRh } from "./LinhaPessoaRh";

interface TabelaPessoasRhProps {
  pessoas: PessoaListItem[];
  nomeDoLocal: (localId: string | null) => string | null;
  comContrato: boolean;
  /** A pessoa cuja ficha está aberta (a linha fica assinalada). */
  abertaId: string | null;
  aoAbrir: (id: string) => void;
  /** `pessoaId` → estado da admissão mais recente (um só pedido para a lista toda). */
  estadoAdmissaoPorPessoa?: ReadonlyMap<string, EstadoAdmissao>;
}

const CABECALHO = "px-3 text-xs font-medium text-muted-foreground";

export function TabelaPessoasRh({ pessoas, nomeDoLocal, comContrato, abertaId, aoAbrir, estadoAdmissaoPorPessoa }: TabelaPessoasRhProps) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table density="compact">
        <caption className="sr-only">{t("rhForm.lista.cabecalho")}</caption>
        <TableHeader>
          <TableRow>
            <TableHead className={CABECALHO}>{t("hr.columns.colaborador")}</TableHead>
            <TableHead className={CABECALHO}>{t("hr.columns.cargo")}</TableHead>
            <TableHead className={CABECALHO}>{t("hr.columns.local")}</TableHead>
            <TableHead className={CABECALHO}>{t("hr.columns.contratacao")}</TableHead>
            <TableHead className={CABECALHO}>{t("hr.columns.estadoAcesso")}</TableHead>
            {comContrato && <TableHead className={CABECALHO}>{t("hr.columns.estadoContrato")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pessoas.map((pessoa) => (
            <LinhaPessoaRh
              key={pessoa.id} pessoa={pessoa} local={nomeDoLocal(pessoa.local_id)} comContrato={comContrato}
              aberta={abertaId === pessoa.id} aoAbrir={aoAbrir}
              estadoAdmissao={estadoAdmissaoPorPessoa?.get(pessoa.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
