import { useEffect, useRef, useState } from "react";
import {
  ErroDeEscrita,
  assinarOrdem,
  assinaturaDaOrdem,
  urlsDosAnexos,
  type Assinatura,
} from "../lib/dados";
import { Button, Card, Field, Input, Modal, cx } from "./ui";

/**
 * A assinatura do cliente, no telemóvel do técnico.
 *
 * Hoje o relatório leva uma linha para assinar à caneta. O papel perde-se,
 * molha-se, fica no carro. Isto fica com a ordem para sempre e sai no
 * relatório.
 *
 * ⚠ O que isto é: o equivalente digital da folha de obra assinada — prova de
 * que uma pessoa esteve no local e aceitou o trabalho, com nome, qualidade e
 * momento. **Não é** uma assinatura eletrónica qualificada, e o ecrã diz
 * isso. Prometer validade legal aqui seria vender uma garantia que isto não
 * dá.
 */
export default function PainelAssinatura({
  ordemId,
  organizationId,
  fechada,
  podeAssinar,
}: {
  ordemId: string;
  organizationId: string;
  /** Só se assina depois de o trabalho acabar. */
  fechada: boolean;
  podeAssinar: boolean;
}) {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [aAssinar, setAAssinar] = useState(false);

  const carregar = async () => {
    const a = await assinaturaDaOrdem(ordemId);
    setAssinatura(a);
    if (a) {
      const m = await urlsDosAnexos([a.caminho]);
      setUrl(m.get(a.caminho) ?? null);
    } else {
      setUrl(null);
    }
  };

  useEffect(() => {
    let vivo = true;
    void assinaturaDaOrdem(ordemId).then(async (a) => {
      if (!vivo) return;
      setAssinatura(a);
      if (a) {
        const m = await urlsDosAnexos([a.caminho]);
        if (vivo) setUrl(m.get(a.caminho) ?? null);
      }
    });
    return () => {
      vivo = false;
    };
  }, [ordemId]);

  // Quem não pode assinar nem tem assinatura para ver não precisa do cartão.
  if (!assinatura && !podeAssinar) return null;

  /*
    ⚠ Antes o cartão **não aparecia de todo** enquanto a ordem não estivesse
    fechada, e quem o procurou disse o que havia a dizer: "não sei fazer a
    assinatura, ela não parece estar a funcionar".

    Não estava avariada — estava invisível. Um ecrã que esconde uma
    funcionalidade até ao momento certo não ensina o momento certo a ninguém:
    ensina que a funcionalidade não existe. Agora o cartão aparece sempre, e
    quando ainda não dá diz **porquê** e **o que falta fazer**.
  */
  const aindaNao = !fechada && podeAssinar && !assinatura;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Assinatura do cliente</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Prova de que alguém esteve no local e aceitou o trabalho. Sai no relatório.
          </p>
        </div>
        {fechada && podeAssinar && (
          <Button variant="secondary" size="sm" onClick={() => setAAssinar(true)}>
            {assinatura ? "Assinar outra vez" : "Recolher assinatura"}
          </Button>
        )}
      </div>

      {aindaNao && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <strong className="font-medium text-slate-800">Ainda não.</strong> A
          assinatura recolhe-se <strong>depois de fechar a ordem</strong> — é o que
          o cliente está a aceitar que tem de estar escrito primeiro. Fecha a
          ordem aqui em cima e o botão aparece neste cartão.
        </p>
      )}

      {assinatura && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            {url ? (
              <img
                src={url}
                alt={`Assinatura de ${assinatura.nome}`}
                className="h-16 w-auto max-w-[16rem] object-contain"
              />
            ) : (
              <div className="flex h-16 w-40 items-center justify-center text-xs text-slate-400">
                a carregar…
              </div>
            )}
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-800">{assinatura.nome}</p>
            {assinatura.qualidade && (
              <p className="text-xs text-slate-500">{assinatura.qualidade}</p>
            )}
            <p className="text-xs text-slate-400">
              {new Date(assinatura.assinada_em).toLocaleString("pt-PT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}

      {aAssinar && (
        <ModalDeAssinatura
          ordemId={ordemId}
          organizationId={organizationId}
          jaExiste={assinatura !== null}
          aoFechar={() => setAAssinar(false)}
          aoGravar={async () => {
            setAAssinar(false);
            await carregar();
          }}
        />
      )}
    </Card>
  );
}

/* ───────────────────────── A caixa de assinar ──────────────────────────── */

function ModalDeAssinatura({
  ordemId,
  organizationId,
  jaExiste,
  aoFechar,
  aoGravar,
}: {
  ordemId: string;
  organizationId: string;
  jaExiste: boolean;
  aoFechar: () => void;
  aoGravar: () => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [qualidade, setQualidade] = useState("");
  const [temTraco, setTemTraco] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tela = useRef<TelaDeAssinar | null>(null);

  const gravar = async () => {
    if (!nome.trim()) {
      setErro("Falta o nome de quem assinou.");
      return;
    }
    const imagem = await tela.current?.paraPNG();
    if (!imagem) {
      setErro("Falta a assinatura. Assina com o dedo no quadrado.");
      return;
    }

    setAGravar(true);
    setErro(null);
    try {
      await assinarOrdem({
        ordemId,
        organizationId,
        imagem,
        nome: nome.trim(),
        qualidade: qualidade.trim() || null,
      });
      await aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title={jaExiste ? "Assinar outra vez" : "Assinatura do cliente"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar} disabled={aGravar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar}>
            {aGravar ? "A gravar…" : "Gravar assinatura"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {jaExiste && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Já há uma assinatura nesta ordem. Esta substitui a anterior, e fica registado que
            houve substituição.
          </p>
        )}

        <Field label="Quem assina" hint="O nome como está no documento de identificação.">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Manuel Silva"
            autoFocus
          />
        </Field>

        <Field
          label="Em que qualidade"
          hint="Opcional, mas vale muito seis meses depois: cliente, condómino, encarregado, porteiro…"
        >
          <Input
            value={qualidade}
            onChange={(e) => setQualidade(e.target.value)}
            placeholder="Ex.: condómino"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700">Assinatura</span>
            <button
              type="button"
              onClick={() => {
                tela.current?.limpar();
                setTemTraco(false);
              }}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Limpar
            </button>
          </div>
          <Tela controlo={tela} aoDesenhar={() => setTemTraco(true)} />
          <p className="mt-1.5 text-xs text-slate-400">
            {temTraco ? "Pronto." : "Assina com o dedo, ou com o rato."}
          </p>
        </div>

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}

        {/* Dizer o que isto é e o que não é, aqui e não em letra pequena numa
            página de termos. Quem recolhe a assinatura tem de o poder explicar
            à pessoa que está a assinar. */}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          Isto é o equivalente digital da folha de obra assinada: prova de que a pessoa esteve
          no local e aceitou o trabalho. Não é uma assinatura eletrónica qualificada — para
          contratos que precisem disso, o Olyvia tem outro caminho.
        </p>
      </div>
    </Modal>
  );
}

/* ────────────────────────────── A tela ─────────────────────────────────── */

interface TelaDeAssinar {
  limpar: () => void;
  /** `null` se ninguém desenhou nada. */
  paraPNG: () => Promise<Blob | null>;
}

/**
 * O quadrado onde se assina.
 *
 * Sem biblioteca — são uns cem pixels de traço, e uma biblioteca traria mais
 * kilobytes do que código. Quatro coisas que não são óbvias e que fazem a
 * diferença entre isto funcionar e não funcionar num telemóvel:
 *
 *  · **`touch-action: none`.** Sem isso, arrastar o dedo faz *scroll* à página
 *    em vez de desenhar, e a pessoa fica a olhar para o ecrã a abanar;
 *  · **eventos de ponteiro, não de rato.** `pointerdown` cobre dedo, caneta e
 *    rato com o mesmo código;
 *  · **`devicePixelRatio`.** Sem escalar a tela, o traço sai desfocado num
 *    telemóvel — que é onde isto vai ser usado sempre;
 *  · **recorte.** Uma assinatura feita a um canto deixa três quartos de branco.
 *    Guardam-se os limites do traço enquanto se desenha e corta-se no fim; sem
 *    isso, no relatório a assinatura fica minúscula a um canto.
 */
function Tela({
  controlo,
  aoDesenhar,
}: {
  /**
   * Não se chama `ref` de propósito. No React 18, `ref` é um nome reservado:
   * React tira-o das props e o componente nunca o recebe — sem erro nenhum,
   * só com um `undefined` a meio de uma função que devia gravar.
   */
  controlo: React.MutableRefObject<TelaDeAssinar | null>;
  aoDesenhar: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const limites = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;

    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const marcar = (x: number, y: number) => {
    const l = limites.current;
    limites.current = l
      ? { x1: Math.min(l.x1, x), y1: Math.min(l.y1, y), x2: Math.max(l.x2, x), y2: Math.max(l.y2, y) }
      : { x1: x, y1: y, x2: x, y2: y };
  };

  controlo.current = {
    limpar() {
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
      limites.current = null;
    },
    async paraPNG() {
      const c = canvas.current;
      const l = limites.current;
      if (!c || !l) return null;

      const dpr = window.devicePixelRatio || 1;
      const margem = 8;
      const x = Math.max(0, (l.x1 - margem) * dpr);
      const y = Math.max(0, (l.y1 - margem) * dpr);
      const w = Math.min(c.width - x, (l.x2 - l.x1 + margem * 2) * dpr);
      const h = Math.min(c.height - y, (l.y2 - l.y1 + margem * 2) * dpr);

      const corte = document.createElement("canvas");
      corte.width = Math.max(1, Math.round(w));
      corte.height = Math.max(1, Math.round(h));
      const ctx = corte.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(c, x, y, w, h, 0, 0, corte.width, corte.height);

      return new Promise<Blob | null>((resolve) => {
        corte.toBlob((b) => resolve(b), "image/png");
      });
    },
  };

  return (
    <canvas
      ref={canvas}
      // `touch-action: none` é o que impede o ecrã de fazer scroll enquanto o
      // dedo desenha. Sem isto, isto não funciona num telemóvel.
      className={cx(
        "h-40 w-full cursor-crosshair rounded-lg bg-white ring-1 ring-slate-300",
        "[touch-action:none]"
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const ctx = e.currentTarget.getContext("2d");
        if (!ctx) return;
        const p = ponto(e);
        desenhando.current = true;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        marcar(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!desenhando.current) return;
        const ctx = e.currentTarget.getContext("2d");
        if (!ctx) return;
        const p = ponto(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        marcar(p.x, p.y);
      }}
      onPointerUp={() => {
        if (!desenhando.current) return;
        desenhando.current = false;
        aoDesenhar();
      }}
      onPointerLeave={() => {
        desenhando.current = false;
      }}
    />
  );
}
