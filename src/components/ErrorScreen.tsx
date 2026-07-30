interface Props {
  /** Message deja traduit en langage humain (voir explainError). */
  message: string;
  detail?: string | undefined;
  onRetry: () => void;
}

export function ErrorScreen({ message, detail, onRetry }: Props): JSX.Element {
  return (
    <div className="overlay">
      <h1 className="title">Oups</h1>
      <p className="error">{message}</p>
      {detail && <pre className="error-detail">{detail}</pre>}
      <button type="button" onClick={onRetry}>
        Reessayer
      </button>
    </div>
  );
}
