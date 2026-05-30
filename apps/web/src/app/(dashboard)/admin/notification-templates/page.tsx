'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import {
  NotificationTemplate,
  NotificationTemplateCategory,
  notificationTemplateService,
} from '@/services/notification-template.service';

const CATEGORY_LABEL: Record<NotificationTemplateCategory, string> = {
  transport_confirmation: 'confirmação transporte',
  operation_reminder: 'lembrete operação',
  boarding: 'embarque',
  delay: 'atraso',
  cancellation: 'cancelamento',
  operation_completed: 'operação concluída',
};

type EditorState = {
  id?: string;
  key: string;
  title: string;
  category: NotificationTemplateCategory;
  message: string;
  active: boolean;
};

const DEFAULT_EDITOR: EditorState = {
  key: 'transport_confirmation',
  title: 'Confirmação de Transporte',
  category: 'transport_confirmation',
  message: '',
  active: true,
};

export default function NotificationTemplatesPage() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  const templatesQuery = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => notificationTemplateService.list(),
  });

  const metadataQuery = useQuery({
    queryKey: ['notification-templates-metadata'],
    queryFn: () => notificationTemplateService.metadata(),
  });

  const previewQuery = useQuery({
    queryKey: ['notification-preview', editor.message],
    queryFn: () => notificationTemplateService.preview({ message: editor.message }),
    enabled: !!editor.message.trim(),
  });

  const seedMutation = useMutation({
    mutationFn: () => notificationTemplateService.seedDefaults(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setMessage('Templates padrão criados com sucesso.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editor.id) {
        return notificationTemplateService.update(editor.id, {
          title: editor.title,
          message: editor.message,
          category: editor.category,
          active: editor.active,
        });
      }
      return notificationTemplateService.create({
        key: editor.key,
        title: editor.title,
        message: editor.message,
        category: editor.category,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setCreating(false);
      setEditor(DEFAULT_EDITOR);
      setMessage('Template salvo com sucesso.');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => notificationTemplateService.duplicate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setMessage('Template duplicado.');
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      notificationTemplateService.setActive(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
    },
  });

  useEffect(() => {
    if (!templatesQuery.data || templatesQuery.data.length > 0) return;
    if (seedMutation.isPending || seedMutation.isSuccess) return;
    seedMutation.mutate();
  }, [templatesQuery.data, seedMutation]);

  const templatesByCategory = useMemo(() => {
    const groups: Record<string, NotificationTemplate[]> = {};
    for (const template of templatesQuery.data ?? []) {
      const key = template.category ?? 'transport_confirmation';
      groups[key] = groups[key] ?? [];
      groups[key].push(template);
    }
    return groups;
  }, [templatesQuery.data]);

  return (
    <section className='space-y-6'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight text-slate-100'>Templates de Mensagens</h1>
        <p className='mt-2 text-sm text-slate-400'>
          Configure mensagens operacionais para WhatsApp/SMS com preview em tempo real.
        </p>
      </div>

      {message && (
        <div className='rounded-xl border border-cyan-900/50 bg-cyan-900/10 px-4 py-3 text-sm text-cyan-200'>
          {message}
        </div>
      )}

      <div className='grid gap-6 xl:grid-cols-[1.3fr_1fr]'>
        <Card>
          <div className='space-y-4'>
            <div className='flex items-center justify-between border-b border-slate-800 pb-3'>
              <h2 className='text-base font-semibold text-slate-100'>
                {creating || editor.id ? 'Editar template' : 'Novo template'}
              </h2>
              <button
                type='button'
                onClick={() => {
                  setCreating(true);
                  setEditor(DEFAULT_EDITOR);
                }}
                className='rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800'
              >
                + Criar template
              </button>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <label className='space-y-1'>
                <span className='text-xs uppercase tracking-wider text-slate-500'>Chave</span>
                <input
                  value={editor.key}
                  onChange={(e) => setEditor((prev) => ({ ...prev, key: e.target.value }))}
                  disabled={!!editor.id}
                  className='w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
                />
              </label>
              <label className='space-y-1'>
                <span className='text-xs uppercase tracking-wider text-slate-500'>Categoria</span>
                <select
                  value={editor.category}
                  onChange={(e) =>
                    setEditor((prev) => ({
                      ...prev,
                      category: e.target.value as NotificationTemplateCategory,
                    }))
                  }
                  className='w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-500'>Título</span>
              <input
                value={editor.title}
                onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                className='w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
              />
            </label>

            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-500'>Mensagem</span>
              <textarea
                rows={12}
                value={editor.message}
                onChange={(e) => setEditor((prev) => ({ ...prev, message: e.target.value }))}
                className='w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'
              />
            </label>

            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                onClick={() => saveMutation.mutate()}
                disabled={!editor.title || !editor.message || saveMutation.isPending}
                className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
              >
                Salvar template
              </button>
              <button
                type='button'
                onClick={() => {
                  setCreating(false);
                  setEditor(DEFAULT_EDITOR);
                }}
                className='rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800'
              >
                Limpar editor
              </button>
              {editor.id && (
                <button
                  type='button'
                  onClick={() => activeMutation.mutate({ id: editor.id!, active: !editor.active })}
                  className='rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800'
                >
                  {editor.active ? 'Desativar' : 'Ativar'}
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className='space-y-4'>
            <div className='border-b border-slate-800 pb-3'>
              <h2 className='text-base font-semibold text-slate-100'>Preview em tempo real</h2>
              <p className='mt-1 text-xs text-slate-500'>
                Dados de amostra de paciente/operador + QR para validação visual.
              </p>
            </div>
            <div className='rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm whitespace-pre-wrap text-slate-200'>
              {previewQuery.data?.renderedMessage ?? 'Digite uma mensagem com variáveis para visualizar o preview.'}
            </div>
            {previewQuery.data?.sampleData && (
              <div className='grid gap-2 text-xs text-slate-400'>
                {Object.entries(previewQuery.data.sampleData).map(([key, value]) => (
                  <div key={key} className='flex items-center justify-between rounded-lg border border-slate-800 px-2 py-1'>
                    <span className='font-mono text-slate-500'>{`{{${key}}}`}</span>
                    <span className='text-slate-300'>{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
            {previewQuery.data?.qrCodeDataUrl && (
              <div className='rounded-xl border border-slate-800 bg-slate-900 p-3'>
                <p className='mb-2 text-xs uppercase tracking-wider text-slate-500'>QR Preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewQuery.data.qrCodeDataUrl} alt='QR preview' className='mx-auto h-36 w-36 rounded bg-white p-2' />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className='space-y-4'>
          <h2 className='text-base font-semibold text-slate-100'>Templates cadastrados</h2>
          {templatesQuery.isLoading ? (
            <p className='text-sm text-slate-500'>Carregando templates...</p>
          ) : (
            <div className='space-y-5'>
              {Object.entries(CATEGORY_LABEL).map(([categoryKey, categoryLabel]) => {
                const items = templatesByCategory[categoryKey] ?? [];
                return (
                  <div key={categoryKey} className='space-y-2'>
                    <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>{categoryLabel}</h3>
                    {items.length === 0 ? (
                      <div className='rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-500'>
                        Sem template nesta categoria.
                      </div>
                    ) : (
                      items.map((template) => (
                        <div
                          key={template.id}
                          className='rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3'
                        >
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div>
                              <p className='text-sm font-semibold text-slate-100'>{template.title}</p>
                              <p className='text-xs font-mono text-slate-500'>{template.key}</p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                template.active
                                  ? 'bg-emerald-900/30 text-emerald-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {template.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <p className='mt-2 line-clamp-3 text-xs whitespace-pre-wrap text-slate-400'>
                            {template.message}
                          </p>
                          <div className='mt-3 flex flex-wrap gap-2'>
                            <button
                              type='button'
                              onClick={() =>
                                setEditor({
                                  id: template.id,
                                  key: template.key,
                                  title: template.title,
                                  message: template.message,
                                  category: (template.category ?? 'transport_confirmation') as NotificationTemplateCategory,
                                  active: template.active,
                                })
                              }
                              className='rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800'
                            >
                              Editar
                            </button>
                            <button
                              type='button'
                              onClick={() => duplicateMutation.mutate(template.id)}
                              className='rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800'
                            >
                              Duplicar
                            </button>
                            <button
                              type='button'
                              onClick={() =>
                                activeMutation.mutate({ id: template.id, active: !template.active })
                              }
                              className='rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800'
                            >
                              {template.active ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {metadataQuery.data?.variables && (
            <div className='rounded-xl border border-slate-800 bg-slate-900 p-3'>
              <p className='mb-2 text-xs uppercase tracking-wider text-slate-500'>Variáveis suportadas</p>
              <div className='grid gap-2 md:grid-cols-2'>
                {metadataQuery.data.variables.map((item: any) => (
                  <div key={item.key} className='rounded-lg border border-slate-800 px-2 py-1 text-xs'>
                    <p className='font-mono text-slate-300'>{`{{${item.key}}}`}</p>
                    <p className='text-slate-500'>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

