'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DocSection {
  id: string;
  title: string;
  path: string;
  children?: DocSection[];
}

const docStructure: DocSection[] = [
  { id: 'readme', title: 'Overview', path: 'README.md' },
  {
    id: 'architecture',
    title: 'Architecture',
    path: 'architecture/overview.md',
    children: [
      { id: 'arch-overview', title: 'System Overview', path: 'architecture/overview.md' },
    ],
  },
  {
    id: 'api',
    title: 'API',
    path: 'api/README.md',
    children: [
      { id: 'api-overview', title: 'Overview', path: 'api/README.md' },
      { id: 'api-endpoints', title: 'Endpoints', path: 'api/endpoints.md' },
    ],
  },
  {
    id: 'database',
    title: 'Database',
    path: 'database/README.md',
    children: [
      { id: 'db-overview', title: 'Overview', path: 'database/README.md' },
      { id: 'db-schema', title: 'Schema', path: 'database/schema.md' },
    ],
  },
  {
    id: 'services',
    title: 'Services',
    path: 'services/README.md',
  },
  {
    id: 'frontend',
    title: 'Frontend',
    path: 'frontend/README.md',
  },
  {
    id: 'deployment',
    title: 'Deployment',
    path: 'deployment/README.md',
    children: [
      { id: 'deploy-guide', title: 'Guide', path: 'deployment/README.md' },
      { id: 'deploy-env', title: 'Environment', path: 'deployment/environment.md' },
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    path: 'monitoring/README.md',
  },
];

export default function DocsPage() {
  const [selectedDoc, setSelectedDoc] = useState('README.md');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['api', 'database', 'deployment']));
  const [MarkdownRenderer, setMarkdownRenderer] = useState<React.ComponentType<{ content: string; onDocSelect: (path: string) => void; selectedDoc: string }> | null>(null);

  // Load the markdown renderer on client side only
  useEffect(() => {
    import('@/components/docs/MarkdownRenderer').then((mod) => {
      setMarkdownRenderer(() => mod.MarkdownRenderer);
    });
  }, []);

  const loadDoc = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/docs/${encodeURIComponent(path)}`);
      if (response.ok) {
        const text = await response.text();
        setContent(text);
      } else {
        setContent('# Document Not Found\n\nThe requested documentation file could not be loaded.');
      }
    } catch {
      setContent('# Error\n\nFailed to load documentation.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDoc(selectedDoc);
  }, [selectedDoc, loadDoc]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNavItem = (item: DocSection, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.has(item.id);
    const isSelected = selectedDoc === item.path;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleSection(item.id);
            }
            setSelectedDoc(item.path);
          }}
          className={cn(
            'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between',
            isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700',
            depth > 0 && 'ml-4'
          )}
        >
          <span>{item.title}</span>
          {hasChildren && (
            <svg
              className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.children!.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <Card className="h-full overflow-auto">
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Documentation</h3>
            <nav className="space-y-1">
              {docStructure.map((item) => renderNavItem(item))}
            </nav>
          </CardContent>
        </Card>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        <Card className="h-full">
          <CardContent className="p-6 prose prose-sm max-w-none">
            {loading || !MarkdownRenderer ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <MarkdownRenderer content={content} onDocSelect={setSelectedDoc} selectedDoc={selectedDoc} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
