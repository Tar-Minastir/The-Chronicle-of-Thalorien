/**
 * The application shell's ornate sidebar (rendering system 4: it never moves with the map).
 * Logo, primary navigation, a secondary "Codex" group for the remaining sections, and a slot
 * for the contextual panel.
 */
import type { ReactNode } from 'react';
import { Divider, Flourish, Icon, WhiteTreeEmblem, type IconName } from './icons';

export type Section = 'atlas' | 'quests' | 'people' | 'journal' | 'character' | 'encyclopedia' | 'rules' | 'history';

export const PRIMARY: [Section, string, IconName][] = [
  ['atlas', 'World Atlas', 'compass'],
  ['quests', 'Quests', 'scroll'],
  ['people', 'Companions', 'companions'],
  ['journal', 'Journal', 'book'],
];
export const SECONDARY: [Section, string, IconName][] = [
  ['character', 'Character', 'hero'],
  ['encyclopedia', 'Encyclopedia', 'codex'],
  ['rules', 'Rules', 'rules'],
  ['history', 'History', 'history'],
];

interface Props {
  section: Section;
  onSection: (s: Section) => void;
  /** Count shown on the History entry (unresolved inconsistencies). */
  warnings: number;
  children?: ReactNode;
}

export function Sidebar({ section, onSection, warnings, children }: Props) {
  return (
    <aside className="sidebar" aria-label="Chronicle">
      <Flourish className="tl" /><Flourish className="tr" /><Flourish className="bl" /><Flourish className="br" />
      <header className="logo">
        <WhiteTreeEmblem size={74} />
        <h1><span>Chronicle of</span>Thalorien</h1>
      </header>

      <nav className="primary-nav" aria-label="Sections">
        {PRIMARY.map(([id, label, icon]) => (
          <button key={id} className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => onSection(id)}>
            <Icon name={icon} size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <nav className="secondary-nav" aria-label="Codex">
        {SECONDARY.map(([id, label, icon]) => (
          <button key={id} className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => onSection(id)} title={label}>
            <Icon name={icon} size={17} /><span>{label}</span>
            {id === 'history' && warnings > 0 && <sup title={`${warnings} inconsistencies to review`}>{warnings}</sup>}
          </button>
        ))}
      </nav>
      <Divider />
      <div className="context">{children}</div>
    </aside>
  );
}
