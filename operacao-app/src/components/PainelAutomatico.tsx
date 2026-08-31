import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, ErrorState, Skeleton } from "./ui";
import { AlertTriangle, Check, Clock, Mail } from "./icons";
import { ErroDeDados, definirDefinicao, lerDefinicoes } from "../lib/dados";

/**
 * O que acontece sozinho.
 *
 * Por enquanto é um interruptor só, mas o sítio existe porque virão mais — e
 * porque uma coisa que a aplicação faz sem ninguém carregar em nada tem de
 * estar num sítio onde se veja que está ligada.
 *
 * O relatório automático escreve **para fora da casa**. É a única coisa do
 * módulo que chega a alguém que não trabalha aqui, e por isso nasce desligado
 * e o ecrã diz por extenso o que acontece quando se liga.
 */
export default function PainelAutomatico() {
  const { activeOrgId, funcao, orgs } = useAuth();
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const podeMudar = funcao === "admin" || funcao === "gestor";

  // Isto é por organização, e quem tem várias liga numa a pensar que ligou em
  // todas — aconteceu na primeira vez que alguém usou este ecrã. O nome fica
  // à vista, sempre, mesmo quando só há uma empresa.
  const nomeDaOrg = orgs.find((o) => o.id === activeOrgId)?.name ?? null;

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const d = await lerDefinicoes(activeOrgId);
      setLigado(d.relatorio_automatico === "sim");
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível ler as definições.");
      setLigado(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const trocar = async () => {
    if (!activeOrgId || ligado === null) return;
    const novo = !ligado;
    setAGravar(true);
    setErro(null);
    try {
      await definirDefinicao(activeOrgId, "relatorio_automatico", novo ? "sim" : "nao");
      setLigado(novo);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  if (erro && ligado === null) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (ligado === null) return <Skeleton className="h-52 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Mail width={15} height={15} className="text-slate-400" />
              Mandar o relatório ao cliente
            </h2>
            {nomeDaOrg && (
              <p className="mt-0.5 text-xs text-slate-500">
                {ligado ? "Ligado" : "Desligado"} em{" "}
                <strong className="font-semibold text-slate-700">{nomeDaOrg}</strong>. Cada empresa
                tem o seu interruptor — ligar aqui não liga nas outras.
              </p>
            )}
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Quando uma ordem é <strong className="font-medium">confirmada</strong>, o cliente
              recebe por email o que foi feito — sem ninguém se lembrar de o mandar.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Button
              variant={ligado ? "secondary" : "primary"}
              size="sm"
              onClick={() => void trocar()}
              disabled={!podeMudar || aGravar}
            >
              {aGravar ? "A gravar…" : ligado ? "Desligar" : "Ligar"}
            </Button>
          </div>
        </div>

        {!podeMudar && (
          <p className="mt-3 text-xs text-slate-500">
            Só quem administra ou gere é que muda isto.
          </p>
        )}

        {erro && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
            {erro}
          </p>
        )}
      </Card>

      {/* Uma coisa que escreve para fora tem de dizer exatamente o que faz,
          antes de alguém a ligar — e não depois, quando o cliente já recebeu. */}
      <Card className="p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          O que o cliente recebe, ao certo
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <Ponto sim>O código e o título da ordem</Ponto>
          <Ponto sim>O nome dele, onde foi o trabalho, e quando ficou concluído</Ponto>
          <Ponto sim>A lista do que foi feito, com os valores medidos</Ponto>
          <Ponto sim>O que ficou não conforme, se houver</Ponto>
          <Ponto sim>Quem assinou a receção, se assinou</Ponto>
          <Ponto>
            Fotografias — <span className="text-slate-500">não vão. Diz-se que existem, e quem
            as quiser pede-as.</span>
          </Ponto>
          <Ponto>
            Custos e horas — <span className="text-slate-500">nunca. São contas de casa.</span>
          </Ponto>
        </ul>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quando não sai
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li className="flex items-start gap-2">
            <Clock width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              <strong className="font-medium text-slate-700">Ao fechar, não.</strong> Fechar é o
              técnico a dizer que acabou; confirmar é o escritório a dizer que está bem. Só o
              segundo manda o email — trabalho por rever não sai de casa.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              <strong className="font-medium text-slate-700">Sem email na ficha, não.</strong> Se
              o cliente não tem email no Olyvia, não se manda nada — e ninguém fica bloqueado por
              isso.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              <strong className="font-medium text-slate-700">Duas vezes, nunca.</strong> Reabrir
              uma ordem e voltar a confirmá-la não manda o email outra vez.
            </span>
          </li>
        </ul>
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
          O email sai pelo servidor de correio que a empresa já tem configurado no Olyvia. Se não
          houver nenhum, o Olyvia avisa quem confirmou a ordem — e o cliente não recebe nada.
        </p>
      </Card>
    </div>
  );
}

function Ponto({ sim, children }: { sim?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {sim ? (
        <Check width={14} height={14} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-slate-300">
          —
        </span>
      )}
      <span>{children}</span>
    </li>
  );
}
