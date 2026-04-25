'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, ChevronDown, ChevronUp, Expand, FileImage, FileText, Sparkles, Terminal, User, X } from 'lucide-react';
import { useChatOverrides } from './ArnessaProvider';

type SourceLike = { type?: string; value?: string; mimeType?: string };
type AttachmentLike = {
  name?: string;
  type?: string;
  source?: SourceLike;
  url?: string;
  src?: string;
  data?: string;
  mime_type?: string;
  path?: string;
};

type NormalizedAttachment = {
  name: string;
  mimeType: string;
  url: string;
  isImage: boolean;
};

type NormalizedContent = {
  text: string;
  attachments: NormalizedAttachment[];
};

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sourceToUrl(source?: SourceLike): string | null {
  if (!source?.value) return null;
  if (source.type === 'url') return source.value;
  return `data:${source.mimeType || 'application/octet-stream'};base64,${source.value}`;
}

function attachmentToNormalized(attachment: AttachmentLike): NormalizedAttachment | null {
  const directUrl = typeof attachment.data === 'string' ? attachment.data
    : typeof attachment.url === 'string' ? attachment.url
    : typeof attachment.src === 'string' ? attachment.src
    : null;
  const sourceUrl = sourceToUrl(attachment.source);
  const url = directUrl || sourceUrl;
  if (!url) return null;

  const mimeType = attachment.mime_type || attachment.source?.mimeType || attachment.type || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/') || url.startsWith('data:image/');
  const name = attachment.name || attachment.path?.split('/').pop() || (isImage ? 'Image' : 'File');

  return { name, mimeType, url, isImage };
}

function normalizeContent(content: unknown): NormalizedContent {
  if (typeof content === 'string') return { text: content, attachments: [] };

  if (Array.isArray(content)) {
    const text = content
      .filter((item): item is { type?: string; text?: string } => Boolean(item && typeof item === 'object'))
      .filter((item) => item.type === 'text')
      .map((item) => item.text || '')
      .join('\n\n');

    const attachments = content
      .filter((item): item is AttachmentLike => Boolean(item && typeof item === 'object'))
      .map(attachmentToNormalized)
      .filter((item): item is NormalizedAttachment => Boolean(item));

    return { text, attachments };
  }

  if (content && typeof content === 'object') {
    const value = content as AttachmentLike & { text?: string; content?: string; attachments?: AttachmentLike[]; images?: AttachmentLike[] };
    const attachments = [
      attachmentToNormalized(value),
      ...(Array.isArray(value.attachments) ? value.attachments.map(attachmentToNormalized) : []),
      ...(Array.isArray(value.images) ? value.images.map(attachmentToNormalized) : []),
    ].filter((item): item is NormalizedAttachment => Boolean(item));

    const text = typeof value.text === 'string'
      ? value.text
      : typeof value.content === 'string'
        ? value.content
        : attachments.length === 0
          ? JSON.stringify(content, null, 2)
          : '';

    return { text, attachments };
  }

  return { text: '', attachments: [] };
}

export function ImageLightbox({ image, onClose, closeLabel }: { image: NormalizedAttachment | null; onClose: () => void; closeLabel?: string }) {
  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={image.name}>
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label={closeLabel ?? 'Close image viewer'}
      />
      <div className="relative z-10 flex w-[min(30vw,30rem)] max-w-[30vw] min-w-[18rem] flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0 pr-3">
            <div className="truncate text-sm font-medium">{image.name}</div>
            <div className="text-xs text-muted-foreground">{image.mimeType}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium transition hover:bg-muted"
            onClick={onClose}
            aria-label={closeLabel ?? 'Close image'}
          >
            <X className="mr-1 h-4 w-4" />
            {closeLabel ?? 'Close'}
          </button>
        </div>
        <div className="flex items-center justify-center bg-muted/30 p-4">
          <img src={image.url} alt={image.name} className="h-auto max-h-[30vh] w-auto max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

export function AttachmentCard({ attachment, closeLabel }: { attachment: NormalizedAttachment; closeLabel?: string }) {
  const [open, setOpen] = useState(false);

  if (attachment.isImage) {
    return (
      <>
        <button
          type="button"
          className="arn-chat-attachment-image group relative shrink-0 overflow-hidden rounded-2xl border bg-background text-left transition hover:border-primary/40 hover:shadow-sm"
          onClick={() => setOpen(true)}
        >
          <div className="arn-chat-attachment-image__preview">
            <img src={attachment.url} alt={attachment.name} className="arn-chat-attachment-image__img" />
          </div>
          <div className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <FileImage className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.name}</p>
              <p className="text-xs text-muted-foreground">{attachment.mimeType}</p>
            </div>
            <Expand className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </div>
        </button>
        <ImageLightbox image={open ? attachment : null} onClose={() => setOpen(false)} closeLabel={closeLabel} />
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-background">
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{attachment.name}</p>
          <p className="text-xs text-muted-foreground">{attachment.mimeType || 'Attachment'}</p>
        </div>
      </div>
    </div>
  );
}

export function EmptyState() {
  const { labels } = useChatOverrides();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 p-10 text-center text-muted-foreground">
      <Sparkles className="h-10 w-10 text-primary" />
      <div>
        <h3 className="text-lg font-semibold text-foreground">{labels.emptyTitle}</h3>
        <p className="text-sm">{labels.emptySubtitle}</p>
      </div>
    </div>
  );
}

export function MessageBubble({ content, role, timestamp, className, density = 'default' }: { content: unknown; role: string; timestamp?: number; className?: string; density?: 'default' | 'compact' }) {
  const isUser = role === 'user';
  const normalized = useMemo(() => normalizeContent(content), [content]);
  const { labels } = useChatOverrides();
  const compact = density === 'compact';

  return (
    <li className={`${className ?? `flex min-w-0 gap-3 ${isUser ? 'justify-start' : 'justify-end'}`} arn-chat-message-bubble`}>
      <div className={`w-fit ${compact ? 'max-w-[78%] gap-2.5 rounded-[1.4rem] p-3' : 'max-w-[60%] gap-3 rounded-3xl p-4'} inline-flex min-w-0 overflow-hidden border ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
        <div className={`mt-0.5 flex ${compact ? 'h-7 w-7' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-primary-foreground/15' : 'bg-muted'}`}>
          {isUser ? <User className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : <Bot className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
        </div>
        <div className={`min-w-0 overflow-hidden ${compact ? 'space-y-2' : 'space-y-3'}`}>
          {normalized.text ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: (props) => <p className={`break-words whitespace-pre-wrap ${compact ? 'text-[13px] leading-5' : 'text-sm leading-6'}`} {...props} />,
                pre: (props) => <pre className={`max-h-64 max-w-full overflow-x-auto overflow-y-auto rounded-xl bg-muted/40 ${compact ? 'p-2.5 text-[11px] leading-5' : 'p-3 text-xs leading-6'} whitespace-pre-wrap`} {...props} />,
                code: (props) => <code className="break-all whitespace-pre-wrap text-xs" {...props} />,
              }}
            >
              {normalized.text}
            </ReactMarkdown>
          ) : null}
          {normalized.attachments.length > 0 ? (
            <div className={`grid gap-2 ${normalized.attachments.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
              {normalized.attachments.map((attachment, index) => (
                <AttachmentCard key={`${attachment.name}-${index}`} attachment={attachment} closeLabel={labels.closeImageLabel} />
              ))}
            </div>
          ) : null}
          {timestamp ? <p className={`${compact ? 'text-[11px]' : 'text-xs'} opacity-60`}>{formatTimestamp(timestamp)}</p> : null}
        </div>
      </div>
    </li>
  );
}

export function ToolResultCard({ content, toolName, timestamp, className }: { content: string; toolName?: string; timestamp?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const { labels } = useChatOverrides();
  return (
    <div className={className ?? 'w-fit max-w-[60%] min-w-0 rounded-2xl border bg-card'}>
      <button type="button" className="flex w-full min-w-0 items-center gap-3 p-4 text-left" onClick={() => setOpen(v => !v)}>
        <Terminal className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tool</div>
          <div className="truncate text-sm font-medium">{toolName || labels.toolResultDefault}</div>
          {timestamp ? <div className="mt-1 text-xs text-muted-foreground">{formatTimestamp(timestamp)}</div> : null}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open ? <pre className="max-h-80 overflow-x-auto overflow-y-auto border-t p-4 text-xs leading-6 whitespace-pre">{content}</pre> : null}
    </div>
  );
}

export function ActivityIndicator({ label, timestamp, className }: { label: string; timestamp?: number; className?: string }) {
  return (
    <div className={className ?? 'w-fit max-w-[60%] rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground'}>
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      {label}
      {timestamp ? <span className="text-[11px] opacity-70"> • {formatTimestamp(timestamp)}</span> : null}
    </div>
  );
}

export function CustomEventRenderer({ name, value, timestamp, className }: { name: string; value: unknown; timestamp?: number; className?: string }) {
  const normalized = useMemo(() => normalizeContent(value), [value]);

  return (
    <div className={className ?? 'w-fit max-w-[60%] min-w-0 rounded-2xl border border-dashed p-4 text-sm'}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{name}</div>
        {timestamp ? <div className="text-xs text-muted-foreground">{formatTimestamp(timestamp)}</div> : null}
      </div>
      {normalized.attachments.length > 0 ? (
        <div className={`mt-3 grid gap-2 ${normalized.attachments.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {normalized.attachments.map((attachment, index) => (
            <AttachmentCard key={`${attachment.name}-${index}`} attachment={attachment} />
          ))}
        </div>
      ) : null}
      {normalized.text ? <pre className="mt-2 overflow-x-auto overflow-y-auto text-xs whitespace-pre">{normalized.text}</pre> : null}
      {!normalized.text && normalized.attachments.length === 0 ? (
        <pre className="mt-2 overflow-x-auto overflow-y-auto text-xs whitespace-pre">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function DeferredToolQuestionCard({
  value,
  timestamp,
  onResolve,
  className,
}: {
  value: any;
  timestamp?: number;
  onResolve?: (callId: string, result: any, kind?: 'call' | 'approval') => Promise<unknown> | unknown;
  className?: string;
}) {
  const [answered, setAnswered] = useState(false);
  const args = value?.args && typeof value.args === 'object' ? value.args : {};
  const question = value?.question
    || value?.metadata?.approval_question
    || (value?.deferred_kind === 'approval' ? `Allow ${value?.tool_name || 'this tool'} to run?` : args.question)
    || `Waiting for ${value?.tool_name || 'tool'} input`;
  const details = value?.tool_name === 'generate_furniture_image'
    ? [args.prompt, args.input_path ? `Source: ${args.input_path}` : null, args.output_path ? `Output: ${args.output_path}` : null].filter(Boolean).join('\n')
    : null;

  const resolve = async (approved: boolean) => {
    if (!value?.call_id || !onResolve || answered) return;
    setAnswered(true);
    await onResolve(value.call_id, { approved }, 'approval');
  };

  return (
    <div className={className ?? 'w-fit max-w-[60%] min-w-0 rounded-2xl border bg-card p-4 text-sm'}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Approval needed</div>
      <div className="mt-2 font-medium">{question}</div>
      {details ? <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs">{details}</pre> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={answered || !onResolve} onClick={() => resolve(true)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          Allow
        </button>
        <button type="button" disabled={answered || !onResolve} onClick={() => resolve(false)} className="rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          Deny
        </button>
      </div>
      {timestamp ? <div className="mt-2 text-xs text-muted-foreground">{formatTimestamp(timestamp)}</div> : null}
    </div>
  );
}
