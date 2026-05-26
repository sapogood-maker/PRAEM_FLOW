'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { AlertCircle, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NotificationTemplate {
  id: string;
  key: string;
  title: string;
  message: string;
  variables?: Record<string, any>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationLog {
  id: string;
  templateId?: string;
  phone: string;
  message: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DUPLICATE' | 'SKIPPED';
  provider: string;
  providerMessageId?: string;
  retryCount: number;
  sentAt?: string;
  deliveredAt?: string;
  failedReason?: string;
  createdAt: string;
}

const SAMPLE_VARIABLES: Record<string, Record<string, string>> = {
  appointment_confirmation: {
    patient_name: 'João Silva',
    date: '26/05/2025',
    time: '14:30',
    hospital: 'Hospital Central',
  },
  driver_arriving: {
    driver_name: 'Carlos',
    eta: '5 minutos',
    patient_name: 'João Silva',
  },
  boarding_qr: {
    patient_name: 'João Silva',
  },
  route_started: {
    driver_name: 'Carlos',
    patient_name: 'João Silva',
  },
  no_show: {
    patient_name: 'João Silva',
  },
  trip_completed: {
    patient_name: 'João Silva',
  },
};

export default function WhatsappAdminPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/whatsapp/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data || []);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/logs?limit=50');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadLogs();
  }, [loadTemplates, loadLogs]);

  const handleUpdateTemplate = async (template: NotificationTemplate) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/whatsapp/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template.title,
          message: template.message,
          active: template.active,
        }),
      });
      if (response.ok) {
        await loadTemplates();
        setEditingTemplate(null);
        setTestMessage('Template atualizado com sucesso');
        setTimeout(() => setTestMessage(''), 3000);
      }
    } catch (error) {
      console.error('Failed to update template:', error);
      setTestMessage('Erro ao atualizar template');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSend = async (template: NotificationTemplate) => {
    if (!testPhone) {
      setTestMessage('Informe um número de telefone');
      return;
    }

    try {
      setTestLoading(true);
      const response = await fetch('/api/whatsapp/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone,
          templateKey: template.key,
        }),
      });
      if (response.ok) {
        setTestMessage('Mensagem enviada com sucesso');
        setTimeout(() => setTestMessage(''), 3000);
      } else {
        setTestMessage('Erro ao enviar mensagem');
      }
    } catch (error) {
      console.error('Failed to send test message:', error);
      setTestMessage('Erro ao enviar mensagem');
    } finally {
      setTestLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SENT':
      case 'DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      SENT: 'Enviada',
      DELIVERED: 'Entregue',
      FAILED: 'Falha',
      PENDING: 'Pendente',
      DUPLICATE: 'Duplicada',
      SKIPPED: 'Ignorada',
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gerenciar WhatsApp</h1>
        <p className="text-gray-600 mt-2">Configure mensagens e monitore comunicações</p>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          {testMessage && (
            <Alert className={testMessage.includes('Erro') ? 'border-red-500' : 'border-green-500'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{testMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.title}</CardTitle>
                      <CardDescription className="font-mono text-xs mt-1">{template.key}</CardDescription>
                    </div>
                    <Badge variant={template.active ? 'default' : 'secondary'}>
                      {template.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingTemplate?.id === template.id ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor={`title-${template.id}`}>Título</Label>
                        <Input
                          id={`title-${template.id}`}
                          value={editingTemplate.title}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              title: e.target.value,
                            })
                          }
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`message-${template.id}`}>Mensagem</Label>
                        <Textarea
                          id={`message-${template.id}`}
                          value={editingTemplate.message}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              message: e.target.value,
                            })
                          }
                          disabled={loading}
                          rows={4}
                        />
                        {SAMPLE_VARIABLES[template.key] && (
                          <p className="text-xs text-gray-500 mt-1">
                            Variáveis disponíveis: {Object.keys(SAMPLE_VARIABLES[template.key]).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateTemplate(editingTemplate)}
                          disabled={loading}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTemplate(null)}
                          disabled={loading}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
                        {template.message}
                      </div>
                      {SAMPLE_VARIABLES[template.key] && (
                        <div className="bg-blue-50 p-3 rounded text-sm">
                          <p className="font-semibold mb-2">Amostra com variáveis:</p>
                          <p className="whitespace-pre-wrap">
                            {template.message.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
                              const sampleVars = SAMPLE_VARIABLES[template.key];
                              return (sampleVars as Record<string, any>)[varName] || match;
                            })}
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTemplate(template)}
                          disabled={loading}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestSend(template)}
                          disabled={testLoading || !testPhone}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Teste
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {templates.length === 0 && !loading && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nenhum template encontrado</p>
              </CardContent>
            </Card>
          )}

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-base">Enviar Teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="test-phone">Número de telefone (WhatsApp)</Label>
                <Input
                  id="test-phone"
                  placeholder="55 45 99999-9999 ou 5545999999999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-600">
                Digite um número de telefone e clique em "Teste" em qualquer template acima para enviar uma mensagem
                de teste.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <div className="grid gap-4">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Telefone</p>
                      <p className="font-mono">{log.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Status</p>
                      <Badge className={getStatusColor(log.status)}>
                        {getStatusLabel(log.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Data</p>
                      <p className="text-sm">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Tentativas</p>
                      <p className="text-sm">{log.retryCount}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-gray-600">Mensagem</p>
                    <p className="text-sm mt-1 bg-gray-50 p-2 rounded whitespace-pre-wrap break-words">
                      {log.message}
                    </p>
                  </div>
                  {log.failedReason && (
                    <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
                      <p className="text-xs text-red-800">{log.failedReason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {logs.length === 0 && !loading && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nenhum log encontrado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
