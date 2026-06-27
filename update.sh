#!/bin/bash
# update.sh — Atualiza o OpenBSP e reinicia o servidor
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/openbsp.log"
ENV_FILE="$HOME/.openbsp.env"

echo "🔄 Atualizando OpenBSP..."
cd "$PROJECT_DIR"

# Puxa últimas alterações
git pull

# Carrega variáveis de ambiente
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
  echo "✅ Variáveis carregadas de $ENV_FILE"
else
  echo "⚠️  Arquivo $ENV_FILE não encontrado. Crie-o com:"
  echo "   echo 'export SUPABASE_URL=...' >> ~/.openbsp.env"
  echo "   echo 'export SUPABASE_ANON_KEY=...' >> ~/.openbsp.env"
fi

# Para o processo anterior
if pkill -f "deno run.*server.ts" 2>/dev/null; then
  echo "🛑 Servidor anterior encerrado."
  sleep 1
fi

# Inicia o servidor em background
nohup deno run --allow-net --allow-read --allow-env "$PROJECT_DIR/server.ts" >> "$LOG_FILE" 2>&1 &
PID=$!

echo "✅ OpenBSP rodando! PID: $PID"
echo "📋 Logs: tail -f $LOG_FILE"
echo "🌐 Portal:  http://$(curl -s ifconfig.me):5000/app"
echo "🔧 Admin:   http://$(curl -s ifconfig.me):5000/admin"
