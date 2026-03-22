import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Planet, SimulationState, SimulationSummary, StarSystem, SurfaceCell } from './types';

type ViewMode = 'galaxy' | 'system' | 'planet';

type PlanetDelta = {
  habitability: number;
  temperature: number;
  moisture: number;
  water: number;
  population: number;
  speciesCount: number;
};

type StepReport = {
  steps: number;
  beforeStep: number;
  afterStep: number;
  changedWorlds: number;
  selectedPlanetId: string | null;
  selectedPlanetDelta: PlanetDelta | null;
  eventLabel: string;
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
  return planet.species.reduce((sum, species) => sum + species.population, 0);
}

function eraName(step: number): string {
  if (step < 5) return 'Genesis Drift';
  if (step < 15) return 'World Bloom';
  if (step < 30) return 'Awakening Age';
  return 'Stellar Chronicle';
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
  if (!planet.life.present) {
    return { label: 'Sterile world', tone: 'sterile' };
  }
  if (planet.life.civilization) {
    return { label: 'Civilization-bearing world', tone: 'civilized' };
  }
  if (planet.species.some((species) => species.stage === 'toolmakers')) {
    return { label: 'Developing biosphere', tone: 'developing' };
  }
  return { label: 'Primitive biosphere', tone: 'primitive' };
}

function hotspotCells(planet: Planet): SurfaceCell[] {
  if (!planet.life.present) return [];
  return planet.surface
    .flat()
    .filter((cell) => !cell.has_water && cell.habitability > 0.55)
    .sort((left, right) => right.habitability - left.habitability)
    .slice(0, Math.min(4, planet.life.species_count + 1));
}

function findPlanet(state: SimulationState | null, planetId: string | null): Planet | null {
  if (!state || !planetId) return null;
  for (const system of state.systems) {
    const found = system.planets.find((planet) => planet.id === planetId);
    if (found) return found;
  }
  return null;
}

function buildStepReport(before: SimulationState, after: SimulationState, selectedPlanetId: string | null, steps: number): StepReport {
  let changedWorlds = 0;
  for (const system of after.systems) {
    for (const planet of system.planets) {
      const previous = findPlanet(before, planet.id);
      if (!previous) continue;
      if (
        previous.metrics.habitability !== planet.metrics.habitability ||
        previous.life.species_count !== planet.life.species_count ||
        populationOf(previous) !== populationOf(planet)
      ) {
        changedWorlds += 1;
      }
    }
  }

  const selectedBefore = findPlanet(before, selectedPlanetId);
  const selectedAfter = findPlanet(after, selectedPlanetId);
  let selectedPlanetDelta: PlanetDelta | null = null;

  if (selectedBefore && selectedAfter) {
    selectedPlanetDelta = {
      habitability: Number((selectedAfter.metrics.habitability - selectedBefore.metrics.habitability).toFixed(3)),
      temperature: Number((selectedAfter.metrics.avg_temperature - selectedBefore.metrics.avg_temperature).toFixed(3)),
      moisture: Number((selectedAfter.metrics.avg_moisture - selectedBefore.metrics.avg_moisture).toFixed(3)),
      water: Number((selectedAfter.metrics.water_ratio - selectedBefore.metrics.water_ratio).toFixed(3)),
      population: populationOf(selectedAfter) - populationOf(selectedBefore),
      speciesCount: selectedAfter.life.species_count - selectedBefore.life.species_count,
    };
  }

  const eventLabel =
    after.metrics.species_count > before.metrics.species_count
      ? 'New life signatures intensified across the simulation.'
      : after.metrics.habitable_worlds > before.metrics.habitable_worlds
        ? 'Climate fronts improved habitability on additional worlds.'
        : 'Seasonal drift reshaped the known worlds.';

  return {
    steps,
    beforeStep: before.current_step,
    afterStep: after.current_step,
    changedWorlds,
    selectedPlanetId,
    selectedPlanetDelta,
    eventLabel,
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
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="65%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="98" fill="rgba(94, 140, 255, 0.12)" stroke={atmosphereColor} strokeWidth="3" />
        <g clipPath={`url(#clip-${planet.id})`}>
          <rect x="0" y="0" width="240" height="240" fill="#09121f" />
          {planet.surface.flat().map((cell) => {
            const isHotspot = hotspots.some((item) => item.x === cell.x && item.y === cell.y);
            return (
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
            );
          })}
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
          <p className="eyebrow">Planet feel</p>
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
                boxShadow: cell.has_water ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
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

  const selectedPlanetStage = selectedPlanet ? lifeStageSummary(selectedPlanet) : null;

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

  const loadSimulation = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.loadSimulation(id);
      setSimulation(state);
      setSelectedSystemId(state.systems[0]?.id ?? null);
      setSelectedPlanetId(state.systems[0]?.planets[0]?.id ?? null);
      setViewMode('galaxy');
      setStepReport(null);
      setHoverCell(null);
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
      setSelectedSystemId(state.systems[0]?.id ?? null);
      setSelectedPlanetId(state.systems[0]?.planets[0]?.id ?? null);
      setViewMode('galaxy');
      setStepReport(null);
      setHoverCell(null);
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
      const state = await api.stepSimulation(simulation.id, steps);
      setSimulation(state);
      setStepReport(buildStepReport(simulation, state, selectedPlanetId, steps));
      await refreshList();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Grand Simulations</p>
          <h1>Cosmic Sandbox</h1>
          <p className="muted">Chart seeded universes, descend into living worlds, and feel each epoch reshape the cosmos.</p>
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
                <span>Epoch {item.current_step}</span>
              </button>
            ))}
            {simulations.length === 0 && <p className="muted">No simulations stored yet.</p>}
          </div>
        </section>
      </aside>

      <main className="main-panel">
        <header className="topbar panel topbar-grid">
          <div>
            <p className="eyebrow">Explorer Path</p>
            <div className="breadcrumb-row">
              <button className={`breadcrumb ${viewMode === 'galaxy' ? 'active' : ''}`} onClick={() => setViewMode('galaxy')} disabled={!simulation}>
                Universe
              </button>
              <span>›</span>
              <button
                className={`breadcrumb ${viewMode === 'system' ? 'active' : ''}`}
                onClick={() => setViewMode('system')}
                disabled={!selectedSystem}
              >
                {selectedSystem?.name ?? 'System'}
              </button>
              <span>›</span>
              <button
                className={`breadcrumb ${viewMode === 'planet' ? 'active' : ''}`}
                onClick={() => setViewMode('planet')}
                disabled={!selectedPlanet}
              >
                {selectedPlanet?.name ?? 'Planet'}
              </button>
            </div>
            <h2>{simulation?.name ?? 'No active universe'}</h2>
          </div>

          <section className="epoch-engine">
            <div>
              <p className="eyebrow">Epoch Engine</p>
              <strong>Epoch {simulation?.current_step ?? 0} · {eraName(simulation?.current_step ?? 0)}</strong>
              <p className="muted">
                {selectedPlanet ? `${selectedPlanet.name}: ${seasonName(selectedPlanet.season_phase)} · ${climateLabel(selectedPlanet)}` : 'Create or load a simulation to begin.'}
              </p>
            </div>
            <div className="time-controls pulse-controls">
              <button onClick={() => stepTime(1)} disabled={!simulation || loading}>Pulse +1</button>
              <button onClick={() => stepTime(5)} disabled={!simulation || loading}>Epoch +5</button>
              <button onClick={() => stepTime(10)} disabled={!simulation || loading}>Leap +10</button>
            </div>
            {stepReport && (
              <div className="step-report">
                <strong>Last shift: {stepReport.eventLabel}</strong>
                <span>{stepReport.changedWorlds} worlds changed from epoch {stepReport.beforeStep} to {stepReport.afterStep}.</span>
                {stepReport.selectedPlanetDelta && selectedPlanet && (
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
          <div className="content-grid explorer-grid">
            <section className={`panel galaxy-panel focus-panel ${viewMode === 'galaxy' ? 'panel-active' : ''}`}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">1. Survey the cosmos</p>
                  <h3>Universe / System View</h3>
                </div>
                <span>{simulation.metrics.system_count} systems · {simulation.metrics.habitable_worlds} habitable worlds</span>
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
              {selectedSystem && (
                <div className="focus-card inset-panel">
                  <div>
                    <p className="eyebrow">Selected system</p>
                    <strong>{selectedSystem.name}</strong>
                    <p className="muted">{selectedSystem.planets.length} planets orbit a type {selectedSystem.star_type} star.</p>
                  </div>
                  <button onClick={() => setViewMode('system')}>Survey planets</button>
                </div>
              )}
              <div className="metrics-row">
                <div><strong>{simulation.metrics.system_count}</strong><span>systems</span></div>
                <div><strong>{simulation.metrics.planet_count}</strong><span>planets</span></div>
                <div><strong>{simulation.metrics.species_count}</strong><span>species</span></div>
                <div><strong>{simulation.metrics.habitable_worlds}</strong><span>habitable worlds</span></div>
              </div>
            </section>

            <section className={`panel orbit-panel focus-panel ${viewMode === 'system' ? 'panel-active' : ''}`}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">2. Drop into orbit</p>
                  <h3>{selectedSystem?.name ?? 'Select a system'}</h3>
                </div>
                <div className="mini-actions">
                  <span>Star {selectedSystem?.star_type} · luminosity {selectedSystem?.luminosity}</span>
                  <button onClick={() => setViewMode('galaxy')} disabled={!selectedSystem}>Back to universe</button>
                </div>
              </div>
              <div className="orbit-strip orbit-grid">
                {selectedSystem?.planets.map((planet) => {
                  const stage = lifeStageSummary(planet);
                  return (
                    <button
                      key={planet.id}
                      className={`planet-chip ${selectedPlanet?.id === planet.id ? 'selected' : ''} tone-${stage.tone}`}
                      onClick={() => {
                        setSelectedPlanetId(planet.id);
                        setViewMode('planet');
                      }}
                    >
                      <div className="planet-chip-top">
                        <strong>{planet.name}</strong>
                        <span className={`status-pill tone-${stage.tone}`}>{stage.label}</span>
                      </div>
                      <span>{metricPercent(planet.metrics.habitability)} habitable · {metricPercent(planet.metrics.water_ratio)} water</span>
                      <span>{planet.life.present ? `${planet.life.species_count} species · ${climateLabel(planet)}` : `No life · ${climateLabel(planet)}`}</span>
                    </button>
                  );
                })}
              </div>
              {selectedPlanet && (
                <div className={`focus-card inset-panel tone-${selectedPlanetStage?.tone ?? 'sterile'}`}>
                  <div>
                    <p className="eyebrow">Orbital readout</p>
                    <strong>{selectedPlanet.name}</strong>
                    <p className="muted">{selectedPlanetStage?.label} · anomaly: {selectedPlanet.anomaly}</p>
                  </div>
                  <button onClick={() => setViewMode('planet')}>Enter surface</button>
                </div>
              )}
            </section>

            {selectedPlanet && (
              <>
                <section className={`panel detail-panel focus-panel ${viewMode === 'planet' ? 'panel-active' : ''}`}>
                  <div className="section-header detail-header">
                    <div>
                      <p className="eyebrow">3. Surface / biome immersion</p>
                      <h3>{selectedPlanet.name}</h3>
                      <p className="muted">{selectedPlanet.radius_km.toLocaleString()} km · {seasonName(selectedPlanet.season_phase)} · anomaly: {selectedPlanet.anomaly}</p>
                    </div>
                    <div className="mini-actions align-end">
                      <span className={`status-pill tone-${selectedPlanetStage?.tone ?? 'sterile'}`}>{selectedPlanetStage?.label}</span>
                      <button onClick={() => setViewMode('system')}>Back to orbit</button>
                    </div>
                  </div>

                  <div className="planet-stage-layout">
                    <PlanetGlobe planet={selectedPlanet} hoveredCell={hoverCell} />
                    <div className="planet-meters">
                      <div className="meter-card">
                        <span>Water coverage</span>
                        <strong>{metricPercent(selectedPlanet.metrics.water_ratio)}</strong>
                        <div className="meter-track"><i style={{ width: metricPercent(selectedPlanet.metrics.water_ratio) }} /></div>
                      </div>
                      <div className="meter-card">
                        <span>Thermal band</span>
                        <strong>{metricPercent(selectedPlanet.metrics.avg_temperature)}</strong>
                        <div className="meter-track warm"><i style={{ width: metricPercent(selectedPlanet.metrics.avg_temperature) }} /></div>
                      </div>
                      <div className="meter-card">
                        <span>Moisture band</span>
                        <strong>{metricPercent(selectedPlanet.metrics.avg_moisture)}</strong>
                        <div className="meter-track lush"><i style={{ width: metricPercent(selectedPlanet.metrics.avg_moisture) }} /></div>
                      </div>
                      <div className="meter-card highlight">
                        <span>Habitability</span>
                        <strong>{metricPercent(selectedPlanet.metrics.habitability)}</strong>
                        <div className="meter-track bright"><i style={{ width: metricPercent(selectedPlanet.metrics.habitability) }} /></div>
                      </div>
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
                      <span>Hover or focus surface cells to inspect biome boundaries, climate, and habitability. Glowing cells mark strong life-supporting zones.</span>
                    )}
                  </div>
                </section>

                <section className="panel inspector-panel focus-panel panel-active">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Living world inspector</p>
                      <h3>Life & Species Visibility</h3>
                    </div>
                    <span>{selectedPlanet.life.present ? selectedPlanet.life.dominant_species : 'No biosphere detected'}</span>
                  </div>

                  <div className={`life-banner tone-${selectedPlanetStage?.tone ?? 'sterile'}`}>
                    <strong>{selectedPlanetStage?.label}</strong>
                    <span>{selectedPlanet.life.present ? `${selectedPlanet.life.species_count} species · biosphere score ${selectedPlanet.life.biosphere_score}` : 'Sterile conditions still dominate this world.'}</span>
                  </div>

                  <div className="life-summary inset-panel summary-grid">
                    <div>
                      <span className="summary-label">Dominant strain</span>
                      <strong>{selectedPlanet.life.dominant_species ?? 'None'}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Total population</span>
                      <strong>{populationOf(selectedPlanet).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Climate</span>
                      <strong>{climateLabel(selectedPlanet)}</strong>
                    </div>
                    <div>
                      <span className="summary-label">Season</span>
                      <strong>{seasonName(selectedPlanet.season_phase)}</strong>
                    </div>
                  </div>

                  {selectedPlanet.life.civilization && (
                    <div className="civilization-card inset-panel">
                      <p className="eyebrow">Civilization contact</p>
                      <strong>{selectedPlanet.life.civilization.name}</strong>
                      <span>{selectedPlanet.life.civilization.tier} civilization · stability {metricPercent(selectedPlanet.life.civilization.stability)}</span>
                    </div>
                  )}

                  <div className="species-list">
                    {selectedPlanet.species.map((species) => (
                      <article key={species.id} className={`species-card tone-${species.stage === 'civilization' ? 'civilized' : species.stage === 'toolmakers' ? 'developing' : 'primitive'}`}>
                        <div className="planet-chip-top">
                          <strong>{species.name}</strong>
                          <span className={`status-pill tone-${species.stage === 'civilization' ? 'civilized' : species.stage === 'toolmakers' ? 'developing' : 'primitive'}`}>
                            {species.stage}
                          </span>
                        </div>
                        <span>{species.adaptation}</span>
                        <span>Population: {species.population.toLocaleString()}</span>
                        <span>Resilience: {metricPercent(species.resilience)}</span>
                      </article>
                    ))}
                    {selectedPlanet.species.length === 0 && (
                      <p className="muted">This world currently has no active biosphere.</p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        ) : (
          <section className="panel empty-state">
            <h3>Create or open a simulation</h3>
            <p>Generate a seeded universe from the left panel or load an existing save to begin exploring.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
