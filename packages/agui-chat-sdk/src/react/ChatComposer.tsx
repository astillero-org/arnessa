import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, FileImage, FileText, Paperclip, SendHorizontal, X } from 'lucide-react';
import { useChatActions, useChatState } from './ChatProvider';
import { AttachmentDraft, fileToAttachmentDraft } from '../core/attachment-utils';

export const ChatComposer: React.FC = () => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useChatActions();
  const { runStatus, lastError } = useChatState();

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const mapped = await Promise.all(files.map(fileToAttachmentDraft));
    setAttachments((current) => [...current, ...mapped]);
  };

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((attachment) => attachment.id !== id));

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && attachments.length === 0) || runStatus === 'running') return;
    const currentText = text;
    const currentAttachments = attachments;
    const payload = currentAttachments.length ? { text: currentText, attachments: currentAttachments } : currentText;
    setText('');
    setAttachments([]);
    requestAnimationFrame(resizeTextarea);
    try {
      await sendMessage(payload as any);
      currentAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    } catch {
      setText(currentText);
      setAttachments(currentAttachments);
      requestAnimationFrame(resizeTextarea);
    }
  };

  const dragProps = {
    onDragEnter: (event: React.DragEvent) => { event.preventDefault(); setIsDragging(true); },
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setIsDragging(true); },
    onDragLeave: (event: React.DragEvent) => { event.preventDefault(); setIsDragging(false); },
    onDrop: async (event: React.DragEvent) => { event.preventDefault(); setIsDragging(false); if (runStatus !== 'running') await handleFiles(event.dataTransfer.files); },
  };

  const attachmentLabel = useMemo(() => attachments.length ? `${attachments.length} adjunto${attachments.length > 1 ? 's' : ''}` : 'Adjuntar', [attachments.length]);

  return (
    <form onSubmit={onSubmit} className="border-t bg-background p-4" {...dragProps}>
      {lastError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="leading-5">{lastError.message}</p>
        </div>
      ) : null}

      <div className={`rounded-3xl border bg-card shadow-sm transition-colors ${isDragging ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border'}`}>
        <div className="flex items-center justify-between border-b px-4 py-2 text-[11px] text-muted-foreground">
          <span>Arrastra imágenes o documentos aquí</span>
          <span>{attachmentLabel}</span>
        </div>

        {attachments.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto border-b px-3 py-3">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="group relative flex w-44 shrink-0 gap-3 rounded-2xl border bg-background p-2.5">
                {attachment.previewUrl ? (
                  <img src={attachment.previewUrl} alt={attachment.name} className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    {attachment.type.startsWith('image/') ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                )}
                <div className="min-w-0 flex-1 pr-5">
                  <p className="truncate text-sm font-medium">{attachment.name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(attachment.size / 1024)} KB</p>
                </div>
                <button type="button" className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100" onClick={() => removeAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2 p-3">
          <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-muted/40 text-foreground transition hover:bg-muted" onClick={() => inputRef.current?.click()} aria-label="Adjuntar archivo">
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            className="min-h-12 max-h-40 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            rows={2}
            value={text}
            onChange={(e) => { setText(e.target.value); requestAnimationFrame(resizeTextarea); }}
            placeholder="Describe lo que quieres crear..."
            disabled={runStatus === 'running'}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void onSubmit(event);
              }
            }}
            onPaste={async (event) => { const files = event.clipboardData.files; if (files?.length) { event.preventDefault(); await handleFiles(files); } }}
          />

          <button type="submit" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50" disabled={runStatus === 'running' || (!text.trim() && attachments.length === 0)}>
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input ref={inputRef} type="file" className="hidden" multiple onChange={async (event) => { if (event.target.files?.length) await handleFiles(event.target.files); event.currentTarget.value = ''; }} accept="image/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.svg" />
    </form>
  );
};
