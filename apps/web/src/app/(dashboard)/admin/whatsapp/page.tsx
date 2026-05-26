'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';

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
  const [tab, setTab] = useState<'templates' | 'logs'>('templates');
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
        return 'bg-emerald-900/30 text-emerald-300';
      case 'FAILED':
        return 'bg-red-900/30 text-red-300';
      case 'PENDING':
        return 'bg-yellow-900/30 text-yellow-300';
      default:
        return 'bg-slate-700 text-slate-300';
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
    <div className='space-y-6'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>Gerenciar WhatsApp</h1>
        <p className='text-slate-400 mt-2'>Configure mensagens e monitore comunicações</p>
      </div>

      {testMessage && (
        <div
          className={`rounded-lg border p-4 ${
            testMessage.includes('Erro')
              ? 'border-red-900/50 bg-red-900/10 text-red-300'
              : 'border-emerald-900/50 bg-emerald-900/10 text-emerald-300'
          }`}
        >
          {testMessage}
        </div>
      )}

      {/* Tabs */}
      <div className='border-b border-slate-700'>
        <div className='flex gap-6'>
          <button
            onClick={() => setTab('templates')}
            className={`px-1 py-3 text-sm font-medium transition-colors ${
              tab === 'templates'
                ? 'border-b-2 border-blue-500 text-blue-300'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            📧 Templates
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-1 py-3 text-sm font-medium transition-colors ${
              tab === 'logs'
                ? 'border-b-2 border-blue-500 text-blue-300'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            📋 Histórico
          </button>
        </div>
      </div>

      {/* Templates Tab */}
      {tab === 'templates' && (
        <div className='space-y-4'>
          <div className='grid gap-4'>
            {templates.map((template) => (
              <Card key={template.id}>
                <div className='space-y-4'>
                  {editingTemplate?.id === template.id ? (
                    <>
                      <div className='flex items-center justify-between border-b border-slate-700 pb-3'>
                        <h3 className='font-semibold'>Editando: {template.title}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs ${
                            template.active
                              ? 'bg-emerald-900/30 text-emerald-300'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {template.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className='space-y-3'>
                        <div>
                          <label className='block text-xs font-medium text-slate-400 mb-1'>
                            Título
                          </label>
                          <input
                            type='text'
                            value={editingTemplate.title}
                            onChange={(e) =>
                              setEditingTemplate({
                                ...editingTemplate,
                                title: e.target.value,
                              })
                            }
                            disabled={loading}
                            className='w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none'
                          />
                        </div>
                        <div>
                          <label className='block text-xs font-medium text-slate-400 mb-1'>
                            Mensagem
                          </label>
                          <textarea
                            value={editingTemplate.message}
                            onChange={(e) =>
                              setEditingTemplate({
                                ...editingTemplate,
                                message: e.target.value,
                              })
                            }
                            disabled={loading}
                            rows={4}
                            className='w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none'
                          />
                          {SAMPLE_VARIABLES[template.key] && (
                            <p className='text-xs text-slate-500 mt-1'>
                              Variáveis: {Object.keys(SAMPLE_VARIABLES[template.key]).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className='flex gap-2'>
                          <button
                            onClick={() => handleUpdateTemplate(editingTemplate)}
                            disabled={loading}
                            className='rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingTemplate(null)}
                            disabled={loading}
                            className='rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className='flex items-start justify-between border-b border-slate-700 pb-3'>
                        <div>
                          <h3 className='font-semibold'>{template.title}</h3>
                          <code className='text-xs text-slate-500 font-mono'>{template.key}</code>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${
                            template.active
                              ? 'bg-emerald-900/30 text-emerald-300'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {template.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className='space-y-3'>
                        <div className='rounded bg-slate-800/50 p-3 text-sm text-slate-300 whitespace-pre-wrap break-words'>
                          {template.message}
                        </div>
                        {SAMPLE_VARIABLES[template.key] && (
                          <div className='rounded bg-blue-900/20 p-3 text-sm'>
                            <p className='font-semibold mb-2 text-blue-300'>Amostra com variáveis:</p>
                            <p className='text-blue-200 whitespace-pre-wrap break-words'>
                              {template.message.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
                                const sampleVars = SAMPLE_VARIABLES[template.key];
                                return (sampleVars as Record<string, any>)[varName] || match;
                              })}
                            </p>
                          </div>
                        )}
                        <div className='flex gap-2'>
                          <button
                            onClick={() => setEditingTemplate(template)}
                            disabled={loading}
                            className='rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleTestSend(template)}
                            disabled={testLoading || !testPhone}
                            className='rounded border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                          >
                            📤 Teste
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {templates.length === 0 && !loading && (
            <Card>
              <div className='text-center text-slate-400'>Nenhum template encontrado</div>
            </Card>
          )}

          <Card>
            <div className='space-y-3'>
              <h3 className='font-semibold border-b border-slate-700 pb-3'>Enviar Teste</h3>
              <div>
                <label className='block text-xs font-medium text-slate-400 mb-1'>
                  Número de telefone (WhatsApp)
                </label>
                <input
                  type='text'
                  placeholder='55 45 99999-9999 ou 5545999999999'
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className='w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none'
                />
              </div>
              <p className='text-xs text-slate-500'>
                Digite um número e clique em "Teste" em qualquer template acima para enviar.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div className='grid gap-4'>
          {logs.map((log) => (
            <Card key={log.id}>
              <div className='space-y-3'>
                <div className='grid grid-cols-2 gap-4 border-b border-slate-700 pb-3'>
                  <div>
                    <p className='text-xs text-slate-500'>Telefone</p>
                    <p className='font-mono text-sm'>{log.phone}</p>
                  </div>
                  <div>
                    <p className='text-xs text-slate-500'>Status</p>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs ${getStatusColor(
                        log.status
                      )}`}
                    >
                      {getStatusLabel(log.status)}
                    </span>
                  </div>
                  <div>
                    <p className='text-xs text-slate-500'>Data</p>
                    <p className='text-sm'>
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-slate-500'>Tentativas</p>
                    <p className='text-sm'>{log.retryCount}</p>
                  </div>
                </div>
                <div>
                  <p className='text-xs text-slate-500 mb-1'>Mensagem</p>
                  <p className='text-sm bg-slate-800/50 p-2 rounded whitespace-pre-wrap break-words text-slate-300'>
                    {log.message}
                  </p>
                </div>
                {log.failedReason && (
                  <div className='p-2 rounded bg-red-900/20 border border-red-900/50'>
                    <p className='text-xs text-red-300'>{log.failedReason}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}

          {logs.length === 0 && !loading && (
            <Card>
              <div className='text-center text-slate-400'>Nenhum log encontrado</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
