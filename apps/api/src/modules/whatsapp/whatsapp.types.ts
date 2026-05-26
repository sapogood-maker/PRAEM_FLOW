// Provider-agnostic messaging types — swap ZApiAdapter for any future provider

export interface ProviderSendResponse {
  messageId?: string;
  status: 'SENT' | 'FAILED';
  raw?: Record<string, unknown>;
  error?: string;
}

export interface IMessageProvider {
  sendText(phone: string, message: string): Promise<ProviderSendResponse>;
  sendImage(phone: string, imageUrl: string, caption?: string): Promise<ProviderSendResponse>;
  sendImageBase64(phone: string, base64: string, caption?: string): Promise<ProviderSendResponse>;
  sendLocation(phone: string, lat: number, lng: number, address?: string): Promise<ProviderSendResponse>;
  sendLink(phone: string, url: string, title: string): Promise<ProviderSendResponse>;
}

export interface SendMessageOptions {
  tenantId: string;
  patientId?: string;
  tripId?: string;
  routeId?: string;
  phone: string;
  templateKey: NotificationTemplateKey;
  variables?: Record<string, string>;
}

export type NotificationTemplateKey =
  | 'appointment_confirmation'
  | 'driver_arriving'
  | 'route_started'
  | 'boarding_confirmed'
  | 'arrival_expected'
  | 'appointment_reminder'
  | 'no_show'
  | 'trip_completed'
  | 'boarding_qr'
  | 'tracking_link'
  | 'stale_recovery';

export const DEFAULT_TEMPLATES: Record<NotificationTemplateKey, { title: string; message: string; variables: string[] }> = {
  appointment_confirmation: {
    title: 'Confirmação de Agendamento',
    message: 'Seu transporte PRAEM foi agendado para {{date}} às {{time}}. Confirme sua presença.',
    variables: ['date', 'time'],
  },
  driver_arriving: {
    title: 'Motorista a Caminho',
    message: 'O motorista {{driver_name}} está a caminho com o veículo {{vehicle}}.',
    variables: ['driver_name', 'vehicle'],
  },
  route_started: {
    title: 'Rota Iniciada',
    message: 'Sua rota de transporte foi iniciada. Prepare-se para o embarque.',
    variables: [],
  },
  boarding_confirmed: {
    title: 'Embarque Confirmado',
    message: 'Seu embarque foi confirmado. Boa viagem, {{patient_name}}!',
    variables: ['patient_name'],
  },
  arrival_expected: {
    title: 'Chegada Prevista',
    message: 'Previsão de chegada ao destino: {{eta}}. Hospital: {{hospital}}.',
    variables: ['eta', 'hospital'],
  },
  appointment_reminder: {
    title: 'Lembrete de Consulta',
    message: 'Lembrete: seu atendimento é amanhã em {{hospital}}. Seu transporte está confirmado.',
    variables: ['hospital'],
  },
  no_show: {
    title: 'Ausência no Embarque',
    message: 'Identificamos ausência no embarque. Entre em contato com a central PRAEM.',
    variables: [],
  },
  trip_completed: {
    title: 'Viagem Finalizada',
    message: 'Viagem finalizada. Obrigado, {{patient_name}}. Até a próxima!',
    variables: ['patient_name'],
  },
  boarding_qr: {
    title: 'QR de Embarque',
    message: 'Seu embarque foi confirmado.\nApresente este QR Code ao motorista no momento do embarque.',
    variables: [],
  },
  tracking_link: {
    title: 'Link de Rastreamento',
    message: 'Acompanhe seu transporte em tempo real: {{tracking_link}}',
    variables: ['tracking_link'],
  },
  stale_recovery: {
    title: 'Operação Anterior Detectada',
    message: 'Uma operação anterior foi detectada no sistema. Contate a central para regularização.',
    variables: [],
  },
};
