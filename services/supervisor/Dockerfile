FROM python:3.12-slim

WORKDIR /app

COPY services/supervisor/pyproject.toml services/supervisor/README.md ./
COPY services/supervisor/src ./src

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "supervisor.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
