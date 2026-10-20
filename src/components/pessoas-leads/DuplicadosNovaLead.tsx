import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import type { Bloqueio, ErroDialogo, Parcial } from "@/hooks/pessoas/novaLead/useNovaLead";
import type { CampoForte, PessoaBloqueio } from "@/hooks/pessoas/novaLead/tiposNovaLead";
import { ConfirmarAtualizacao } from "./ConfirmarAtualizacao";
import { LadoALadoNovaLead } from "./LadoALadoNovaLead";

const N = "pessoasPagina.real.newLead.dup.";
const ESTADOS = new Set(["new", "contacted", "qualified", "lost", "rejected", "converted", "cancelled"]);
const RESULTADOS_ENCERRO = new Set(["semInteresse", "obraInviavel"]);

interface DuplicadosProps {
  /** Aberto quando há uma decisão de bloqueio. */
  decisao: Bloqueio | null;
  /** A pessoa cuja atualização espera confirmação (segundo ecrã). */
  confirmar: PessoaBloqueio | null;
  aGuardar: boolean;
  erro: ErroDialogo | null;
  parcial: Parcial | null;
  aoAbrir: (p: PessoaBloqueio) => void;
  aoAtualizar: (p: PessoaBloqueio) => void;
  aoConfirmar: () => void;
  aoVoltar: () => void;
  aoCancelar: () => void;
  aoTentarDeNovo: () => void;
}

type Traduzir = ReturnType<typeof useTranslation>["t"];

function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{rotulo}:</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

function estadoDe(t: Traduzir, p: PessoaBloqueio): string | null {
  if (p.encerrada) {
    const resultado = p.motivoEncerramento && RESULTADOS_ENCERRO.has(p.motivoEncerramento)
      ? t(`pessoasPagina.close.result.${p.motivoEncerramento}`) : null;
    return resultado ? t("pessoasPagina.close.stage", { result: resultado }) : t("pessoasPagina.close.badge");
  }
  if (!p.estado) return null;
  return ESTADOS.has(p.estado) ? t(`${N}state.${p.estado}`) : p.estado;
}

function CartaoPessoa({
  pessoa, varias, aoAbrir, aoAtualizar, formatar,
}: {
  pessoa: PessoaBloqueio; varias: boolean; aoAbrir: (p: PessoaBloqueio) => void; aoAtualizar: (p: PessoaBloqueio) => void; formatar: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const estado = estadoDe(t, pessoa);
  const campos = pessoa.campos.map((c: CampoForte) => t(`${N}matchField.${c}`)).join(", ");
  const papel = pessoa.papel === "cliente" ? t(`${N}role.client`) : pessoa.papel === "lead" ? t(`${N}role.lead`) : t(`${N}role.none`);
  return (
    <section aria-labelledby={`nl-dup-${pessoa.entityId}`} className="space-y-3 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <h3 id={`nl-dup-${pessoa.entityId}`} className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {pessoa.nome}
          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium">{papel}</span>
          {/* «Já é cliente» em texto, ao lado do selo. */}
          {pessoa.jaECliente && <span className="text-sm font-medium text-destructive">{t(`${N}alreadyClient`)}</span>}
        </h3>
        <p className="text-xs text-muted-foreground">{t(`${N}matched`, { fields: campos })}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {estado && <Detalhe rotulo={t(`${N}status`)} valor={estado} />}
          {pessoa.papel !== null && <Detalhe rotulo={t(`${N}assigned`)} valor={pessoa.atribuidoA ?? t(`${N}unassigned`)} />}
          {pessoa.criadaEm && <Detalhe rotulo={t(`${N}created`)} valor={formatar(pessoa.criadaEm)} />}
        </dl>
      </div>
      <LadoALadoNovaLead nome={pessoa.nome} linhas={pessoa.ladoALado} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {pessoa.podeAbrir && (
          <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={() => aoAbrir(pessoa)}>
            {varias ? t(`${N}open`, { name: pessoa.nome }) : <>{t(`${N}openOne`)}<span className="sr-only"> {pessoa.nome}</span></>}
          </Button>
        )}
        {pessoa.atualizar && (
          <Button type="button" className={`min-h-11 ${FOCO}`} data-atualizar={pessoa.entityId} onClick={() => aoAtualizar(pessoa)}>
            {t(`${N}update`)}<span className="sr-only"> {pessoa.nome}</span>
          </Button>
        )}
      </div>
    </section>
  );
}

/** O mais próximo de «aberto agora»: um aviso de erro, ou o parcial, dentro do próprio diálogo. */
function Avisos({ erro, parcial, aoTentarDeNovo }: Pick<DuplicadosProps, "erro" | "parcial" | "aoTentarDeNovo">) {
  const { t } = useTranslation();
  if (!erro && !parcial) return null;
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
      {parcial && (
        <p>
          {t(`${N}partial`, {
            done: parcial.feito.length > 0 ? parcial.feito.map((p) => t(`${N}step.${p}`)).join(", ") : t(`${N}partialNone`),
            failed: t(`${N}step.${parcial.falhou}`),
          })}
        </p>
      )}
      <p>{t(parcial ? parcial.chave : (erro as ErroDialogo).chave)}</p>
      {/* Também no aviso parcial: repetir é seguro (a mensagem di-lo) e sem botão o utilizador teria de adivinhar a saída. */}
      <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoTentarDeNovo}>{t(`${N}retry`)}</Button>
    </div>
  );
}

/**
 * O diálogo de duplicados da «Nova lead»: quem é a pessoa que já existe (nome, papel, estado, atribuído a, criada em), o que difere lado
 * a lado e só três saídas: «Abrir existente», «Atualizar dados» e «Cancelar». Não existe «Criar mesmo assim» nem «Partilhar».
 */
export function DuplicadosNovaLead(p: DuplicadosProps) {
  const { t, language } = useTranslation();
  const formatar = (iso: string): string => {
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString(language === "pt" ? "pt-PT" : "en-GB");
  };
  const decisao = p.decisao;
  const pessoas = decisao?.pessoas ?? [];
  // «Voltar» da confirmação desmonta o botão clicado: o foco passa a «Atualizar dados» da mesma pessoa (ou, sem ele, ao título).
  const conteudo = useRef<HTMLDivElement>(null);
  const anterior = useRef<string | null>(null);
  const idConfirmar = p.confirmar?.entityId ?? null;
  useEffect(() => {
    const veioDe = anterior.current;
    anterior.current = idConfirmar;
    if (veioDe === null || idConfirmar !== null || decisao === null) return;
    const botao = Array.from(conteudo.current?.querySelectorAll<HTMLElement>("[data-atualizar]") ?? []).find((el) => el.dataset.atualizar === veioDe);
    (botao ?? conteudo.current?.querySelector<HTMLElement>("[data-titulo-duplicados]"))?.focus();
  }, [idConfirmar, decisao]);
  return (
    <AlertDialog open={decisao !== null} onOpenChange={(aberto) => { if (!aberto) (p.confirmar ? p.aoVoltar() : p.aoCancelar()); }}>
      <AlertDialogContent ref={conteudo} className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle tabIndex={-1} data-titulo-duplicados="">{t(`${N}title`)}</AlertDialogTitle>
          <AlertDialogDescription>{pessoas.length + (decisao?.semAcesso ? 1 : 0) > 1 ? t(`${N}introMany`) : t(`${N}intro`)}</AlertDialogDescription>
        </AlertDialogHeader>
        {p.confirmar ? (
          <ConfirmarAtualizacao pessoa={p.confirmar} aGuardar={p.aGuardar} aoConfirmar={p.aoConfirmar} aoVoltar={p.aoVoltar} />
        ) : (
          <div className="space-y-3">
            {pessoas.map((pessoa) => (
              <CartaoPessoa key={pessoa.entityId} pessoa={pessoa} varias={pessoas.length > 1} aoAbrir={p.aoAbrir} aoAtualizar={p.aoAtualizar} formatar={formatar} />
            ))}
            {decisao?.semAcesso && <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{t(`${N}noAccess`)}</p>}
            {decisao?.grupo.map((g) => (
              // Só informação: sem botões nem acesso à outra empresa.
              <p key={g.organizacaoId ?? g.nome} className="text-xs text-muted-foreground">{t(`${N}groupAlso`, { org: g.nome })}</p>
            ))}
          </div>
        )}
        <Avisos erro={p.erro} parcial={p.parcial} aoTentarDeNovo={p.aoTentarDeNovo} />
        {!p.confirmar && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={p.aoCancelar}>{t(`${N}cancel`)}</Button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
