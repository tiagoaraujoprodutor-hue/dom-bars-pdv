'use client';

import { useEffect } from 'react';

/**
 * Fronteira de erro global do painel. Em vez de a tela ficar branca quando algo
 * inesperado quebra na renderização, mostramos uma mensagem humana em pt-BR e um
 * botão para tentar de novo — o operador nunca fica travado sem saída.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log no console do navegador ajuda o suporte a diagnosticar sem expor detalhes na tela.
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ marginTop: 0 }}>Algo deu errado</h1>
        <p className="muted">
          Encontramos um problema ao carregar esta tela. Você pode tentar novamente — seus dados
          continuam salvos.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => reset()}>Tentar novamente</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
