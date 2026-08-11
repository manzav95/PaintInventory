/**
 * Sessions persist until the user signs out. Idle auto-logout is disabled.
 * Kept as a no-op hook so call sites remain stable.
 */
export default function useIdleLogout(_userName, _onIdleLogout) {
  return {};
}
