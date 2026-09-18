import { useT } from '../lib/i18n';

interface Props {
  /** True when the hand was lost rather than the player asking to stop. */
  auto: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

/**
 * Pause overlay.
 *
 * Two very different situations behind one screen, so it says which one it is.
 * A player who pressed Space knows what happened; a player whose hand left the
 * frame does not, and telling them "hand lost" is the difference between a
 * game that stopped and a game that broke.
 *
 * The auto-paused case deliberately offers no resume button: bringing the hand
 * back is the resume, and the engine does it on its own. Offering a button for
 * something that is about to happen anyway invites people to reach for the
 * mouse -- with the hand the game is waiting for.
 */
export function PauseScreen({ auto, onResume, onRestart, onQuit }: Props): JSX.Element {
  const t = useT();

  return (
    <div className="overlay overlay--pause">
      <h1 className="title title--plain">{t(auto ? 'pause.title.auto' : 'pause.title')}</h1>

      <p className="subtitle">
        {auto ? (
          <>
            {t('pause.body.auto.1')}
            <br />
            {t('pause.body.auto.2')}
          </>
        ) : (
          t('pause.body')
        )}
      </p>

      {!auto && (
        <button type="button" onClick={onResume}>
          {t('pause.resume')}
        </button>
      )}

      <p className="small">
        <kbd>Space</kbd> {t(auto ? 'key.resumeNow' : 'key.resume')} · <kbd>R</kbd>{' '}
        {t('key.restart')} · <kbd>Esc</kbd> {t('key.menu')}
      </p>

      <div className="pause-actions">
        <button type="button" className="button--ghost" onClick={onRestart}>
          {t('pause.restart')}
        </button>
        {/* The way out. A paused run had no exit at all: the only routes back to
            the menu were finishing it or reloading the page, which is a strange
            thing to ask of someone who has just stopped because they need to be
            somewhere else. */}
        <button type="button" className="button--ghost" onClick={onQuit}>
          {t('pause.quit')}
        </button>
      </div>
    </div>
  );
}
