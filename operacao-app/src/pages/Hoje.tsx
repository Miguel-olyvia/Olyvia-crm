import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, listarOrdens, type LinhaOrdem } from "../lib/dados";
import { Card, ErrorState, Skeleton, cx } from "../components/ui";
import { AlertTriangle, CheckCircle, ChevronRight, Inbox } from "../components/icons";
import { alertasDaOrdem, type Alerta } from "../domain/alertas";

/**
 * O ecrã das 8h30.
 *
 * Responde a duas perguntas e mais nada: o que espera por mim, e o que está a
 * correr mal. Nunca pede filtros antes de mostrar seja o que for, e um bloco
 * a zero desaparece em vez de mostrar um zero — no Infraspeak o dashboard é
 * um catálogo de widgets configuráveis onde o essencial se perde.
 *
 * Cada linha é um problema em que se pode clicar, e leva à lista já filtrada.
 */

interface Bloco {
  chave: string;
  rotulo: string;
  contagem: number;
  detalhe?: string;
  href: string;
  tom: "espera" | "aviso" | "critico";
}

function paraData(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

function contexto(o: LinhaOrdem) {
  return {
    estado: o.estado,
    agendadaPara: paraData(o.agendada_para),
    iniciadaEm: paraData(o.iniciada_em),
    ultimaAtividadeEm: paraData(o.atualizada_em),
    pausaRetomaPrevista: paraData(o.pausa_retoma_prevista),
    criadaEm: paraData(o.criada_em),
  };
}

export default function Hoje() {
  const { activeOrgId, userName } = useAuth();
  const [ordens, setOrdens] = useState<LinhaOrdem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setOrdens(null);
    setErro(null);

    (async () => {
      try {
        const linhas = await listarOrdens(activeOrgId, {
          estados: ["por_aprovar", "agendada", "em_curso", "pausada", "fechada"],
        });
        if (vivo) setOrdens(linhas);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar o dia.");
        setOrdens([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [activeOrgId, tentativa]);

  const { precisamDeMim, aCorrerMal, total } = useMemo(() => {
    if (!ordens) return { precisamDeMim: [], aCorrerMal: [], total: 0 };
    const agora = new Date();

    const porAprovar = ordens.filter((o) => o.estado === "por_aprovar");
    const porConfirmar = ordens.filter((o) => o.estado === "fechada");

    // Junta os alertas de todas as ordens e conta-os por tipo.
    const porAlerta = new Map<string, { alerta: Alerta; ordens: LinhaOrdem[] }>();
    for (const o of ordens) {
      for (const a of alertasDaOrdem(contexto(o), agora)) {
        const atual = porAlerta.get(a.chave);
        if (atual) atual.ordens.push(o);
        else porAlerta.set(a.chave, { alerta: a, ordens: [o] });
      }
    }

    const precisam: Bloco[] = [];
    if (porAprovar.length > 0) {
      precisam.push({
        chave: "por-aprovar",
        rotulo: porAprovar.length === 1 ? "1 ordem por aprovar" : `${porAprovar.length} ordens por aprovar`,
        detalhe: maisAntiga(porAprovar, (o) => paraData(o.criada_em)),
        contagem: porAprovar.length,
        href: "/ordens?vista=por-aprovar",
        tom: "espera",
      });
    }
    if (porConfirmar.length > 0) {
      precisam.push({
        chave: "por-confirmar",
        rotulo:
          porConfirmar.length === 1
            ? "1 ordem fechada por confirmar"
            : `${porConfirmar.length} ordens fechadas por confirmar`,
        contagem: porConfirmar.length,
        href: "/ordens?vista=por-confirmar",
        tom: "espera",
      });
    }

    const ROTULOS: Record<string, (n: number) => string> = {
      atrasada: (n) => (n === 1 ? "1 ordem atrasada" : `${n} ordens atrasadas`),
      parada: (n) => (n === 1 ? "1 ordem parada" : `${n} ordens paradas`),
      retoma_ultrapassada: (n) =>
        n === 1 ? "1 pausa com retoma ultrapassada" : `${n} pausas com retoma ultrapassada`,
      por_aprovar_ha_muito: (n) =>
        n === 1 ? "1 ordem à espera de aprovação há dias" : `${n} ordens à espera de aprovação há dias`,
    };

    const mal: Bloco[] = [];
    for (const [chave, { alerta, ordens: os }] of porAlerta) {
      // "Por aprovar há muito" já está no bloco de cima; não duplicar.
      if (chave === "por_aprovar_ha_muito") continue;
      mal.push({
        chave,
        rotulo: ROTULOS[chave]?.(os.length) ?? `${os.length} × ${chave}`,
        detalhe: os.length === 1 ? os[0].codigo : alerta.texto,
        contagem: os.length,
        href: chave === "atrasada" ? "/ordens?vista=atrasadas" : "/ordens?vista=em-curso",
        tom: alerta.severidade === "critico" ? "critico" : "aviso",
      });
    }
    mal.sort((a, b) => (a.tom === b.tom ? b.contagem - a.contagem : a.tom === "critico" ? -1 : 1));

    return { precisamDeMim: precisam, aCorrerMal: mal, total: ordens.length };
  }, [ordens]);

  const primeiroNome = userName?.split(/\s+/)[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {primeiroNome ? `Bom dia, ${primeiroNome}` : "Hoje"}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {new Date().toLocaleDateString("pt-PT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {erro && <ErrorState message={erro} onRetry={() => setTentativa((t) => t + 1)} />}

      {ordens === null && !erro && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {ordens && !erro && (
        <>
          <Seccao titulo="A precisar de mim" blocos={precisamDeMim} />
          <Seccao titulo="A correr mal" blocos={aCorrerMal} />

          {precisamDeMim.length === 0 && aCorrerMal.length === 0 && (
            <Card className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                {total > 0 ? (
                  <CheckCircle width={22} height={22} />
                ) : (
                  <Inbox width={22} height={22} />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {total > 0 ? "Está tudo em dia" : "Ainda não há trabalho registado"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
                {total > 0
                  ? "Nenhuma ordem à espera de ti e nenhuma a correr mal."
                  : "Quando existirem ordens, o que precisar de atenção aparece aqui."}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Seccao({ titulo, blocos }: { titulo: string; blocos: Bloco[] }) {
  // Um bloco a zero desaparece. Não há zeros decorativos neste ecrã.
  if (blocos.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {titulo}
      </h2>
      <Card className="divide-y divide-slate-100">
        {blocos.map((b) => (
          <Link
            key={b.chave}
            to={b.href}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70"
          >
            <span
              className={cx(
                "flex h-2 w-2 shrink-0 rounded-full",
                b.tom === "critico" && "bg-red-500",
                b.tom === "aviso" && "bg-amber-500",
                b.tom === "espera" && "bg-brand"
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{b.rotulo}</span>
              {b.detalhe && (
                <span className="block truncate font-mono text-xs tabular text-slate-400">
                  {b.detalhe}
                </span>
              )}
            </span>
            {b.tom !== "espera" && (
              <AlertTriangle
                width={15}
                height={15}
                className={b.tom === "critico" ? "shrink-0 text-red-400" : "shrink-0 text-amber-400"}
              />
            )}
            <ChevronRight width={16} height={16} className="shrink-0 text-slate-300" />
          </Link>
        ))}
      </Card>
    </section>
  );
}

/** "mais antiga há 12 dias" — a idade do problema, não só a contagem. */
function maisAntiga(
  ordens: readonly LinhaOrdem[],
  campo: (o: LinhaOrdem) => Date | null
): string | undefined {
  const datas = ordens.map(campo).filter((d): d is Date => d !== null);
  if (datas.length === 0) return undefined;
  const maisVelha = datas.reduce((a, b) => (a < b ? a : b));
  const dias = Math.floor((Date.now() - maisVelha.getTime()) / 86_400_000);
  if (dias < 1) return undefined;
  return dias === 1 ? "mais antiga há 1 dia" : `mais antiga há ${dias} dias`;
}
