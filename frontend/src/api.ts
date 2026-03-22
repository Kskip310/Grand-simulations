import { SimulationState, SimulationSummary } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listSimulations: (): Promise<SimulationSummary[]> => request('/simulations'),
  createSimulation: (seed: number, name?: string): Promise<SimulationState> =>
    request('/simulations', {
      method: 'POST',
      body: JSON.stringify({ seed, name }),
    }),
  loadSimulation: (id: string): Promise<SimulationState> => request(`/simulations/${id}`),
  stepSimulation: (id: string, steps: number): Promise<SimulationState> =>
    request(`/simulations/${id}/step`, {
      method: 'POST',
      body: JSON.stringify({ steps }),
    }),
};
