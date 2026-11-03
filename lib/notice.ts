const styles = `
  :host { display: block; margin: 8px 0; }
  button, p {
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 12px;
    border: 1px solid #666;
    border-radius: 5px;
    background: #202020;
    color: #eee;
    font: 14px/1.5 Arial, sans-serif;
    text-align: left;
  }
  button { cursor: pointer; }
  button:hover { border-color: #aaa; }
  button:focus-visible { outline: 2px solid #aaa; outline-offset: 2px; }
`;

export function createNotice(
  doc: Document,
  allowReveal: boolean,
  onReveal: () => void,
  label = 'GTA 6 content hidden',
): HTMLElement {
  const host = doc.createElement('div');
  host.dataset.viceGuardUi = '';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = styles;
  if (allowReveal) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = `${label} · Click to reveal`;
    button.addEventListener('click', onReveal);
    shadow.append(style, button);
  } else {
    const notice = doc.createElement('p');
    notice.textContent = `${label} · Reveal disabled`;
    shadow.append(style, notice);
  }
  return host;
}
