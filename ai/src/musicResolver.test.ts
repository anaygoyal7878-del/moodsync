import { describe, expect, it, vi } from 'vitest';
import { matchPlaylistByKeywords, type SpotifyPlaylistSummary } from '@moodsync/integration-spotify';
import type { CompletedMusicSession } from './musicMemory.js';

vi.mock('@moodsync/database', () => ({
  smartHomeConnectionRepository: { findByUserAndProvider: vi.fn() },
  oauthTokenRepository: { getDecrypted: vi.fn(), update: vi.fn() },
  musicSessionRepository: { listCompletedSince: vi.fn() },
}));

const { pickProvenPlaylist } = await import('./musicResolver.js');

function playlist(name: string, id = name.toLowerCase()): SpotifyPlaylistSummary {
  return { id, name, uri: `spotify:playlist:${id}` };
}

/** A session that measurably helped: heart rate came down during a
 * RELAX session, which is the direction that mode wants. */
function session(itemName: string, heartRateDelta: number, mode: CompletedMusicSession['mode'] = 'RELAX'): CompletedMusicSession {
  return {
    mode,
    itemName,
    genre: null,
    startedAt: new Date('2026-08-01T10:00:00Z'),
    endedAt: new Date('2026-08-01T10:30:00Z'),
    heartRateDelta,
    endedEarly: false,
    hourOfDay: 10,
  };
}

describe('matchPlaylistByKeywords', () => {
  it('returns null when nothing matches', () => {
    expect(matchPlaylistByKeywords([playlist('Road Trip')], ['relax', 'calm'])).toBeNull();
  });

  it('honours keyword priority — an earlier keyword beats a later one', () => {
    const result = matchPlaylistByKeywords([playlist('Chill Vibes'), playlist('Relax Now')], ['relax', 'chill']);
    expect(result?.name).toBe('Relax Now');
  });

  it('prefers the shortest name among equal matches', () => {
    const result = matchPlaylistByKeywords(
      [playlist('Focus Music For Studying And Long Drives'), playlist('Deep Focus')],
      ['focus'],
    );
    expect(result?.name).toBe('Deep Focus');
  });

  it('matches case-insensitively on a substring', () => {
    expect(matchPlaylistByKeywords([playlist('my CALM evening')], ['calm'])?.name).toBe('my CALM evening');
  });

  it('returns null for an empty library rather than throwing', () => {
    expect(matchPlaylistByKeywords([], ['relax'])).toBeNull();
  });
});

describe('pickProvenPlaylist', () => {
  const library = [playlist('Evening Calm'), playlist('Rain Sounds'), playlist('Gym Hype')];

  it('returns null with no history at all', () => {
    expect(pickProvenPlaylist(library, [], 'RELAX')).toBeNull();
  });

  it('picks the playlist whose sessions measurably helped', () => {
    const sessions = [
      session('Evening Calm', -8),
      session('Evening Calm', -6),
      session('Evening Calm', -7),
    ];
    expect(pickProvenPlaylist(library, sessions, 'RELAX')?.name).toBe('Evening Calm');
  });

  it('ignores a playlist that moved heart rate the wrong way for the mode', () => {
    const sessions = [session('Gym Hype', 12), session('Gym Hype', 15), session('Gym Hype', 10)];
    expect(pickProvenPlaylist(library, sessions, 'RELAX')).toBeNull();
  });

  it('never proposes a playlist the user no longer has', () => {
    // Strong history for a playlist that has since been deleted.
    const sessions = [session('Deleted Favourite', -9), session('Deleted Favourite', -8), session('Deleted Favourite', -10)];
    expect(pickProvenPlaylist(library, sessions, 'RELAX')).toBeNull();
  });

  it('does not cross modes — RELAX history says nothing about FOCUS', () => {
    const sessions = [session('Evening Calm', -8), session('Evening Calm', -7), session('Evening Calm', -9)];
    expect(pickProvenPlaylist(library, sessions, 'FOCUS')).toBeNull();
  });
});
