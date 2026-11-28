FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY apps/linguakids_web/package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY apps/linguakids_web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HF_HOME=/data/huggingface TOKENIZERS_PARALLELISM=false
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
COPY ml/requirements-training.txt /tmp/training.txt
COPY services/inference/pyproject.toml /tmp/inference.toml
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('/tmp/inference.toml','rb'))['project']['dependencies']))" > /tmp/inference.txt
RUN pip install --no-cache-dir torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
RUN python -m pip install --no-cache-dir -r requirements.txt -r /tmp/inference.txt -r /tmp/training.txt
ARG INCLUDE_SCHOOL_VOICES=true
COPY services/ services/
COPY ml/scripts/ ml/scripts/
COPY scripts/build_react.py scripts/build_react.py
COPY deploy/ deploy/
RUN INCLUDE_SCHOOL_VOICES="$INCLUDE_SCHOOL_VOICES" python -m deploy.download_models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
COPY --from=web /build/dist/ public/
CMD ["python", "-m", "deploy.start"]
