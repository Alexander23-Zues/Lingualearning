LinguaKids Railway configuration

The legacy root railway.json is retired to deploy/legacy/railway.json.disabled.
Before deploying its removal, persist the existing production service settings
in Railway: Dockerfile builder/path, /ready healthcheck with a 300-second timeout,
ON_FAILURE restart policy with three retries, and an empty Config File path.
Preserve the existing /data volume, region, replicas, domain and server variables.
The archived file is recovery/reference material; builders must not load it.

The prepared railway.ts declares only the existing linguakids service and
linguakids-volume at /data. Variables are unmanaged; never put secret values
in the authoring file. Git deployment does not evaluate or apply railway.ts.
Retiring the legacy file and preserving service settings does not establish
IaC ownership and must not be described as a completed IaC plan/apply.

For a future IaC adoption, install the pinned SDK using npm ci --prefix .railway
and use a supported Railway CLI environment. Inspect config plan before apply;
never apply a plan that removes the volume or changes unrelated services.
Do not bypass an operating-system block on the CLI executable.
