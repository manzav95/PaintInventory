import { colors } from "../theme/tokens";

/**
 * Shared audit/transaction action accent colors (Home, Dashboard, history).
 * Matches the original HomeScreen mapping.
 *
 * @param {string} action
 * @param {object} [details]
 */
export function getActionColor(action, details) {
  const map = colors.action;

  if (action === "update" && details?._actionType === "check_in") {
    return map.checkIn;
  }
  if (action === "update" && details?._actionType === "check_out") {
    return map.checkOut;
  }
  if (action === "check_in") return map.checkIn;
  if (action === "check_out") return map.checkOut;
  if (action === "update" && details?._actionType === "receiving") {
    return map.adjust;
  }
  if (action === "receiving") return map.adjust;
  if (action === "update" && details?._actionType === "recycled") {
    return map.receive;
  }
  if (action === "recycled") return map.receive;
  if (action === "add") return map.adjust;
  if (action === "delete") return map.delete;
  if (action === "change_id") return map.update;
  if (action === "update") return map.create;
  if (action === "material_usage") return map.materialUsage || map.adjust;
  return map.unknown;
}
