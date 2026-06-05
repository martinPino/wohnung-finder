import type { ContactMessage } from "@/types";
import type { T } from "@/lib/i18n";

interface MessageFormProps {
  message: ContactMessage;
  onChange: (message: ContactMessage) => void;
  t: T;
}

export default function MessageForm({ message, onChange, t }: MessageFormProps) {
  const set = <K extends keyof ContactMessage>(key: K, value: string) =>
    onChange({ ...message, [key]: value });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">{t.messageTitle}</h2>
      <p className="text-xs text-gray-500">
        {t.messagePlaceholderHint.split("{listingTitle}")[0]}
        <code className="rounded bg-gray-100 px-1">{"{listingTitle}"}</code>
        {t.messagePlaceholderHint.split("{listingTitle}")[1]?.split("{landlordName}")[0]}
        <code className="rounded bg-gray-100 px-1">{"{landlordName}"}</code>
        {t.messagePlaceholderHint.split("{landlordName}")[1]}
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t.subjectLabel}</label>
        <input
          type="text"
          value={message.subject}
          onChange={(e) => set("subject", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t.bodyLabel}</label>
        <textarea
          rows={7}
          value={message.body}
          onChange={(e) => set("body", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-400">{message.body.length} {t.chars}</p>
      </div>
    </div>
  );
}
