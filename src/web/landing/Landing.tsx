import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import { ArrowRight, ArrowLeft, Plus } from '@phosphor-icons/react';
import { FireflyMark, PrismaHero, PrismaAction } from './components/ui/prisma-hero.tsx';
import { Scene, parts } from './Scene.tsx';
import type { InspectPart } from './Scene.tsx';

const chapters = ['The beginning', 'The yard', 'The exception', 'The truck', 'The agent', 'The shared record', 'Your turn'];
const details: Record<InspectPart, { title: string; text: string }> = {
  lidar: { title: 'A view of what’s ahead.', text: 'Roof and side sensors cover the cab’s surroundings. The long trailer blocks their view directly behind it, so reversing needs its own rear coverage.' },
  rear: { title: 'A clear view behind the trailer.', text: 'A rear-facing sensor sees the pallet in the reversing path. The vehicle controller stops and reports BLOCKED. Firefly coordinates what happens next. This is an illustrative sensor layout.' },
  compute: { title: 'Decisions on the vehicle.', text: 'Onboard compute turns sensor input into local driving decisions. The truck controller acknowledges a requested move before motion starts.' },
  cab: { title: 'A truck on the shared channel.', text: 'The vehicle carries out controller-accepted movement. Firefly coordinates the job across the truck, the supervisor and the people working nearby.' },
};
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="scene-fallback">The 3D scene is unavailable. You can still read the story and open the console.</div> : this.props.children; }
}

export function Landing() {
  const progress = useRef(0);
  const hotspots = useRef<Partial<Record<InspectPart, HTMLButtonElement | null>>>({});
  const panels = useRef<(HTMLElement | null)[]>([]);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const [beat, setBeat] = useState(0);
  const [selected, setSelected] = useState<InspectPart | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(false);
  const motionReduced = reducedMotion || paused;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let request = 0;
    const update = () => {
      request = 0;
      const height = sections.current[0]?.offsetHeight || window.innerHeight;
      const p = Math.max(0, Math.min(6, window.scrollY / height));
      progress.current = p;
      setBeat(Math.round(p));
      panels.current.forEach((panel, i) => {
        if (panel) {
          const opacity = motionReduced ? Number(Math.round(p) === i) : Math.max(0, 1 - Math.abs(p - i) * 1.7);
          panel.style.opacity = String(opacity);
          panel.inert = opacity === 0;
        }
      });
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(update); };
    update(); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(request); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [motionReduced]);
  useEffect(() => { if (beat !== 3) setSelected(null); }, [beat]);
  const select = (part: InspectPart) => setSelected(part);
  const go = (index: number) => sections.current[index]?.scrollIntoView({ behavior: motionReduced ? 'instant' : 'smooth' });
  return <div className={`landing ${beat === 0 ? 'is-hero' : 'is-story'}`}>
    <a className="skip-link" href="#story">Skip to the story</a>
    <header className="nav">
      <nav aria-label="Main navigation" className="nav-tab">
        <button onClick={() => go(1)}>The yard</button>
        <button onClick={() => go(3)}>The truck</button>
        <a href="/console.html">Open the console <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></a>
      </nav>
    </header>
    <a className="small-wordmark" href="#beginning"><FireflyMark strokeWidth={16} />Firefly</a>
    <span className="twin-label"><span />Twin mode · simulated trucks</span>
    <div className="scene" aria-hidden="true">
      <SceneBoundary><Canvas frameloop={motionReduced ? 'demand' : 'always'} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [35, 11, 26], fov: 42, near: 0.1, far: 250 }} gl={{ antialias: true, powerPreference: 'high-performance' }} fallback={<div className="scene-fallback">3D needs WebGL. The full story is available below.</div>}>
        <Scene progress={progress} beat={beat} selected={selected} onSelect={select} hotspots={hotspots} reducedMotion={motionReduced} />
      </Canvas></SceneBoundary>
    </div>
    <div className="scene-shade" aria-hidden="true" />
    <div className="hotspots" aria-label="Truck inspection hotspots" hidden={beat !== 3}>
      {parts.map(part => <button key={part} ref={el => { hotspots.current[part] = el; }} className={`hotspot hotspot-${part}`} aria-label={`Inspect ${part}`} aria-pressed={selected === part} onClick={() => select(part)}><span className="hotspot-dot"><Plus size={13} strokeWidth={1.5} aria-hidden="true" /></span><span>{part === 'lidar' ? 'Roof lidar' : part === 'rear' ? 'Rear sensor' : part === 'compute' ? 'Compute' : 'Cab'}</span></button>)}
    </div>
    <main id="story">
      {chapters.map((chapter, i) => <section key={chapter} id={i === 0 ? 'beginning' : `chapter-${i}`} className={`chapter chapter-${i}`} aria-label={chapter} ref={el => { sections.current[i] = el; }}>
        <div className="copy" ref={el => { panels.current[i] = el; }}>
          {i === 0 && <PrismaHero onExplore={() => go(1)} reduceMotion={motionReduced} />}
          {i === 1 && <>
            <h2>A moving world.<br />A shared picture.</h2>
            <p>Eight dock doors. Trucks arriving, backing in, moving on. Every job depends on what is happening around it.</p>
            <p className="supporting">Firefly starts at the yard, where digital decisions meet physical work.</p>
          </>}
          {i === 2 && <>
            <h2>Then the plan<br />meets a pallet.</h2>
            <p>A pallet blocks the reversing path. Rear sensing detects it; the truck stops itself and reports <strong className="inline-signal">BLOCKED</strong>.</p>
            <p className="supporting">The brakes belong to the truck.<br />What happens next belongs to Firefly.</p>
            <span className="scenario-note">Illustrated scenario · not a live event</span>
          </>}
          {i === 3 && <>
            <h2>Autonomy,<br />up close.</h2>
            <p>Explore the truck that senses, stops and speaks to the rest of the yard.</p>
            <div className="part-controls" aria-label="Choose a truck component">
              {parts.map(part => <button key={part} aria-pressed={selected === part} onClick={() => select(part)}>{part === 'lidar' ? 'Roof lidar' : part === 'rear' ? 'Rear sensor' : part === 'compute' ? 'Compute' : 'Cab'}</button>)}
            </div>
            <div className="part-card" aria-live="polite" aria-atomic="true">
              {selected ? <><h3>{details[selected].title}</h3><p>{details[selected].text}</p><button className="text-action" onClick={() => setSelected(null)}>View the whole truck <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></button></> : <p>Select a sensor hotspot or a component above to take a closer look.</p>}
            </div>
          </>}
          {i === 4 && <>
            <h2>An agent takes<br />the next step.</h2>
            <p>Find another compatible door. Or, when the job cannot move, ask a person with a forklift to clear the approach.</p>
            <blockquote>“F-3 is leaking. Keep it out of assignments until maintenance clears it.”<cite>Maria · yard supervisor</cite></blockquote>
            <p className="supporting">A correction becomes a site rule. Conflicting offers are withdrawn, and the agent finds another eligible worker.</p>
          </>}
          {i === 5 && <>
            <h2>One channel.<br />Work seen through.</h2>
            <p>Agents coordinate. Robots carry out the move. People clear the path and authorize the release.</p>
            <p className="supporting">Every outcome is verified and recorded. Firefly uses recorded outcomes, so the next decision starts with what actually happened.</p>
            <div className="channel-line"><span>Agents</span><i /><span>Robots</span><i /><span>People</span></div>
            <small>Message names modeled on VDA 5050.</small>
          </>}
          {i === 6 && <>
            <h2>The next move<br />is yours.</h2>
            <p>Step into the simulated yard. Cause an exception.<br className="desktop-break" /> Watch the work unfold in the live console.</p>
            <PrismaAction href="/console.html">Open the console</PrismaAction>
            <p className="closing">Firefly — the operating system<br />for agents, robots and people.</p>
          </>}
        </div>
      </section>)}
    </main>
    <footer className="scene-footer">
      <span className="illustration-label">Illustrative vehicle & sensor layout</span>
      <div className="footer-controls">
        <button className="motion-control" onClick={() => setPaused(value => !value)} disabled={reducedMotion} aria-pressed={motionReduced}>{reducedMotion ? 'Reduced motion on' : paused ? 'Resume motion' : 'Reduce motion'}</button>
        <nav className="chapter-controls" aria-label="Story chapters">
          <button aria-label="Previous chapter" disabled={beat === 0} onClick={() => go(beat - 1)}><ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" /></button>
          <span>{chapters[beat]}</span>
          <button aria-label="Next chapter" disabled={beat === 6} onClick={() => go(beat + 1)}><ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></button>
        </nav>
      </div>
    </footer>
  </div>;
}
