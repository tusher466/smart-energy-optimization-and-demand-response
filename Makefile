.PHONY: backend frontend test build seed
backend:
	cd backend && uvicorn app.main:app --reload
frontend:
	cd frontend && npm run dev
test:
	cd backend && python -m pytest tests -q
build:
	cd frontend && npm run build
seed:
	curl -X POST http://127.0.0.1:8000/api/v1/ledger/seed
