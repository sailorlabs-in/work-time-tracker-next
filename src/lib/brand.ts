/**
 * Utility to get the application name based on DEPLOYMENT_MODE
 */
export function getAppName(): string {
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || process.env.DEPLOYMENT_MODE;
  return mode === "develop" || mode === "dev" ? "Dev-WorkTracker" : "WorkTracker";
}
