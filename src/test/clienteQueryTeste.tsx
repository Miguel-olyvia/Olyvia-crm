// Só para testes: um cliente do react-query por montagem, sem repetições. A ficha real monta o fornecedor do questionário do levantamento
// (react-query) à volta dos registos; sem fonte real não lê nada, por isso os testes que não falam com a base só precisam de o ter à volta.
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function ComClienteQuery({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
