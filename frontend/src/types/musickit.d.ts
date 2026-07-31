/**
 * Hand-written types for Apple's MusicKit JS v3 global — there is no
 * `@types/musickit-js` package, and MusicKit JS itself ships no
 * TypeScript definitions; it's loaded at runtime from Apple's CDN
 * (`https://js-cdn.music.apple.com/musickit/v3/musickit.js`), not
 * installed via npm (see musicKitClient.tsx's doc comment for why).
 *
 * This is DELIBERATELY a minimal subset covering only the methods/
 * properties MoodSync actually calls, sourced from Apple's real
 * documented MusicKit JS API (developer.apple.com/documentation/
 * musickitjs) — not a full re-implementation of every MusicKit
 * capability. Extend this file as more of the API gets used rather than
 * speculatively typing methods nothing calls yet.
 */
declare namespace MusicKit {
  interface Artwork {
    url: string;
    width: number | null;
    height: number | null;
  }

  interface MediaItemAttributes {
    name: string;
    artistName: string;
    albumName?: string;
    artwork?: Artwork;
    durationInMillis?: number;
  }

  interface MediaItem {
    id: string;
    type: string;
    attributes?: MediaItemAttributes;
  }

  type PlaybackStates = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

  interface MusicKitInstance {
    readonly isAuthorized: boolean;
    readonly musicUserToken: string;
    readonly storefrontId: string;
    readonly nowPlayingItem: MediaItem | null;
    readonly playbackState: PlaybackStates;
    readonly currentPlaybackTime: number;
    readonly currentPlaybackDuration: number;

    authorize(): Promise<string>;
    unauthorize(): Promise<void>;

    play(): Promise<void>;
    pause(): void;
    stop(): void;
    skipToNextItem(): Promise<void>;
    skipToPreviousItem(): Promise<void>;
    /** Moves the playhead. Real MusicKit JS v3 API, declared here when
     * the premium player's seek bar started using it — this file only
     * declares the surface this app actually calls, not all of MusicKit. */
    seekToTime(time: number): Promise<void>;
    setQueue(options: { songs?: string[]; song?: string; playlist?: string; album?: string }): Promise<unknown>;

    api: {
      // Apple's actual response envelope varies by endpoint — resource
      // fetches (library/catalog lookups) come back as `{ data: [...] }`,
      // but the catalog search endpoint comes back as `{ results: {...} }`
      // instead. Typed loosely on purpose rather than presuming one shape
      // fits every endpoint; callers narrow per-endpoint.
      music(path: string, queryParameters?: Record<string, unknown>): Promise<Record<string, unknown>>;
    };

    addEventListener(name: string, callback: () => void): void;
    removeEventListener(name: string, callback: () => void): void;
  }

  interface ConfigureOptions {
    developerToken: string;
    app: { name: string; build: string };
  }

  function configure(options: ConfigureOptions): MusicKitInstance;
  function getInstance(): MusicKitInstance;
}

interface Window {
  MusicKit?: typeof MusicKit;
}
