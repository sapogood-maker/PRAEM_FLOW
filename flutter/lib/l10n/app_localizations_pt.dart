// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appTitle => 'PRAEM OPS';

  @override
  String get loginSubtitle => 'Terminal Operacional Motorista';

  @override
  String get email => 'Email';

  @override
  String get password => 'Senha';

  @override
  String get loginInvalidCredentials =>
      'Email ou senha inválidos. Use seu login operacional.';

  @override
  String get loginEntering => 'Entrando…';

  @override
  String get loginAction => 'ENTRAR';

  @override
  String get vehicleSelectTitle => 'Selecionar Veículo';

  @override
  String get retry => 'TENTAR NOVAMENTE';

  @override
  String vehicleLoadError(Object message) {
    return 'Erro ao carregar veículos: $message';
  }

  @override
  String vehicleCapacity(Object capacity) {
    return 'Cap. $capacity pac.';
  }

  @override
  String get tripDetailsTooltip => 'Detalhes da viagem';

  @override
  String get reloadRouteTooltip => 'Recarregar rota';

  @override
  String get logout => 'Sair';

  @override
  String get openScannerAction => 'ABRIR SCANNER';

  @override
  String get scanQrFab => 'SCAN QR';

  @override
  String get qrScannerTitle => 'Escanear QR do Passageiro';

  @override
  String get boardingConfirmed => 'Embarque Confirmado';

  @override
  String get passengerLabel => 'Passageiro';

  @override
  String get destinationLabel => 'Destino';

  @override
  String get eventLabel => 'Evento';

  @override
  String get tripLabel => 'Viagem';

  @override
  String get continueScanning =>
      'Continue escaneando os próximos passageiros...';

  @override
  String get validationFailed => 'Validação operacional falhou';

  @override
  String get clearAction => 'LIMPAR';

  @override
  String get scannerHint =>
      'Abra o scanner e escaneie o QR do passageiro para confirmar o embarque.';

  @override
  String get connectionGpsActive => 'GPS ativo';

  @override
  String get connectionGpsInactive => 'GPS inativo';

  @override
  String connectionPending(Object count) {
    return 'Pendências: $count';
  }

  @override
  String connectionWs(Object status) {
    return 'WS: $status';
  }

  @override
  String connectionApi(Object status) {
    return 'API: $status';
  }

  @override
  String get lastSyncUnknown => 'Último sync: —';

  @override
  String lastSyncAt(Object time) {
    return 'Último sync: $time';
  }

  @override
  String get syncAction => 'SYNC';

  @override
  String get connectivityOnline => 'ONLINE';

  @override
  String get connectivityDegraded => 'DEGRADADO';

  @override
  String get connectivityOffline => 'OFFLINE';

  @override
  String get connectivitySyncing => 'SINCRONIZANDO';

  @override
  String get navigateAction => 'NAVEGAR';

  @override
  String get finalizeOperation => 'FINALIZAR OPERAÇÃO';

  @override
  String get sendQrAction => 'ENVIAR QR';

  @override
  String get shareAction => 'COMPARTILHAR';

  @override
  String get qrWillBeSent => 'QR será enviado via WhatsApp';

  @override
  String get routeShared => 'Rota compartilhada';

  @override
  String startNavigationTo(Object destinationType) {
    return 'INICIAR NAVEGAÇÃO · $destinationType';
  }

  @override
  String passengerManifestTitle(Object count, Object pluralSuffix) {
    return 'MANIFESTO ($count passageiro$pluralSuffix)';
  }

  @override
  String get noAssignedPassenger => 'Nenhum passageiro atribuído';

  @override
  String get statusBoarding => 'EMBARCANDO';

  @override
  String get statusInTransit => 'EM TRÂNSITO';

  @override
  String get statusArrived => 'CHEGOU';

  @override
  String get statusCompleted => 'CONCLUÍDO';

  @override
  String get statusNoShow => 'NÃO VEIO';

  @override
  String get statusCancelled => 'CANCELADO';

  @override
  String get statusWaiting => 'AGUARDANDO';

  @override
  String staleRouteWarning(Object hours, Object level) {
    return '⚠️ Rota desatualizada (${hours}h) · $level';
  }

  @override
  String get previousOperationDetected => 'Operação anterior detectada';

  @override
  String get originFallback => 'Origem';

  @override
  String get destinationFallback => 'Destino';

  @override
  String staleLevel(Object hours, Object level) {
    return 'Desatualizada: ${hours}h · nível $level';
  }

  @override
  String stalePassengersSummary(Object boarded, Object inTransit) {
    return 'Passageiros embarcados: $boarded · Em trânsito: $inTransit';
  }

  @override
  String get yes => 'SIM';

  @override
  String get no => 'NÃO';

  @override
  String get continueOperation => 'CONTINUAR OPERAÇÃO';

  @override
  String get emergencyBoardingAction => 'SCAN QR — Embarque de emergência';

  @override
  String get tripDetailsTitle => 'Detalhes da Viagem';

  @override
  String get origin => 'ORIGEM';

  @override
  String get destinationUpper => 'DESTINO';

  @override
  String get stopsItinerary => 'ROTEIRO DE PARADAS';

  @override
  String get scanPatientQr => 'SCAN QR PACIENTE';

  @override
  String manifestWithCount(Object count) {
    return 'MANIFESTO ($count pac.)';
  }

  @override
  String get stopUpdateError => 'Erro ao atualizar parada';

  @override
  String plannedArrival(Object value) {
    return '📅 Previsto: $value';
  }

  @override
  String actualArrival(Object value) {
    return '✅ Chegou: $value';
  }

  @override
  String get navigate => 'Navegar';

  @override
  String get confirmArrival => '✅ Confirmar Chegada';

  @override
  String get startBoarding => '🚶 Iniciar Embarque';

  @override
  String get completeStop => '✔ Concluir Parada';

  @override
  String get skipStop => '⏭ Pular';

  @override
  String riskLabel(Object risk) {
    return 'Risco: $risk';
  }

  @override
  String boardedAt(Object value) {
    return 'Embarcou: $value';
  }

  @override
  String get goToAddress => 'Ir até endereço';

  @override
  String get navigateToPatient => 'Navegar até paciente';

  @override
  String get navigateToHospital => 'Navegar até hospital';

  @override
  String get navigateReturn => 'Navegar retorno';

  @override
  String get destinationDefault => 'Destino';

  @override
  String get googleMaps => 'Google Maps';

  @override
  String get googleMapsSubtitle => 'Navegação com trânsito em tempo real';

  @override
  String get waze => 'Waze';

  @override
  String get wazeSubtitle => 'Alertas de trânsito e rotas alternativas';

  @override
  String get routeNotFound => 'Rota não encontrada';
}

/// The translations for Portuguese, as used in Brazil (`pt_BR`).
class AppLocalizationsPtBr extends AppLocalizationsPt {
  AppLocalizationsPtBr() : super('pt_BR');

  @override
  String get appTitle => 'PRAEM OPS';

  @override
  String get loginSubtitle => 'Terminal Operacional Motorista';

  @override
  String get email => 'Email';

  @override
  String get password => 'Senha';

  @override
  String get loginInvalidCredentials =>
      'Email ou senha inválidos. Use seu login operacional.';

  @override
  String get loginEntering => 'Entrando…';

  @override
  String get loginAction => 'ENTRAR';

  @override
  String get vehicleSelectTitle => 'Selecionar Veículo';

  @override
  String get retry => 'TENTAR NOVAMENTE';

  @override
  String vehicleLoadError(Object message) {
    return 'Erro ao carregar veículos: $message';
  }

  @override
  String vehicleCapacity(Object capacity) {
    return 'Cap. $capacity pac.';
  }

  @override
  String get tripDetailsTooltip => 'Detalhes da viagem';

  @override
  String get reloadRouteTooltip => 'Recarregar rota';

  @override
  String get logout => 'Sair';

  @override
  String get openScannerAction => 'ABRIR SCANNER';

  @override
  String get scanQrFab => 'SCAN QR';

  @override
  String get qrScannerTitle => 'Escanear QR do Passageiro';

  @override
  String get boardingConfirmed => 'Embarque Confirmado';

  @override
  String get passengerLabel => 'Passageiro';

  @override
  String get destinationLabel => 'Destino';

  @override
  String get eventLabel => 'Evento';

  @override
  String get tripLabel => 'Viagem';

  @override
  String get continueScanning =>
      'Continue escaneando os próximos passageiros...';

  @override
  String get validationFailed => 'Validação operacional falhou';

  @override
  String get clearAction => 'LIMPAR';

  @override
  String get scannerHint =>
      'Abra o scanner e escaneie o QR do passageiro para confirmar o embarque.';

  @override
  String get connectionGpsActive => 'GPS ativo';

  @override
  String get connectionGpsInactive => 'GPS inativo';

  @override
  String connectionPending(Object count) {
    return 'Pendências: $count';
  }

  @override
  String connectionWs(Object status) {
    return 'WS: $status';
  }

  @override
  String connectionApi(Object status) {
    return 'API: $status';
  }

  @override
  String get lastSyncUnknown => 'Último sync: —';

  @override
  String lastSyncAt(Object time) {
    return 'Último sync: $time';
  }

  @override
  String get syncAction => 'SYNC';

  @override
  String get connectivityOnline => 'ONLINE';

  @override
  String get connectivityDegraded => 'DEGRADADO';

  @override
  String get connectivityOffline => 'OFFLINE';

  @override
  String get connectivitySyncing => 'SINCRONIZANDO';

  @override
  String get navigateAction => 'NAVEGAR';

  @override
  String get finalizeOperation => 'FINALIZAR OPERAÇÃO';

  @override
  String get sendQrAction => 'ENVIAR QR';

  @override
  String get shareAction => 'COMPARTILHAR';

  @override
  String get qrWillBeSent => 'QR será enviado via WhatsApp';

  @override
  String get routeShared => 'Rota compartilhada';

  @override
  String startNavigationTo(Object destinationType) {
    return 'INICIAR NAVEGAÇÃO · $destinationType';
  }

  @override
  String passengerManifestTitle(Object count, Object pluralSuffix) {
    return 'MANIFESTO ($count passageiro$pluralSuffix)';
  }

  @override
  String get noAssignedPassenger => 'Nenhum passageiro atribuído';

  @override
  String get statusBoarding => 'EMBARCANDO';

  @override
  String get statusInTransit => 'EM TRÂNSITO';

  @override
  String get statusArrived => 'CHEGOU';

  @override
  String get statusCompleted => 'CONCLUÍDO';

  @override
  String get statusNoShow => 'NÃO VEIO';

  @override
  String get statusCancelled => 'CANCELADO';

  @override
  String get statusWaiting => 'AGUARDANDO';

  @override
  String staleRouteWarning(Object hours, Object level) {
    return '⚠️ Rota desatualizada (${hours}h) · $level';
  }

  @override
  String get previousOperationDetected => 'Operação anterior detectada';

  @override
  String get originFallback => 'Origem';

  @override
  String get destinationFallback => 'Destino';

  @override
  String staleLevel(Object hours, Object level) {
    return 'Desatualizada: ${hours}h · nível $level';
  }

  @override
  String stalePassengersSummary(Object boarded, Object inTransit) {
    return 'Passageiros embarcados: $boarded · Em trânsito: $inTransit';
  }

  @override
  String get yes => 'SIM';

  @override
  String get no => 'NÃO';

  @override
  String get continueOperation => 'CONTINUAR OPERAÇÃO';

  @override
  String get emergencyBoardingAction => 'SCAN QR — Embarque de emergência';

  @override
  String get tripDetailsTitle => 'Detalhes da Viagem';

  @override
  String get origin => 'ORIGEM';

  @override
  String get destinationUpper => 'DESTINO';

  @override
  String get stopsItinerary => 'ROTEIRO DE PARADAS';

  @override
  String get scanPatientQr => 'SCAN QR PACIENTE';

  @override
  String manifestWithCount(Object count) {
    return 'MANIFESTO ($count pac.)';
  }

  @override
  String get stopUpdateError => 'Erro ao atualizar parada';

  @override
  String plannedArrival(Object value) {
    return '📅 Previsto: $value';
  }

  @override
  String actualArrival(Object value) {
    return '✅ Chegou: $value';
  }

  @override
  String get navigate => 'Navegar';

  @override
  String get confirmArrival => '✅ Confirmar Chegada';

  @override
  String get startBoarding => '🚶 Iniciar Embarque';

  @override
  String get completeStop => '✔ Concluir Parada';

  @override
  String get skipStop => '⏭ Pular';

  @override
  String riskLabel(Object risk) {
    return 'Risco: $risk';
  }

  @override
  String boardedAt(Object value) {
    return 'Embarcou: $value';
  }

  @override
  String get goToAddress => 'Ir até endereço';

  @override
  String get navigateToPatient => 'Navegar até paciente';

  @override
  String get navigateToHospital => 'Navegar até hospital';

  @override
  String get navigateReturn => 'Navegar retorno';

  @override
  String get destinationDefault => 'Destino';

  @override
  String get googleMaps => 'Google Maps';

  @override
  String get googleMapsSubtitle => 'Navegação com trânsito em tempo real';

  @override
  String get waze => 'Waze';

  @override
  String get wazeSubtitle => 'Alertas de trânsito e rotas alternativas';

  @override
  String get routeNotFound => 'Rota não encontrada';
}
