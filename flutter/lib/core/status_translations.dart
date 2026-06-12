String translateStatusPtBr(String? status) {
  final value = (status ?? '').trim().toUpperCase();
  switch (value) {
    case 'CREATED':
      return 'Criada';
    case 'DISPATCHED':
      return 'Despachada';
    case 'ACTIVE':
      return 'Em Operação';
    case 'BOARDING':
      return 'Embarque';
    case 'BOARDED':
      return 'Embarcado';
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
      return 'Em Trânsito';
    case 'COMPLETED':
      return 'Concluída';
    case 'NO_SHOW':
      return 'Não Compareceu';
    case 'CANCELLED':
      return 'Cancelada';
    case 'SCHEDULED':
      return 'Agendada';
    case 'STOPPED':
    case 'IDLE':
      return 'Parado';
    case 'MOVING':
      return 'Em Movimento';
    case 'ONLINE':
      return 'Online';
    case 'OFFLINE':
      return 'Offline';
    case 'WAITING':
      return 'Aguardando';
    case 'ARRIVED':
      return 'Chegou';
    default:
      return status?.toString() ?? '—';
  }
}
