# Autenticação e onboarding

## Finalidade

Como criar conta, entrar, recuperar senha, e o que acontece no primeiro acesso.

## Onde encontrar

`/login` (entrar/criar conta), `/redefinir-senha` (nova senha), `/auth/callback`
(retorno do Google), `/apresentacao` (apresentação pós-login) e
`/plano-pessoal` (etapa de plano, quando aplicável). `/` e a URL legada
`/welcome` redirecionam para `/login` quando não há sessão.

## Passo a passo

**Login**: e-mail/senha ou "Entrar com Google". Não há login com link mágico. O botão de login com Apple existe visualmente, mas ainda mostra "estará disponível em breve" — não funciona.

**Criar conta**: mesmo formulário do login, alternando para o modo "Criar conta" (e-mail/senha). Após criar, se a confirmação de e-mail estiver ativa, o usuário vê "Conta criada. Confira seu email para confirmar o acesso."

**Recuperar senha**:
1. Na tela de login, tocar em "Esqueci minha senha".
2. Informar o e-mail. A resposta é sempre neutra: "Se existir uma conta com este e-mail, enviaremos as instruções de recuperação." (não revela se o e-mail existe).
3. Abrir o link recebido por e-mail — leva a `/redefinir-senha`.
4. Definir uma nova senha (mínimo 8 caracteres, confirmação obrigatória).
5. Após salvar, o usuário é desconectado e redirecionado ao login com a senha nova.

A troca de senha também pode ser iniciada logado, em Configurações → Segurança.

**Primeiro acesso**: depois de autenticar, o usuário passa pela apresentação
pós-login e pelo Plano Pessoal, quando aplicável, antes de chegar à Home
simplificada. A antiga apresentação pública em `/welcome` não faz mais parte
do fluxo.

## Diferenças PF/PJ

Os workspaces Pessoal e Empresa permanecem isolados e são resolvidos pelo
contexto autenticado existente.

## Desktop / mobile

Fluxo idêntico em ambos; layout adaptado.

## Permissões

Não aplicável — esta etapa acontece antes de haver papéis definidos.

## Pré-requisitos

E-mail válido. Para Google, uma conta Google.

## Limitações atuais

- Sem login por Apple (placeholder apenas).
- Sem autenticação em duas etapas.
- Sem gerenciamento de sessões ativas.
- Sem edição de e-mail ou de avatar pelo próprio usuário (ver `settings-and-security.md`).

## Mensagens de erro conhecidas

- Falha ao criar conta: "Não foi possível criar sua conta. Revise os dados e tente novamente."
- Falha ao entrar: "Não foi possível entrar. Confira seus dados e tente novamente."
- Falha no retorno do Google: "Não foi possível concluir o acesso com Google. Tente novamente."
- Link de recuperação inválido/expirado: "Este link de recuperação é inválido ou já expirou."

## Funcionalidades ainda não disponíveis

- Login com Apple.
- Autenticação em duas etapas.
- Sessões ativas / logout remoto.
