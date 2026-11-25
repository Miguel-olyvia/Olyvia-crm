// Famílias (interface): o cartão de pré-visualização, ao vivo, de uma família derivada. Bolinhas de cor (o hex vem da OPÇÃO do produto; sem hex não se inventa cor),
// seletor de medida (um eixo «cor» sem nenhuma cor definida desenha-se como botões de texto, não como bolinhas «?»), e o SKU e o preço do PRODUTO da variante escolhida (só leitura). As combinações que não têm produto ficam aria-disabled (focáveis, com a razão).
// O FOCO (contorno exterior, afastado) distingue-se do ESTADO ESCOLHIDO (borda grossa e visto): o anel de foco do tema tem a mesma cor do primário.
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { estiloDaCor, preco } from "./estilosFamilias";
import type { CorCfg, FamiliaCfg, MedidaCfg, VarianteCfg } from "./nucleo";
import { FotoSobreAmostra } from "../AmostraOpcao";
import { MetadesDaCor } from "./pecasFamilias";

const SETAS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
/** As setas movem a escolha entre os radios ativos do grupo (o foco acompanha); os aria-disabled saltam-se. */
function aoTeclar(e: KeyboardEvent<HTMLButtonElement>): void {
  const passo = SETAS[e.key];
  if (!passo) return;
  const radios = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([aria-disabled="true"])') ?? []);
  const i = radios.indexOf(e.currentTarget);
  if (i < 0 || radios.length < 2) return;
  e.preventDefault();
  const seguinte = radios[(i + passo + radios.length) % radios.length];
  seguinte.focus();
  seguinte.click();
}

/** O foco: contorno de 4 px, afastado do botão (visível em qualquer fundo). Nada aqui diz «escolhido». */
const FOCO = "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary";
const RADIO = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[15px] transition-colors motion-reduce:transition-none focus-visible:z-10 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${FOCO}`;

interface BotaoTextoProps { rotulo: string; ligado: boolean; onEscolher: () => void; disponivel?: boolean; idRazao?: string; razao?: string; onFoco?: () => void; onDesfoco?: () => void }

/** Um valor em texto (a medida, ou o valor de um eixo «cor» sem nenhuma cor definida). Indisponível = aria-disabled (focável, com a razão), como as bolinhas. */
function BotaoTexto({ rotulo, ligado, onEscolher, disponivel = true, idRazao, razao, onFoco, onDesfoco }: BotaoTextoProps) {
  return (
    <button type="button" role="radio" aria-checked={ligado} aria-disabled={disponivel ? undefined : true} aria-describedby={disponivel ? undefined : idRazao}
      title={disponivel ? undefined : `${rotulo}: ${razao}`} tabIndex={ligado ? 0 : -1} onClick={() => { if (disponivel) onEscolher(); }} onKeyDown={aoTeclar} onFocus={onFoco} onBlur={onDesfoco}
      className={cn(RADIO, "border-2", ligado ? "border-foreground bg-primary/10 font-semibold" : "border-input bg-background hover:bg-accent")}>
      {ligado && <span aria-hidden="true" className="mr-1.5">✓</span>}{rotulo}
    </button>
  );
}

function BotaoMedida({ m, ligado, onEscolher }: { m: MedidaCfg; ligado: boolean; onEscolher: () => void }) {
  return <BotaoTexto rotulo={m.rotulo} ligado={ligado} onEscolher={onEscolher} />;
}

interface BolinhaProps { c: CorCfg; ligada: boolean; disponivel: boolean; idRazao: string; onEscolher: () => void; onFoco: (id: string | null) => void }

function BolinhaCor({ c, ligada, disponivel, idRazao, onEscolher, onFoco }: BolinhaProps) {
  // uma cor com foto (e sem hex) não está «sem cor definida»: a foto é a cor
  const semCor = c.hex.length === 0 && !c.foto;
  return (
    <button type="button" role="radio" aria-checked={ligada} aria-label={semCor ? `${c.nome} (sem cor definida)` : c.nome} aria-disabled={disponivel ? undefined : true}
      aria-describedby={disponivel ? undefined : idRazao} title={disponivel ? c.nome : `${c.nome}: esta cor não existe nesta medida.`} tabIndex={ligada ? 0 : -1}
      onClick={() => { if (disponivel) onEscolher(); }} onKeyDown={aoTeclar} onFocus={() => onFoco(c.id)} onBlur={() => onFoco(null)} style={estiloDaCor(c.hex)}
      // a borda interior fixa de 2 px a 60 % do texto (3:1) mantém o branco e o preto visíveis nos dois temas; escolhida = borda de 3 px a 100 % e visto
      className={cn(RADIO, "relative h-11 w-11 shrink-0 overflow-hidden p-0", semCor && "border-dashed bg-muted text-xs", ligada ? "border-[3px] border-foreground" : "border-2 border-foreground/60")}>
      <MetadesDaCor hex={c.hex} />
      <FotoSobreAmostra foto={c.foto} />
      {(ligada || semCor) && <span aria-hidden="true" className={cn("pointer-events-none absolute text-base font-bold leading-none", semCor ? "text-foreground" : "text-white mix-blend-difference")}>{ligada ? "✓" : "?"}</span>}
    </button>
  );
}

export function CartaoFamiliaPreview({ familia }: { familia: FamiliaCfg }) {
  const { variantes, medidas, cores, eixos } = familia;
  const idRazao = useId();
  const [escolha, setEscolha] = useState<{ medidaId: string; corId: string }>({ medidaId: variantes[0]?.medidaId ?? "", corId: variantes[0]?.corId ?? "" });
  const [emFoco, setEmFoco] = useState<string | null>(null);
  if (variantes.length === 0) return null;
  const temMedida = (id: string) => variantes.some((v) => v.medidaId === id);
  const medidaId = temMedida(escolha.medidaId) ? escolha.medidaId : variantes[0].medidaId;
  const dessa = (v: VarianteCfg) => v.medidaId === medidaId;
  const corId = variantes.some((v) => dessa(v) && v.corId === escolha.corId) ? escolha.corId : (variantes.find(dessa)?.corId ?? variantes[0].corId);
  const atual = variantes.find((v) => dessa(v) && v.corId === corId) ?? variantes[0];
  const corMostrada = cores.find((c) => c.id === (emFoco ?? atual.corId));
  const comCor = eixos.cor !== null && cores.length > 0, comMedida = eixos.medida.length > 0;
  // nenhuma cor definida (ex.: «Medida» escolhida para as bolinhas): os valores são texto, não cores; com uma só cor definida mantêm-se as bolinhas
  const valoresEmTexto = cores.every((c) => c.hex.length === 0 && !c.foto);
  const razao = valoresEmTexto ? "Esta opção não existe nesta medida." : "Esta cor não existe nesta medida.";
  const detalhe = [familia.marca, familia.categoria].filter(Boolean).join(" · ");
  return (
    <div role="group" aria-label="Pré-visualização da família" className="grid max-w-md gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div>
        <h4 className="break-words text-lg font-semibold leading-tight">{familia.nome}</h4>
        {detalhe && <p className="text-[15px] text-muted-foreground">{detalhe}</p>}
      </div>
      {comCor && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium text-muted-foreground">{eixos.cor}: <span className="text-foreground">{corMostrada?.nome}</span></p>
          <span id={idRazao} className="sr-only">{razao}</span>
          <div role="radiogroup" aria-label={eixos.cor ?? "Cor"} className={valoresEmTexto ? "flex flex-wrap gap-2 p-1" : "flex flex-wrap gap-3 p-1"}>
            {cores.map((c) => {
              const disponivel = variantes.some((v) => dessa(v) && v.corId === c.id), escolher = () => setEscolha({ medidaId, corId: c.id });
              return valoresEmTexto
                ? <BotaoTexto key={c.id} rotulo={c.nome} ligado={c.id === corId} disponivel={disponivel} idRazao={idRazao} razao={razao} onEscolher={escolher} onFoco={() => setEmFoco(c.id)} onDesfoco={() => setEmFoco(null)} />
                : <BolinhaCor key={c.id} c={c} ligada={c.id === corId} disponivel={disponivel} idRazao={idRazao} onEscolher={escolher} onFoco={setEmFoco} />;
            })}
          </div>
        </div>
      )}
      {comMedida && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium text-muted-foreground">Medida</p>
          <div role="radiogroup" aria-label="Medida" className="flex flex-wrap gap-2 p-1">
            {medidas.filter((m) => temMedida(m.id)).map((m) => <BotaoMedida key={m.id} m={m} ligado={m.id === medidaId} onEscolher={() => setEscolha({ medidaId: m.id, corId })} />)}
          </div>
        </div>
      )}
      <div aria-live="polite" className="grid gap-0.5 border-t border-border pt-3">
        <p className="break-words text-[15px] font-medium">{atual.produtoNome}</p>
        <p className="text-sm text-muted-foreground">SKU {atual.sku}</p>
        <p className="text-lg font-semibold tabular-nums">{preco(atual.preco)}</p>
      </div>
    </div>
  );
}
