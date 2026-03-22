export type SimulationSummary = {
  id: string;
  name: string;
  seed: number;
  created_at: string;
  updated_at: string;
  metrics: Record<string, number>;
  current_step: number;
};

export type SurfaceCell = {
  x: number;
  y: number;
  elevation: number;
  moisture: number;
  temperature: number;
  biome: string;
  label: string;
  has_water: boolean;
  habitability: number;
};

export type Species = {
  id: string;
  name: string;
  adaptation: string;
  stage: string;
  population: number;
  growth_bias: number;
  resilience: number;
};

export type Planet = {
  id: string;
  name: string;
  orbit_index: number;
  radius_km: number;
  surface: SurfaceCell[][];
  metrics: Record<string, number>;
  species: Species[];
  life: {
    present: boolean;
    species_count: number;
    dominant_species: string | null;
    civilization: { name: string; tier: string; stability: number } | null;
    biosphere_score: number;
  };
  season_phase: number;
  anomaly: string;
};

export type StarSystem = {
  id: string;
  name: string;
  x: number;
  y: number;
  star_type: string;
  luminosity: number;
  planets: Planet[];
};

export type SimulationState = {
  id: string;
  name: string;
  seed: number;
  current_step: number;
  systems: StarSystem[];
  metrics: Record<string, number>;
};
