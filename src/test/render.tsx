import { act, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { StoreProvider } from '../store';

export function renderAt(hash: string) {
  location.hash = hash;
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

export function setDay(day: number) {
  const slider = screen.getByLabelText('Simulated days since go-live');
  act(() => {
    fireEvent.change(slider, { target: { value: String(day) } });
  });
}

export const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
