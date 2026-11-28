import { defineRailway, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "linguakids";
export default defineRailway(() => {
  const dataVolume=volume("linguakids-volume", {sizeMB:500,region:"iad",allowOnlineResize:true});
  const linguakids = service("linguakids", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    volumeMounts: {"/data":dataVolume},
    deploy: {restartPolicyType:"ON_FAILURE",restartPolicyMaxRetries:3},
    healthcheck: "/ready",
    healthcheckTimeout: 300,
    replicas: { "iad": 1 },
  });

  return project("LinguaKids", {
    variables: { managed: false },
    resources: [linguakids,dataVolume],
  });
});
