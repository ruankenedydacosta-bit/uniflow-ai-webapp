# Financeiro Mobile V1

Camada de apresentação mobile, isolada do Financeiro desktop. Usa snapshots locais imutáveis e delega os comandos de gerenciamento aos modais já existentes da página.

- Visível somente abaixo de 768px.
- Não calcula saldos nem classifica transações.
- Não consulta APIs, Supabase ou provedores bancários.
- O botão contextual abre ações financeiras; a navegação central da Uni permanece sob responsabilidade do Mobile App Shell.
