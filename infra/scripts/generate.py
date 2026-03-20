#!/usr/bin/env python3
"""Generate configs from ports.json + env.nonsecret.json for Shady deployment"""

import json
from pathlib import Path

INFRA_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = INFRA_DIR.parent
DEPLOY_DIR = REPO_ROOT / "deploy"
C = json.load(open(INFRA_DIR / "ports.json"))
H = C["hosts"]
NONSECRET_PATH = INFRA_DIR / "env.nonsecret.json"
NONSECRET = {}
if NONSECRET_PATH.exists():
    NONSECRET = json.load(open(NONSECRET_PATH))


def _write_atomic(path: Path, content: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content)
    tmp.replace(path)


def _format_env_value(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if text == "":
        return ""
    needs_quotes = any(ch.isspace() for ch in text) or "#" in text or '"' in text
    if needs_quotes:
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def _merge_env(env_name: str):
    base = dict(NONSECRET.get("defaults", {}))
    base.update(NONSECRET.get(env_name, {}))
    merged = dict(C["env"][env_name])
    for key, value in base.items():
        if key not in merged:
            merged[key] = value
    return merged


def env(e):
    merged = _merge_env(e)
    lines = []
    for k, v in merged.items():
        rendered = _format_env_value(v)
        if rendered is None:
            continue
        lines.append(f"{k}={rendered}")
    return "\n".join(lines)


def caddy(e):
    d, r = C["env"][e], C["routing"]
    o = [
        "{",
        f"\temail {{$ACME_EMAIL:admin@aicoflow.com}}",
        "}",
        "",
    ]
    for k, v in r.items():
        dm = d.get(f"DOMAIN_{k.upper()}", "")
        if not dm:
            continue
        o.append(f"{dm} {{")
        if "target" in v:
            host = H["loopback"]
            t = f"{host}:{v['port']}"
            o.append(f"\treverse_proxy {t}")
        o += ["}", ""]
    return "\n".join(o)


def compose_caddy():
    return """services:
  caddy:
    image: caddy:2-alpine
    container_name: shady-caddy
    restart: unless-stopped
    network_mode: host
    environment:
      - ACME_EMAIL=${ACME_EMAIL:-admin@aicoflow.com}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
"""


def compose_registry(env_name: str):
    ct = C["containers"]
    loopback = H["loopback"]
    doppler_config = {"dev": "dev", "prod": "prd"}.get(env_name, "prd")
    svc_env_files = f".env.{env_name}.generated"

    return f"""# Generated from ports.json
# Shady deployment — Doppler project: shady, config: {doppler_config}
networks:
  shared:
    name: shady-shared
    driver: bridge

volumes:
  shady-pgdata:

services:
  shady-db:
    image: {ct["shady-db"]["image"]}
    container_name: shady-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${{POSTGRES_USER}}
      POSTGRES_PASSWORD: ${{POSTGRES_PASSWORD}}
      POSTGRES_DB: ${{POSTGRES_DB}}
      POSTGRES_INITDB_ARGS: --encoding=UTF-8 --lc-collate=en_US.UTF-8 --lc-ctype=en_US.UTF-8
    ports: ["{ct["shady-db"]["expose"]}"]
    volumes:
      - shady-pgdata:/var/lib/postgresql/data
      - ../backend/src/db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${{POSTGRES_USER}} -d ${{POSTGRES_DB}}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [shared]
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

  shady-backend:
    image: ${{REGISTRY}}/${{REPO_OWNER}}/shady-backend:${{IMAGE_TAG}}
    container_name: shady-backend
    restart: unless-stopped
    network_mode: host
    entrypoint: ["/usr/local/bin/doppler-entrypoint.sh"]
    command: ["bun", "src/main.ts"]
    environment:
      - DOPPLER_TOKEN=${{DOPPLER_TOKEN:-}}
      - DOPPLER_PROJECT=shady
      - DOPPLER_CONFIG={doppler_config}
      - DATABASE_URL=postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@{loopback}:5432/${{POSTGRES_DB}}
      - PORT=${{BACKEND_PORT}}
    env_file: [{svc_env_files}]
    depends_on:
      shady-db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://{loopback}:${{BACKEND_PORT}}/health"]
      interval: 30s
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

  shady-admin:
    image: ${{REGISTRY}}/${{REPO_OWNER}}/shady-admin:${{IMAGE_TAG}}
    container_name: shady-admin
    restart: unless-stopped
    environment:
      - DOPPLER_TOKEN=${{DOPPLER_TOKEN:-}}
      - DOPPLER_PROJECT=shady
      - DOPPLER_CONFIG={doppler_config}
      - ADMIN_PORT=${{ADMIN_PORT}}
    env_file: [{svc_env_files}]
    ports: ["{loopback}:${{ADMIN_PORT}}:${{ADMIN_PORT}}"]
    networks: [shared]

  shady-widget:
    image: ${{REGISTRY}}/${{REPO_OWNER}}/shady-widget:${{IMAGE_TAG}}
    container_name: shady-widget
    restart: unless-stopped
    environment:
      - WIDGET_PORT=${{WIDGET_PORT}}
    env_file: [{svc_env_files}]
    ports: ["{loopback}:${{WIDGET_PORT}}:${{WIDGET_PORT}}"]
    networks: [shared]
"""


if __name__ == "__main__":
    import sys

    e = sys.argv[1] if len(sys.argv) > 1 else "prod"

    _write_atomic(DEPLOY_DIR / "Caddyfile", caddy(e))
    _write_atomic(DEPLOY_DIR / "docker-compose.caddy.yml", compose_caddy())
    _write_atomic(DEPLOY_DIR / "docker-compose.registry.yml", compose_registry(e))

    if e == "dev":
        _write_atomic(REPO_ROOT / f".env.{e}.generated", env(e))
        env_note = f".env.{e}.generated (repo root)"
    else:
        _write_atomic(DEPLOY_DIR / f".env.{e}.generated", env(e))
        env_note = f".env.{e}.generated (deploy/)"

    print("Generated from ports.json:")
    print(f"  - Caddyfile (env: {e})")
    print(f"  - {env_note}")
    print(f"  - docker-compose files")
