LinguaKids Railway configuration
This partial owns only the existing linguakids service and linguakids-volume mounted at /data. Variables are unmanaged; do not put secret values into this file.
Install the pinned SDK using npm ci --prefix .railway. Use Railway CLI 5.75.0 or newer. Preview config plan before config apply; never apply a plan that removes the volume or changes unrelated services.
The old railway.json is kept for recovery but excluded from the production upload after migration.
