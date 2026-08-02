/**
 * Fixture screens are intentionally unavailable from the authenticated LAN
 * cockpit. A developer/test server must opt in explicitly; this avoids a
 * convincing-looking fixture packet ever appearing as canonical runtime data.
 */
export function dashboardDemoRoutesEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.KENDALL_LAN_AUTH_ENABLED !== "true" && environment.KENDALL_DASHBOARD_ENABLE_DEMO_ROUTES === "true";
}
