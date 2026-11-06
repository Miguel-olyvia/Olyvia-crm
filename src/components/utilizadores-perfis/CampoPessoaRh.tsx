// O campo opcional «Pessoa do RH» da aba Dados: escolher uma ficha de RH da organização ativa para ligar a esta conta.
// Só aparece com `hr.pessoas.conta.link` (quem decide é a página, por `estado.podeLigar`). Já ligada: mostra a ficha, sem
// desligar (isso faz-se na ficha do RH). Sem vínculo na organização a RPC recusaria, por isso o campo fica desativado e diz porquê.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AJUDA_CAMPO, RotuloCampo } from "./CampoForm";
import type { EstadoPessoaRh } from "./pessoaRh";

/** O Select não aceita valor vazio: é este o «sem ligação». */
const NENHUMA = "__nenhuma__";

interface CampoPessoaRhProps {
  id: string;
  estado: EstadoPessoaRh;
  /** O id da ficha escolhida, ou "". */
  valor: string;
  /** O nome da organização ativa, para os textos. */
  organizacao: string;
  /** O formulário tem um vínculo completo na organização ativa. */
  temVinculo: boolean;
  bloqueado: boolean;
  aoMudar: (pessoaId: string) => void;
}

export function CampoPessoaRh({ id, estado, valor, organizacao, temVinculo, bloqueado, aoMudar }: CampoPessoaRhProps) {
  const { t } = useTranslation();
  const campoId = `${id}-pessoaRh`;
  const ajudaId = `${campoId}-ajuda`;
  const ligada = estado.ligadaId ? estado.pessoas.find((p) => p.id === estado.ligadaId) : undefined;

  if (estado.ligadaId) {
    return (
      <div className="space-y-1.5 rounded-md border bg-muted/30 p-4" data-testid="pessoa-rh-ligada">
        <p className="text-sm font-medium text-foreground">{t("usersProfiles.form.user.hrPerson")}</p>
        <p className="text-sm text-foreground">{t("usersProfiles.form.user.hrPerson.linked", { name: ligada?.nome ?? estado.ligadaId })}</p>
      </div>
    );
  }

  const nota = estado.erro
    ? t("usersProfiles.form.user.hrPerson.loadError", { message: estado.erro })
    : !temVinculo
      ? t("usersProfiles.form.user.hrPerson.needsLink", { org: organizacao })
      : !estado.carregando && estado.pessoas.length === 0
        ? t("usersProfiles.form.user.hrPerson.empty", { org: organizacao })
        : t("usersProfiles.form.user.hrPerson.hint", { org: organizacao });
  const desativado = bloqueado || estado.carregando || !!estado.erro || !temVinculo || estado.pessoas.length === 0;

  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-4">
      <RotuloCampo para={campoId} texto={t("usersProfiles.form.user.hrPerson")} />
      <Select value={valor || NENHUMA} disabled={desativado} onValueChange={(v) => aoMudar(v === NENHUMA ? "" : v)}>
        <SelectTrigger id={campoId} aria-describedby={ajudaId} className={cn("min-h-11", FOCO)}>
          <SelectValue placeholder={t("usersProfiles.form.user.hrPerson.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUMA} className="min-h-11">{t(estado.carregando ? "usersProfiles.form.user.hrPerson.loading" : "usersProfiles.form.user.hrPerson.none")}</SelectItem>
          {estado.pessoas.map((p) => (
            <SelectItem key={p.id} value={p.id} className="min-h-11">{p.detalhe ? `${p.nome} · ${p.detalhe}` : p.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={ajudaId} role={estado.erro ? "alert" : undefined} className={cn(AJUDA_CAMPO, estado.erro && "text-destructive")}>{nota}</p>
    </div>
  );
}
