// Só para os testes (nenhum código da página o importa): o jsdom não tem estas funções, que o Radix usa nos botões de rádio (o tamanho
// do botão) e na lista do Select (ao abrir). Chama-se uma vez, num `beforeAll`.
export function prepararRadixNoJsdom(): void {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
