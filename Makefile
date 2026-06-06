.PHONY: setup preflight doctor dev-dashboard dev-supervisor lint-dashboard check

setup:
	pnpm run setup

preflight:
	pnpm run preflight

doctor:
	pnpm run doctor

dev-dashboard:
	pnpm run dev:dashboard

dev-supervisor:
	pnpm run dev:supervisor

lint-dashboard:
	pnpm run lint:dashboard

check:
	pnpm run check
