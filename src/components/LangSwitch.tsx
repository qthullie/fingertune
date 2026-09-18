import { LANGS, setLang, useT, type Lang } from '../lib/i18n';

/**
 * Two buttons, always both visible.
 *
 * A single toggle showing the *other* language is smaller, and it is ambiguous
 * in exactly the situation that matters: a French speaker landing on an English
 * page sees "FR" and cannot tell whether it means "you are in French" or
 * "switch to French". Showing both with one pressed removes the guess.
 */
export function LangSwitch(): JSX.Element {
  const t = useT();

  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      {LANGS.map((lang: Lang) => (
        <button
          key={lang}
          type="button"
          className={`chip chip--lang${lang === t.lang ? ' chip--active' : ''}`}
          aria-pressed={lang === t.lang}
          lang={lang}
          onClick={() => setLang(lang)}
        >
          {t(lang === 'en' ? 'lang.en' : 'lang.fr')}
        </button>
      ))}
    </div>
  );
}
