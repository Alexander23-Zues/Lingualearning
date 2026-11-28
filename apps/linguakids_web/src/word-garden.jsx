import { uiText, useUiLanguage } from "./i18n";
import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './ui';

export const wordLetters = (word) => Array.from(String(word || '').normalize('NFC').toLocaleUpperCase('en')).filter(letter => /\p{L}/u.test(letter));
export function supportsWordGarden(pairs) {
  return Array.isArray(pairs) && pairs.length > 0 && pairs.every(pair =>
    typeof pair.en === 'string' && typeof pair.fil === 'string' && pair.fil.trim() &&
    wordLetters(pair.en).length >= 2 && wordLetters(pair.en).length <= 16);
}
export function shuffledLetters(word, random = Math.random) {
  const original = wordLetters(word), letters = [...original];
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  if (letters.join('') === original.join('') && new Set(letters).size > 1) letters.push(letters.shift());
  return letters;
}

export function WordGarden({ pairs, answers, onSolve }) {
  useUiLanguage();
  const [round, setRound] = useState(() => Math.max(0, pairs.findIndex(pair => answers[pair.en] !== pair.fil)));
  const pair = pairs[round];
  return <WordRound key={round} pair={pair} round={round} pairs={pairs} answers={answers} onSolve={onSolve}
    onNext={() => setRound(pairs.findIndex(item => answers[item.en] !== item.fil))} />;
}

function WordRound({ pair, round, pairs, answers, onSolve, onNext }) {
  useUiLanguage();
  const gameRef = useRef(null);
  useEffect(() => {
    if (round > 0) {
      gameRef.current?.focus({preventScroll:true});
      const dialog = gameRef.current?.closest('dialog');
      if (dialog) dialog.scrollTop = 0;
    }
  }, [round]);
  const [letters, setLetters] = useState(() => shuffledLetters(pair.en));
  const [selected, setSelected] = useState([]);
  const [feedback, setFeedback] = useState('');
  const target = wordLetters(pair.en);
  const solved = answers[pair.en] === pair.fil;
  const found = pairs.filter(item => answers[item.en] === item.fil).length;
  function choose(index) {
    if (solved) return;
    setSelected(previous => previous.includes(index) ? previous : [...previous, index]);
    setFeedback('');
  }
  function check() {
    if (solved || !selected.length) return;
    if (selected.map(index => letters[index]).join('') === target.join('')) {
      onSolve(pair);
      setFeedback(`Well done! ${pair.en} means ${pair.fil}.`);
    } else setFeedback('Not quite. Undo a letter or clear your word and try again.');
  }
  function keyboard(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || solved) return;
    if (event.key === 'Backspace') {
      event.preventDefault(); setSelected(previous => previous.slice(0, -1)); setFeedback('');
    } else if (event.key === 'Escape') {
      // Escape belongs to the dialog, so it remains available to close the game.
    } else if (event.key.length === 1 && /\p{L}/u.test(event.key)) {
      event.preventDefault();
      const index = letters.findIndex((letter, i) => letter === event.key.toLocaleUpperCase('en') && !selected.includes(i));
      if (index >= 0) choose(index);
    } else if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault(); check();
    }
  }
  return <section ref={gameRef} className="word-garden" aria-label={uiText("Word Garden game")} tabIndex={0} onKeyDown={keyboard}>
    <header className="garden-heading">
      <div><span className="eyebrow">{uiText("BUILD A LITTLE DISCOVERY")}</span><h2>{uiText("Word Garden ")}<span aria-hidden="true">🌱</span></h2></div>
      <span className="garden-counter">{found} / {pairs.length}{uiText(" found")}</span>
    </header>
    <progress aria-label={uiText("Words found")} max={pairs.length} value={found} />
    <div className="garden-layout">
      <div className="garden-board">
        <p className="garden-clue">{uiText("Filipino clue ")}<strong>{pair.fil}</strong></p>
        <p className="garden-instructions">{uiText("Tap letters in order, or type the English word.")}</p>
        <div className="garden-slots" aria-label={uiText("Your word: {0}", [selected.map(index => letters[index]).join('') || 'empty'])}>
          {target.map((_, index) => <span key={index} className={solved ? 'solved' : ''} aria-hidden="true">{letters[selected[index]] || ''}</span>)}
        </div>
        <div className={`garden-letters ${letters.length > 8 ? 'garden-letter-grid' : ''}`} role="group" aria-label={uiText("Shuffled letters")}>
          {letters.map((letter, index) => {
            const angle = 2 * Math.PI * index / letters.length - Math.PI / 2;
            return <button type="button" key={index} className="garden-letter"
              style={{'--x': `${50 + 34 * Math.cos(angle)}%`, '--y': `${50 + 34 * Math.sin(angle)}%`}}
              aria-label={uiText("Letter {0}, tile {1}", [letter, index + 1])} aria-pressed={selected.includes(index)}
              disabled={solved || selected.includes(index)} onClick={() => choose(index)}>{letter}</button>;
          })}
          {letters.length <= 8 && <Icon name="spark" size={30} />}
        </div>
        <div className="garden-tools">
          <Button variant="ghost" disabled={solved || !selected.length} onClick={() => {setSelected(selected.slice(0,-1));setFeedback('');}}>{uiText("Undo")}</Button>
          <Button variant="ghost" disabled={solved || !selected.length} onClick={() => {setSelected([]);setFeedback('');}}>{uiText("Clear")}</Button>
          <Button variant="ghost" icon="refresh" disabled={solved} onClick={() => {setLetters(shuffledLetters(pair.en));setSelected([]);setFeedback('');}}>{uiText("Shuffle")}</Button>
        </div>
        <p className="garden-feedback" role="status">{feedback || (solved ? uiText("You found {0}!", [pair.en]) : uiText("{0} letters · Word {1} of {2}", [target.length, round + 1, pairs.length]))}</p>
        {solved ? (found < pairs.length ? <Button className="garden-check" icon="arrow" onClick={onNext}>{uiText("Next word")}</Button> : <p className="garden-done">{uiText("Every word found! Finish below to save your activity.")}</p>) :
          <Button className="garden-check" disabled={selected.length !== target.length} onClick={check}>{uiText("Check word")}</Button>}
      </div>
      <aside className="garden-found" aria-label={uiText("Word discoveries")}>
        <h3>{uiText("Your discoveries")}</h3><p>{uiText("One word at a time. Watch your garden grow.")}</p>
        <ol>{pairs.map((item, index) => <li key={index} aria-current={index === round ? 'step' : undefined}>
          <span className="garden-seed" aria-hidden="true">{answers[item.en] === item.fil ? '🌿' : index + 1}</span>
          <span><strong>{answers[item.en] === item.fil ? item.en : uiText("{0} letters", [wordLetters(item.en).length])}</strong><small>{item.fil}</small></span>
          {answers[item.en] === item.fil && <span aria-label={uiText("Word found")}>✓</span>}
        </li>)}</ol>
      </aside>
    </div>
  </section>;
}
