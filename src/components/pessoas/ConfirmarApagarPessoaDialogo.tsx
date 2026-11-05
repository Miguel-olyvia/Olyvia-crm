// Apagar uma lead ou um cliente por engano (neg_apagar_pessoa, soft delete), com confirmação. Antes de confirmar lê o que está ligado à pessoa
// (neg_pessoa_ligacoes) e, se houver documentos, mostra-os num aviso: a base NÃO recusa por eles, os documentos ficam guardados e ligados.
// Só recusa por negócios abertos (NG011), que o aviso também diz logo e o «Apagar» fica desativado. O foco abre no «Cancelar» e os erros
// aparecem DENTRO do diálogo (como em `ConfirmarLixoNegocioDialogo`). Em sucesso fecha o diálogo, FECHA A FICHA e só depois refaz as listas
// (refazer a ficha de uma pessoa apagada daria NG003), e anuncia.
import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { chaveDaLigacao, itensDoAviso, useApagarPessoa, usePessoaLigacoes, type LigacoesPessoa } from "@/hooks/pessoas/useApagarPessoa";

const A = "pessoasPagina.apagarPessoa.";

/** A pessoa a apagar: o nome e o papel decidem o título e o anúncio. */
export interface PessoaAApagar {
  id: string;
  nome: string;
  papel: "lead" | "cliente";
}

/** «1 contrato, 2 faturas e 1 proposta aceite»: as contagens e o «e» vêm das traduções (a lib do projeto é ES2020: sem Intl.ListFormat). */
function listaDoAviso(t: (k: string, p?: Record<string, string | number>) => string, l: LigacoesPessoa): string | null {
  const partes = itensDoAviso(l).map(({ tipo, quantos }) => t(chaveDaLigacao(tipo, quantos), { count: quantos }));
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0] ?? null;
  return `${partes.slice(0, -1).join(", ")} ${t(`${A}and`)} ${partes[partes.length - 1]}`;
}

interface CorpoProps {
  organizationId: string;
  pessoa: PessoaAApagar;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoFecharFicha: () => void;
  aoConcluido: (anuncio: string) => void;
}

function Corpo({ organizationId, pessoa, envio, aoFechar, aoFecharFicha, aoConcluido }: CorpoProps) {
  const { t } = useTranslation();
  const lidas = usePessoaLigacoes(organizationId, pessoa.id);
  const { apagar, refazer } = useApagarPessoa(organizationId);
  const ligacoes = lidas.data ?? null;
  const lista = ligacoes ? listaDoAviso(t, ligacoes) : null;
  const comAbertos = (ligacoes?.negocios_abertos ?? 0) > 0;
  const bloqueado = envio.aGuardar || comAbertos;
  const confirmar = () => {
    if (bloqueado) return;
    envio.enviar(() => apagar(pessoa.id), () => {
      aoFechar();
      aoFecharFicha();
      refazer(pessoa.id);
      aoConcluido(t(`${A}done.${pessoa.papel}`, { name: pessoa.nome }));
    });
  };
  return (
    <div className="space-y-4">
      {/* Sempre montada: o leitor de ecrã ouve a leitura a começar e a acabar. */}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{lidas.isLoading ? t(`${A}loading`) : ""}</p>
      {lidas.isError && <p className="text-sm text-muted-foreground">{t(`${A}loadError`)}</p>}
      {comAbertos && <p role="alert" className="text-sm font-medium text-destructive">{t(`${A}erro.ng011`)}</p>}
      {lista && (
        <div data-aviso-ligacoes className="flex gap-3 rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{t(`${A}warn.title`)}</p>
            <p>{t(`${A}warn.has`, { list: lista })}</p>
            <p>{t(`${A}warn.kept`)}</p>
          </div>
        </div>
      )}
      <ErroDeEnvio chave={comAbertos && envio.erro === `${A}erro.ng011` ? null : envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${A}cancel`)}
        </Button>
        <Button
          type="button" variant="destructive" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)}
          aria-disabled={bloqueado || undefined} aria-busy={envio.aGuardar || undefined} onClick={confirmar}
        >
          {t(`${A}confirm`)}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface ConfirmarApagarPessoaDialogoProps {
  organizationId: string;
  /** A pessoa; `null` = fechado. */
  pessoa: PessoaAApagar | null;
  aoFechar: () => void;
  /** Fecha a ficha da pessoa apagada (corre ANTES de refazer as listas). */
  aoFecharFicha: () => void;
  /** Depois de apagar: o texto a anunciar (a ficha já fechou). */
  aoConcluido: (anuncio: string) => void;
}

export function ConfirmarApagarPessoaDialogo({ organizationId, pessoa, aoFechar, aoFecharFicha, aoConcluido }: ConfirmarApagarPessoaDialogoProps) {
  const { t } = useTranslation();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultima = useRef<PessoaAApagar | null>(pessoa);
  if (pessoa) ultima.current = pessoa;
  const mostrada = pessoa ?? ultima.current;
  if (!mostrada) return null;
  return (
    <DialogoDeEnvio
      aberto={pessoa !== null} aoFechar={aoFechar} titulo={t(`${A}title.${mostrada.papel}`)}
      descricao={t(`${A}description`, { name: mostrada.nome })}
    >
      {(envio) => (
        <Corpo
          key={mostrada.id} organizationId={organizationId} pessoa={mostrada} envio={envio}
          aoFechar={aoFechar} aoFecharFicha={aoFecharFicha} aoConcluido={aoConcluido}
        />
      )}
    </DialogoDeEnvio>
  );
}
