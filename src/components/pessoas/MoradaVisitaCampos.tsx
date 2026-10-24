// "Morada da visita": a escolha entre "Na morada da lead" (só leitura, por defeito se a lead tiver morada) e "Outra morada"
// (rua e número, código postal 0000-000, localidade, andar ou fração e uma nota de acesso). Sem morada da lead só há a
// segunda. Partilhado pelo "Registar chamada", pelo diálogo "Marcar visita" das submissões e por "Alterar visita".
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "./CamposDataHora";
import { classeCartao } from "./cartaoOpcao";
import { MAX_NOTA_ACESSO, textoMoradaVisita, type DestinoVisita, type ErroMoradaVisita } from "./moradaVisita";
import { Visto } from "./OpcoesResultado";
import type { MoradaVisita } from "./pessoasTipos";

const A = "pessoasPagina.visitAddr.";
const CAMPO = cn("min-h-11", FOCO);

interface MoradaVisitaCamposProps {
  /** A base dos ids dos campos. */
  id: string;
  /** A morada que a lead indicou; `null` = a ficha não tem (só "Outra morada"). */
  moradaLead: MoradaVisita | null;
  valor: DestinoVisita;
  erro: ErroMoradaVisita | null;
  aoMudar: (destino: DestinoVisita) => void;
}

interface OpcaoProps {
  nome: string;
  escolhida: boolean;
  titulo: string;
  detalhe?: string;
  aoEscolher: () => void;
}

/** Um cartão de escolha única (rádio): o título, uma linha de apoio opcional e o visto quando escolhido. */
function Opcao({ nome, escolhida, titulo, detalhe, aoEscolher }: OpcaoProps) {
  return (
    <label className="relative flex cursor-pointer">
      <input type="radio" name={nome} className="peer sr-only" checked={escolhida} onChange={aoEscolher} />
      <span className={classeCartao(escolhida)}>
        <span className="min-w-0">
          <span className="block">{titulo}</span>
          {detalhe && <span className="block break-words text-xs font-normal text-muted-foreground">{detalhe}</span>}
        </span>
        <Visto escolhido={escolhida} />
      </span>
    </label>
  );
}

function CampoTexto(p: { id: string; rotulo: string; valor: string; erro?: string | null; max?: number; ajuda?: string; aoMudar: (v: string) => void; wide?: boolean; inputMode?: "numeric" }) {
  return (
    <div className={cn("space-y-1.5", p.wide && "sm:col-span-2")}>
      <Label htmlFor={p.id}>{p.rotulo}</Label>
      <Input
        id={p.id} value={p.valor} autoComplete="off" maxLength={p.max} inputMode={p.inputMode} placeholder={p.ajuda}
        aria-invalid={p.erro ? true : undefined} aria-describedby={p.erro ? `${p.id}-erro` : undefined}
        className={cn(CAMPO, p.erro && "border-destructive")} onChange={(e) => p.aoMudar(e.target.value)}
      />
      {p.erro && <MensagemErro id={`${p.id}-erro`} texto={p.erro} />}
    </div>
  );
}

/** Os campos de "Outra morada". */
function CamposOutra({ id, valor, erro, aoMudar }: Pick<MoradaVisitaCamposProps, "id" | "valor" | "erro" | "aoMudar">) {
  const { t } = useTranslation();
  const o = valor.outra;
  const mudar = (parcial: Partial<MoradaVisita>) => aoMudar({ ...valor, outra: { ...o, ...parcial } });
  const texto = (e: ErroMoradaVisita) => (erro === e ? t(`${A}error.${e}`, { max: MAX_NOTA_ACESSO }) : null);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CampoTexto id={`${id}-rua`} rotulo={t(`${A}street`)} valor={o.rua} erro={texto("ruaVazia")} aoMudar={(rua) => mudar({ rua })} wide />
      <CampoTexto
        id={`${id}-cp`} rotulo={t(`${A}postal`)} valor={o.codigoPostal} max={8} ajuda={t(`${A}postal.placeholder`)} inputMode="numeric"
        erro={texto("codigoPostalInvalido")} aoMudar={(codigoPostal) => mudar({ codigoPostal })}
      />
      <CampoTexto id={`${id}-localidade`} rotulo={t(`${A}city`)} valor={o.localidade} aoMudar={(localidade) => mudar({ localidade })} />
      <CampoTexto id={`${id}-andar`} rotulo={t(`${A}unit`)} valor={o.andar} aoMudar={(andar) => mudar({ andar })} wide />
      <CampoTexto
        id={`${id}-acesso`} rotulo={t(`${A}access`)} valor={valor.notaAcesso} erro={texto("notaAcessoComprida")} wide
        aoMudar={(notaAcesso) => aoMudar({ ...valor, notaAcesso })}
      />
    </div>
  );
}

export function MoradaVisitaCampos({ id, moradaLead, valor, erro, aoMudar }: MoradaVisitaCamposProps) {
  const { t } = useTranslation();
  const nome = useId();
  const naLead = moradaLead !== null && valor.igualALead;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-foreground">{t(`${A}title`)}</legend>
      {moradaLead ? (
        <div className="grid grid-cols-1 gap-2">
          <Opcao
            nome={nome} escolhida={naLead} titulo={t(`${A}same`)} detalhe={`${t(`${A}sameHint`)}: ${textoMoradaVisita(moradaLead)}`}
            aoEscolher={() => aoMudar({ ...valor, igualALead: true })}
          />
          <Opcao nome={nome} escolhida={!naLead} titulo={t(`${A}other`)} aoEscolher={() => aoMudar({ ...valor, igualALead: false })} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t(`${A}noLead`)}</p>
      )}
      {!naLead && <CamposOutra id={id} valor={valor} erro={erro} aoMudar={aoMudar} />}
    </fieldset>
  );
}
