import { useEffect, useState } from "react";
import { instalarPack, listarPacks, type Pack, type ResultadoDoPack } from "../lib/config";
import { ErroDeEscrita } from "../lib/dados";
import { Badge, Button, Card, ConfirmDialog } from "./ui";
import { Check } from "./icons";

/**
 * Começar com um pack, em vez de com uma árvore em branco.
 *
 * Uma árvore de definições vazia acaba sempre em caixote — é a razão pela qual
 * na instância do Infraspeak existem categorias chamadas "BM24 PISO" e pastas
 * comerciais dentro de "Manutenções". Ninguém montou aquilo mal de propósito;
 * montou-o sem nada por onde se guiar.
 *
 * O cartão fica **aberto enquanto não houver configuração** e fechado depois —
 * quem já montou a operação não precisa de o ver todos os dias, mas continua a
 * poder acrescentar um setor novo mais tarde.
 */
export default function PainelPacks({
  orgId,
  vazio,
  aoInstalar,
}: {
  orgId: string | null;
  /** Ainda não há checklists nem medições. É o primeiro dia. */
  vazio: boolean;
  aoInstalar: () => void;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [aberto, setAberto] = useState(vazio);
  const [aConfirmar, setAConfirmar] = useState<Pack | null>(null);
  const [aInstalar, setAInstalar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoPack | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarPacks().then((p) => {
      if (vivo) setPacks(p);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (packs.length === 0) return null;

  const instalar = async (p: Pack) => {
    if (!orgId) return;
    setAConfirmar(null);
    setAInstalar(p.pack);
    setErro(null);
    try {
      const r = await instalarPack(orgId, p.pack);
      setResultado(r);
      aoInstalar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível instalar.");
    } finally {
      setAInstalar(null);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Começar com um pack</h2>
          <p className="mt-0.5 max-w-prose text-xs text-slate-500">
            Categorias, medições e checklists já feitas, para se poder abrir a primeira ordem
            hoje. Depois edita-se o que não servir.
          </p>
        </div>
        {!vazio && (
          <Button variant="secondary" size="sm" onClick={() => setAberto((x) => !x)}>
            {aberto ? "Fechar" : "Ver packs"}
          </Button>
        )}
      </div>

      {aberto && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {packs.map((p) => (
            <li
              key={p.pack}
              className="flex flex-col rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70"
            >
              <h3 className="text-sm font-medium text-slate-800">{p.nome}</h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{p.descricao}</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Badge className="bg-white text-slate-600 ring-slate-200">
                  {p.categorias} categorias
                </Badge>
                <Badge className="bg-white text-slate-600 ring-slate-200">
                  {p.medicoes} medições
                </Badge>
                <Badge className="bg-white text-slate-600 ring-slate-200">
                  {p.checklists} checklists
                </Badge>
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={aInstalar !== null}
                onClick={() => setAConfirmar(p)}
              >
                {aInstalar === p.pack ? "A instalar…" : "Instalar"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {resultado && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Check width={14} height={14} className="mt-0.5 shrink-0" />
          <span>{resumo(resultado)}</span>
        </p>
      )}

      {aConfirmar && (
        <ConfirmDialog
          title={`Instalar “${aConfirmar.nome}”?`}
          confirmLabel="Instalar"
          // O medo certo aqui é "vai-me estragar o que já montei". A resposta
          // tem de vir antes da pergunta, e não depois.
          message={
            <>
              Acrescenta o que faltar e <strong>não mexe em nada do que já existe</strong> —
              se uma categoria, uma medição ou uma checklist já cá estiver, passa à frente.
              Podes correr isto outra vez sem duplicar nada.
            </>
          }
          onConfirm={() => void instalar(aConfirmar)}
          onCancel={() => setAConfirmar(null)}
        />
      )}
    </Card>
  );
}

/** O que se criou e o que já lá estava, numa frase que se lê. */
function resumo(r: ResultadoDoPack): string {
  const criou = [
    r.criadas.categorias && `${r.criadas.categorias} categorias`,
    r.criadas.medicoes && `${r.criadas.medicoes} medições`,
    r.criadas.checklists && `${r.criadas.checklists} checklists`,
  ].filter(Boolean);

  if (criou.length === 0) return `“${r.nome}” já estava todo instalado. Nada mudou.`;
  return `“${r.nome}” instalado: ${criou.join(", ")}.`;
}
