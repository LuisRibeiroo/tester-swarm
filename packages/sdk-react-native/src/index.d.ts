export type TesterLoopStatus = 'NOT_ENROLLED' | 'TRACKING' | 'DISABLED';

export interface TesterLoopApi {
  /**
   * Returns current SDK tracking status on Android.
   * Always resolves to `'DISABLED'` on iOS, Web, or unlinked runtimes.
   */
  status(): Promise<TesterLoopStatus>;

  /**
   * Allows host apps to expose an opt-out toggle. Safe no-op on non-Android targets.
   */
  setEnabled(enabled: boolean): Promise<void>;
}

export declare const TesterLoop: TesterLoopApi;
export default TesterLoop;
