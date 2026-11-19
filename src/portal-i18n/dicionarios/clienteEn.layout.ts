// Customer portal frame (header, buttons, notices), in English: `pc.layout.*` keys.
// The title and the Home/Documents menu are already in clienteEn.ts (`pc.layout.titulo`, `pc.layout.menu.*`);
// here is the "Projects" tab, which in the HR portal groups proposals and contracts.
export const clienteEnLayout: Record<string, string> = {
  "pc.layout.menu.negocios": "Projects",
  "pc.layout.papel": "Customer",
  "pc.layout.mudarParaFornecedor": "Switch to Supplier Portal",
  "pc.layout.sessaoExpirada.titulo": "Session expired",
  "pc.layout.sessaoExpirada.descricao": "Please sign in again.",
  "pc.layout.erro.titulo": "Error",
  "pc.layout.erro.confirmarPassword": "We could not confirm the password change. Please try again.",
};
