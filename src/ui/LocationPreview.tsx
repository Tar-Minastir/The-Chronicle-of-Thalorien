/**
 * Contextual panel in the sidebar: an illustrated summary of whatever is selected on the atlas
 * (a place, a person, a faction, a proposed addition), or of the present moment when nothing is.
 * Every row is derived from the campaign record; rows with nothing recorded are omitted.
 */
import type { ReactNode } from 'react';
import { PanelScene, PLACE_ART, artUrl, useArtwork } from '../atlas/vignettes';
import type { AtlasFeature } from '../atlas/geography';
import {
  entitiesMentioning, factionStance, heroPlacements, lastLoggedDay, mentionBlocks, recordedInPlay, silenceOf, type WorldIndex,
} from '../domain/selectors';
import { stripMd } from '../domain/text';
import { monogram } from '../atlas/glyphs';
import { Divider, Icon, type IconName } from './shell/icons';

interface Props {
  ix: WorldIndex;
  selectedId: string | null;
  features: AtlasFeature[];
  onOpenDetails: () => void;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s);

function Row({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return <li><Icon name={icon} size={16} /><span><b>{label}:</b> {children}</span></li>;
}

export function LocationPreview({ ix, selectedId, features, onOpenDetails }: Props) {
  const { world } = ix;
  const geo = world.geo.find((g) => g.id === selectedId);
  const entity = selectedId ? ix.entity.get(selectedId) : undefined;
  const feature = features.find((f) => f.id === selectedId);
  const partyId = world.current?.partyLocationId ?? null;
  const shownGeo = geo ?? (!entity && !feature ? world.geo.find((g) => g.id === partyId) : undefined);
  const slug = shownGeo?.id.replace('location:', '') ?? null;
  const painted = useArtwork(slug ? artUrl.panel(slug) : null);

  let title = 'The Chronicle';
  let eyebrow = '';
  let text = '';
  let rows: ReactNode = null;
  let action = 'View Details';
  let art: ReactNode = <PanelScene art={null} />;

  if (feature) {
    title = `❧ ${feature.name ?? 'Unnamed feature'}`;
    eyebrow = feature.status === 'proposed' ? 'Proposed atlas addition · not canon' : 'Atlas interpretation · not canon';
    text = feature.description;
    rows = <>{feature.relation && <Row icon="pin" label="Where">{feature.relation}</Row>}</>;
    action = 'View Proposal';
  } else if (shownGeo) {
    const e = ix.entity.get(shownGeo.id);
    const silence = silenceOf(world, shownGeo.id);
    const here = heroPlacements(ix).filter((h) => h.locationId === shownGeo.id);
    const last = lastLoggedDay(ix, shownGeo.id);
    const quests = entitiesMentioning(ix, shownGeo.id, 'quest').filter((q) => q.status === 'active');
    const kind = PLACE_ART[slug!] ?? null;
    art = painted ? <img className="panel-scene" src={painted} alt="" /> : <PanelScene art={kind} />;
    title = shownGeo.name;
    eyebrow = !geo ? 'Where the company now stands' : shownGeo.id === partyId ? 'The company is here' : recordedInPlay(ix, shownGeo.id) ? 'Recorded in play' : 'Known by report';
    // Description: the place's own record, else a line of the documents that defines it ("Uchkeken: hidden elven wood; …").
    const bare = shownGeo.name.replace(/^The\s+/i, '').toLowerCase();
    // (The chronicle's "CURRENT STATE" lines are plans for the moment, not descriptions, so they are skipped.)
    const defining = mentionBlocks(ix, shownGeo.id)
      .filter((b) => (b.headingPath[1] ?? '').toUpperCase() !== 'CURRENT STATE')
      .map((b) => stripMd(b.text))
      .find((t) => new RegExp(`^(the\\s+)?${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(,[^:—]{0,40})?[:—]`, 'i').test(t));
    const source = e?.records[0] ? stripMd(e.records[0].text) : defining;
    text = source ? clip(source.replace(/^[^:—]+[:—]\s*/, ''), 190) : 'The record names this place but does not describe it.';
    rows = (
      <>
        {silence && <Row icon="status" label="Silence"><em className={`state ${silence.status}`}>{silence.status}</em></Row>}
        {here.length > 0 && <Row icon="people" label="Here now">{here.map((h) => h.entity.name.split(' ')[0]).join(', ')}</Row>}
        {last !== null && <Row icon="calendar" label="Last in the session log">Day {last}</Row>}
        {quests.length > 0 && <Row icon="quest" label="Active quests">{quests.slice(0, 3).map((q) => q.name).join(' · ')}{quests.length > 3 ? ` +${quests.length - 3}` : ''}</Row>}
        <Row icon="pin" label="Position">provisional</Row>
      </>
    );
    action = 'View Location Details';
  } else if (entity?.kind === 'character') {
    const placement = heroPlacements(ix).find((h) => h.entity.id === entity.id);
    const attitude = world.claims.filter((c) => c.key === `attitude:${entity.id}`).pop();
    art = <div className="panel-portrait" aria-label="No approved portrait"><span>{monogram(entity.name)}</span></div>;
    title = entity.name;
    eyebrow = entity.attrs.role === 'player-character' ? 'The hero' : entity.attrs.role === 'companion' ? 'Companion' : 'Person';
    text = entity.records[0] ? clip(stripMd(entity.records[0].text), 190) : '';
    rows = (
      <>
        {placement && <Row icon="pin" label="Whereabouts">{placement.locationId ? world.geo.find((g) => g.id === placement.locationId)?.name : 'not recorded'}</Row>}
        {attitude && <Row icon="status" label="Attitude">{attitude.value}</Row>}
        {entity.status && <Row icon="calendar" label="Status">{entity.status}</Row>}
      </>
    );
    action = 'View Character Details';
  } else if (entity?.kind === 'faction') {
    const places = world.relations.filter((r) => r.type === 'presence' && r.from === entity.id);
    title = entity.name;
    eyebrow = 'Faction';
    text = entity.records[0] ? clip(stripMd(entity.records[0].text), 190) : '';
    rows = (
      <>
        <Row icon="status" label="Stance">{factionStance(entity) === 'allied' ? 'entry says “allied”' : 'not stated'}</Row>
        {places.length > 0 && <Row icon="pin" label="Entry names">{places.map((r) => ix.entity.get(r.to)?.name).join(', ')}</Row>}
      </>
    );
    action = 'View Faction Details';
  }

  return (
    <section className="preview" aria-live="polite">
      <div className="preview-art">{art}</div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      <Divider />
      {text && <p className="blurb">{text}</p>}
      <ul className="facts">{rows}</ul>
      <button className="ornate" onClick={onOpenDetails}>{action} <span aria-hidden="true">»</span></button>
    </section>
  );
}
