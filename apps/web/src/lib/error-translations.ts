const ERROR_PT_BR: Record<string, string> = {
  'Patient not found': 'Paciente não encontrado',
  'Route not found': 'Rota não encontrada',
  'Trip not found': 'Viagem não encontrada',
  'Trip already completed': 'Viagem já concluída',
  'Invalid QR Code': 'QR Code inválido',
  'Invalid credentials': 'Credenciais inválidas',
  'Synchronization failed': 'Falha de sincronização',
  'Operational conflict': 'Conflito operacional',
};

export function translateErrorMessage(input?: unknown): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return 'Erro operacional';
  return ERROR_PT_BR[value] ?? value;
}
