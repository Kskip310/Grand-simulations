import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Alert, Planet, SimulationState, SimulationSummary, Species, StarSystem, SurfaceCell } from './types';

type ViewMode = 'galaxy' | 'system' | 'planet';

type PlanetDelta = {
  habitability: number;
  temperature: number;
  moisture: number;
  population: number;
  settlementCount: number;
};

type StepReport = {
  steps: number;
  beforeStep: number;
  afterStep: number;
  changedWorlds: number;
  selectedPlanetDelta: PlanetDelta | null;
  headline: string;
};

type InfluenceAction = {
  id: string;
  label: string;
  effect: string;
  mode: 'subtle' | 'direct';
};

const BIOME_COLORS: Record<string, string> = {
  ocean: '#174f90',
  reef: '#21a6c6',
  ice: '#d8ecff',
  desert: '#d8b65b',
  grassland: '#74c255',
  forest: '#2f8a42',
  rainforest: '#0e6c39',
  tundra: '#98afaa',
  mountain: '#7f6d63',
  wetland: '#3f9983',
  volcanic: '#b44d34',
};

const WORLD_ACTIONS: InfluenceAction[] = [
  { id: 'warm_atmosphere', label: 'Warm Atmosphere', effect: 'Raise long-term heat drift.', mode: 'subtle' },
  { id: 'cool_atmosphere', label: 'Cool Atmosphere', effect: 'Lower long-term heat drift.', mode: 'subtle' },
  { id: 'enrich_rains', label: 'Enrich Rains', effect: 'Increase moisture drift and fertility.', mode: 'subtle' },
  { id: 'fertility_blessing', label: 'Fertility Blessing', effect: 'Strengthen biosphere growth.', mode: 'subtle' },
  { id: 'stir_mutation', label: 'Stir Mutation', effect: 'Push adaptation and change.', mode: 'subtle' },
  { id: 'stabilize_world', label: 'Stabilize World', effect: 'Reduce collapse and climate shocks.', mode: 'subtle' },
  { id: 'enrich_resources', label: 'Enrich Resources', effect: 'Boost long-run material potential.', mode: 'subtle' },
  { id: 'protect_biosphere', label: 'Protect Biosphere', effect: 'Shield life and settlements.', mode: 'direct' },
  { id: 'biosphere_seeding', label: 'Biosphere Seeding', effect: 'Directly encourage life where viable.', mode: 'direct' },
  { id: 'raise_disasters', label: 'Raise Disasters', effect: 'Increase hazard and collapse risk.', mode: 'direct' },
  { id: 'cataclysm', label: 'Cataclysm', effect: 'Severely disrupt the world.', mode: 'direct' },
];

const CULTURE_ACTIONS: InfluenceAction[] = [
  { id: 'encourage_cooperation', label: 'Encourage Cooperation', effect: 'Improve coordination and resilience.', mode: 'subtle' },
  { id: 'encourage_conflict', label: 'Encourage Conflict', effect: 'Raise pressure and volatility.', mode: 'direct' },
  { id: 'encourage_curiosity', label: 'Encourage Curiosity', effect: 'Bias discovery and experimentation.', mode: 'subtle' },
  { id: 'encourage_caution', label: 'Encourage Caution', effect: 'Increase survival discipline.', mode: 'subtle' },
  { id: 'encourage_invention', label: 'Encourage Invention', effect: 'Bias technological development.', mode: 'subtle' },
  { id: 'encourage_agriculture', label: 'Encourage Agriculture', effect: 'Bias food and settlement capacity.', mode: 'subtle' },
  { id: 'encourage_navigation', label: 'Encourage Navigation', effect: 'Bias travel and local reach.', mode: 'subtle' },
  { id: 'encourage_astronomy', label: 'Encourage Astronomy', effect: 'Bias orbital awareness and science.', mode: 'subtle' },
  { id: 'encourage_spirituality', label: 'Encourage Spirituality', effect: 'Shape meaning-making and myth.', mode: 'subtle' },
  { id: 'suppress_collapse', label: 'Suppress Collapse', effect: 'Push against breakdown pressure.', mode: 'direct' },
  { id: 'increase_expansion_drive', label: 'Increase Expansion Drive', effect: 'Bias off-world ambition.', mode: 'direct' },
];

function metricPercent(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function formatSignedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

function populationOf(planet: Planet): number {
  const biosphere = planet.species.reduce((sum, species) => sum + species.population, 0);
  const settlement = planet.settlement?.population ?? 0;
  return biosphere + settlement;
}

function eraName(step: number): string {
  if (step < 5) return 'Genesis Drift';
  if (step < 15) return 'World Bloom';
  if (step < 30) return 'Awakening Age';
  return 'Overseer Epoch';
}

function seasonName(phase: number): string {
  if (phase < 1.2) return 'Vernal rise';
  if (phase < 2.6) return 'High radiance';
  if (phase < 4.1) return 'Cooling turn';
  if (phase < 5.4) return 'Deep night';
  return 'Thaw return';
}

function climateLabel(planet: Planet): string {
  const heat = planet.metrics.avg_temperature;
  const moisture = planet.metrics.avg_moisture;
  if (heat < 0.22) return 'Cryotic world';
  if (heat > 0.72 && moisture < 0.4) return 'Scorched drylands';
  if (heat > 0.66 && moisture > 0.62) return 'Humid tropics';
  if (moisture > 0.7) return 'Storm-wet basins';
  if (moisture < 0.28) return 'Wind-carved plains';
  return 'Temperate frontier';
}

function lifeStageSummary(planet: Planet): { label: string; tone: 'sterile' | 'primitive' | 'developing' | 'civilized' } {
  if (planet.settlement) return { label: `${planet.settlement.kind} world`, tone: 'civilized' };
  if (!planet.life.present) return { label: 'Sterile world', tone: 'sterile' };
  if (planet.life.civilization?.orbital_presence) return { label: 'Orbital civilization', tone: 'civilized' };
  if (planet.life.civilization) return { label: 'Planetary civilization', tone: 'civilized' };
  if (planet.species.some((species) => species.stage === 'toolmakers')) return { label: 'Developing cultures', tone: 'developing' };
  return { label: 'Primitive biosphere', tone: 'primitive' };
}

function hotspotCells(planet: Planet): SurfaceCell[] {
  if (!planet.life.present && !planet.settlement) return [];
  return planet.surface
    .flat()
    .filter((cell) => !cell.has_water && cell.habitability > 0.52)
    .sort((left, right) => right.habitability - left.habitability)
    .slice(0, Math.min(5, planet.life.species_count + (planet.settlement ? 2 : 1)));
}

function findPlanet(state: SimulationState | null, planetId: string | null): Planet | null {
  if (!state || !planetId) return null;
  for (const system of state.systems) {
    const found = system.planets.find((planet) => planet.id === planetId);
    if (found) return found;
  }
  return null;
}

function dominantSpecies(planet: Planet): Species | null {
  return planet.species.reduce<Species | null>((best, species) => {
    if (!best || species.population > best.population) return species;
    return best;
  }, null);
}

function buildStepReport(before: SimulationState, after: SimulationState, selectedPlanetId: string | null): StepReport {
  let changedWorlds = 0;
  for (const system of after.systems) {
    for (const planet of system.planets) {
      const previous = findPlanet(before, planet.id);
      if (!previous) continue;
      if (
        previous.metrics.habitability !== planet.metrics.habitability ||
        previous.life.development_index !== planet.life.development_index ||
        previous.settlement?.population !== planet.settlement?.population ||
        populationOf(previous) !== populationOf(planet)
      ) {
        changedWorlds += 1;
      }
    }
  }

  const selectedBefore = findPlanet(before, selectedPlanetId);
  const selectedAfter = findPlanet(after, selectedPlanetId);
  const delta = selectedBefore && selectedAfter
    ? {
        habitability: Number((selectedAfter.metrics.habitability - selectedBefore.metrics.habitability).toFixed(3)),
        temperature: Number((selectedAfter.metrics.avg_temperature - selectedBefore.metrics.avg_temperature).toFixed(3)),
        moisture: Number((selectedAfter.metrics.avg_moisture - selectedBefore.metrics.avg_moisture).toFixed(3)),
        population: populationOf(selectedAfter) - populationOf(selectedBefore),
        settlementCount: (selectedAfter.settlement ? 1 : 0) - (selectedBefore.settlement ? 1 : 0),
      }
    : null;

  const latestAlert = after.alerts[after.alerts.length - 1];
  return {
    steps: after.current_step - before.current_step,
    beforeStep: before.current_step,
    afterStep: after.current_step,
    changedWorlds,
    selectedPlanetDelta: delta,
    headline: latestAlert?.title ?? 'Simulation advanced.',
  };
}

function PlanetGlobe({ planet, hoveredCell }: { planet: Planet; hoveredCell: SurfaceCell | null }) {
  const stage = lifeStageSummary(planet);
  const hotspots = hotspotCells(planet);
  const atmosphereColor = {
    sterile: '#6f7b91',
    primitive: '#6bd59f',
    developing: '#90f2cf',
    civilized: '#ffd47f',
  }[stage.tone];

  return (
    <div className={`planet-globe-card tone-${stage.tone}`}>
      <svg viewBox="0 0 240 240" className="planet-globe" role="img" aria-label={`Planet globe for ${planet.name}`}>
        <defs>
          <clipPath id={`clip-${planet.id}`}>
            <circle cx="120" cy="120" r="90" />
          </clipPath>
          <radialGradient id={`shade-${planet.id}`} cx="35%" cy="30%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
            <stop offset="65%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.48)" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="98" fill="rgba(94, 140, 255, 0.12)" stroke={atmosphereColor} strokeWidth="3" />
        <g clipPath={`url(#clip-${planet.id})`}>
          <rect x="0" y="0" width="240" height="240" fill="#09121f" />
          {planet.surface.flat().map((cell) => (
            <rect
              key={`${planet.id}-${cell.x}-${cell.y}`}
              x={24 + cell.x * 8}
              y={48 + cell.y * 12}
              width="8"
              height="12"
              fill={BIOME_COLORS[cell.biome] ?? '#666'}
              opacity={0.62 + cell.habitability * 0.45}
              stroke={cell.has_water ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)'}
              strokeWidth="0.7"
            />
          ))}
          {hotspots.map((cell) => (
            <circle
              key={`${planet.id}-hotspot-${cell.x}-${cell.y}`}
              cx={28 + cell.x * 8}
              cy={54 + cell.y * 12}
              r="3"
              fill="rgba(207, 255, 226, 0.95)"
              stroke="rgba(13, 43, 31, 0.8)"
              strokeWidth="1"
            />
          ))}
          {planet.settlement && <circle cx="120" cy="120" r="82" fill="none" stroke="rgba(255, 212, 127, 0.72)" strokeWidth="2.5" strokeDasharray="5 4" />}
          {hoveredCell && (
            <rect
              x={24 + hoveredCell.x * 8}
              y={48 + hoveredCell.y * 12}
              width="8"
              height="12"
              fill="none"
              stroke="white"
              strokeWidth="2"
            />
          )}
          <circle cx="120" cy="120" r="90" fill={`url(#shade-${planet.id})`} />
        </g>
      </svg>
      <div className="planet-globe-caption">
        <div>
          <p className="eyebrow">World state</p>
          <strong>{stage.label}</strong>
        </div>
        <span>{climateLabel(planet)}</span>
      </div>
    </div>
  );
}

function SurfaceMap({ planet, onHover, hoveredCell }: { planet: Planet; onHover: (cell: SurfaceCell | null) => void; hoveredCell: SurfaceCell | null }) {
  const hotspots = hotspotCells(planet);
  return (
    <div className="surface-wrap">
      <div className="surface-map" role="img" aria-label={`Surface map of ${planet.name}`}>
        {planet.surface.flat().map((cell) => {
          const isHotspot = hotspots.some((item) => item.x === cell.x && item.y === cell.y);
          const isHovered = hoveredCell?.x === cell.x && hoveredCell?.y === cell.y;
          return (
            <button
              key={`${cell.x}-${cell.y}`}
              className={`surface-cell ${isHovered ? 'hovered' : ''} ${isHotspot ? 'hotspot' : ''}`}
              style={{
                background: BIOME_COLORS[cell.biome] ?? '#888',
                opacity: 0.65 + cell.habitability * 0.45,
              }}
              onMouseEnter={() => onHover(cell)}
              onFocus={() => onHover(cell)}
              onMouseLeave={() => onHover(null)}
              onBlur={() => onHover(null)}
              title={`${cell.label} — habitability ${metricPercent(cell.habitability)}`}
            >
              {isHotspot && <span className="life-dot" />}
            </button>
          );
        })}
      </div>
      <div className="legend-row">
        {Object.entries(BIOME_COLORS).map(([key, color]) => (
          <span key={key} className="legend-item">
            <i style={{ background: color }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('galaxy');
  const [seed, setSeed] = useState(2026);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<SurfaceCell | null>(null);
  const [stepReport, setStepReport] = useState<StepReport | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Alert | null>(null);

  const refreshList = async () => {
    const items = await api.listSimulations();
    setSimulations(items);
  };

  useEffect(() => {
    refreshList().catch((reason: Error) => setError(reason.message));
  }, []);

  const selectedSystem: StarSystem | null = useMemo(() => {
    if (!simulation) return null;
    return simulation.systems.find((item) => item.id === selectedSystemId) ?? simulation.systems[0] ?? null;
  }, [simulation, selectedSystemId]);

  const selectedPlanet: Planet | null = useMemo(() => {
    if (!selectedSystem) return null;
    return selectedSystem.planets.find((item) => item.id === selectedPlanetId) ?? selectedSystem.planets[0] ?? null;
  }, [selectedSystem, selectedPlanetId]);

  const stage = selectedPlanet ? lifeStageSummary(selectedPlanet) : null;
  const primarySpecies = selectedPlanet ? dominantSpecies(selectedPlanet) : null;

  useEffect(() => {
    if (simulation?.systems[0] && !selectedSystemId) {
      setSelectedSystemId(simulation.systems[0].id);
    }
  }, [simulation, selectedSystemId]);

  useEffect(() => {
    if (selectedSystem?.planets[0] && !selectedPlanetId) {
      setSelectedPlanetId(selectedSystem.planets[0].id);
    }
  }, [selectedSystem, selectedPlanetId]);

  const hydrateSelection = (state: SimulationState) => {
    setSelectedSystemId(state.systems[0]?.id ?? null);
    setSelectedPlanetId(state.systems[0]?.planets[0]?.id ?? null);
    setViewMode('galaxy');
    setHoverCell(null);
  };

  const loadSimulation = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.loadSimulation(id);
      setSimulation(state);
      hydrateSelection(state);
      setStepReport(null);
      setActionFeedback(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createSimulation = async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.createSimulation(seed, name || undefined);
      setSimulation(state);
      hydrateSelection(state);
      setStepReport(null);
      setActionFeedback(null);
      await refreshList();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const stepTime = async (steps: number) => {
    if (!simulation) return;
    setLoading(true);
    setError(null);
    try {
      const before = simulation;
      const state = await api.stepSimulation(simulation.id, steps);
      setSimulation(state);
      setStepReport(buildStepReport(before, state, selectedPlanetId));
      setActionFeedback(state.alerts[state.alerts.length - 1] ?? null);
      await refreshList();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyInfluence = async (action: InfluenceAction) => {
    if (!simulation || !selectedPlanet) return;
    setLoading(true);
    setError(null);
    try {
      const state = await api.influencePlanet(simulation.id, selectedPlanet.id, action.id);
      setSimulation(state);
      setActionFeedback(state.alerts[state.alerts.length - 1] ?? null);
      await refreshList();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectWatchWorld = (planetId: string) => {
    if (!simulation) return;
    for (const system of simulation.systems) {
      const planet = system.planets.find((item) => item.id === planetId);
      if (planet) {
        setSelectedSystemId(system.id);
        setSelectedPlanetId(planet.id);
        setViewMode('planet');
        return;
      }
    }
  };

  return (
    <div className="app-shell overseer-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Grand Simulations</p>
          <h1>Cosmic Overseer</h1>
          <p className="muted">Observe, influence, and test whether worlds can rise from biosphere to off-world presence.</p>
        </div>

        <section className="panel stack-gap">
          <h2>Create Simulation</h2>
          <label>
            Seed
            <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional simulation name" />
          </label>
          <button className="primary" onClick={createSimulation} disabled={loading}>
            Generate Universe
          </button>
        </section>

        <section className="panel stack-gap">
          <div className="section-header compact-header">
            <h2>Saved Universes</h2>
            <button onClick={() => refreshList().catch((reason: Error) => setError(reason.message))}>Refresh</button>
          </div>
          <div className="save-list">
            {simulations.map((item) => (
              <button key={item.id} className="save-card" onClick={() => loadSimulation(item.id)}>
                <strong>{item.name}</strong>
                <span>Seed {item.seed}</span>
                <span>{item.metrics.system_count} systems · {item.metrics.planet_count} worlds</span>
                <span>{item.metrics.civilization_worlds ?? 0} civilized · epoch {item.current_step}</span>
              </button>
            ))}
          </div>
        </section>

        {simulation && (
          <section className="panel stack-gap">
            <div className="section-header compact-header">
              <div>
                <p className="eyebrow">Overseer watchlist</p>
                <h2>High-interest worlds</h2>
              </div>
              <span>{simulation.metrics.watch_worlds} watched</span>
            </div>
            <div className="watch-list">
              {simulation.overseer.watch_worlds.map((watch) => (
                <button key={watch.planet_id} className="watch-card" onClick={() => selectWatchWorld(watch.planet_id)}>
                  <strong>{watch.planet_name}</strong>
                  <span>{watch.system_name}</span>
                  <span>Interest {metricPercent(watch.interest)} · {watch.alert_level}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      <main className="main-panel">
        <header className="topbar panel topbar-grid">
          <div>
            <p className="eyebrow">Observer Path</p>
            <div className="breadcrumb-row">
              <button className={`breadcrumb ${viewMode === 'galaxy' ? 'active' : ''}`} onClick={() => setViewMode('galaxy')} disabled={!simulation}>Universe</button>
              <span>›</span>
              <button className={`breadcrumb ${viewMode === 'system' ? 'active' : ''}`} onClick={() => setViewMode('system')} disabled={!selectedSystem}>{selectedSystem?.name ?? 'System'}</button>
              <span>›</span>
              <button className={`breadcrumb ${viewMode === 'planet' ? 'active' : ''}`} onClick={() => setViewMode('planet')} disabled={!selectedPlanet}>{selectedPlanet?.name ?? 'Planet'}</button>
            </div>
            <h2>{simulation?.name ?? 'No active universe'}</h2>
          </div>
          <section className="epoch-engine">
            <div>
              <p className="eyebrow">Epoch Engine</p>
              <strong>Epoch {simulation?.current_step ?? 0} · {eraName(simulation?.current_step ?? 0)}</strong>
              <p className="muted">{selectedPlanet ? `${selectedPlanet.name}: ${seasonName(selectedPlanet.season_phase)} · ${climateLabel(selectedPlanet)}` : 'Create or load a simulation to begin.'}</p>
            </div>
            <div className="time-controls pulse-controls">
              <button onClick={() => stepTime(1)} disabled={!simulation || loading}>Pulse +1</button>
              <button onClick={() => stepTime(5)} disabled={!simulation || loading}>Epoch +5</button>
              <button onClick={() => stepTime(10)} disabled={!simulation || loading}>Leap +10</button>
            </div>
            {stepReport && (
              <div className="step-report">
                <strong>{stepReport.headline}</strong>
                <span>{stepReport.changedWorlds} worlds changed from epoch {stepReport.beforeStep} to {stepReport.afterStep}.</span>
                {stepReport.selectedPlanetDelta && (
                  <div className="delta-row">
                    <span>Habitability {formatSignedPercent(stepReport.selectedPlanetDelta.habitability)}</span>
                    <span>Temp {formatSignedPercent(stepReport.selectedPlanetDelta.temperature)}</span>
                    <span>Moisture {formatSignedPercent(stepReport.selectedPlanetDelta.moisture)}</span>
                    <span>Population {formatSignedNumber(stepReport.selectedPlanetDelta.population)}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </header>

        {error && <div className="panel error-banner">{error}</div>}

        {simulation ? (
          <div className="content-grid explorer-grid overseer-grid">
            <section className={`panel galaxy-panel focus-panel ${viewMode === 'galaxy' ? 'panel-active' : ''}`}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">1. Observe</p>
                  <h3>System Watch</h3>
                </div>
                <span>{simulation.metrics.civilization_worlds} civilized · {simulation.metrics.settled_worlds} settled</span>
              </div>
              <div className="galaxy-map">
                {simulation.systems.map((system) => (
                  <button
                    key={system.id}
                    className={`system-node ${selectedSystem?.id === system.id ? 'selected' : ''}`}
                    style={{ left: `${system.x}%`, top: `${system.y}%` }}
                    onClick={() => {
                      setSelectedSystemId(system.id);
                      setSelectedPlanetId(system.planets[0]?.id ?? null);
                      setViewMode('system');
                    }}
                  >
                    <span>{system.star_type}</span>
                    <small>{system.name}</small>
                  </button>
                ))}
              </div>
              <div className="metrics-row">
                <div><strong>{simulation.metrics.system_count}</strong><span>systems</span></div>
                <div><strong>{simulation.metrics.planet_count}</strong><span>worlds</span></div>
                <div><strong>{simulation.metrics.civilization_worlds}</strong><span>civilizations</span></div>
                <div><strong>{simulation.metrics.settled_worlds}</strong><span>settlements</span></div>
              </div>
            </section>

            <section className={`panel orbit-panel focus-panel ${viewMode === 'system' ? 'panel-active' : ''}`}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">2. Choose a world</p>
                  <h3>{selectedSystem?.name ?? 'Select a system'}</h3>
                </div>
                <button onClick={() => setViewMode('galaxy')} disabled={!selectedSystem}>Back to universe</button>
              </div>
              <div className="orbit-strip orbit-grid">
                {selectedSystem?.planets.map((planet) => {
                  const worldStage = lifeStageSummary(planet);
                  return (
                    <button
                      key={planet.id}
                      className={`planet-chip ${selectedPlanet?.id === planet.id ? 'selected' : ''} tone-${worldStage.tone}`}
                      onClick={() => {
                        setSelectedPlanetId(planet.id);
                        setViewMode('planet');
                      }}
                    >
                      <div className="planet-chip-top">
                        <strong>{planet.name}</strong>
                        <span className={`status-pill tone-${worldStage.tone}`}>{worldStage.label}</span>
                      </div>
                      <span>{metricPercent(planet.metrics.habitability)} habitable · {metricPercent(planet.development.interest)} interest</span>
                      <span>{planet.life.civilization ? `${planet.life.civilization.tier} civilization` : `${planet.life.species_count} species`}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedPlanet && (
              <>
                <section className={`panel detail-panel focus-panel ${viewMode === 'planet' ? 'panel-active' : ''}`}>
                  <div className="section-header detail-header">
                    <div>
                      <p className="eyebrow">3. Inspect</p>
                      <h3>{selectedPlanet.name}</h3>
                      <p className="muted">{selectedPlanet.radius_km.toLocaleString()} km · {seasonName(selectedPlanet.season_phase)} · anomaly: {selectedPlanet.anomaly}</p>
                    </div>
                    <div className="mini-actions align-end">
                      <span className={`status-pill tone-${stage?.tone ?? 'sterile'}`}>{stage?.label}</span>
                      <button onClick={() => setViewMode('system')}>Back to orbit</button>
                    </div>
                  </div>

                  <div className="planet-stage-layout">
                    <PlanetGlobe planet={selectedPlanet} hoveredCell={hoverCell} />
                    <div className="planet-meters">
                      <div className="meter-card"><span>Habitability</span><strong>{metricPercent(selectedPlanet.metrics.habitability)}</strong><div className="meter-track bright"><i style={{ width: metricPercent(selectedPlanet.metrics.habitability) }} /></div></div>
                      <div className="meter-card"><span>Collapse risk</span><strong>{metricPercent(selectedPlanet.development.collapse_risk)}</strong><div className="meter-track danger"><i style={{ width: metricPercent(selectedPlanet.development.collapse_risk) }} /></div></div>
                      <div className="meter-card"><span>World interest</span><strong>{metricPercent(selectedPlanet.development.interest)}</strong><div className="meter-track"><i style={{ width: metricPercent(selectedPlanet.development.interest) }} /></div></div>
                      <div className="meter-card"><span>Next milestone</span><strong>{selectedPlanet.development.next_milestone}</strong><p className="muted">{selectedPlanet.development.expansion_ready ? 'Ready for off-world action.' : 'Still developing.'}</p></div>
                    </div>
                  </div>

                  <SurfaceMap planet={selectedPlanet} onHover={setHoverCell} hoveredCell={hoverCell} />
                  <div className="hover-readout panel inset-panel">
                    {hoverCell ? (
                      <>
                        <div>
                          <strong>{hoverCell.label}</strong>
                          <p className="muted">Cell {hoverCell.x + 1}, {hoverCell.y + 1} · {hoverCell.has_water ? 'water-dominant' : 'land-dominant'}</p>
                        </div>
                        <span>Temp {metricPercent(hoverCell.temperature)}</span>
                        <span>Moisture {metricPercent(hoverCell.moisture)}</span>
                        <span>Habitability {metricPercent(hoverCell.habitability)}</span>
                      </>
                    ) : (
                      <span>Hover or focus surface cells to inspect where climate, water, and life-supporting terrain overlap.</span>
                    )}
                  </div>
                </section>

                <section className="panel inspector-panel focus-panel panel-active">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">4. Influence & observe consequences</p>
                      <h3>Overseer Control Layer</h3>
                    </div>
                    <span>{selectedPlanet.life.alert_level}</span>
                  </div>

                  <div className={`life-banner tone-${stage?.tone ?? 'sterile'}`}>
                    <strong>{stage?.label}</strong>
                    <span>{selectedPlanet.life.present ? `${selectedPlanet.life.species_count} species · biosphere score ${selectedPlanet.life.biosphere_score}` : 'No natural biosphere detected yet.'}</span>
                  </div>

                  <div className="life-summary inset-panel summary-grid">
                    <div><span className="summary-label">Dominant strain</span><strong>{selectedPlanet.life.dominant_species ?? 'None'}</strong></div>
                    <div><span className="summary-label">Population</span><strong>{populationOf(selectedPlanet).toLocaleString()}</strong></div>
                    <div><span className="summary-label">Season</span><strong>{seasonName(selectedPlanet.season_phase)}</strong></div>
                    <div><span className="summary-label">Climate</span><strong>{climateLabel(selectedPlanet)}</strong></div>
                  </div>

                  {selectedPlanet.life.civilization && (
                    <div className="civilization-card inset-panel">
                      <p className="eyebrow">Civilization readiness</p>
                      <strong>{selectedPlanet.life.civilization.name}</strong>
                      <span>{selectedPlanet.life.civilization.tier} civilization · orbital {selectedPlanet.life.civilization.orbital_presence ? 'online' : 'not yet'}</span>
                      <div className="threshold-grid">
                        {Object.entries(selectedPlanet.life.civilization.thresholds).map(([key, value]) => (
                          <div key={key} className="threshold-card">
                            <span>{key.replace(/_/g, ' ')}</span>
                            <strong>{metricPercent(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedPlanet.settlement && (
                    <div className="settlement-card inset-panel">
                      <p className="eyebrow">Off-world presence</p>
                      <strong>{selectedPlanet.settlement.kind} from {selectedPlanet.settlement.origin_planet_name}</strong>
                      <span>{selectedPlanet.settlement.civilization_name} · pop {selectedPlanet.settlement.population.toLocaleString()} · {selectedPlanet.settlement.status}</span>
                    </div>
                  )}

                  <div className="action-panel">
                    <div>
                      <p className="eyebrow">Natural & direct world influence</p>
                      <div className="action-grid">
                        {WORLD_ACTIONS.map((action) => (
                          <button key={action.id} className={`action-card ${action.mode}`} onClick={() => applyInfluence(action)} disabled={loading}>
                            <strong>{action.label}</strong>
                            <span>{action.effect}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="eyebrow">Culture / civilization biasing</p>
                      <div className="action-grid">
                        {CULTURE_ACTIONS.map((action) => (
                          <button key={action.id} className={`action-card ${action.mode}`} onClick={() => applyInfluence(action)} disabled={loading || (!selectedPlanet.life.present && !selectedPlanet.settlement)}>
                            <strong>{action.label}</strong>
                            <span>{action.effect}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="influence-readout inset-panel">
                    <p className="eyebrow">Active world pressures</p>
                    <div className="pressure-grid">
                      {Object.entries(selectedPlanet.influences)
                        .filter(([, value]) => Math.abs(value) >= 0.02)
                        .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
                        .slice(0, 8)
                        .map(([key, value]) => (
                          <div key={key} className="threshold-card">
                            <span>{key.replace(/_/g, ' ')}</span>
                            <strong>{formatSignedPercent(value)}</strong>
                          </div>
                        ))}
                      {Object.values(selectedPlanet.influences).every((value) => Math.abs(value) < 0.02) && <span className="muted">No strong overseer pressure is active on this world yet.</span>}
                    </div>
                  </div>

                  <div className="species-list">
                    {selectedPlanet.species.map((species) => (
                      <article key={species.id} className={`species-card tone-${species.stage === 'spacefaring' || species.stage === 'civilization' ? 'civilized' : species.stage === 'toolmakers' ? 'developing' : 'primitive'}`}>
                        <div className="planet-chip-top">
                          <strong>{species.name}</strong>
                          <span className={`status-pill tone-${species.stage === 'spacefaring' || species.stage === 'civilization' ? 'civilized' : species.stage === 'toolmakers' ? 'developing' : 'primitive'}`}>{species.stage}</span>
                        </div>
                        <span>{species.adaptation}</span>
                        <span>Population: {species.population.toLocaleString()}</span>
                        <span>Tech {metricPercent(species.tech_tier)} · coordination {metricPercent(species.coordination)}</span>
                        <span>Collapse pressure {metricPercent(species.collapse_pressure)}</span>
                      </article>
                    ))}
                    {selectedPlanet.species.length === 0 && <p className="muted">This world currently has no active native biosphere.</p>}
                  </div>
                </section>

                <section className="panel alerts-panel focus-panel panel-active">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Feedback</p>
                      <h3>Alerts & Recent Developments</h3>
                    </div>
                    {actionFeedback && <span>{actionFeedback.category}</span>}
                  </div>
                  {actionFeedback && (
                    <div className="focus-card inset-panel feedback-card">
                      <div>
                        <strong>{actionFeedback.title}</strong>
                        <p className="muted">{actionFeedback.detail}</p>
                      </div>
                    </div>
                  )}
                  <div className="alerts-list">
                    {simulation.alerts.slice().reverse().map((alert, index) => (
                      <article key={`${alert.step}-${alert.title}-${index}`} className={`alert-card ${alert.severity}`}>
                        <div className="planet-chip-top">
                          <strong>{alert.title}</strong>
                          <span>Epoch {alert.step}</span>
                        </div>
                        <span>{alert.detail}</span>
                      </article>
                    ))}
                  </div>
                  <div className="recent-events inset-panel">
                    <p className="eyebrow">Selected world log</p>
                    <div className="event-list">
                      {selectedPlanet.recent_events.slice().reverse().map((event) => (
                        <span key={event}>{event}</span>
                      ))}
                      {selectedPlanet.recent_events.length === 0 && <span className="muted">No major events on this world yet.</span>}
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        ) : (
          <section className="panel empty-state">
            <h3>Create or open a simulation</h3>
            <p>Generate a seeded universe from the left panel or load an existing save to begin acting as the overseer.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
