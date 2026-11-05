// O separador «Pessoas» do Lixo: as leads e os clientes apagados por engano (anew_entities com deleted_at), lidos por neg_pessoas_apagadas, que
// aplica o âmbito de apagar (quem não pode apagar recebe a lista vazia). «Restaurar» pede uma confirmação simples e chama
// neg_apagar_pessoa(org, id, false); o botão só aparece a quem tem as permissões de apagar (a base decide de novo e um «não» vem traduzido).
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useApagarPessoa, type PessoaApagada } from "@/hooks/pessoas/useApagarPessoa";
import type { PodeApagarPessoa } from "@/hooks/pessoas/usePodeApagarPessoa";

const A = "pessoasPagina.apagarPessoa.";

interface LixoPessoasProps {
  organizationId: string;
  pessoas: PessoaApagada[];
  aCarregar: boolean;
  erro: boolean;
  aoTentarDeNovo: () => void;
  /** Quem pode restaurar, por papel (as mesmas permissões de apagar). */
  pode: PodeApagarPessoa;
}

export function LixoPessoas({ organizationId, pessoas, aCarregar, erro, aoTentarDeNovo, pode }: LixoPessoasProps) {
  const { t } = useTranslation();
  const { restaurar } = useApagarPessoa(organizationId);
  const [aRestaurar, setARestaurar] = useState<PessoaApagada | null>(null);
  const nomeDe = (p: PessoaApagada): string => p.nome ?? t(`${A}lixo.noName`);

  if (aCarregar) return <p role="status" className="py-8 text-center text-muted-foreground">{t(`${A}lixo.loading`)}</p>;
  if (erro) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-center gap-3 py-8 text-sm">
        <p>{t(`${A}lixo.loadError`)}</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentarDeNovo}>{t(`${A}lixo.retry`)}</Button>
      </div>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t(`${A}lixo.name`)}</TableHead>
            <TableHead>{t(`${A}lixo.kind`)}</TableHead>
            <TableHead>{t(`${A}lixo.when`)}</TableHead>
            <TableHead>{t(`${A}lixo.who`)}</TableHead>
            <TableHead className="text-right">{t(`${A}lixo.actions`)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pessoas.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t(`${A}lixo.empty`)}</TableCell></TableRow>
          ) : pessoas.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{nomeDe(p)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{t(`${A}lixo.kind.${p.cliente ? "cliente" : "lead"}`)}</Badge>
              </TableCell>
              <TableCell>{p.apagadaEm ? format(new Date(p.apagadaEm), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{p.apagadaPor ?? "—"}</TableCell>
              <TableCell className="text-right">
                {(p.cliente ? pode.cliente : pode.lead) && (
                  <Button
                    type="button" size="sm" variant="outline" className={cn("min-h-11", FOCO)}
                    aria-label={t(`${A}lixo.restoreLabel`, { name: nomeDe(p) })} onClick={() => setARestaurar(p)}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t(`${A}lixo.restore`)}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {aRestaurar && (
        <DialogoDeEnvio
          aberto aoFechar={() => setARestaurar(null)} titulo={t(`${A}lixo.restoreTitle`, { name: nomeDe(aRestaurar) })}
          descricao={t(`${A}lixo.restoreDescription`)}
        >
          {(envio) => (
            <div className="space-y-4">
              <ErroDeEnvio chave={envio.erro} />
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
                  onClick={() => { if (!envio.aGuardar) setARestaurar(null); }}
                >
                  {t(`${A}cancel`)}
                </Button>
                <Button
                  type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}
                  onClick={() => {
                    if (envio.aGuardar) return;
                    const alvo = aRestaurar;
                    envio.enviar(() => restaurar(alvo.id), () => {
                      setARestaurar(null);
                      toast.success(t(`${A}lixo.restored`, { name: nomeDe(alvo) }));
                    });
                  }}
                >
                  {t(`${A}lixo.restore`)}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogoDeEnvio>
      )}
    </>
  );
}
