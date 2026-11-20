# Scaling

Modular services: routers are thin; services/ml are pure functions — extract to containers without rewrite. API stateless except SQLite; swap to Postgres/Timescale by changing DATABASE_URL (SQLAlchemy). Training jobs move to a queue (Celery/RQ) with artifact cache in .model_cache.

Standards: OpenADR 2.0b for demand-response signals, IEEE 2030.5 for DER dispatch, IEC 61850 naming for substation nodes in black-start graphs.

Global contributors: region profiles are config-only additions; knowledge/*.md extends copilot RAG; synthetic generators seed new climates.
