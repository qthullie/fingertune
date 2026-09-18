import { useT } from '../lib/i18n';

interface Props {
  /** True when the webcam image is hidden. */
  hidden: boolean;
  onChange: (hidden: boolean) => void;
}

/**
 * The control that decides whether the webcam image is ever drawn.
 *
 * It is a checkbox on the start screen, and it is there rather than only on
 * <kbd>V</kbd> for one reason: by the time a keyboard shortcut would help, the
 * camera has started and the room is already on screen. That is exactly the
 * frame the person reaching for it did not want to exist.
 *
 * The label says what happens, not what the mode is called. "Privacy mode" is
 * a name you have to have been told; "hide the webcam image" is the thing
 * itself.
 */
export function PrivacySwitch({ hidden, onChange }: Props): JSX.Element {
  const t = useT();

  return (
    <label className={`switch${hidden ? ' switch--on' : ''}`}>
      <input
        type="checkbox"
        checked={hidden}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-box" aria-hidden="true" />
      <span>{t('privacy.label')}</span>
    </label>
  );
}
