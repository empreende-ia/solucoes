import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export const ApiDocsPanel: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const apiKey = typeof window !== 'undefined'
    ? localStorage.getItem('dispara_api_key') || 'SUA_API_KEY'
    : 'SUA_API_KEY';

  const copyExample = () => {
    const example = `curl -X GET "https://seu-dominio.com/api/campaigns" \\
  -H "Authorization: Bearer ${apiKey}"`;
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <BookOpen className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-lg text-[var(--ds-text-primary)]">Documentação da API</CardTitle>
            <CardDescription>
              Integre o Dispara com seus sistemas via REST API
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--ds-text-secondary)]">
          Acesse a documentação interativa (Swagger UI) para explorar todos os endpoints disponíveis,
          testar requisições e ver exemplos de uso.
        </p>

        {/* Exemplo de uso */}
        <div className="bg-[var(--ds-bg-surface)] rounded-lg p-4 border border-[var(--ds-border-default)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider">Exemplo</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyExample}
              className="h-6 px-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          <pre className="text-xs text-[var(--ds-text-secondary)] overflow-x-auto">
            <code>{`curl -X GET "/api/campaigns" \\
  -H "Authorization: Bearer <API_KEY>"`}</code>
          </pre>
        </div>

        {/* Botão de acesso */}
        <Link href="/docs" target="_blank">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <BookOpen className="h-4 w-4 mr-2" />
            Abrir Documentação
            <ExternalLink className="h-3 w-3 ml-2 opacity-50" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};
