// SHA-1 do innerHTML que o ProposalPortalDocument produzia em português ANTES de ganhar `idiomasDoDocumento`,
// um cenário de cada vez (ver ProposalPortalDocument.fixtures.ts). Capturado do componente original; não se
// edita à mão: se um destes mudar, o HTML do português de sempre mudou.
export const PT_HTML_BASELINE: Record<string, string> = {
  single: "3dccc38aa2e5e4f68882020938c61bfc2ce411c1",
  singleIdle: "3dccc38aa2e5e4f68882020938c61bfc2ce411c1",
  singleInput: "905f5bfea2ae89049eed9ef71aa94fe029049e14",
  singleSending: "649675fff7d906b673b1b2910fea137994a0467d",
  singleVerifying: "334153df98497cb4daf105d74efafc72790b3759",
  singleVerified: "704b9b554e06ad19bedaa8204972a97cafcce7f1",
  singleError: "48193cc5d69654a627eab2cb9a5cc47a3de4ce5f",
  singlePreview: "a1cef987d2747d9b77152315f3063d20ff0b0922",
  multi: "647dec7bfbec6e8b6dc22bf14a67ae153a815852",
  multiSections: "71ec91c636a41372af1e4f5ffccdf1ea8c439ac7",
  accepted: "f3dc5923537c62de57401fb3ba1c127550647f9a",
  rejected: "4088d696f88c167f90e80f7fae29449575f48e1c",
  configured: "0d8f4dfa5e60b7d6450491a968a33587b079cf99",
  fallback: "99d565ced71c7d5c24005f6aa3b492287b883550",
};
