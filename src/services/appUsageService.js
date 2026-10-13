// Registro de uso do app (migration 068): uma chamada ao abrir ou voltar à
// tela (retomando), a cada minuto com a tela visível e ao sair da tela. O
// banco mede o tempo pelo próprio relógio; aqui só se avisa que o app está
// aberto.
import { supabase } from './supabaseClient.js';

export async function registrarUsoDoApp({ retomando = false } = {}) {
  if (!supabase) return;
  // Falha de rede ou sessão expirada não interrompe nada: o próximo minuto
  // tenta de novo.
  await supabase.rpc('registrar_uso_do_app', { p_retomando: retomando });
}
