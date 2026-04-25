'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, FileImage, FileText, Paperclip, SendHorizontal, X } from 'lucide-react';
import { useChatActions, useChatState } from '@arnessa/react/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type AttachmentDraft = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  base64: string;
  mimeType: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

async function fileToDraft(file: File): Promise<AttachmentDraft> {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    base64: await fileToBase64(file),
    mimeType: file.type || 'application/octet-stream',
  };
}

export function StudioComposer() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useChatActions();
  const { runStatus, lastError } = useChatState();

  const disabled = runStatus === 'running';
  const canSubmit = !disabled && (text.trim().length > 0 || attachments.length > 0);
  const activeError = localError || (lastError as any)?.message || null;

  const attachmentLabel = useMemo(() => `${attachments.length} adjunto${attachments.length > 1 ? 's' : ''}`, [attachments.length]);

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
      const next = await Promise.all(files.map(fileToDraft));
      setLocalError(null);
      setAttachments((current) => [...current, ...next]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudieron adjuntar los archivos.');
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const currentText = text;
    const currentAttachments = attachments;
    const payload = currentAttachments.length > 0 ? { text: currentText, attachments: currentAttachments } : currentText;

    setText('');
    setAttachments([]);
    setLocalError(null);
    requestAnimationFrame(resizeTextarea);

    try {
      await sendMessage(payload as never);
      currentAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    } catch (error) {
      setText(currentText);
      setAttachments(currentAttachments);
      setLocalError(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
      requestAnimationFrame(resizeTextarea);
    }
  };

  return (
    <div className="space-y-3">
      {activeError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Error al enviar</AlertTitle>
          <AlertDescription>{activeError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-0 bg-transparent py-0 ring-0 shadow-none">
        <CardContent className="px-0">
          <form
            onSubmit={handleSubmit}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDragging(false);
              if (!disabled) await handleFiles(event.dataTransfer.files);
            }}
            className={`rounded-[1.5rem] border bg-card p-3 shadow-sm transition ${isDragging ? 'border-primary ring-3 ring-primary/10' : 'border-border'}`}
          >
            {attachments.length > 0 ? <div className="mb-3 flex items-center justify-end gap-3 px-1"><Badge variant="secondary">{attachmentLabel}</Badge></div> : null}

            {attachments.length > 0 ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative flex items-center gap-3 rounded-2xl border bg-background px-3 py-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {attachment.type.startsWith('image/') ? <FileImage /> : <FileText />}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">{attachment.type || 'Archivo'} · {Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeAttachment(attachment.id)} aria-label={`Eliminar ${attachment.name}`}>
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" size="icon-lg" onClick={() => inputRef.current?.click()} disabled={disabled} aria-label="Adjuntar archivo">
                <Paperclip />
              </Button>

              <Textarea
                ref={textareaRef}
                rows={3}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  requestAnimationFrame(resizeTextarea);
                }}
                placeholder="Describe el mueble o sube una referencia visual..."
                disabled={disabled}
                className="min-h-[56px] max-h-[220px] resize-none overflow-y-auto rounded-2xl border-0 bg-muted/40 shadow-none focus-visible:border-ring"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void handleSubmit(event);
                  }
                }}
                onPaste={async (event) => {
                  const files = event.clipboardData.files;
                  if (files?.length) {
                    event.preventDefault();
                    await handleFiles(files);
                  }
                }}
              />

              <Button type="submit" size="icon-lg" disabled={!canSubmit} aria-label="Enviar mensaje">
                <SendHorizontal />
              </Button>
            </div>

            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.svg"
              onChange={async (event) => {
                const input = event.currentTarget;
                const files = input.files;
                if (files?.length) await handleFiles(files);
                input.value = '';
              }}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
