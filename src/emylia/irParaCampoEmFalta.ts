// 27/10 (Rúben): tentou passar de fase com campos em falta: além de abrir o passo, desce até ao 1.º campo em falta,
// põe-lhe o cursor e destaca-o (prototipo.css, .campo-destaque). O campo é o que tem aria-invalid; o destaque vai para a
// linha da pergunta (data-campo), para se ver também a pergunta.
export function irParaCampoEmFalta(atraso = 450) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    const caixa = el.closest<HTMLElement>("[data-campo]") ?? el;
    caixa.scrollIntoView?.({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    caixa.classList.remove("campo-destaque");
    void caixa.offsetWidth; // volta a correr a animação se o mesmo campo for destacado outra vez
    caixa.classList.add("campo-destaque");
    setTimeout(() => caixa.classList.remove("campo-destaque"), 2000);
  }, atraso);
}
