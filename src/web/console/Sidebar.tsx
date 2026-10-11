import type { ReactNode } from 'react';
import { HardHat, Robot, Truck, User } from '@phosphor-icons/react';
import type { WorldSnapshot } from '../../contract.ts';
import { FireflyMark, StatusIcon } from './bits.tsx';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-2 pb-1.5 text-[12px] font-medium text-fg-4">{title}</h2>
      {children}
    </section>
  );
}

export function Sidebar({
  world,
  selected,
  onSelect,
}: {
  world: WorldSnapshot | null;
  selected: string | null;
  onSelect: (incidentId: string) => void;
}) {
  const incidents = world ? [...world.incidents].reverse() : [];
  const rules = world?.corrections.filter((c) => c.active) ?? [];
  const agents = world?.workers.filter((w) => w.kind === 'agent') ?? [];
  const people = world?.workers.filter((w) => w.kind === 'person') ?? [];
  const trucks = world?.trucks ?? [];
  const held = trucks.filter((t) => t.controller === 'held').length;

  return (
    <aside className="flex min-h-0 flex-col px-3 pt-3 pb-3">
      <a href="/" aria-label="Firefly home" className="flex items-center gap-2.5 px-2 py-1.5 text-fg">
        <FireflyMark width={34} />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Firefly</p>
          <p className="text-[12px] text-fg-3">North Yard</p>
        </div>
      </a>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Incidents">
          {incidents.length === 0 ? (
            <p className="px-2 py-1 text-[13px] text-fg-4">None open. The yard is moving.</p>
          ) : (
            <ul>
              {incidents.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => onSelect(i.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-left text-[13.5px] transition-colors ${
                      selected === i.id ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-hover/60'
                    }`}
                  >
                    <StatusIcon status={i.status} />
                    <span className="shrink-0 font-mono text-[11.5px] text-fg-3">{i.id}</span>
                    <span className="truncate">{i.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Site rules">
          {rules.length === 0 ? (
            <p className="px-2 py-1 text-[13px] leading-snug text-fg-4">No rules yet. Facts Maria tells Firefly are saved here.</p>
          ) : (
            <ul className="space-y-1">
              {rules.map((r) => (
                <li key={r.id} className="rounded-md px-2 py-1.5 text-[13px] leading-snug text-fg-2">
                  {r.interpretation}
                  <span className="mt-0.5 block text-[11.5px] text-fg-4">
                    {r.source} · until {r.releaseCondition}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Workforce">
          <ul className="space-y-0.5 text-[13px]">
            {agents.map((w) => (
              <Row key={w.id} icon={<Robot size={15} />} name={w.name} detail={w.status} busy={w.status === 'busy'} />
            ))}
            {people.map((w) => (
              <Row
                key={w.id}
                icon={w.equipment ? <HardHat size={15} /> : <User size={15} />}
                name={w.equipment ? `${w.name} · ${w.equipment}` : w.name}
                detail={w.status.replace('_', ' ')}
              />
            ))}
            <Row icon={<Truck size={15} />} name={`${trucks.length} trucks`} detail={held ? `${held} held` : 'none held'} alert={held > 0} />
          </ul>
        </Section>
      </div>

      <p className="mt-3 flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[12px] text-fg-3">
        <span className="h-1.5 w-1.5 rounded-full bg-fg-3" />
        Twin mode · simulated trucks
      </p>
    </aside>
  );
}

function Row({ icon, name, detail, busy, alert }: { icon: ReactNode; name: string; detail: string; busy?: boolean; alert?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md px-2 py-[5px]">
      <span className={busy ? 'text-fg' : 'text-fg-3'}>{icon}</span>
      <span className="truncate text-fg-2">{name}</span>
      <span className={`ml-auto shrink-0 text-[12px] ${alert ? 'font-medium text-fg' : busy ? 'text-fg' : 'text-fg-4'}`}>{detail}</span>
    </li>
  );
}
