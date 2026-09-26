import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useRotulos } from "../auth/Rotulos";
import { Button, Card, ErrorState, Input, Skeleton } from "./ui";
import { AlertTriangle, Check, Eye, EyeOff, Plus, X } from "./icons";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  gravarEspecialidade,
  gravarRotulo,
  listarEspecialidades,
  listarRotulos,
  reporRotulos,
  type Especialidade,
} from "../lib/config";
import {
  LISTAS,
  NOME_DA_LISTA,
  PARA_QUE_SERVE,
  ficaSemNenhuma,
  opcoesDaLista,
  type Lista,
  type RotuloGravado,
} from "../domain/rotulos";

/**
 * O vocabulário da empresa.
 *
 * O módulo nasceu a falar como uma empresa de manutenção de edifícios. Uma
 * empresa de limpezas não faz &ldquo;proação&rdquo;; uma construtora não tem
 * &ldquo;criticidade crítica&rdquo;, tem &ldquo;para a obra&rdquo;; uma frota
 * de camiões não tem &ldquo;pisos&rdquo;.
 *
 * Duas decisões que este ecrã tem de deixar claras, sem uma linha de
 * documentação:
 *
 *  · **Muda-se o nome, não se inventa a opção.** O código por baixo é o
 *    motor: a prioridade ordena a lista de trabalho, a origem escolhe o
 *    caminho, o nível desenha a árvore. Por isso não há botão de "adicionar"
 *    nestas cinco listas — e há, logo em baixo, nas que aceitam tudo.
 *
 *  · **Esconder não apaga o passado.** Uma ordem de há dois anos continua a
 *    mostrar o que dizia. Está escrito no ecrã, porque a pergunta aparece
 *    sempre à terceira vez que alguém esconde alguma coisa.
 */

export default function PainelVocabulario() {
  const { activeOrgId, funcao } = useAuth();
  // Sem isto, mudar um nome aqui só se via depois de recarregar a página —
  // e quem acabou de escrever "Reforço" ia procurá-lo à lista e não o via.
  const { recarregar: recarregarNaAplicacao } = useRotulos();
  const [rotulos, setRotulos] = useState<RotuloGravado[] | null>(null);
  const [skills, setSkills] = useState<Especialidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const podeMudar = funcao === "admin" || funcao === "gestor";

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [r, s] = await Promise.all([
        listarRotulos(activeOrgId),
        listarEspecialidades(activeOrgId).catch(() => [] as Especialidade[]),
      ]);
      setRotulos(r);
      setSkills(s);
      recarregarNaAplicacao();
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o vocabulário.");
      setRotulos([]);
    }
  }, [activeOrgId, recarregarNaAplicacao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (rotulos === null) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">Como a vossa empresa fala</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-600">
          Estas cinco listas vêm com o vocabulário da manutenção de edifícios. Muda-lhes o
          nome para o vosso — <em>proação</em> pode passar a <em>reforço</em>,{" "}
          <em>crítica</em> a <em>para a linha</em> — e esconde o que não usam.
        </p>
        <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <Check width={13} height={13} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-medium text-slate-700">Esconder não apaga o passado.</strong>{" "}
            Tira das caixas de escolha para trabalho novo; as ordens antigas continuam a
            mostrar o que diziam.
          </span>
        </p>
      </Card>

      {LISTAS.map((l) => (
        <BlocoDaLista
          key={l}
          lista={l}
          rotulos={rotulos}
          orgId={activeOrgId ?? ""}
          podeMudar={podeMudar}
          aoGravar={() => void carregar()}
        />
      ))}

      <Especialidades
        skills={skills}
        orgId={activeOrgId ?? ""}
        podeMudar={podeMudar}
        aoGravar={() => void carregar()}
      />
    </div>
  );
}

function BlocoDaLista({
  lista,
  rotulos,
  orgId,
  podeMudar,
  aoGravar,
}: {
  lista: Lista;
  rotulos: RotuloGravado[];
  orgId: string;
  podeMudar: boolean;
  aoGravar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);
  const opcoes = opcoesDaLista(lista, rotulos);
  const mudadas = rotulos.some((r) => r.lista === lista);

  const guardar = async (
    valor: string,
    campos: { nome?: string; ativo?: boolean; ordem?: number }
  ) => {
    const atual = opcoes.find((o) => o.valor === valor);
    if (!atual) return;
    setAGravar(valor);
    setErro(null);
    try {
      await gravarRotulo({
        orgId,
        lista,
        valor,
        nome: campos.nome ?? atual.nome,
        ativo: campos.ativo ?? atual.ativo,
        ordem: campos.ordem,
      });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(null);
    }
  };

  const repor = async () => {
    setAGravar("*");
    setErro(null);
    try {
      await reporRotulos(orgId, lista);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível repor.");
    } finally {
      setAGravar(null);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{NOME_DA_LISTA[lista]}</h3>
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-slate-500">
            {PARA_QUE_SERVE[lista]}
          </p>
        </div>
        {mudadas && podeMudar && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void repor()}
            disabled={aGravar !== null}
          >
            Voltar aos nomes de origem
          </Button>
        )}
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {opcoes.map((o, i) => {
          const ultima = o.ativo && ficaSemNenhuma(lista, o.valor, rotulos);
          return (
            <li key={o.valor} className="flex flex-wrap items-center gap-2 py-2">
              <Input
                defaultValue={o.nome}
                disabled={!podeMudar || aGravar !== null}
                // Grava ao sair do campo e no Enter — não a cada tecla, que
                // era uma escrita na base por letra escrita.
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v && v !== o.nome) void guardar(o.valor, { nome: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="min-w-0 flex-1"
                aria-label={`Nome de ${o.valor}`}
              />

              <span className="shrink-0 font-mono text-[11px] text-slate-400" title="O código que fica gravado nas ordens. Não muda.">
                {o.valor}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={!podeMudar || i === 0 || aGravar !== null}
                  onClick={() => void guardar(o.valor, { ordem: i - 1 })}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Subir"
                  title="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={!podeMudar || i === opcoes.length - 1 || aGravar !== null}
                  onClick={() => void guardar(o.valor, { ordem: i + 1 })}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Descer"
                  title="Descer"
                >
                  ↓
                </button>

                <button
                  type="button"
                  disabled={!podeMudar || ultima || aGravar !== null}
                  onClick={() => void guardar(o.valor, { ativo: !o.ativo })}
                  className="ml-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  title={
                    ultima
                      ? "É a única que sobra. Sem nenhuma, não se conseguia criar trabalho."
                      : o.ativo
                        ? "Esconder das caixas de escolha"
                        : "Voltar a mostrar"
                  }
                >
                  {o.ativo ? (
                    <>
                      <Eye width={13} height={13} /> Em uso
                    </>
                  ) : (
                    <>
                      <EyeOff width={13} height={13} className="text-slate-400" />
                      <span className="text-slate-400">Escondida</span>
                    </>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!podeMudar && (
        <p className="mt-2 text-xs text-slate-500">Só quem gere é que muda estes nomes.</p>
      )}
    </Card>
  );
}

/**
 * As especialidades.
 *
 * Estas aceitam tudo — é uma lista da empresa, não um valor do motor. Existem
 * desde o primeiro dia e nunca tiveram por onde se criar: a agenda tem o
 * filtro, as tarefas têm o campo, e a lista estava sempre vazia.
 */
function Especialidades({
  skills,
  orgId,
  podeMudar,
  aoGravar,
}: {
  skills: Especialidade[];
  orgId: string;
  podeMudar: boolean;
  aoGravar: () => void;
}) {
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const juntar = async () => {
    const nome = nova.trim();
    if (!nome) return;
    setAGravar(true);
    setErro(null);
    try {
      await gravarEspecialidade({ orgId, nome });
      setNova("");
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-800">Especialidades</h3>
      <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-slate-500">
        Eletricista, AVAC, canalizador, jardinagem — o que a vossa equipa tiver. Filtram a
        agenda e dizem quem pode fazer que tarefa. <strong>Estas inventam-se à vontade.</strong>
      </p>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {skills.length === 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
          <span>
            Ainda não há nenhuma. Enquanto esta lista estiver vazia, o filtro por
            especialidade na agenda não mostra nada.
          </span>
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {skills.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1.5 text-sm text-slate-700"
            >
              {s.nome}
              {podeMudar && (
                <button
                  type="button"
                  onClick={() =>
                    void gravarEspecialidade({ orgId, id: s.id, nome: s.nome, ativo: false })
                      .then(aoGravar)
                      .catch((e: unknown) =>
                        setErro(
                          e instanceof ErroDeEscrita ? e.message : "Não foi possível esconder."
                        )
                      )
                  }
                  className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`Tirar ${s.nome}`}
                  title="Tirar da lista"
                >
                  <X width={12} height={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeMudar && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void juntar();
            }}
            placeholder="Eletricista"
            className="min-w-0 flex-1"
            aria-label="Especialidade nova"
          />
          <Button size="sm" onClick={() => void juntar()} disabled={!nova.trim() || aGravar}>
            <Plus width={14} height={14} />
            Juntar
          </Button>
        </div>
      )}
    </Card>
  );
}
