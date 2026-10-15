/**
 * A pílula de TEXTO de uma entrada do menu («1 por aprovar», «3 por confirmar»): o estado diz-se por palavras e não só
 * por cor. Serve os contadores de texto do menu (admissões, denúncias); cada um lê a sua própria memória de exemplo.
 */
export function PilulaTexto({ texto }: { texto: string }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold leading-none text-amber-950 tabular-nums">
      {texto}
    </span>
  );
}
