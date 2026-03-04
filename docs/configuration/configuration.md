# Configuration Guide

This guide covers all aspects of configuring the Botswana HIE platform, including environment variables, profiles, package configuration, and service-specific settings.

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Environment Files](#environment-files)
3. [Platform Profiles](#platform-profiles)
4. [Package Configuration](#package-configuration)
5. [Service-Specific Configuration](#service-specific-configuration)
6. [Resource Allocation](#resource-allocation)
7. [Network Configuration](#network-configuration)

## Configuration Overview

The HIE platform uses a hierarchical configuration approach:

1. **Platform Level**: `config.yaml` - Defines packages and profiles
2. **Profile Level**: `.env.{profile}` - Environment-specific variables
3. **Package Level**: `package-metadata.json` - Package defaults and variables
4. **Service Level**: Service-specific configuration files

### Configuration Files Location

```
hie-botswana/
├── config.yaml                 # Platform configuration
├── .env.local                  # Development environment
├── .env.qa                     # QA environment
├── .env.uat                    # UAT environment
├── .env.prod                   # Production environment
└── packages/
    └── {package-name}/
        ├── package-metadata.json
        └── config/             # Service configuration files
```

## Environment Files

### Environment File Structure

Each environment file (`.env.local`, `.env.qa`, `.env.uat`, `.env.prod`) contains environment variables that override package defaults.

### Common Environment Variables

#### Logging Configuration

```bash
# Log file path
BASHLOG_FILE_PATH=/tmp/logs/hie.log

# Log level (DEBUG, INFO, WARN, ERROR)
BASHLOG_LEVEL=INFO
```

#### Elasticsearch Backups

```bash
# Backup directory (use persistent path, not /tmp)
ES_BACKUPS=/opt/hie-backups
```

#### Development Mode

```bash
# Enable development mode for mediators
OMANG_DEV_MOUNT_FOLDER=/absolute/path/to/projects/omang-service-mediator
SHR_DEV_MODE=true
```

### Environment-Specific Variables

#### Development (.env.local)

```bash
# Development credentials
KEYCLOAK_ADMIN_PASSWORD=dev_password_only
ELASTIC_PASSWORD=dev_password_only
POSTGRES_PASSWORD=dev_password_only

# Development URLs
OPENHIM_URL=http://localhost:9000
FHIR_SERVER_URL=http://localhost:3447/fhir
```

#### Production (.env.prod)

```bash
# Production credentials (use strong passwords)
KEYCLOAK_ADMIN_PASSWORD=<secure-password>
ELASTIC_PASSWORD=<secure-password>
POSTGRES_PASSWORD=<secure-password>

# Production URLs
OPENHIM_URL=https://openhim.yourdomain.com
FHIR_SERVER_URL=https://fhir.yourdomain.com/fhir

# SSL/TLS Configuration
SSL_CERT_PATH=/etc/ssl/certs/hie.crt
SSL_KEY_PATH=/etc/ssl/private/hie.key
```

## Platform Profiles

Profiles are defined in `config.yaml` and determine which packages are deployed and their configuration.

### Profile Structure

```yaml
profiles:
  - name: dev
    packages:
      - interoperability-layer-openhim
      - database-postgres
      # ... other packages
    envFiles:
      - .env.local
    dev: true
    only: false
```

### Available Profiles

#### Development Profile (`dev`)

**Purpose**: Local development and testing

**Packages**:

- All core services
- Development tools
- Monitoring stack
- No reverse proxy

**Usage**:

```bash
./instant-linux package init -p dev
```

#### QA Profile (`qa`)

**Purpose**: Quality assurance testing

**Packages**:

- All core services
- Reverse proxy (nginx)
- Monitoring stack

**Usage**:

```bash
./instant-linux package init -p qa
```

#### Pilot Profile (`pilot`)

**Purpose**: Pilot deployment

**Packages**:

- Production-like setup
- No reverse proxy (may use external load balancer)

**Usage**:

```bash
./instant-linux package init -p pilot
```

#### UAT Profile (`uat`)

**Purpose**: User acceptance testing

**Packages**:

- Full production stack
- Reverse proxy
- Monitoring

**Usage**:

```bash
./instant-linux package init -p uat
```

#### Production Profile (`prod`)

**Purpose**: Production deployment

**Packages**:

- Full production stack
- Reverse proxy with SSL
- Monitoring and alerting

**Usage**:

```bash
./instant-linux package init -p prod
```

### Profile Configuration

To modify a profile, edit `config.yaml`:

```yaml
profiles:
  - name: custom
    packages:
      - interoperability-layer-openhim
      - fhir-datastore-hapi-fhir
      # Add/remove packages as needed
    envFiles:
      - .env.custom
    dev: false
    only: false
```

## Package Configuration

Each package has a `package-metadata.json` file that defines:

- Package metadata (name, version, description)
- Dependencies
- Environment variables with defaults
- Configuration requirements

### Viewing Package Configuration

```bash
# View package metadata
cat packages/shr-mediator/package-metadata.json

# View environment variables
cat packages/shr-mediator/package-metadata.json | jq '.environmentVariables'
```

### Overriding Package Defaults

Package defaults can be overridden in environment files:

```bash
# In .env.local
SHR_HTTP_PORT=3000
SHR_FHIR_SERVER_BASE_URL=http://hapi-fhir:8080/fhir
SHR_MFL_URL=https://mfldit.gov.org.bw/api/v1/mfl/fhir
```

## Service-Specific Configuration

### OpenHIM Configuration

**Configuration Files:**

- `packages/interoperability-layer-openhim/importer/volume/openhim-import.json`

**Key Settings:**

- Admin credentials
- Mediator registration
- Channel configuration
- Authentication settings

**Environment Variables:**

```bash
OPENHIM_CORE_HTTP_PORT=9000
OPENHIM_CORE_HTTPS_PORT=5001
OPENHIM_ADMIN_USERNAME=root@openhim.org
OPENHIM_ADMIN_PASSWORD=instant101
```

### SHR Mediator Configuration

**Key Environment Variables:**

```bash
# Ports
SHR_HTTP_PORT=3000
SHR_MLLP_PORT=3001
SHR_MLLP_ORU_PORT=3002

# FHIR Server
SHR_FHIR_SERVER_BASE_URL=http://hapi-fhir:8080/fhir
SHR_FHIR_SERVER_USERNAME=
SHR_FHIR_SERVER_PASSWORD=

# FHIR Converter
SHR_FHIR_CONVERTER_URL=http://openhim-mediator-fhir-converter:2019

# MFL Service
SHR_MFL_URL=https://mfldit.gov.org.bw/api/v1/mfl/fhir
SHR_MFL_FALLBACK_URL=http://facility-registry-mfl:3005/api/v1
# SHR tries fallback (facility-registry-mfl) first; if it fails, uses primary MFL URL above.

# Kafka
SHR_TASK_RUNNER_BROKERS=["kafka-01:9092", "kafka-02:9092"]

# Retry Configuration
SHR_RETRY_CONFIG_TRANSLATOR_MAX_RETRIES=5
SHR_RETRY_CONFIG_TRANSLATOR_RETRY_DELAY=10000
SHR_RETRY_CONFIG_HL7_MAX_RETRIES=5
SHR_RETRY_CONFIG_HL7_RETRY_DELAY=10000

# OCL (OpenConceptLab)
SHR_BW_CONFIG_OCL_URL=https://api.openconceptlab.org
SHR_BW_CONFIG_PIMS_SYSTEM_URL=https://api.openconceptlab.org/orgs/I-TECH-UW/sources/PIMSLAB/
SHR_BW_CONFIG_IPMS_SYSTEM_URL=https://api.openconceptlab.org/orgs/I-TECH-UW/sources/IPMSLAB/
SHR_BW_CONFIG_CIEL_SYSTEM_URL=https://openconceptlab.org/orgs/CIEL/sources/CIEL/

# MLLP Configuration
SHR_BW_CONFIG_MLLP_TARGET_HOST=ipms-server
SHR_BW_CONFIG_MLLP_TARGET_ADT_PORT=2575
SHR_BW_CONFIG_MLLP_TARGET_ORM_PORT=2575

# OpenHIM Integration
SHR_OPENHIM_USERNAME=root@openhim.org
SHR_OPENHIM_PASSWORD=instant101
SHR_OPENHIM_TRUST_SELF_SIGNED=true
SHR_MEDIATOR_CONFIG_OPENHIM_AUTH_API_URL=https://openhim-core:8080
```

**Configuration Files:**

- `packages/shr-mediator/config/data/locations.json`
- `packages/shr-mediator/config/data/organizations.json`
- `packages/shr-mediator/config/ocl_json/*.json`

### Omang Service Mediator Configuration

**Key Environment Variables:**

```bash
# Database Connections
OMANG_DB_HOST=oracle-host
OMANG_DB_PORT=1521
OMANG_DB_SID=FREE
OMANG_DB_USERNAME=omang_user
OMANG_DB_PASSWORD=omang_password

BDRS_DB_HOST=oracle-host
BDRS_DB_PORT=1521
BDRS_DB_SID=FREE
BDRS_DB_USERNAME=bdrs_user
BDRS_DB_PASSWORD=bdrs_password

IMMIGRATION_DB_HOST=oracle-host
IMMIGRATION_DB_PORT=1521
IMMIGRATION_DB_SID=FREE
IMMIGRATION_DB_USERNAME=immigration_user
IMMIGRATION_DB_PASSWORD=immigration_password

# Service Configuration
OMANG_HTTP_PORT=3004
OMANG_OPENHIM_USERNAME=root@openhim.org
OMANG_OPENHIM_PASSWORD=instant101
```

**Configuration Files:**

- `packages/omang-service-mediator/config/init.sql`

### Facility Registry MFL Configuration

**Key Environment Variables:**

```bash
# Service Configuration
MFL_HTTP_PORT=3005
MFL_API_URL=https://mfldit.gov.org.bw/api/v1/mfl/fhir
```

**Configuration Files:**

- `packages/facility-registry-mfl/config/data/locations.json`
- `packages/facility-registry-mfl/config/data/organizations.json`

**Data Synchronization:**

```bash
# Manual sync via API
curl -X POST http://localhost:3005/api/v1/sync/trigger

# Or update files directly
# Edit: packages/facility-registry-mfl/config/data/locations.json
# Edit: packages/facility-registry-mfl/config/data/organizations.json
```

### HAPI FHIR Configuration

**Key Environment Variables:**

```bash
FHIR_SERVER_PORT=3447
FHIR_SERVER_BASE_URL=http://hapi-fhir:8080/fhir
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=hapi
POSTGRES_USER=hapi
POSTGRES_PASSWORD=<password>
```

**Implementation Guides:**
Install via API:

```bash
curl -X POST https://localhost:5001/ig \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Botswana IG",
    "url": "https://build.fhir.org/ig/jembi/botswana-hie-fhir-ig/branches/master"
  }'
```

### Elasticsearch Configuration

**Key Environment Variables:**

```bash
ELASTICSEARCH_HTTP_PORT=9201
ELASTIC_PASSWORD=<password>
ES_BACKUPS=/opt/hie-backups
ES_CLUSTER_NAME=hie-cluster
ES_NODE_NAME=hie-node
```

**Backup Configuration:**

- Backup location: Set `ES_BACKUPS` to a persistent path (not `/tmp`)
- Backup schedule: Configure via cron or scheduled tasks

### Kafka Configuration

**Key Environment Variables:**

```bash
KAFKA_BROKER_PORT=9092
KAFKA_ZOOKEEPER_PORT=2181
KAFKA_NUM_PARTITIONS=3
KAFKA_REPLICATION_FACTOR=1
```

**Topic Configuration:**
Topics are created automatically, but can be managed manually:

```bash
# List topics
docker exec -it $(docker ps -q -f name=kafka) \
  kafka-topics.sh --bootstrap-server localhost:9092 --list

# Create topic manually
docker exec -it $(docker ps -q -f name=kafka) \
  kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic my-topic --partitions 3 --replication-factor 1
```

### Keycloak Configuration

**Key Environment Variables:**

```bash
KEYCLOAK_HTTP_PORT=9088
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=<password>
KEYCLOAK_REALM=platform-realm
```

**Configuration Files:**

- `packages/identity-access-manager-keycloak/config/realm.json`
- `packages/identity-access-manager-keycloak/config/openhim.json`
- `packages/identity-access-manager-keycloak/config/grafana.json`

### Monitoring Configuration

**Prometheus:**

```bash
PROMETHEUS_PORT=9090
```

**Grafana:**

```bash
GRAFANA_HTTP_PORT=3000
GRAFANA_ADMIN_USERNAME=test
GRAFANA_ADMIN_PASSWORD=dev_password_only
```

**Loki:**

```bash
LOKI_PORT=3100
```

**Configuration Files:**

- `packages/monitoring/prometheus/prometheus.yml`
- `packages/monitoring/grafana/datasource.yml`
- `packages/monitoring/loki/loki-config.yml`
- `packages/monitoring/promtail/promtail-config.yml`

## Resource Allocation

Resource allocations are defined in each package's `docker-compose.yml` file under `deploy.resources`.

### CPU Allocation

CPU is specified as a portion of total cores:

- `2` on a 6-core system = 33.33% CPU
- `6` on a 6-core system = 100% CPU

**Example:**

```yaml
deploy:
  resources:
    reservations:
      cpus: "2"
    limits:
      cpus: "4"
```

### Memory Allocation

Memory is specified with multipliers (M, G):

- `500M` = 500 megabytes
- `1G` = 1 gigabyte
- `10G` = 10 gigabytes

**Example:**

```yaml
deploy:
  resources:
    reservations:
      memory: 1G
    limits:
      memory: 2G
```

### Important Notes

1. **ELK Stack Services**: Be cautious with CPU limits as they may conflict with health checks
2. **Memory vs JVM Heap**: Ensure allocated memory exceeds JVM heap size for Java services
3. **Exit Code 137**: Indicates out-of-memory failure - increase memory allocation

### Modifying Resource Allocations

Resources can be overridden via environment variables in docker-compose files:

```yaml
environment:
  - CPU_LIMIT=4
  - MEMORY_LIMIT=2G
```

## Network Configuration

### Service Discovery

Services communicate via Docker Swarm service names:

- `openhim-core`
- `hapi-fhir`
- `postgres`
- `kafka-01`, `kafka-02`
- `elasticsearch`
- `shr-mediator`
- `omang-service-mediator`

### Port Mapping

Default ports (can be overridden):

| Service           | Port | Protocol |
| ----------------- | ---- | -------- |
| OpenHIM           | 9000 | HTTP     |
| OpenHIM           | 5001 | HTTPS    |
| Keycloak          | 9088 | HTTP     |
| HAPI FHIR         | 3447 | HTTP     |
| SHR Mediator      | 3000 | HTTP     |
| Omang Service     | 3004 | HTTP     |
| Facility Registry | 3005 | HTTP     |
| OpenCR            | 3003 | HTTP     |
| Elasticsearch     | 9201 | HTTP     |
| Kibana            | 5601 | HTTP     |
| Grafana           | 3000 | HTTP     |
| Kafka             | 9092 | TCP      |
| Kafdrop           | 9013 | HTTP     |

### Reverse Proxy Configuration

For production, configure nginx reverse proxy:

```bash
cd packages/reverse-proxy-nginx
./set-secure-mode.sh
```

Update SSL certificates in:

- `packages/reverse-proxy-nginx/package-conf-secure/*.conf`

## Configuration Best Practices

1. **Use Environment Files**: Never hardcode credentials
2. **Version Control**: Keep `.env.example` files, but exclude actual `.env` files
3. **Secrets Management**: Use Docker secrets for sensitive data in production
4. **Backup Configuration**: Store configuration backups separately
5. **Documentation**: Document all custom configurations
6. **Testing**: Test configuration changes in dev/qa before production

## Configuration Validation

### Validate Environment File

```bash
# Check for required variables
grep -E "^(OPENHIM|FHIR|POSTGRES)" .env.local
```

### Validate Service Configuration

```bash
# Check service can start with config
docker service ps <service-name>

# View service logs for config errors
docker service logs <service-name> | grep -i "config\|error"
```

## Troubleshooting Configuration

1. **Service Won't Start**: Check environment variables and required dependencies
2. **Connection Errors**: Verify service names and ports
3. **Authentication Failures**: Verify credentials in environment files
4. **Resource Issues**: Check resource allocations and system capacity

For more troubleshooting help, see the [Troubleshooting Guide](../troubleshooting/troubleshooting.md).
