import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, cx } from "./ui";
import { AlertTriangle, Check, CheckCircle, ChevronDown, ChevronRight, Plus, X } from "./icons";
import ObraAutoRececao from "./ObraAutoRececao";
import { ErroDeDados, ErroDeEscrita, urlsDosAnexos, type MembroEquipa } from "../lib/dados";
import { mudarEstadoObra } from "../lib/obras";
import {
  ROTULO_ESTADO_REMATE,
  ROTULO_TIPO_DIVISAO,
  configurarVistoria,
  criarRemate,
  guardarDivisao,
  justificarFecho,
  lerFecho,
  marcarFoto,
  mudarEstadoRemate,
  removerDivisao,
  responderVistoria,
  urlParaDescarregar,
  type DivisaoFecho,
  type EstadoRemate,
  type FechoObra,
  type MomentoFoto,
  type OrigemRemate,
  type ResultadoVistoria,
  type TipoDivisao,
} from "../lib/obrasFecho";
import { podePlanear } from "../domain/obras";
import { dataHora } from "../lib/formatar";

/**
 * Separador "Fecho" da obra: o que se faz no último dia, no local, de
 * telemóvel na mão — vistoria por divisão, remates, fotos antes/depois e o
 * auto de receção assinado pelo cliente. Concluir a obra exige o auto (ou a
 * justificação do gestor): a base recusa sem isso.
 */
export default function ObraFecho({
  obraId,
  orgId,
  funcao,
  equipa,
  recarga,
  aoMudar,
}: {
  obraId: string;
  orgId: string;
  funcao: string | null;
  equipa: readonly MembroEquipa[];
  recarga?: number;
  aoMudar: () => void;
}) {
  const [f, setF] = useState<FechoObra | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [aberta, setAberta] = useState<string | null>(null);
  const [novaDivisao, setNovaDivisao] = useState(false);
  const [novoRemate, setNovoRemate] = useState<{ divisaoId: string | null } | null>(null);
  const [verRemates, setVerRemates] = useState<"pendentes" | "todos">("pendentes");
  const [marcar, setMarcar] = useState(false);
  const [auto, setAuto] = useState(false);
  const [justificar, setJustificar] = useState(false);
  const [lista, setLista] = useState<DivisaoFecho | null>(null);
  const [aConcluir, setAConcluir] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await lerFecho(obraId);
      setF(r);
      if (r) {
        const caminhos = [
          ...r.remates.map((x) => x.foto_caminho).filter((x): x is string => !!x),
          ...r.fotos.map((x) => x.caminho),
        ];
        setUrls(await urlsDosAnexos(caminhos));
        setAberta((a) => a ?? r.divisoes[0]?.id ?? null);
      }
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o fecho.");
    }
  }, [obraId]);

  useEffect(() => {
    void carregar();
  }, [carregar, recarga]);

  /** Corre uma escrita, mostra o erro se houver, e relê. */
  const fazer = useCallback(
    async (acao: () => Promise<unknown>) => {
      setAviso(null);
      try {
        await acao();
        await carregar();
      } catch (e) {
        setAviso(e instanceof ErroDeEscrita ? e.message : "Algo correu mal.");
      }
    },
    [carregar]
  );

  const respostas = useMemo(() => {
    const m = new Map<string, ResultadoVistoria>();
    for (const v of f?.vistoria ?? []) m.set(`${v.divisao_id}|${v.item}`, v.resultado);
    return m;
  }, [f]);

  if (f === undefined && !erro) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (f === null) {
    return (
      <Card className="p-4 text-sm text-slate-600">
        O fecho da obra ainda não está instalado nesta base (falta correr <code>db/obras-fecho.sql</code>).
      </Card>
    );
  }
  if (!f) return null;

  const o = f.obra;
  const fechada = o.estado === "concluida" || o.estado === "cancelada";
  const podeFechar = f.pode.fechar && !fechada;
  const pendentes = f.remates.filter((r) => r.estado !== "verificado");
  const temAuto = !!f.fecho?.auto_assinado_em;
  const temJust = !!f.fecho?.justificacao;
  const prontaParaConcluir = o.estado === "em_curso" && o.n_por_validar === 0 && (temAuto || temJust);
  const nomeDivisao = new Map(f.divisoes.map((d) => [d.id, d.nome]));
  const fotosMarcadas = f.fotos.filter((x) => x.momento);

  async function descarregar() {
    if (!f?.fecho?.auto_pdf_caminho) return;
    const url = await urlParaDescarregar(f.fecho.auto_pdf_caminho, `Auto de receção ${o.codigo}.pdf`);
    if (url) window.open(url, "_blank", "noopener");
    else setAviso("Não foi possível abrir o PDF.");
  }

  async function concluir() {
    setAConcluir(true);
    await fazer(async () => {
      await mudarEstadoObra(obraId, "concluida", null);
      aoMudar();
    });
    setAConcluir(false);
  }

  return (
    <div className="space-y-3" data-testid="obra-fecho">
      {/* ── Estado do fecho ── */}
      <Card className="p-4">
        <p className="text-sm font-semibold text-slate-800">Fecho da obra</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          <Passo feito={o.n_por_validar === 0}>
            {o.n_por_validar === 0 ? "Todas as tarefas validadas" : `${o.n_por_validar} tarefa(s) por validar`}
          </Passo>
          <Passo feito={pendentes.length === 0} aviso>
            {pendentes.length === 0 ? "Sem remates por fechar" : `${pendentes.length} remate(s) por fechar`}
          </Passo>
          <Passo feito={temAuto || temJust}>
            {temAuto
              ? `Auto assinado por ${f.fecho?.auto_assinante} a ${dataHora(f.fecho?.auto_assinado_em)}`
              : temJust
                ? `Sem auto — justificado por ${f.fecho?.justificado_por ?? "gestor"}: “${f.fecho?.justificacao}”`
                : "Falta o auto de receção assinado pelo cliente"}
          </Passo>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {podeFechar && (
            <Button size="sm" onClick={() => setAuto(true)} variant={temAuto ? "secondary" : "primary"}>
              {temAuto ? "Refazer o auto" : "Auto de receção"}
            </Button>
          )}
          {temAuto && f.fecho?.auto_pdf_caminho && (
            <Button size="sm" variant="secondary" onClick={() => void descarregar()}>
              Descarregar PDF
            </Button>
          )}
          {!fechada && !temAuto && !temJust && f.pode.justificar && (
            <Button size="sm" variant="ghost" onClick={() => setJustificar(true)}>
              Concluir sem auto…
            </Button>
          )}
          {podePlanear(funcao) && prontaParaConcluir && (
            <Button size="sm" onClick={() => void concluir()} disabled={aConcluir}>
              {aConcluir ? "A concluir…" : "Concluir obra"}
            </Button>
          )}
        </div>
        {aviso && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{aviso}</p>}
      </Card>

      {/* ── Divisões e vistoria ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Vistoria por divisão</p>
          {podeFechar && (
            <Button size="sm" variant="secondary" onClick={() => setNovaDivisao(true)}>
              <Plus width={12} height={12} /> Divisão
            </Button>
          )}
        </div>

        {f.divisoes.length === 0 && (
          <div className="mt-2 text-sm text-slate-500">
            <p>Ainda não há divisões nesta obra.</p>
            {podeFechar && f.sugestoes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {f.sugestoes.map((s) => (
                  <Button key={s.nome} size="sm" variant="subtle" onClick={() => void fazer(() => guardarDivisao(obraId, s.nome, s.tipo))}>
                    <Plus width={12} height={12} /> {s.nome}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 divide-y divide-slate-100">
          {f.divisoes.map((d) => {
            const respondidos = d.itens.filter((i) => respostas.has(`${d.id}|${i}`)).length;
            const mal = d.itens.filter((i) => respostas.get(`${d.id}|${i}`) === "nok").length;
            const ab = aberta === d.id;
            return (
              <div key={d.id} className="py-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => setAberta(ab ? null : d.id)}
                  aria-expanded={ab}
                >
                  {ab ? <ChevronDown width={14} height={14} /> : <ChevronRight width={14} height={14} />}
                  <span className="flex-1 font-medium text-slate-800">{d.nome}</span>
                  {mal > 0 && <Badge className="bg-red-50 text-red-700 ring-red-200">{mal} mal</Badge>}
                  <span className="tabular text-xs text-slate-500">
                    {respondidos}/{d.itens.length}
                  </span>
                </button>
                {ab && (
                  <div className="mt-2 space-y-1.5">
                    {d.itens.map((item) => {
                      const r = respostas.get(`${d.id}|${item}`);
                      return (
                        <div key={item} className="flex items-center gap-2 text-sm">
                          <span className={cx("flex-1", r === "nok" ? "text-red-700" : "text-slate-700")}>{item}</span>
                          {(["ok", "nok", "na"] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              disabled={!podeFechar}
                              aria-pressed={r === v}
                              aria-label={`${item}: ${v === "ok" ? "está bem" : v === "nok" ? "não está bem" : "não se aplica"}`}
                              onClick={() => void fazer(() => responderVistoria(d.id, item, v))}
                              className={cx(
                                "h-9 min-w-9 rounded-lg border px-2 text-xs font-medium transition-colors disabled:opacity-60",
                                r === v
                                  ? v === "ok"
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : v === "nok"
                                      ? "border-red-500 bg-red-500 text-white"
                                      : "border-slate-400 bg-slate-400 text-white"
                                  : "border-slate-200 bg-white text-slate-500"
                              )}
                            >
                              {v === "ok" ? <Check width={14} height={14} /> : v === "nok" ? <X width={14} height={14} /> : "n/a"}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {podeFechar && (
                      <div className="flex flex-wrap gap-3 pt-1 text-xs">
                        <button type="button" className="text-brand underline" onClick={() => setNovoRemate({ divisaoId: d.id })}>
                          + Remate nesta divisão
                        </button>
                        {podePlanear(funcao) && (
                          <button type="button" className="text-slate-500 underline" onClick={() => setLista(d)}>
                            Editar a lista ({ROTULO_TIPO_DIVISAO[d.tipo].toLowerCase()})
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-slate-400 underline"
                          onClick={() => void fazer(() => removerDivisao(d.id))}
                        >
                          Tirar divisão
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Remates ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">
            Remates {pendentes.length > 0 && <span className="text-amber-700">· {pendentes.length} por fechar</span>}
          </p>
          <div className="flex gap-2">
            <Select
              className="py-1 text-xs"
              value={verRemates}
              onChange={(e) => setVerRemates(e.target.value as "pendentes" | "todos")}
              aria-label="Que remates ver"
            >
              <option value="pendentes">Por fechar</option>
              <option value="todos">Todos</option>
            </Select>
            {podeFechar && (
              <Button size="sm" variant="secondary" onClick={() => setNovoRemate({ divisaoId: null })}>
                <Plus width={12} height={12} /> Remate
              </Button>
            )}
          </div>
        </div>
        {(verRemates === "todos" ? f.remates : pendentes).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {verRemates === "todos" ? "Ainda não há remates." : "Nada por fechar."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {(verRemates === "todos" ? f.remates : pendentes).map((r) => {
              const coord = f.pode.fechar;
              const responsavel = r.responsavel_id && r.responsavel_id === f.pode.eu;
              return (
                <li key={r.id} className="flex gap-3 py-2.5">
                  {r.foto_caminho && urls.get(r.foto_caminho) ? (
                    <a href={urls.get(r.foto_caminho)} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={urls.get(r.foto_caminho)} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    </a>
                  ) : null}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-slate-800">
                      {r.divisao_id && <span className="text-slate-500">{nomeDivisao.get(r.divisao_id)} · </span>}
                      {r.descricao}
                    </p>
                    <p className="text-xs text-slate-500">
                      <EstadoRemateBadge estado={r.estado} /> {r.origem === "rececao" ? "na receção" : r.origem === "vistoria" ? "na vistoria" : ""}
                      {r.responsavel && <> · {r.responsavel}</>}
                      {r.nota && <> · “{r.nota}”</>}
                    </p>
                    {!fechada && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {r.estado === "aberto" && (coord || responsavel) && (
                          <Button size="sm" variant="secondary" onClick={() => void fazer(() => mudarEstadoRemate(r.id, "resolvido"))}>
                            Resolvido
                          </Button>
                        )}
                        {r.estado !== "verificado" && coord && (
                          <Button size="sm" variant="subtle" onClick={() => void fazer(() => mudarEstadoRemate(r.id, "verificado"))}>
                            <CheckCircle width={12} height={12} /> Verificar
                          </Button>
                        )}
                        {r.estado !== "aberto" && coord && (
                          <Button size="sm" variant="ghost" onClick={() => void fazer(() => mudarEstadoRemate(r.id, "aberto"))}>
                            Reabrir
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Antes / depois ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Antes e depois</p>
          {!fechada && f.fotos.length > 0 && f.divisoes.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setMarcar(true)}>
              Marcar fotos
            </Button>
          )}
        </div>
        {fotosMarcadas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {f.fotos.length === 0
              ? "As tarefas ainda não têm fotos."
              : f.divisoes.length === 0
                ? "Cria as divisões para marcar as fotos de antes e depois."
                : "Escolhe, das fotos das tarefas, as de antes e as de depois de cada divisão."}
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {f.divisoes.map((d) => {
              const antes = fotosMarcadas.filter((x) => x.divisao_id === d.id && x.momento === "antes");
              const depois = fotosMarcadas.filter((x) => x.divisao_id === d.id && x.momento === "depois");
              if (!antes.length && !depois.length) return null;
              return (
                <div key={d.id}>
                  <p className="text-xs font-medium text-slate-600">{d.nome}</p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["Antes", antes],
                        ["Depois", depois],
                      ] as const
                    ).map(([rot, fs]) => (
                      <div key={rot}>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{rot}</p>
                        <div className="mt-0.5 grid grid-cols-2 gap-1">
                          {fs.map((x) =>
                            urls.get(x.caminho) ? (
                              <a key={x.id} href={urls.get(x.caminho)} target="_blank" rel="noreferrer">
                                <img src={urls.get(x.caminho)} alt={x.tarefa} className="aspect-square w-full rounded-md object-cover" />
                              </a>
                            ) : null
                          )}
                          {fs.length === 0 && <span className="col-span-2 text-xs text-slate-400">—</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {novaDivisao && (
        <NovaDivisao
          aoFechar={() => setNovaDivisao(false)}
          aoGravar={(nome, tipo) => fazer(() => guardarDivisao(obraId, nome, tipo)).then(() => setNovaDivisao(false))}
        />
      )}
      {novoRemate && (
        <NovoRemate
          orgId={orgId}
          obraId={obraId}
          divisoes={f.divisoes}
          divisaoInicial={novoRemate.divisaoId}
          equipa={equipa}
          aoFechar={() => setNovoRemate(null)}
          aoGravar={() => {
            setNovoRemate(null);
            void carregar();
          }}
        />
      )}
      {marcar && (
        <MarcarFotos
          fecho={f}
          urls={urls}
          aoFechar={() => setMarcar(false)}
          aoMarcar={(id, m, d) => fazer(() => marcarFoto(id, m, d))}
        />
      )}
      {lista && (
        <EditarLista
          orgId={orgId}
          divisao={lista}
          aoFechar={() => setLista(null)}
          aoGravar={() => {
            setLista(null);
            void carregar();
          }}
        />
      )}
      {auto && (
        <ObraAutoRececao
          fecho={f}
          orgId={orgId}
          aoFechar={() => setAuto(false)}
          aoGravar={() => {
            void carregar();
            aoMudar();
          }}
        />
      )}
      {justificar && (
        <Justificar
          aoFechar={() => setJustificar(false)}
          aoGravar={(t) => fazer(() => justificarFecho(obraId, t)).then(() => setJustificar(false))}
        />
      )}
    </div>
  );
}

function Passo({ feito, aviso, children }: { feito: boolean; aviso?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {feito ? (
        <CheckCircle width={16} height={16} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle width={16} height={16} className={cx("mt-0.5 shrink-0", aviso ? "text-amber-500" : "text-red-500")} />
      )}
      <span className={feito ? "text-slate-700" : "text-slate-800"}>{children}</span>
    </li>
  );
}

const COR_REMATE: Record<EstadoRemate, string> = {
  aberto: "bg-amber-50 text-amber-800 ring-amber-200",
  resolvido: "bg-sky-50 text-sky-700 ring-sky-200",
  verificado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function EstadoRemateBadge({ estado }: { estado: EstadoRemate }) {
  return <Badge className={COR_REMATE[estado]}>{ROTULO_ESTADO_REMATE[estado]}</Badge>;
}

function NovaDivisao({ aoFechar, aoGravar }: { aoFechar: () => void; aoGravar: (nome: string, tipo: TipoDivisao) => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDivisao>("geral");
  return (
    <Modal
      title="Nova divisão"
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Voltar
          </Button>
          <Button disabled={!nome.trim()} onClick={() => aoGravar(nome.trim(), tipo)}>
            Criar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <Select
            className="w-full"
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as TipoDivisao;
              setTipo(t);
              if (!nome.trim() && t !== "geral") setNome(ROTULO_TIPO_DIVISAO[t]);
            }}
          >
            {(Object.keys(ROTULO_TIPO_DIVISAO) as TipoDivisao[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_DIVISAO[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" hint="Ex.: Casa de banho suite, Cozinha, Sala">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function NovoRemate({
  orgId,
  obraId,
  divisoes,
  divisaoInicial,
  equipa,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  obraId: string;
  divisoes: DivisaoFecho[];
  divisaoInicial: string | null;
  equipa: readonly MembroEquipa[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [divisao, setDivisao] = useState<string>(divisaoInicial ?? "");
  const [origem, setOrigem] = useState<OrigemRemate>("vistoria");
  const [responsavel, setResponsavel] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar() {
    setAGravar(true);
    setErro(null);
    try {
      await criarRemate({
        organizationId: orgId,
        obraId,
        descricao: descricao.trim(),
        divisaoId: divisao || null,
        origem,
        responsavelId: responsavel || null,
        foto,
      });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível criar o remate.");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal
      title="Novo remate"
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar} disabled={aGravar}>
            Voltar
          </Button>
          <Button disabled={!descricao.trim() || aGravar} onClick={() => void gravar()}>
            {aGravar ? "A gravar…" : "Criar remate"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="O que falta">
          <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: silicone da base com falha junto à parede" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Divisão">
            <Select className="w-full" value={divisao} onChange={(e) => setDivisao(e.target.value)}>
              <option value="">—</option>
              {divisoes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quando">
            <Select className="w-full" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemRemate)}>
              <option value="vistoria">Na vistoria</option>
              <option value="rececao">Na receção (cliente)</option>
              <option value="outro">Outro</option>
            </Select>
          </Field>
        </div>
        <Field label="Responsável">
          <Select className="w-full" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Por atribuir</option>
            {equipa.map((m) => (
              <option key={m.utilizador_id} value={m.utilizador_id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Foto (opcional)">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
          />
        </Field>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function MarcarFotos({
  fecho,
  urls,
  aoFechar,
  aoMarcar,
}: {
  fecho: FechoObra;
  urls: Map<string, string>;
  aoFechar: () => void;
  aoMarcar: (fotoId: string, momento: MomentoFoto | null, divisaoId: string | null) => Promise<unknown>;
}) {
  const [divisao, setDivisao] = useState(fecho.divisoes[0]?.id ?? "");
  return (
    <Modal title="Marcar fotos de antes e depois" size="lg" onClose={aoFechar}>
      <div className="space-y-3">
        <Field label="Divisão">
          <Select className="w-full" value={divisao} onChange={(e) => setDivisao(e.target.value)}>
            {fecho.divisoes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fecho.fotos.map((x) => {
            const aqui = x.divisao_id === divisao;
            return (
              <div key={x.id} className="overflow-hidden rounded-lg border border-slate-200">
                {urls.get(x.caminho) ? (
                  <img src={urls.get(x.caminho)} alt={x.tarefa} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square w-full bg-slate-100" />
                )}
                <p className="truncate px-1.5 pt-1 text-[11px] text-slate-500">{x.tarefa}</p>
                <div className="flex gap-1 p-1.5">
                  {(["antes", "depois"] as const).map((m) => {
                    const ativo = aqui && x.momento === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => void aoMarcar(x.id, ativo ? null : m, ativo ? null : divisao)}
                        className={cx(
                          "flex-1 rounded-md border px-1 py-1 text-xs font-medium",
                          ativo ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600"
                        )}
                      >
                        {m === "antes" ? "Antes" : "Depois"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function EditarLista({
  orgId,
  divisao,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  divisao: DivisaoFecho;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [texto, setTexto] = useState(divisao.itens.join("\n"));
  const [erro, setErro] = useState<string | null>(null);
  async function gravar(itens: string[]) {
    setErro(null);
    try {
      await configurarVistoria(orgId, divisao.tipo, itens);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível guardar a lista.");
    }
  }
  return (
    <Modal
      title={`Lista da vistoria — ${ROTULO_TIPO_DIVISAO[divisao.tipo]}`}
      size="md"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="ghost" onClick={() => void gravar([])}>
            Repor a de origem
          </Button>
          <Button onClick={() => void gravar(texto.split("\n"))}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-slate-500">
          Um item por linha. Vale para todas as divisões deste tipo, em todas as obras da organização. Curta: é para
          responder de pé.
        </p>
        <Textarea rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} />
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function Justificar({ aoFechar, aoGravar }: { aoFechar: () => void; aoGravar: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <Modal
      title="Concluir sem auto de receção"
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Voltar
          </Button>
          <Button disabled={t.trim().length < 10} onClick={() => aoGravar(t.trim())}>
            Guardar justificação
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          Sem a assinatura do cliente, a obra só se conclui com uma justificação tua. Fica registada na obra.
        </p>
        <Textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Ex.: o cliente está fora e aceitou a obra por email a 20/10." />
      </div>
    </Modal>
  );
}
