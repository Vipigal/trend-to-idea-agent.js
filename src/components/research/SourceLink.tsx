import { ExternalLink } from "lucide-react";

interface SourceLinkProps {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string;
}

export function SourceLink({ url, title, snippet, publishedAt }: SourceLinkProps) {
  const domain = new URL(url).hostname.replace("www.", "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2 rounded-lg hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <ExternalLink className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-600">
            {title}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{domain}</span>
            {publishedAt && (
              <>
                <span>•</span>
                <span>{new Date(publishedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
          {snippet && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{snippet}</p>
          )}
        </div>
      </div>
    </a>
  );
}
