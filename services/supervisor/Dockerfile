FROM python:3.12-slim

WORKDIR /app

COPY services/supervisor/pyproject.toml services/supervisor/README.md ./
COPY services/supervisor/src ./src

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["python", "-m", "supervisor.api.main"]
