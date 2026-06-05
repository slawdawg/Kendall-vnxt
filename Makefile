.PHONY: dev-dashboard dev-supervisor check

dev-dashboard:
	npm --workspace apps/dashboard run dev

dev-supervisor:
	uv run --directory services/supervisor uvicorn supervisor.api.main:app --reload

check:
	npm run check
