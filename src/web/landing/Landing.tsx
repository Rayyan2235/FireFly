import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import { Scene, parts } from './Scene.tsx';
import type { InspectPart } from './Scene.tsx';

const chapters = ['The beginning', 'The yard', 'The exception', 'The truck', 'The agent', 'The shared record', 'Your turn'];
const details: Record<InspectPart, { title: string; text: string }> = {
  lidar: { title: 'A view of what’s ahead.', text: 'The roof lidar senses obstacles around the truck. Its own controller stops on a blocked approach and reports BLOCKED. Firefly decides what happens next.' },
  compute: { title: 'Decisions on the vehicle.', text: 'Onboard compute turns sensor input into local driving decisions. The truck controller acknowledges a requested move before motion starts.' },
  cab: { title: 'A truck on the shared channel.', text: 'The vehicle carries out controller-accepted movement. Firefly coordinates the job across the truck, the supervisor and the people working nearby.' },
};
function Arrow({ down = false }: { down?: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={down ? { transform: 'rotate(90deg)' } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}
function Mark() {
  return <svg viewBox="0 0 32 32" width="24" height="24" fill="none" aria-hidden="true"><path d="m18 3-11 15h9l-2 11 12-16h-9z" fill="currentColor" /></svg>;
}
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
        if (panel) panel.style.opacity = String(motionReduced ? 1 : Math.max(0, 1 - Math.abs(p - i) * 1.7));
      });
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(update); };
    update(); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(request); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [motionReduced]);
  useEffect(() => { if (beat !== 3) setSelected(null); }, [beat]);
  const select = (part: InspectPart) => setSelected(part);
  const go = (index: number) => sections.current[index]?.scrollIntoView({ behavior: motionReduced ? 'instant' : 'smooth' });
  return <>
    <a className="skip-link" href="#story">Skip to the story</a>
    <header className="nav">
      <a className="brand" href="#beginning" aria-label="Firefly, back to the beginning"><Mark />Firefly</a>
      <span className="twin-label"><span />Twin mode · simulated trucks</span>
      <a className="nav-console" href="/">Open the console <Arrow /></a>
    </header>
    <div className="scene" aria-hidden="true">
      <SceneBoundary><Canvas frameloop={motionReduced ? 'demand' : 'always'} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [35, 11, 26], fov: 42, near: 0.1, far: 250 }} gl={{ antialias: true, powerPreference: 'high-performance' }} fallback={<div className="scene-fallback">3D needs WebGL. The full story is available below.</div>}>
        <Scene progress={progress} beat={beat} selected={selected} onSelect={select} hotspots={hotspots} reducedMotion={motionReduced} />
      </Canvas></SceneBoundary>
    </div>
    <div className="scene-shade" aria-hidden="true" />
    <div className="hotspots" aria-label="Truck inspection hotspots" hidden={beat !== 3}>
      {parts.map(part => <button key={part} ref={el => { hotspots.current[part] = el; }} className={`hotspot hotspot-${part}`} aria-label={`Inspect ${part}`} aria-pressed={selected === part} onClick={() => select(part)}><span className="hotspot-dot" /><span>{part === 'lidar' ? 'Lidar' : part === 'compute' ? 'Compute' : 'Cab'}</span></button>)}
    </div>
    <main id="story">
      {chapters.map((chapter, i) => <section key={chapter} id={i === 0 ? 'beginning' : `chapter-${i}`} className={`chapter chapter-${i}`} aria-label={chapter} ref={el => { sections.current[i] = el; }}>
        <div className="copy" ref={el => { panels.current[i] = el; }}>
          {i === 0 && <>
            <h1>Keep the<br />yard moving.</h1>
            <p>When the physical world interrupts the plan,<br className="desktop-break" /> Firefly brings agents, robots and people together<br className="desktop-break" /> to see the work through.</p>
            <button className="text-action" onClick={() => go(1)}>Explore the yard <Arrow down /></button>
          </>}
          {i === 1 && <>
            <h2>A moving world.<br />A shared picture.</h2>
            <p>Eight dock doors. Trucks arriving, backing in, moving on. Every job depends on what is happening around it.</p>
            <p className="supporting">Firefly starts at the yard, where digital decisions meet physical work.</p>
          </>}
          {i === 2 && <>
            <h2>Then the plan<br />meets a pallet.</h2>
            <p>A pallet blocks the approach. The truck senses it, stops itself and reports <strong className="inline-signal">BLOCKED</strong>.</p>
            <p className="supporting">The brakes belong to the truck.<br />What happens next belongs to Firefly.</p>
            <span className="scenario-note">Illustrated scenario · not a live event</span>
          </>}
          {i === 3 && <>
            <h2>Autonomy,<br />up close.</h2>
            <p>Explore the truck that senses, stops and speaks to the rest of the yard.</p>
            <div className="part-controls" aria-label="Choose a truck component">
              {parts.map(part => <button key={part} aria-pressed={selected === part} onClick={() => select(part)}>{part === 'lidar' ? 'Lidar' : part === 'compute' ? 'Compute' : 'Cab'}</button>)}
            </div>
            <div className="part-card" aria-live="polite" aria-atomic="true">
              {selected ? <><h3>{details[selected].title}</h3><p>{details[selected].text}</p><button className="text-action" onClick={() => setSelected(null)}>View the whole truck <Arrow /></button></> : <p>Select a sensor hotspot or a component above to take a closer look.</p>}
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
            <a className="primary-action" href="/">Open the console <Arrow /></a>
            <p className="closing">Firefly — the operating system<br />for agents, robots and people.</p>
          </>}
        </div>
      </section>)}
    </main>
    <aside className="story-rail" aria-label="Story chapters">
      {chapters.map((chapter, i) => <button key={chapter} aria-label={`Go to ${chapter.toLowerCase()}`} aria-current={beat === i ? 'step' : undefined} onClick={() => go(i)}><span /></button>)}
    </aside>
    <footer className="scene-footer">
      <span>{beat === 0 ? 'A shared world. A way forward.' : chapters[beat]}</span>
      <div><span className="illustration-label">Interactive illustration</span><button onClick={() => setPaused(value => !value)} disabled={reducedMotion} aria-pressed={motionReduced}>{reducedMotion ? 'Reduced motion on' : paused ? 'Resume motion' : 'Reduce motion'}</button></div>
    </footer>
  </>;
}
