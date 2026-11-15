export type TesterSwarmStatus = 'NOT_ENROLLED' | 'TRACKING' | 'DISABLED';

export interface TesterSwarmApi {
  /**
   * Returns current SDK tracking status on Android.
   * Always resolves to `'DISABLED'` on iOS, Web, or unlinked runtimes.
   */
  status(): Promise<TesterSwarmStatus>;

  /**
   * Allows host apps to expose an opt-out toggle. Safe no-op on non-Android targets.
   */
  setEnabled(enabled: boolean): Promise<void>;
}

export declare const TesterSwarm: TesterSwarmApi;
export default TesterSwarm;
