import { Fragment } from 'react';

interface Props {
  /** A translated string, where `*emphasis*` becomes <b>. */
  children: string;
}

/**
 * The smallest markup a translated sentence needs.
 *
 * Bold inside a sentence is not decoration here: "going from *fingers apart* to
 * *fingers pinched*" is the rule of the game, and the two states are what the
 * eye should land on. Keeping the emphasis in the string means the translator
 * chooses which French words carry it, instead of inheriting an English word
 * order that no longer applies.
 *
 * Only `*...*` is supported, on purpose. Every richer construct — keyboard
 * keys, links — is assembled in JSX from separate keys, so no translator is
 * ever asked to keep a tag balanced.
 */
export function Rich({ children }: Props): JSX.Element {
  const parts = children.split('*');
  return (
    <>
      {parts.map((part, i) =>
        // Odd indices are what sat between a pair of asterisks.
        i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
