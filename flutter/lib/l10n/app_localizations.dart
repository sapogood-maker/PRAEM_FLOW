import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_pt.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('pt'),
    Locale('pt', 'BR')
  ];

  /// No description provided for @appTitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'PRAEM OPS'**
  String get appTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Terminal Operacional Motorista'**
  String get loginSubtitle;

  /// No description provided for @email.
  ///
  /// In pt_BR, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In pt_BR, this message translates to:
  /// **'Senha'**
  String get password;

  /// No description provided for @loginInvalidCredentials.
  ///
  /// In pt_BR, this message translates to:
  /// **'Email ou senha inválidos. Use seu login operacional.'**
  String get loginInvalidCredentials;

  /// No description provided for @loginEntering.
  ///
  /// In pt_BR, this message translates to:
  /// **'Entrando…'**
  String get loginEntering;

  /// No description provided for @loginAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'ENTRAR'**
  String get loginAction;

  /// No description provided for @vehicleSelectTitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Selecionar Veículo'**
  String get vehicleSelectTitle;

  /// No description provided for @retry.
  ///
  /// In pt_BR, this message translates to:
  /// **'TENTAR NOVAMENTE'**
  String get retry;

  /// No description provided for @vehicleLoadError.
  ///
  /// In pt_BR, this message translates to:
  /// **'Erro ao carregar veículos: {message}'**
  String vehicleLoadError(Object message);

  /// No description provided for @vehicleCapacity.
  ///
  /// In pt_BR, this message translates to:
  /// **'Cap. {capacity} pac.'**
  String vehicleCapacity(Object capacity);

  /// No description provided for @tripDetailsTooltip.
  ///
  /// In pt_BR, this message translates to:
  /// **'Detalhes da viagem'**
  String get tripDetailsTooltip;

  /// No description provided for @reloadRouteTooltip.
  ///
  /// In pt_BR, this message translates to:
  /// **'Recarregar rota'**
  String get reloadRouteTooltip;

  /// No description provided for @logout.
  ///
  /// In pt_BR, this message translates to:
  /// **'Sair'**
  String get logout;

  /// No description provided for @openScannerAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'ABRIR SCANNER'**
  String get openScannerAction;

  /// No description provided for @scanQrFab.
  ///
  /// In pt_BR, this message translates to:
  /// **'SCAN QR'**
  String get scanQrFab;

  /// No description provided for @qrScannerTitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Escanear QR do Passageiro'**
  String get qrScannerTitle;

  /// No description provided for @boardingConfirmed.
  ///
  /// In pt_BR, this message translates to:
  /// **'Embarque Confirmado'**
  String get boardingConfirmed;

  /// No description provided for @passengerLabel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Passageiro'**
  String get passengerLabel;

  /// No description provided for @destinationLabel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Destino'**
  String get destinationLabel;

  /// No description provided for @eventLabel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Evento'**
  String get eventLabel;

  /// No description provided for @tripLabel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Viagem'**
  String get tripLabel;

  /// No description provided for @continueScanning.
  ///
  /// In pt_BR, this message translates to:
  /// **'Continue escaneando os próximos passageiros...'**
  String get continueScanning;

  /// No description provided for @validationFailed.
  ///
  /// In pt_BR, this message translates to:
  /// **'Validação operacional falhou'**
  String get validationFailed;

  /// No description provided for @clearAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'LIMPAR'**
  String get clearAction;

  /// No description provided for @scannerHint.
  ///
  /// In pt_BR, this message translates to:
  /// **'Abra o scanner e escaneie o QR do passageiro para confirmar o embarque.'**
  String get scannerHint;

  /// No description provided for @connectionGpsActive.
  ///
  /// In pt_BR, this message translates to:
  /// **'GPS ativo'**
  String get connectionGpsActive;

  /// No description provided for @connectionGpsInactive.
  ///
  /// In pt_BR, this message translates to:
  /// **'GPS inativo'**
  String get connectionGpsInactive;

  /// No description provided for @connectionPending.
  ///
  /// In pt_BR, this message translates to:
  /// **'Pendências: {count}'**
  String connectionPending(Object count);

  /// No description provided for @connectionWs.
  ///
  /// In pt_BR, this message translates to:
  /// **'WS: {status}'**
  String connectionWs(Object status);

  /// No description provided for @connectionApi.
  ///
  /// In pt_BR, this message translates to:
  /// **'API: {status}'**
  String connectionApi(Object status);

  /// No description provided for @lastSyncUnknown.
  ///
  /// In pt_BR, this message translates to:
  /// **'Último sync: —'**
  String get lastSyncUnknown;

  /// No description provided for @lastSyncAt.
  ///
  /// In pt_BR, this message translates to:
  /// **'Último sync: {time}'**
  String lastSyncAt(Object time);

  /// No description provided for @syncAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'SYNC'**
  String get syncAction;

  /// No description provided for @connectivityOnline.
  ///
  /// In pt_BR, this message translates to:
  /// **'ONLINE'**
  String get connectivityOnline;

  /// No description provided for @connectivityDegraded.
  ///
  /// In pt_BR, this message translates to:
  /// **'DEGRADADO'**
  String get connectivityDegraded;

  /// No description provided for @connectivityOffline.
  ///
  /// In pt_BR, this message translates to:
  /// **'OFFLINE'**
  String get connectivityOffline;

  /// No description provided for @connectivitySyncing.
  ///
  /// In pt_BR, this message translates to:
  /// **'SINCRONIZANDO'**
  String get connectivitySyncing;

  /// No description provided for @navigateAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'NAVEGAR'**
  String get navigateAction;

  /// No description provided for @finalizeOperation.
  ///
  /// In pt_BR, this message translates to:
  /// **'FINALIZAR OPERAÇÃO'**
  String get finalizeOperation;

  /// No description provided for @sendQrAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'ENVIAR QR'**
  String get sendQrAction;

  /// No description provided for @shareAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'COMPARTILHAR'**
  String get shareAction;

  /// No description provided for @qrWillBeSent.
  ///
  /// In pt_BR, this message translates to:
  /// **'QR será enviado via WhatsApp'**
  String get qrWillBeSent;

  /// No description provided for @routeShared.
  ///
  /// In pt_BR, this message translates to:
  /// **'Rota compartilhada'**
  String get routeShared;

  /// No description provided for @startNavigationTo.
  ///
  /// In pt_BR, this message translates to:
  /// **'INICIAR NAVEGAÇÃO · {destinationType}'**
  String startNavigationTo(Object destinationType);

  /// No description provided for @passengerManifestTitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'MANIFESTO ({count} passageiro{pluralSuffix})'**
  String passengerManifestTitle(Object count, Object pluralSuffix);

  /// No description provided for @noAssignedPassenger.
  ///
  /// In pt_BR, this message translates to:
  /// **'Nenhum passageiro atribuído'**
  String get noAssignedPassenger;

  /// No description provided for @statusBoarding.
  ///
  /// In pt_BR, this message translates to:
  /// **'EMBARCANDO'**
  String get statusBoarding;

  /// No description provided for @statusInTransit.
  ///
  /// In pt_BR, this message translates to:
  /// **'EM TRÂNSITO'**
  String get statusInTransit;

  /// No description provided for @statusArrived.
  ///
  /// In pt_BR, this message translates to:
  /// **'CHEGOU'**
  String get statusArrived;

  /// No description provided for @statusCompleted.
  ///
  /// In pt_BR, this message translates to:
  /// **'CONCLUÍDO'**
  String get statusCompleted;

  /// No description provided for @statusNoShow.
  ///
  /// In pt_BR, this message translates to:
  /// **'NÃO VEIO'**
  String get statusNoShow;

  /// No description provided for @statusCancelled.
  ///
  /// In pt_BR, this message translates to:
  /// **'CANCELADO'**
  String get statusCancelled;

  /// No description provided for @statusWaiting.
  ///
  /// In pt_BR, this message translates to:
  /// **'AGUARDANDO'**
  String get statusWaiting;

  /// No description provided for @staleRouteWarning.
  ///
  /// In pt_BR, this message translates to:
  /// **'⚠️ Rota desatualizada ({hours}h) · {level}'**
  String staleRouteWarning(Object hours, Object level);

  /// No description provided for @previousOperationDetected.
  ///
  /// In pt_BR, this message translates to:
  /// **'Operação anterior detectada'**
  String get previousOperationDetected;

  /// No description provided for @originFallback.
  ///
  /// In pt_BR, this message translates to:
  /// **'Origem'**
  String get originFallback;

  /// No description provided for @destinationFallback.
  ///
  /// In pt_BR, this message translates to:
  /// **'Destino'**
  String get destinationFallback;

  /// No description provided for @staleLevel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Desatualizada: {hours}h · nível {level}'**
  String staleLevel(Object hours, Object level);

  /// No description provided for @stalePassengersSummary.
  ///
  /// In pt_BR, this message translates to:
  /// **'Passageiros embarcados: {boarded} · Em trânsito: {inTransit}'**
  String stalePassengersSummary(Object boarded, Object inTransit);

  /// No description provided for @yes.
  ///
  /// In pt_BR, this message translates to:
  /// **'SIM'**
  String get yes;

  /// No description provided for @no.
  ///
  /// In pt_BR, this message translates to:
  /// **'NÃO'**
  String get no;

  /// No description provided for @continueOperation.
  ///
  /// In pt_BR, this message translates to:
  /// **'CONTINUAR OPERAÇÃO'**
  String get continueOperation;

  /// No description provided for @emergencyBoardingAction.
  ///
  /// In pt_BR, this message translates to:
  /// **'SCAN QR — Embarque de emergência'**
  String get emergencyBoardingAction;

  /// No description provided for @tripDetailsTitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Detalhes da Viagem'**
  String get tripDetailsTitle;

  /// No description provided for @origin.
  ///
  /// In pt_BR, this message translates to:
  /// **'ORIGEM'**
  String get origin;

  /// No description provided for @destinationUpper.
  ///
  /// In pt_BR, this message translates to:
  /// **'DESTINO'**
  String get destinationUpper;

  /// No description provided for @stopsItinerary.
  ///
  /// In pt_BR, this message translates to:
  /// **'ROTEIRO DE PARADAS'**
  String get stopsItinerary;

  /// No description provided for @scanPatientQr.
  ///
  /// In pt_BR, this message translates to:
  /// **'SCAN QR PACIENTE'**
  String get scanPatientQr;

  /// No description provided for @manifestWithCount.
  ///
  /// In pt_BR, this message translates to:
  /// **'MANIFESTO ({count} pac.)'**
  String manifestWithCount(Object count);

  /// No description provided for @stopUpdateError.
  ///
  /// In pt_BR, this message translates to:
  /// **'Erro ao atualizar parada'**
  String get stopUpdateError;

  /// No description provided for @plannedArrival.
  ///
  /// In pt_BR, this message translates to:
  /// **'📅 Previsto: {value}'**
  String plannedArrival(Object value);

  /// No description provided for @actualArrival.
  ///
  /// In pt_BR, this message translates to:
  /// **'✅ Chegou: {value}'**
  String actualArrival(Object value);

  /// No description provided for @navigate.
  ///
  /// In pt_BR, this message translates to:
  /// **'Navegar'**
  String get navigate;

  /// No description provided for @confirmArrival.
  ///
  /// In pt_BR, this message translates to:
  /// **'✅ Confirmar Chegada'**
  String get confirmArrival;

  /// No description provided for @startBoarding.
  ///
  /// In pt_BR, this message translates to:
  /// **'🚶 Iniciar Embarque'**
  String get startBoarding;

  /// No description provided for @completeStop.
  ///
  /// In pt_BR, this message translates to:
  /// **'✔ Concluir Parada'**
  String get completeStop;

  /// No description provided for @skipStop.
  ///
  /// In pt_BR, this message translates to:
  /// **'⏭ Pular'**
  String get skipStop;

  /// No description provided for @riskLabel.
  ///
  /// In pt_BR, this message translates to:
  /// **'Risco: {risk}'**
  String riskLabel(Object risk);

  /// No description provided for @boardedAt.
  ///
  /// In pt_BR, this message translates to:
  /// **'Embarcou: {value}'**
  String boardedAt(Object value);

  /// No description provided for @goToAddress.
  ///
  /// In pt_BR, this message translates to:
  /// **'Ir até endereço'**
  String get goToAddress;

  /// No description provided for @navigateToPatient.
  ///
  /// In pt_BR, this message translates to:
  /// **'Navegar até paciente'**
  String get navigateToPatient;

  /// No description provided for @navigateToHospital.
  ///
  /// In pt_BR, this message translates to:
  /// **'Navegar até hospital'**
  String get navigateToHospital;

  /// No description provided for @navigateReturn.
  ///
  /// In pt_BR, this message translates to:
  /// **'Navegar retorno'**
  String get navigateReturn;

  /// No description provided for @destinationDefault.
  ///
  /// In pt_BR, this message translates to:
  /// **'Destino'**
  String get destinationDefault;

  /// No description provided for @googleMaps.
  ///
  /// In pt_BR, this message translates to:
  /// **'Google Maps'**
  String get googleMaps;

  /// No description provided for @googleMapsSubtitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Navegação com trânsito em tempo real'**
  String get googleMapsSubtitle;

  /// No description provided for @waze.
  ///
  /// In pt_BR, this message translates to:
  /// **'Waze'**
  String get waze;

  /// No description provided for @wazeSubtitle.
  ///
  /// In pt_BR, this message translates to:
  /// **'Alertas de trânsito e rotas alternativas'**
  String get wazeSubtitle;

  /// No description provided for @routeNotFound.
  ///
  /// In pt_BR, this message translates to:
  /// **'Rota não encontrada'**
  String get routeNotFound;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['pt'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when language+country codes are specified.
  switch (locale.languageCode) {
    case 'pt':
      {
        switch (locale.countryCode) {
          case 'BR':
            return AppLocalizationsPtBr();
        }
        break;
      }
  }

  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'pt':
      return AppLocalizationsPt();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
