#!/usr/bin/env bash
#
# O build do Vercel, por passos.
#
# Isto vive num ficheiro, e nao no "buildCommand" do vercel.json, porque o
# Vercel recusa um buildCommand com mais de 256 caracteres — e a cadeia com
# tres aplicacoes passava disso. O deploy nem chegava a arrancar: era
# rejeitado na validacao do vercel.json, sem uma unica linha de registo.

set -euo pipefail

# As tres instalacoes abaixo correm com --prefer-offline --no-audit --no-fund.
# Nenhuma delas precisa de rede: o node_modules vem do cache do Vercel e o npm
# so tem de confirmar que ja esta tudo la. O que gastava os minutos era o
# `npm audit`, que e uma chamada de rede por si so. A 3 e 4 de Setembro, tres
# deploys seguidos levaram 10 a 12 minutos com o cache restaurado e o npm a
# dizer `up to date` -- zero pacotes instalados, 2m + 3m + 4m parados a falar
# com o registry. A compilacao demorou 56s nos tres, como sempre.
#
# Nota: o `npm install` da RAIZ nao esta aqui -- e o Install Command do projeto
# no painel do Vercel, e leva as mesmas flags para ficar coberto.

# ── 1. O CRM ────────────────────────────────────────────────────────────
# A aplicacao principal. Se esta falhar, nao ha deploy — e assim tem de ser.
npm run build

# ── 2. duc-app ──────────────────────────────────────────────────────────
npm --prefix duc-app install --prefer-offline --no-audit --no-fund
npm --prefix duc-app run build
rm -rf dist/duc-app
cp -r duc-app/dist dist/duc-app

# ── 3. operacao-app ─────────────────────────────────────────────────────
# Modulo separado, e tem de continuar separado: se o build dele partir, o
# CRM publica na mesma. O preco e /operacao ficar sem a versao nova — o
# aviso abaixo aparece nos registos para ninguem descobrir isso tarde.
if npm --prefix operacao-app install --prefer-offline --no-audit --no-fund && npm --prefix operacao-app run build; then
  rm -rf dist/operacao
  cp -r operacao-app/dist dist/operacao
else
  echo "=============================================================="
  echo " AVISO: o build do operacao-app falhou."
  echo " O CRM foi publicado na mesma. /operacao ficou por atualizar."
  echo "=============================================================="
fi
