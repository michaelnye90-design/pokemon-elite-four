import './style.css';
import { LEGAL_NOTICE } from './legal';

const app = document.querySelector<HTMLElement>('#app')!;
const footer = document.querySelector<HTMLElement>('#legal')!;

app.innerHTML = `
  <h1>Elite Four Challenge</h1>
  <p>Coming soon: battle the Kanto Elite Four with a random team.</p>
`;
footer.textContent = LEGAL_NOTICE;
