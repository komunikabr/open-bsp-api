---
name: MsgHub Portal Architecture
description: Decisões de arquitetura do portal MsgHub (OpenBSP white-label)
---

## Negócio
- Usuário é Tech Provider Meta com app aprovado e WABA único
- OpenBSP centraliza múltiplas aplicações/clientes como tenants isolados
- Plataforma = MsgHub (nome escolhido); Supabase e OpenBSP são invisíveis ao cliente

## RLS e Permissões
- `get_authorized_orgs()` checa tabela `agents`, não `organizations` diretamente
- O role do agente fica em `agents.extra->>'role'` (JSONB), não coluna separada
- Trigger `after_insert_on_organizations` cria entrada em `agents` como owner automaticamente
- API keys INSERT requer role `owner` na org (via `get_authorized_orgs('owner')`)
- Enum `role` no DB: owner, admin, member

## Proxy
- server.ts em Deno na porta 5000 faz proxy /proxy/* → http://127.0.0.1:54321
- Headers (Authorization, apikey) são todos encaminhados — Supabase transparente

## Portal (public/index.html)
- SPA pura com Supabase JS via esm.sh (sem build step)
- Custom selects via divs (não <select> nativo) para estilização correta
- Confirmações destrutivas usam modal com desafio de texto (digitar REVOGAR/REMOVER)
- Erros de RLS code 42501 mostram mensagem amigável ao usuário

**Why:** Supabase não deve aparecer para o cliente final; toda auth é via JWT do portal
