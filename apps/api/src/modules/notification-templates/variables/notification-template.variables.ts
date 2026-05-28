export type NotificationTemplateCategory =
  | 'transport_confirmation'
  | 'operation_reminder'
  | 'boarding'
  | 'delay'
  | 'cancellation'
  | 'operation_completed';

export type SupportedTemplateVariable =
  | 'first_name'
  | 'operation_date'
  | 'operation_time'
  | 'pickup_location'
  | 'destination'
  | 'driver_name'
  | 'confirmation_link'
  | 'qr_code';

export const NOTIFICATION_TEMPLATE_CATEGORIES: Array<{ key: NotificationTemplateCategory; label: string }> = [
  { key: 'transport_confirmation', label: 'confirmação transporte' },
  { key: 'operation_reminder', label: 'lembrete operação' },
  { key: 'boarding', label: 'embarque' },
  { key: 'delay', label: 'atraso' },
  { key: 'cancellation', label: 'cancelamento' },
  { key: 'operation_completed', label: 'operação concluída' },
];

export const SUPPORTED_TEMPLATE_VARIABLES: Array<{
  key: SupportedTemplateVariable;
  label: string;
  sample: string;
}> = [
  { key: 'first_name', label: 'Primeiro nome do paciente', sample: 'Maria' },
  { key: 'operation_date', label: 'Data da operação', sample: '28/05/2026' },
  { key: 'operation_time', label: 'Horário da operação', sample: '07:30' },
  { key: 'pickup_location', label: 'Local de saída', sample: 'UBS Centro' },
  { key: 'destination', label: 'Destino', sample: 'Hospital Municipal' },
  { key: 'driver_name', label: 'Nome do motorista', sample: 'Carlos Souza' },
  { key: 'confirmation_link', label: 'Link de confirmação', sample: 'https://ops.praem.app/t/token-exemplo' },
  { key: 'qr_code', label: 'Conteúdo do QR', sample: 'op_123.secure_token.paciente_temp' },
];

export const DEFAULT_NOTIFICATION_TEMPLATE_MESSAGE = `🚐 PRAEM - Transporte de Saúde

Olá, {{first_name}}.

Seu transporte foi agendado com sucesso.

📅 Data: {{operation_date}}
🕒 Horário: {{operation_time}}
📍 Saída: {{pickup_location}}
🏥 Destino: {{destination}}

👨‍✈️ Motorista: {{driver_name}}

📲 Confirme sua presença:
{{confirmation_link}}

🎫 QR Code:
{{qr_code}}`;

export const DEFAULT_NOTIFICATION_TEMPLATES: Array<{
  key: string;
  title: string;
  category: NotificationTemplateCategory;
  message: string;
  variables: SupportedTemplateVariable[];
}> = [
  {
    key: 'transport_confirmation',
    title: 'Confirmação de Transporte',
    category: 'transport_confirmation',
    message: DEFAULT_NOTIFICATION_TEMPLATE_MESSAGE,
    variables: [
      'first_name',
      'operation_date',
      'operation_time',
      'pickup_location',
      'destination',
      'driver_name',
      'confirmation_link',
      'qr_code',
    ],
  },
  {
    key: 'operation_reminder',
    title: 'Lembrete de Operação',
    category: 'operation_reminder',
    message:
      'Olá, {{first_name}}. Lembrete: seu transporte acontece em {{operation_date}} às {{operation_time}}. Saída: {{pickup_location}}. Destino: {{destination}}.',
    variables: ['first_name', 'operation_date', 'operation_time', 'pickup_location', 'destination'],
  },
  {
    key: 'boarding',
    title: 'Embarque',
    category: 'boarding',
    message:
      'Olá, {{first_name}}. O motorista {{driver_name}} está no local de embarque em {{pickup_location}}. Apresente este QR: {{qr_code}}.',
    variables: ['first_name', 'driver_name', 'pickup_location', 'qr_code'],
  },
  {
    key: 'delay',
    title: 'Atraso',
    category: 'delay',
    message:
      'Olá, {{first_name}}. Sua operação para {{destination}} teve atraso. Novo horário previsto: {{operation_time}}.',
    variables: ['first_name', 'destination', 'operation_time'],
  },
  {
    key: 'cancellation',
    title: 'Cancelamento',
    category: 'cancellation',
    message:
      'Olá, {{first_name}}. Sua operação de {{operation_date}} para {{destination}} foi cancelada. Entre em contato com a central.',
    variables: ['first_name', 'operation_date', 'destination'],
  },
  {
    key: 'operation_completed',
    title: 'Operação Concluída',
    category: 'operation_completed',
    message:
      'Olá, {{first_name}}. Sua operação para {{destination}} foi concluída com sucesso. Obrigado por utilizar o transporte PRAEM.',
    variables: ['first_name', 'destination'],
  },
];

export const PREVIEW_SAMPLE_CONTEXT: Record<SupportedTemplateVariable, string> = {
  first_name: 'Maria',
  operation_date: '28/05/2026',
  operation_time: '07:30',
  pickup_location: 'UBS Centro',
  destination: 'Hospital Municipal',
  driver_name: 'Carlos Souza',
  confirmation_link: 'https://ops.praem.app/t/token-preview-confirmation',
  qr_code: 'operation_456.token_preview.patient_tmp_001',
};
