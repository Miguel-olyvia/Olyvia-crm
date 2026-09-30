import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  avisarAtrasos,
  listarClientes,
  listarLocais,
  listarOrdens,
  type Cliente,
  type LinhaOrdem,
  type LocalRow,
} from "../lib/dados";
import { listarPessoas, type Pessoa } from "../lib/config";
import { Badge, Card, ErrorState, PrioridadeOrdem, Skeleton, cx } from "../components/ui";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Inbox,
  MapPin,
  User,
} from "../components/icons";
import { IconeDaOrdem, IconeDoEstado } from "../components/IconeDeLinha";
import { alertasDaOrdem, type Alerta } from "../domain/alertas";
import { estaAtrasada } from "../domain/estados";

/**
 * O ecrã das 8h30.
 *
 * Responde a três perguntas e mais nada: **o que é hoje**, o que espera por
 * mim, e o que está a correr mal. Nunca pede filtros antes de mostrar seja o
 * que for, e um bloco a zero desaparece em vez de mostrar um zero — no
 * Infraspeak o dashboard é um catálogo de widgets configuráveis onde o
 * essencial se perde.
 *
 * ⚠ **Contar não chega.** A primeira versão deste ecrã dizia "4 ordens
 * atrasadas" e mais nada, e o que acontecia era sempre o mesmo: carregava-se
 * para ir ver quais, olhava-se, voltava-se atrás. Quatro linhas de contagem
 * obrigavam a quatro viagens à lista para saber o que se estava a passar.
 *
 * Agora cada bloco mostra **as três primeiras**, com código, título, cliente,
 * local e de quem é. Três é o número que cabe sem afogar o ecrã e que chega
 * para se reconhecer o problema — "ah, é outra vez a Padaria Lima" — sem sair
 * daqui. As restantes ficam a um clique, como antes.
 */

/** Quantas ordens se mostram dentro de cada bloco antes de se dizer "e mais N". */
const A_MOSTRAR = 3;

interface Bloco {
  chave: string;
  rotulo: string;
  contagem: number;
  detalhe?: string;
  href: string;
  tom: "espera" | "aviso" | "critico";
  ordens: LinhaOrdem[];
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

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "09h" ou "09h30". Sem hora, um travessão — não se inventa uma. */
function horaDe(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const m = d.getMinutes();
  return `${String(d.getHours()).padStart(2, "0")}h${m ? String(m).padStart(2, "0") : ""}`;
}

export default function Hoje() {
  const { activeOrgId, userName, funcao, businessUserId } = useAuth();
  const [ordens, setOrdens] = useState<LinhaOrdem[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [locais, setLocais] = useState<Map<string, string>>(new Map());
  const [pessoas, setPessoas] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setOrdens(null);
    setErro(null);

    (async () => {
      try {
        /* Os nomes vêm à parte porque vivem noutras tabelas. Falhar a lê-los
           não pode apagar o dia: sem eles as linhas mostram-se na mesma, só
           com menos contexto. Por isso levam `catch`, e as ordens não. */
        const [linhas, cls, ls, ps] = await Promise.all([
          listarOrdens(activeOrgId, {
            estados: ["por_aprovar", "agendada", "em_curso", "pausada", "fechada"],
          }),
          listarClientes(activeOrgId).catch(() => [] as Cliente[]),
          listarLocais(activeOrgId).catch(() => [] as LocalRow[]),
          listarPessoas(activeOrgId).catch(() => [] as Pessoa[]),
        ]);
        if (!vivo) return;
        setOrdens(linhas);
        setClientes(new Map(cls.map((c) => [c.id, c.nome])));
        setLocais(new Map(ls.map((l) => [l.id, l.nome])));
        setPessoas(new Map(ps.map((p) => [p.utilizador_id, p.nome])));
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

  // Uma ordem que passou da hora e uma pausa que expirou não geram evento —
  // são a ausência de um, e só se descobrem a olhar para o relógio. O pg_cron
  // faz isto de hora a hora QUANDO está ligado; nem todos os projetos Supabase
  // o têm, e nesses os avisos nunca sairiam.
  //
  // Uma vez por hora por browser, e só a quem coordena — a RPC percorre as
  // ordens todas, e não é trabalho para se pedir a cada navegação.
  //
  // Falhar aqui não pode estragar o ecrã: quem abre o Hoje quer ver o dia, e
  // não um erro sobre notificações.
  useEffect(() => {
    if (!activeOrgId) return;
    if (funcao !== "admin" && funcao !== "gestor" && funcao !== "operador") return;

    const chave = `operacao-avisos-${activeOrgId}`;
    try {
      const ultima = Number(localStorage.getItem(chave) ?? 0);
      if (Date.now() - ultima < 3600_000) return;
      localStorage.setItem(chave, String(Date.now()));
    } catch {
      // Sem localStorage (janela privada, armazenamento bloqueado) corre na
      // mesma. A base recusa o aviso repetido, por isso o pior caso é uma
      // chamada a mais.
    }
    void avisarAtrasos().catch(() => {});
  }, [activeOrgId, funcao]);

  const eTecnico = funcao === "tecnico";

  const { doDia, precisamDeMim, aCorrerMal, total } = useMemo(() => {
    if (!ordens) return { doDia: [], precisamDeMim: [], aCorrerMal: [], total: 0 };
    const agora = new Date();

    /*
     * O dia, a sério.
     *
     * Faltava por completo: o ecrã chamava-se "Hoje" e não mostrava uma única
     * ordem marcada para hoje. Quem coordena vê o dia da equipa toda; um
     * técnico vê só o dele — a lista dos outros não é trabalho dele, e
     * enche-lhe o ecrã.
     */
    const dia = ordens
      .filter((o) => {
        if (o.estado === "fechada") return false;
        const q = paraData(o.agendada_para);
        if (!q || !mesmoDia(q, agora)) return false;
        if (eTecnico && businessUserId) return o.responsavel_id === businessUserId;
        return true;
      })
      .sort((a, b) => (a.agendada_para ?? "").localeCompare(b.agendada_para ?? ""));

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
        rotulo:
          porAprovar.length === 1 ? "1 ordem por aprovar" : `${porAprovar.length} ordens por aprovar`,
        detalhe: maisAntiga(porAprovar, (o) => paraData(o.criada_em)),
        contagem: porAprovar.length,
        href: "/ordens?vista=por-aprovar",
        tom: "espera",
        ordens: porAprovar,
      });
    }
    if (porConfirmar.length > 0) {
      precisam.push({
        chave: "por-confirmar",
        rotulo:
          porConfirmar.length === 1
            ? "1 ordem fechada por confirmar"
            : `${porConfirmar.length} ordens fechadas por confirmar`,
        // Confirmar é o que faz o relatório sair. Uma ordem fechada há três
        // semanas é um cliente que nunca soube que o trabalho foi feito.
        detalhe: maisAntiga(porConfirmar, (o) => paraData(o.atualizada_em)),
        contagem: porConfirmar.length,
        href: "/ordens?vista=por-confirmar",
        tom: "espera",
        ordens: porConfirmar,
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
        detalhe: os.length === 1 ? undefined : alerta.texto,
        contagem: os.length,
        href: chave === "atrasada" ? "/ordens?vista=atrasadas" : "/ordens?vista=em-curso",
        tom: alerta.severidade === "critico" ? "critico" : "aviso",
        ordens: os,
      });
    }
    mal.sort((a, b) => (a.tom === b.tom ? b.contagem - a.contagem : a.tom === "critico" ? -1 : 1));

    return { doDia: dia, precisamDeMim: precisam, aCorrerMal: mal, total: ordens.length };
  }, [ordens, eTecnico, businessUserId]);

  const primeiroNome = userName?.split(/\s+/)[0] ?? null;

  const nomes = {
    cliente: (o: LinhaOrdem) => clientes.get(o.cliente_id) ?? null,
    local: (o: LinhaOrdem) => (o.local_id ? (locais.get(o.local_id) ?? null) : null),
    quem: (o: LinhaOrdem) => (o.responsavel_id ? (pessoas.get(o.responsavel_id) ?? null) : null),
  };

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
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      )}

      {ordens && !erro && (
        <>
          {/* ─────────────────────── O dia ─────────────────────── */}
          {doDia.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {eTecnico ? "O teu dia" : "O dia da equipa"}
                </h2>
                <Link
                  to="/agenda"
                  className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  Ver a agenda
                </Link>
              </div>
              <Card className="divide-y divide-slate-100">
                {doDia.map((o) => (
                  <LinhaDoDia
                    key={o.id}
                    ordem={o}
                    cliente={nomes.cliente(o)}
                    local={nomes.local(o)}
                    quem={eTecnico ? null : nomes.quem(o)}
                  />
                ))}
              </Card>
            </section>
          )}

          <Seccao titulo="A precisar de mim" blocos={precisamDeMim} nomes={nomes} />
          <Seccao titulo="A correr mal" blocos={aCorrerMal} nomes={nomes} />

          {doDia.length === 0 && precisamDeMim.length === 0 && aCorrerMal.length === 0 && (
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
                  ? "Nada marcado para hoje, nada à espera de ti e nada a correr mal."
                  : "Quando existirem ordens, o que precisar de atenção aparece aqui."}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── As linhas ──────────────────────────────── */

interface Nomes {
  cliente: (o: LinhaOrdem) => string | null;
  local: (o: LinhaOrdem) => string | null;
  quem: (o: LinhaOrdem) => string | null;
}

/**
 * Uma ordem marcada para hoje.
 *
 * A hora abre a linha, e é a única coisa alinhada em coluna: é por ela que se
 * percorre um dia. Uma ordem já passada da hora leva a marca de atraso aqui
 * mesmo — descobri-lo às cinco da tarde não serve de nada.
 */
function LinhaDoDia({
  ordem,
  cliente,
  local,
  quem,
}: {
  ordem: LinhaOrdem;
  cliente: string | null;
  local: string | null;
  quem: string | null;
}) {
  const atrasada = estaAtrasada(ordem.estado, paraData(ordem.agendada_para), new Date());

  return (
    <Link
      to={`/ordens/${ordem.codigo}`}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-brand-50/30"
    >
      <span
        className={cx(
          "w-12 shrink-0 pt-0.5 text-right font-mono text-sm tabular",
          atrasada ? "font-semibold text-red-600" : "text-slate-500"
        )}
      >
        {horaDe(ordem.agendada_para)}
      </span>

      <span className="mt-0.5 flex shrink-0 items-center gap-1">
        <IconeDaOrdem origem={ordem.origem} />
        <IconeDoEstado estado={ordem.estado} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-[11px] font-medium tabular text-slate-400">
            {ordem.codigo}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {ordem.titulo}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <PrioridadeOrdem prioridade={ordem.prioridade} />
          {atrasada && (
            <Badge className="bg-red-50 text-red-700 ring-red-200">
              <AlertTriangle width={11} height={11} />
              Passou da hora
            </Badge>
          )}
          {cliente && <span className="truncate text-slate-500">{cliente}</span>}
          {local && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin width={11} height={11} className="shrink-0" />
              <span className="truncate">{local}</span>
            </span>
          )}
          {quem ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <User width={11} height={11} className="shrink-0" />
              <span className="truncate">{quem}</span>
            </span>
          ) : (
            <Badge className="bg-amber-50 text-amber-800 ring-amber-200">sem ninguém</Badge>
          )}
        </span>
      </span>

      <ChevronRight width={16} height={16} className="mt-1 shrink-0 text-slate-300" />
    </Link>
  );
}

/** Uma ordem dentro de um bloco de problema: menos peso, o mesmo contexto. */
function LinhaDoBloco({
  ordem,
  cliente,
  local,
  quem,
}: {
  ordem: LinhaOrdem;
  cliente: string | null;
  local: string | null;
  quem: string | null;
}) {
  return (
    <Link
      to={`/ordens/${ordem.codigo}`}
      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white"
    >
      <span className="shrink-0 font-mono text-[11px] font-medium tabular text-slate-400">
        {ordem.codigo}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{ordem.titulo}</span>
      <span className="hidden min-w-0 max-w-[10rem] shrink-0 truncate text-xs text-slate-400 sm:block">
        {[cliente, local].filter(Boolean).join(" · ") || "—"}
      </span>
      <span className="hidden w-24 shrink-0 truncate text-right text-xs text-slate-400 md:block">
        {quem ?? "sem ninguém"}
      </span>
    </Link>
  );
}

function Seccao({
  titulo,
  blocos,
  nomes,
}: {
  titulo: string;
  blocos: Bloco[];
  nomes: Nomes;
}) {
  // Um bloco a zero desaparece. Não há zeros decorativos neste ecrã.
  if (blocos.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {titulo}
      </h2>
      <div className="space-y-2">
        {blocos.map((b) => (
          <Card key={b.chave} className="overflow-hidden">
            <Link
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
                <span className="block truncate text-sm font-medium text-slate-800">
                  {b.rotulo}
                </span>
                {b.detalhe && (
                  <span className="block truncate text-xs text-slate-400">{b.detalhe}</span>
                )}
              </span>
              {b.tom !== "espera" && (
                <AlertTriangle
                  width={15}
                  height={15}
                  className={
                    b.tom === "critico" ? "shrink-0 text-red-400" : "shrink-0 text-amber-400"
                  }
                />
              )}
              <ChevronRight width={16} height={16} className="shrink-0 text-slate-300" />
            </Link>

            {/* As primeiras, aqui mesmo. Ver quais é a pergunta seguinte, e
                sempre — não vale a pena obrigar a uma viagem para a fazer. */}
            <div className="space-y-0.5 border-t border-slate-100 bg-slate-50/60 px-2 py-2">
              {b.ordens.slice(0, A_MOSTRAR).map((o) => (
                <LinhaDoBloco
                  key={o.id}
                  ordem={o}
                  cliente={nomes.cliente(o)}
                  local={nomes.local(o)}
                  quem={nomes.quem(o)}
                />
              ))}
              {b.ordens.length > A_MOSTRAR && (
                <Link
                  to={b.href}
                  className="block px-2 py-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  e mais {b.ordens.length - A_MOSTRAR} →
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
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
