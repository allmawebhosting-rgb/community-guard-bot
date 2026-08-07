import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyReports from "./tools/list-my-reports";
import getReport from "./tools/get-report";
import createReport from "./tools/create-report";
import listCommunityAlerts from "./tools/list-community-alerts";
import findFacilities from "./tools/find-facilities";
import emergencyContacts from "./tools/emergency-contacts";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "remix-of-remix-of-remix-of-allma-safety-ai",
  title: "Remix of Remix of Remix of Allma Safety AI",
  version: "0.1.0",
  instructions:
    "Tools for Allma Safety AI, a Uganda citizen safety assistant. Use them to file and track a signed-in citizen's safety reports, read published community alerts, find police stations and hospitals, and manage emergency contacts. These tools are for non-emergency use: for a life-threatening emergency, tell the user to call 999 or press SOS in the app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMyReports, getReport, createReport, listCommunityAlerts, findFacilities, emergencyContacts],
});
