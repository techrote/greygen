/** Proposed representation-only boundary; not installed in Greygen. */
export type PresetId = 'white' | 'pink' | 'brown' | 'grey';
export interface BaseTargetIdentity {
  readonly id: PresetId;
  readonly schemaVersion: 1;
  readonly revision: 1;
}
export interface HighResolutionTarget {
  readonly schemaVersion: 1;
  readonly kind: 'greygen-logdb-target';
  readonly gridId: 'log2-31p25-96ppo-20-20000-v1';
  readonly units: 'relative-psd-db';
  readonly baseTarget: BaseTargetIdentity;
  readonly edgePolicy: 'hold-endpoints';
  /** Exactly 958 finite binary64 numbers; base target +/-24 dB envelope. */
  readonly targetDbByKnot: readonly number[];
}
export interface SimpleSpectrum {
  readonly targetId: PresetId;
  /** Exactly 10 finite values in [-24,24]; NOT implicitly rounded to 1 dB. */
  readonly userBandOffsetsDb: readonly number[];
}
export interface CurveLoss {
  readonly maxAbsDb: number;
  readonly rmsLogDb: number;
  readonly worstKnotIndex: number;
}
export interface ProjectionPreview {
  readonly sourceRevision: number; // transient edit revision, checked on commit
  readonly simple: SimpleSpectrum;
  readonly expandedCandidate: HighResolutionTarget;
  readonly loss: CurveLoss;
  readonly decision: 'silent-numerical' | 'confirm-approximation';
  readonly policy: 'peak-1e-6db-guard-1e-10-v1';
  readonly converged: true; // a failed solve is an error, not a preview
}
export declare function expandSimple(state: SimpleSpectrum): HighResolutionTarget;
export declare function replaceNodes(target: HighResolutionTarget,
  edits: readonly (readonly [index: number, targetDb: number])[]): HighResolutionTarget;
export declare function projectToSimple(target: HighResolutionTarget,
  sourceRevision: number): ProjectionPreview;
export declare function certifyFinalOffsets(target: HighResolutionTarget,
  actualOffsets: readonly number[]): CurveLoss;
// Confirmation/undo lives outside this pure boundary. No audio engine, browser,
// calibration, master, animation, persistence or realization choice in this API.
