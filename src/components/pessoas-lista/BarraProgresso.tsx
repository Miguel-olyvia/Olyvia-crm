/** Uma barra fina de progresso, só visual (o estado diz-se no contentor live): não mexe no contraste do texto. */
export function BarraProgresso() {
  return (
    <div data-progresso aria-hidden="true" className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
    </div>
  );
}
