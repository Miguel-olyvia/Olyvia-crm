#!/usr/bin/env bash
#
# O build do Vercel, por passos.
#
# Isto vive num ficheiro, e nao no "buildCommand" do vercel.json, porque o
# Vercel recusa um buildCommand com mais de 256 caracteres — e a cadeia com
# tres aplicacoes passava disso. O deploy nem chegava a arrancar: era
# rejeitado na validacao do vercel.json, sem uma unica linha de registo.

set -euo pipefail

# ── 1. O CRM ────────────────────────────────────────────────────────────
# A aplicacao principal. Se esta falhar, nao ha deploy — e assim tem de ser.
npm run build

# ── 2. duc-app ──────────────────────────────────────────────────────────
npm --prefix duc-app install
npm --prefix duc-app run build
rm -rf dist/duc-app
cp -r duc-app/dist dist/duc-app

# ── 3. operacao-app ─────────────────────────────────────────────────────
# Modulo separado, e tem de continuar separado: se o build dele partir, o
# CRM publica na mesma. O preco e /operacao ficar sem a versao nova — o
# aviso abaixo aparece nos registos para ninguem descobrir isso tarde.
if npm --prefix operacao-app install && npm --prefix operacao-app run build; then
  rm -rf dist/operacao
  cp -r operacao-app/dist dist/operacao
else
  echo "=============================================================="
  echo " AVISO: o build do operacao-app falhou."
  echo " O CRM foi publicado na mesma. /operacao ficou por atualizar."
  echo "=============================================================="
fi
