import './style.css';
import { GameController } from './ui/controller';
import { CardReviewApp } from './ui/card-review-app';

const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(window.location.search);

if (params.get('mode') === 'cards') {
  const reviewApp = new CardReviewApp(app);
  reviewApp.start();
} else {
  const controller = new GameController(app);
  controller.start();

  if (params.get('mode') === 'aivai') {
    controller.startAiVsAi();
  }
}
