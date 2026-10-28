// Configurar o canal (só quem tem `denuncias.configurar`): ligar o canal e escolher o endereço público, e designar quem
// trata os casos. Sem responsáveis designados ninguém consegue tratar denúncias, por isso este é o primeiro passo.
// Mostra só a CONTAGEM de casos que ninguém pode tratar (todos os responsáveis impedidos), nunca o seu conteúdo.
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { erroDoResultado, useExecutar } from "../comum/useExecutar";
import { useFonte, type ConfiguracaoCanal } from "../dados/fonte";
import type { ErroAcao } from "../lib/acoes";

export const FORMATO_SLUG = /^[a-z0-9-]{4,40}$/;

function Canal({ organizationId, config }: { organizationId: string; config: ConfiguracaoCanal }) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  const [ativo, setAtivo] = useState(config.ativo);
  const [slug, setSlug] = useState(config.slug);
  const [erro, setErro] = useState<ErroAcao | "slug_invalido" | null>(null);
  const [guardado, setGuardado] = useState(false);

  const guardar = async (): Promise<void> => {
    const limpo = slug.trim().toLowerCase();
    if (!FORMATO_SLUG.test(limpo)) return setErro("slug_invalido");
    const r = await executar(() => fonte.guardarCanal(organizationId, ativo, limpo));
    setErro(erroDoResultado(r));
    setGuardado(r.ok);
  };

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={ativo} onCheckedChange={(v) => { setAtivo(v === true); setGuardado(false); }} />
        {t("cd.config.ligado")}
      </label>
      <Campo id="den-slug" rotulo={t("cd.config.slug")} ajuda={t("cd.config.slugAjuda")}
        erro={erro ? t(erro === "slug_invalido" ? "cd.config.slugInvalido" : `cd.erroAcao.${erro}`) : undefined}>
        {(a) => <Input {...a} className="font-mono" autoComplete="off" spellCheck={false} value={slug}
          onChange={(e) => { setSlug(e.target.value); setErro(null); setGuardado(false); }} />}
      </Campo>
      {config.slug && <p className="break-all text-xs text-muted-foreground">{t("cd.config.endereco", { endereco: `/canal-denuncias/nova?org=${config.slug}` })}</p>}
      <Button type="button" variant="outline" className="min-h-11" disabled={pendente} onClick={guardar}>{t("cd.config.guardar")}</Button>
      {guardado && <p role="status" className="text-sm text-muted-foreground">{t("cd.config.guardado")}</p>}
    </div>
  );
}

function Responsaveis({ organizationId, config }: { organizationId: string; config: ConfiguracaoCanal }) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  const [escolhido, setEscolhido] = useState("");
  const [erro, setErro] = useState<ErroAcao | null>(null);

  const correr = async (fazer: () => ReturnType<typeof fonte.designarResponsavel>): Promise<boolean> => {
    const r = await executar(fazer);
    setErro(erroDoResultado(r));
    return r.ok;
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{t("cd.config.responsaveis")}</h4>
      {config.responsaveis.length === 0 ? (
        <p role="note" className="text-sm text-muted-foreground">{t("cd.config.semResponsaveis")}</p>
      ) : (
        <ul className="space-y-1">
          {config.responsaveis.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1 text-sm">
              <span>{r.nome}</span>
              <Button type="button" variant="ghost" className="min-h-11" disabled={pendente} aria-label={t("cd.config.remover", { nome: r.nome })}
                onClick={() => correr(() => fonte.removerResponsavel(organizationId, r.id))}>{t("cd.config.removerBotao")}</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="den-designar" className="sr-only">{t("cd.config.designarEscolher")}</label>
        <div className="min-w-[12rem] flex-1">
          <NativeSelect id="den-designar" className="h-11" value={escolhido} placeholder={t("cd.config.designarEscolher")}
            options={config.candidatos.map((c) => ({ value: c.id, label: c.nome }))} onValueChange={(v) => { setEscolhido(v); setErro(null); }} />
        </div>
        <Button type="button" variant="outline" className="min-h-11" disabled={pendente || !escolhido}
          onClick={async () => { if (await correr(() => fonte.designarResponsavel(organizationId, escolhido))) setEscolhido(""); }}>
          {t("cd.config.designar")}
        </Button>
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{t(`cd.erroAcao.${erro}`)}</p>}
    </div>
  );
}

export function ConfigurarCanal({ organizationId, config }: { organizationId: string; config: ConfiguracaoCanal }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="den-config" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 id="den-config" className="text-sm font-semibold">{t("cd.config.titulo")}</h3>
      {config.semQuemTrate > 0 && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("cd.config.semQuemTrate", { n: config.semQuemTrate })}
        </p>
      )}
      <Canal organizationId={organizationId} config={config} />
      <div className="border-t pt-3"><Responsaveis organizationId={organizationId} config={config} /></div>
    </section>
  );
}
