import { useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import { copyText } from '../lib/challenge';
import { useT } from '../lib/i18n';
import { LangSwitch } from './LangSwitch';

const SOURCE_URL = 'https://github.com/qthullie/fingertune';

interface Props {
  /** Dismisses this screen and lets the game start anyway. */
  onContinue: () => void;
}

/**
 * What a phone gets instead of a game it cannot play.
 *
 * Three things it has to do, in this order:
 *
 *   1. Say it is not broken. "Come back on a computer" is a different message
 *      from a black screen, and it is the difference between a visitor who
 *      thinks the project does not work and one who bookmarks it.
 *   2. Make coming back cheap. The link goes on the clipboard in one tap;
 *      asking someone to retype a URL on a laptop is asking them not to.
 *   3. Leave a door open. Tablets on a stand play fine, and a detection rule
 *      that cannot be overridden is a rule that will be wrong about somebody.
 */
export function MobileScreen({ onContinue }: Props): JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');

  const copy = async (): Promise<void> => {
    const ok = await copyText(`${window.location.origin}${window.location.pathname}`);
    setCopied(ok ? 'ok' : 'failed');
  };

  return (
    <div className="overlay overlay--device">
      <LangSwitch />

      <img className="logo" src={logoUrl} alt="Fingertune" width={96} height={96} />
      <h1 className="title title--plain">{t('mobile.title')}</h1>

      <p className="subtitle">{t('mobile.body')}</p>
      <p className="device-note">{t('mobile.why')}</p>

      <button type="button" onClick={() => void copy()}>
        {copied === 'ok'
          ? t('mobile.copied')
          : copied === 'failed'
            ? t('mobile.copyFailed')
            : t('mobile.copy')}
      </button>

      <button type="button" className="button--ghost" onClick={onContinue}>
        {t('mobile.anyway')}
      </button>

      <a className="device-link" href={SOURCE_URL} target="_blank" rel="noreferrer">
        {t('mobile.source')}
      </a>
    </div>
  );
}
