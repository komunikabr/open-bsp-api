# OpenBSP API — Guia Técnico para o Replit

## ⚠️ Regras absolutas para qualquer agente que trabalhar neste projeto

1. **O Replit é APENAS um editor de código.** Nunca instale infraestrutura Replit (Replit Auth, Neon, Drizzle, Postgres do Replit).
2. **O banco de dados é Supabase hospedado** (VPS próprio do usuário). Nunca substitua por outro.
3. **O runtime é Deno**, não Node/Express. O `server.ts` na raiz é um proxy Deno puro.
4. **Nunca crie `package.json`** na raiz. O projeto não usa npm.
5. **Nunca modifique** `supabase/schemas/`, `supabase/migrations/`, `supabase/functions/` sem instrução explícita.
6. Comunicação com o usuário deve ser **em Português**.

---

## Visão Geral

**OpenBSP API** é uma plataforma open-source de WhatsApp Business (e Instagram) multi-tenant, pronta para AI agents. Stack completa:

| Camada | Tecnologia |
|---|---|
| Banco de dados | Supabase (Postgres + RLS + Auth + Storage + Vault) |
| Edge Functions | Deno (dentro do Supabase) |
| Dev proxy (Replit) | Deno (`server.ts` na raiz) |
| Portal web | SPA vanilla JS (`public/index.html`) com `@supabase/supabase-js` |
| Schema declarativo | SQL em `supabase/schemas/` |
| Migrations | SQL em `supabase/migrations/` |

O usuário desenvolve no Replit (edição de código) e implanta no VPS próprio com `supabase start` / `supabase db push`.

---

## Estrutura de Arquivos

```
.
├── server.ts                        # Proxy Deno para dev no Replit (porta 5000)
├── server/
│   └── index.ts                     # Alternativa Express (NÃO é o entry point)
├── public/
│   └── index.html                   # Portal do desenvolvedor (SPA)
├── supabase/
│   ├── config.toml                  # Configuração do projeto Supabase local
│   ├── seed.sql                     # Dados de teste (personagens Minecraft)
│   ├── schemas/                     # Schema declarativo (fonte da verdade)
│   │   ├── 01_types.sql             # ENUMs: direction, service, role, etc.
│   │   ├── 02_functions/            # Funções SQL (triggers, edge, RLS helpers)
│   │   ├── 03_models/               # Tabelas
│   │   ├── 04_functions_post_tables/# Funções que referenciam tabelas
│   │   └── 05_rls/                  # Políticas RLS por tabela
│   ├── migrations/                  # Histórico de migrations geradas
│   └── functions/                   # Edge Functions Deno
│       ├── _shared/                 # Código compartilhado entre funções
│       ├── whatsapp-webhook/        # Recebe webhooks da Meta
│       ├── instagram-webhook/       # Recebe webhooks do Instagram
│       ├── whatsapp-dispatcher/     # Envia mensagens WhatsApp
│       ├── whatsapp-management/     # Gerencia números/templates
│       ├── media-preprocessor/      # Pré-processa mídia
│       ├── agent-client/            # Cliente para AI agents (A2A protocol)
│       └── mcp/                     # Model Context Protocol server
└── AUTH.md                          # Documentação completa do sistema de auth
```

---

## Workflow do Replit

**Comando:** `deno run --allow-net --allow-read --allow-env server.ts`  
**Porta:** 5000

O `server.ts` faz três coisas:
1. Serve os arquivos estáticos de `./public/`
2. Expõe `GET /api/config` → retorna `{ url, anonKey }` do Supabase (lido das env vars)
3. Faz proxy de `GET|POST|... /proxy/*` → repassa para o Supabase hospedado

```
Browser → /api/config     → server.ts → retorna SUPABASE_URL + SUPABASE_ANON_KEY
Browser → /proxy/rest/v1/ → server.ts → SUPABASE_URL/rest/v1/ (proxy transparente)
Browser → /               → server.ts → public/index.html
```

---

## Variáveis de Ambiente (Secrets do Replit)

| Variável | Descrição | Obrigatória |
|---|---|---|
| `SUPABASE_URL` | URL do projeto Supabase hospedado (ex: `https://xyzxyz.supabase.co` ou IP do VPS) | ✅ |
| `SUPABASE_ANON_KEY` | Chave anon/public do Supabase | ✅ |
| `API_BASE_URL` | Base URL pública da API exibida no portal (ex: `https://api.msghub.com.br/v1`). Se não definida, usa o origin atual como fallback. | ❌ |

Configurar em: **Ferramentas → Secrets** no Replit.

As Edge Functions no Supabase usam variáveis adicionais configuradas via `supabase secrets set`:
- `WHATSAPP_VERIFY_TOKEN` — token de verificação do webhook Meta
- `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_ACCESS_TOKEN`
- `edge_functions_url`, `edge_functions_token` (guardados no Vault do Supabase)

---

## Modelo de Dados (tabelas principais)

```
organizations              → Tenant raiz (empresa/cliente)
  └─ organizations_addresses → Números WhatsApp/Instagram conectados
  └─ agents                  → Membros humanos e AI agents da org
  └─ contacts                → Contatos (clientes finais)
  └─ contacts_addresses      → Endereços dos contatos (número WA, etc.)
  └─ conversations           → Conversas
  └─ messages                → Mensagens (incoming/outgoing/internal)
  └─ api_keys                → Chaves de API da org
  └─ webhooks                → Webhooks configurados pela org
  └─ quick_replies           → Respostas rápidas
  └─ logs                    → Logs de eventos
  └─ onboarding_tokens       → Tokens de onboarding
```

**ENUMs importantes:**
- `service`: `whatsapp | instagram | local`
- `direction`: `incoming | outgoing | internal`
- `role`: `owner | admin | member`

---

## Sistema de Autenticação (resumo — ver AUTH.md para detalhes completos)

O OpenBSP tem dois modos de autenticação que coexistem:

### 1. JWT (usuários humanos via Supabase Auth)
- Login via Google/GitHub OAuth no portal
- Supabase emite JWT; `auth.uid()` fica disponível no Postgres
- RLS resolve organização via tabela `agents` (onde `user_id = auth.uid()`)

### 2. API Key (integrations e AI agents)
- Chave armazenada na tabela `api_keys`
- Enviada no header HTTP customizado `api-key`
- RLS resolve organização via `get_authorized_orgs()` → busca na tabela `api_keys`

### Função central de RLS: `get_authorized_orgs(role)`
```sql
-- Prioridade 1: JWT (auth.uid() não nulo)
--   → busca em agents onde user_id = auth.uid()
-- Prioridade 2: API Key (api-key header)
--   → busca em api_keys onde key = request.headers['api-key']
-- Sem nenhum: raise exception
```

### Como chamar a REST API
```bash
# Com API Key (sem usuário logado)
curl 'SUPABASE_URL/rest/v1/messages?select=*' \
  -H "apikey: SUPABASE_ANON_KEY" \
  -H "api-key: OPENBSP_API_KEY"

# NÃO fazer: Authorization: Bearer OPENBSP_API_KEY  ← PostgREST rejeita (não é JWT)
```

### Como chamar Edge Functions
```bash
curl 'SUPABASE_URL/functions/v1/mcp' \
  -X POST \
  -H "Authorization: Bearer OPENBSP_API_KEY" \
  -H "Content-Type: application/json"
# Kong não valida JWT em Edge Functions; a função extrai o Bearer e busca em api_keys
```

---

## Edge Functions

Todas as funções usam **Hono** como framework HTTP e compartilham código via `supabase/functions/_shared/`.

| Função | Descrição | JWT obrigatório |
|---|---|---|
| `whatsapp-webhook` | Recebe eventos da Meta (mensagens, status, etc.) | Não (verify_token) |
| `instagram-webhook` | Recebe eventos do Instagram | Não (verify_token) |
| `whatsapp-dispatcher` | Acionado por trigger DB; envia mensagem via API Meta | Não (service role interno) |
| `whatsapp-management` | CRUD de números, templates, etc. | Sim (API Key) |
| `media-preprocessor` | Download e upload de mídias para Storage | Interno |
| `agent-client` | Protocolo A2A para AI agents externos | Sim (API Key) |
| `mcp` | Model Context Protocol server (tools para LLMs) | Sim (API Key) |

### Fluxo de envio de mensagem (outgoing)
```
INSERT INTO messages (direction='outgoing') 
  → trigger dispatcher_edge_function()
  → chama whatsapp-dispatcher Edge Function via net.http_post
  → Edge Function chama API Meta
  → atualiza messages.status com timestamp de entrega
```

O `base_url` e `auth_token` do dispatcher são armazenados no **Supabase Vault** (secrets criptografados), não em env vars:
- `vault.decrypted_secrets` where `name = 'edge_functions_url'`
- `vault.decrypted_secrets` where `name = 'edge_functions_token'`

---

## Triggers importantes

| Trigger | Tabela | Evento | Ação |
|---|---|---|---|
| `dispatcher_edge_function` | `messages` | AFTER INSERT (outgoing) | Chama Edge Function dispatcher |
| `handle_new_invitation` | `agents` | BEFORE INSERT | Associa `user_id` pelo e-mail |
| `lookup_agents_by_email` | `auth.users` | AFTER INSERT | Associa agentes pendentes ao novo usuário |
| `after_insert_on_organizations` | `organizations` | AFTER INSERT | Cria endereço `local` e agente owner |
| `enforce_invitation_status_flow` | `agents` | BEFORE UPDATE | Garante fluxo pending→accepted/rejected |
| `prevent_last_owner_deletion` | `agents` | BEFORE DELETE/UPDATE | Impede remoção do último owner |
| `set_updated_at` | várias | BEFORE UPDATE | Atualiza `updated_at` automaticamente |

---

## RLS: Arquitetura de Permissões

Todas as tabelas usam a função `get_authorized_orgs(role)` como base:

```
org_id IN (SELECT get_authorized_orgs('member'))  → leitura geral
org_id IN (SELECT get_authorized_orgs('admin'))   → escrita geral
org_id IN (SELECT get_authorized_orgs('owner'))   → ações privilegiadas
```

**Atenção**: A tabela `agents` é a ponte JWT↔org. RLS nela usa `user_id = auth.uid()` diretamente (não `get_authorized_orgs`) para evitar recursão infinita.

---

## Portal do Desenvolvedor (`public/index.html`)

SPA vanilla JS com Tailwind CSS (via CDN). Funciona assim:

1. Ao carregar, faz `GET /api/config` para obter `{ url, anonKey }`
2. Inicializa `@supabase/supabase-js` apontando para `window.location.origin + '/proxy'`
3. Todo tráfego Supabase passa pelo proxy Deno em `server.ts`

Autenticação no portal: e-mail/senha via Supabase Auth (pode adicionar OAuth Google/GitHub nas configurações do Supabase).

---

## Como desenvolver localmente (VPS / máquina do usuário)

```bash
# 1. Instalar Supabase CLI
brew install supabase/tap/supabase

# 2. Iniciar ambiente local
supabase start

# 3. Aplicar schema
supabase db push  # ou: supabase db reset (para reconstruir do zero)

# 4. Seed de dados
supabase db seed  # usa supabase/seed.sql

# 5. Rodar o portal (opcional, para dev local)
deno run --allow-net --allow-read --allow-env server.ts
```

---

## Como aplicar mudanças no schema

O projeto usa schema **declarativo** em `supabase/schemas/` (fonte da verdade) e gera migrations para o histórico.

```bash
# Gerar migration a partir das mudanças no schema
supabase db diff --schema public -f nome_da_migration

# Aplicar no banco hospedado
supabase db push --db-url postgresql://...
```

---

## User preferences

- Comunicação sempre em Português
- Replit é APENAS editor de código — nunca instalar infraestrutura Replit
- Stack: Deno + Supabase (não Node, não Neon, não Drizzle, não Replit Auth)
