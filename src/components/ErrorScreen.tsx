import { useT, type MessageKey } from '../lib/i18n';
import { LangSwitch } from './LangSwitch';

interface Props {
  /** What went wrong, as a message key (see lib/errors). */
  messageKey: MessageKey;
  /** The raw error. Deliberately not translated: it is for a bug report. */
  detail?: string | undefined;
  onRetry: () => void;
}

export function ErrorScreen({ messageKey, detail, onRetry }: Props): JSX.Element {
  const t = useT();

  return (
    <div className="overlay">
      <LangSwitch />
      <h1 className="title title--plain">{t('error.title')}</h1>
      <p className="error">{t(messageKey)}</p>
      {detail && <pre className="error-detail">{detail}</pre>}
      <button type="button" onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  );
}
