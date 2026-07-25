# Voz da Uni

## Finalidade

Ouvir as respostas da Uni em voz alta, em vez de apenas ler.

## Onde encontrar

Botão "Ouvir" abaixo de cada resposta da Uni, na tela de chat (`/uni-ai`).

## Passo a passo

1. Tocar em "Ouvir" abaixo de uma resposta da Uni.
2. O áudio é gerado (ou reaproveitado do cache) e tocado automaticamente após esse toque — **não existe reprodução automática sem essa ação do usuário**.
3. É possível pausar, retomar ou parar a reprodução a qualquer momento.
4. Iniciar a reprodução de outra mensagem interrompe automaticamente a que estava tocando.

**Reaproveitamento de áudio (cache)**: se a mesma resposta (mesmo texto, mesma voz, mesmo usuário) já foi gerada antes, o aplicativo reproduz o áudio já existente em vez de gerar de novo — isso significa que ouvir a mesma resposta outra vez, mesmo depois de atualizar a página ou de sair e entrar novamente na conta, **não consome créditos adicionais de geração de voz**. O cache é privado por usuário — outro usuário nunca tem acesso ao áudio já gerado por você, mesmo com o texto idêntico.

**Desativar a voz**: em Configurações → Preferências, desligar o interruptor "Permitir voz nas respostas da Uni". Com a voz desativada, o botão "Ouvir" some das respostas.

## Diferenças PF/PJ

Nenhuma — a voz funciona da mesma forma em ambos os espaços.

## Desktop / mobile

Mesma experiência em ambos.

## Permissões

Cada usuário só ouve e reaproveita o próprio áudio em cache; nunca o de outro usuário.

## Pré-requisitos

Voz precisa estar habilitada nas Preferências (ativada por padrão) e o servidor precisa ter a geração de voz configurada — se não estiver, o botão "Ouvir" indica que o recurso está indisponível no momento, em vez de falhar silenciosamente.

## Limitações atuais

- Não há reprodução automática ao receber uma resposta — sempre exige toque do usuário.
- Não há reconhecimento de voz (ditar uma pergunta) integrado a este recurso — isso é uma funcionalidade separada e não faz parte da voz de resposta da Uni.
- O cache de áudio tem validade de 30 dias; depois disso, uma nova geração pode ocorrer mesmo para o mesmo texto.
- Configurações adicionais de voz (além do interruptor liga/desliga) ainda não estão disponíveis ("Voz e interação" está marcado "em breve").

## Mensagens de erro conhecidas

Se a geração de voz falhar ou não estiver configurada no servidor, a interface indica isso de forma clara, sem travar o restante do chat.

## Funcionalidades ainda não disponíveis

- Reprodução automática de respostas.
- Configurações avançadas de voz e interação.
