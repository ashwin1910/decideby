import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  location.hash = '';
});
// jsdom has no scrollTo / confirm
window.scrollTo = () => {};
window.confirm = () => true;
