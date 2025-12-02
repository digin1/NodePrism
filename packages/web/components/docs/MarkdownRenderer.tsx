'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownRendererProps {
  content: string;
  onDocSelect: (path: string) => void;
  selectedDoc: string;
}

export function MarkdownRenderer({ content, onDocSelect, selectedDoc }: MarkdownRendererProps) {
  // Convert relative markdown links to absolute paths based on current doc
  const resolveDocLink = (href: string): string | null => {
    if (!href || !href.endsWith('.md')) return null;

    // Get directory of current document
    const currentDir = selectedDoc.includes('/')
      ? selectedDoc.substring(0, selectedDoc.lastIndexOf('/'))
      : '';

    // Handle relative paths like ./file.md or ../file.md
    if (href.startsWith('./')) {
      href = href.substring(2);
    }

    // Resolve the path
    if (href.startsWith('../')) {
      // Go up one directory
      const parts = currentDir.split('/').filter(Boolean);
      parts.pop();
      return [...parts, href.substring(3)].join('/') || href.substring(3);
    }

    // If it's a relative path (no leading slash), combine with current dir
    if (!href.startsWith('/') && currentDir) {
      return `${currentDir}/${href}`;
    }

    return href.startsWith('/') ? href.substring(1) : href;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">{children}</h3>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full divide-y divide-gray-200 border">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-sm text-gray-700 border-b">{children}</td>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          const isMermaid = className === 'language-mermaid';

          if (isMermaid) {
            const chart = String(children).replace(/\n$/, '');
            return <MermaidDiagram chart={chart} />;
          }

          if (isInline) {
            return (
              <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={cn('block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm', className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => {
          // Check if this pre contains a mermaid diagram - if so, don't wrap it
          const child = children as React.ReactElement;
          if (child?.props?.className === 'language-mermaid') {
            return <>{children}</>;
          }
          return (
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4">
              {children}
            </pre>
          );
        },
        a: ({ href, children }) => {
          const docPath = resolveDocLink(href || '');
          if (docPath) {
            // Internal doc link - navigate within viewer
            return (
              <button
                onClick={() => onDocSelect(docPath)}
                className="text-blue-600 hover:underline cursor-pointer"
              >
                {children}
              </button>
            );
          }
          // External link - open in new tab
          return (
            <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        ul: ({ children }) => <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-gray-700">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 text-gray-700 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-6 border-gray-200" />,
        p: ({ children }) => <p className="my-2 text-gray-700 leading-relaxed">{children}</p>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
