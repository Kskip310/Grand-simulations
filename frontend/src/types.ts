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
  culture: Record<string, number>;
  tech_tier: number;
  coordination: number;
  resourcefulness: number;
  collapse_pressure: number;
};

export type Civilization = {
  name: string;
  tier: string;
  population: number;
  tech: number;
  coordination: number;
  resources: number;
  exploration: number;
  survival: number;
  collapse_risk: number;
  expansion_ready: boolean;
  orbital_presence: boolean;
  settlements: number;
  outposts: number;
  thresholds: Record<string, number>;
  known_targets: Array<{
    planet_id: string;
    planet_name: string;
    habitability: number;
    supports_colony: boolean;
    supports_outpost: boolean;
    occupied: boolean;
  }>;
};

export type LifeOverview = {
  present: boolean;
  species_count: number;
  dominant_species: string | null;
  civilization: Civilization | null;
  biosphere_score: number;
  alert_level: string;
  development_index: number;
  expansion_targets: Civilization['known_targets'];
  offworld_presence: Array<{
    target_planet_id: string;
    target_planet_name: string;
    kind: string;
    population: number;
    status: string;
  }>;
};

export type Settlement = {
  kind: string;
  origin_planet_id: string;
  origin_planet_name: string;
  civilization_name: string;
  population: number;
  established_step: number;
  status: string;
  support: number;
  viability: number;
};

export type Planet = {
  id: string;
  name: string;
  orbit_index: number;
  radius_km: number;
  surface: SurfaceCell[][];
  metrics: Record<string, number>;
  species: Species[];
  life: LifeOverview;
  season_phase: number;
  anomaly: string;
  influences: Record<string, number>;
  development: {
    interest: number;
    collapse_risk: number;
    expansion_ready: boolean;
    next_milestone: string;
  };
  settlement: Settlement | null;
  recent_events: string[];
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

export type Alert = {
  step: number;
  system_id: string;
  planet_id: string | null;
  category: string;
  title: string;
  detail: string;
  severity: string;
};

export type SimulationState = {
  id: string;
  name: string;
  seed: number;
  current_step: number;
  systems: StarSystem[];
  metrics: Record<string, number>;
  alerts: Alert[];
  overseer: {
    presence_mode: string;
    watch_worlds: Array<{
      system_id: string;
      system_name: string;
      planet_id: string;
      planet_name: string;
      interest: number;
      alert_level: string;
      expansion_ready: boolean;
    }>;
  };
};
