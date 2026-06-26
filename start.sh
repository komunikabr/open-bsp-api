#!/bin/bash
set -e

echo "Starting OpenBSP API local development environment..."

# Start Supabase stack (ignore health check issues with auth container)
npx supabase start --ignore-health-check 2>&1 || true

# Apply any pending migrations
npx supabase migration up --local 2>&1 || true

echo "Supabase stack is up. Starting status dashboard on port 5000..."

# Start the status dashboard
deno run --allow-net --allow-read server.ts
