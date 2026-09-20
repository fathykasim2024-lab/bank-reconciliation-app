import { handleRecalc } from './logic/recalc.js';
import { handleReview } from './logic/review.js';
import { handleMemo } from './logic/memo.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/recalc') {
      return handleRecalc(request);
    }
    if (request.method === 'POST' && url.pathname === '/api/review') {
      return handleReview(request);
    }
    if (request.method === 'POST' && url.pathname === '/api/memo') {
      return handleMemo(request);
    }

    // كل حاجة تانية (الصفحة والملفات الثابتة) بتتقدم من public/
    return env.ASSETS.fetch(request);
  }
};
