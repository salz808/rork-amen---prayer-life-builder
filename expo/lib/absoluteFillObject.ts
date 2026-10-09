/**
 * RN 0.86 (SDK 57) removed `StyleSheet.absoluteFillObject` from its types.
 * This is the same spreadable fill object, used wherever styles need to be
 * composed (`...absoluteFillObject`) rather than passed opaquely.
 */
export const absoluteFillObject = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};
